import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';
import { proteinGramsFor, DEFAULT_PROTEIN_GOAL } from '../../src/lib/protein';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET    /api/protein?date=YYYY-MM-DD - a day's entries, total and goal
 * GET    /api/protein/summary?days=30 - daily totals for the chart
 * GET    /api/protein/quick           - your most-logged items, for one-tap adds
 * POST   /api/protein                 - log an entry
 * DELETE /api/protein/:id             - remove an entry
 */
const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    await initDb();
    const sql = getDb();

    const authResult = await authenticateRequest(event);
    if (!authResult.authenticated || !authResult.clerkUserId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
      };
    }

    const users = await sql`
      SELECT id, COALESCE(protein_goal_grams, ${DEFAULT_PROTEIN_GOAL}) AS protein_goal_grams
      FROM users WHERE clerk_user_id = ${authResult.clerkUserId}
    `;
    if (users.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found' }) };
    }
    const userId = users[0].id;
    const goalGrams = Number(users[0].protein_goal_grams);

    const pathParts = event.path.split('/').filter(Boolean);
    const tail = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    if (event.httpMethod === 'GET' && tail === 'summary') {
      const days = Math.min(Math.max(parseInt(event.queryStringParameters?.days || '30') || 30, 1), 365);
      const totals = await sql`
        SELECT logged_at AS date, SUM(grams) AS total_grams, COUNT(*)::int AS entry_count
        FROM protein_entries
        WHERE user_id = ${userId}
          AND logged_at >= CURRENT_DATE - ${days}::int
        GROUP BY logged_at
        ORDER BY logged_at
      `;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          goal_grams: goalGrams,
          days: totals.map((row) => ({
            date: row.date,
            total_grams: Number(row.total_grams),
            entry_count: row.entry_count,
          })),
        }),
      };
    }

    if (event.httpMethod === 'GET' && tail === 'quick') {
      const limit = Math.min(Math.max(parseInt(event.queryStringParameters?.limit || '6') || 6, 1), 20);
      // What you log most often over the last month, so the chips become yours
      const quick = await sql`
        SELECT label, food_id, quantity, quantity_unit,
               ROUND(AVG(grams), 1) AS grams,
               COUNT(*)::int AS uses,
               MAX(created_at) AS last_used
        FROM protein_entries
        WHERE user_id = ${userId}
          AND logged_at >= CURRENT_DATE - 30
        GROUP BY label, food_id, quantity, quantity_unit
        ORDER BY uses DESC, last_used DESC
        LIMIT ${limit}
      `;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(
          quick.map((row) => ({
            label: row.label,
            food_id: row.food_id,
            quantity: row.quantity === null ? null : Number(row.quantity),
            quantity_unit: row.quantity_unit,
            grams: Number(row.grams),
            uses: row.uses,
          }))
        ),
      };
    }

    if (event.httpMethod === 'GET') {
      const requested = event.queryStringParameters?.date;
      const date = requested && DATE_RE.test(requested) ? requested : null;

      const entries = await sql`
        SELECT id, logged_at, grams, label, food_id, quantity, quantity_unit, created_at
        FROM protein_entries
        WHERE user_id = ${userId}
          AND logged_at = COALESCE(${date}::date, CURRENT_DATE)
        ORDER BY created_at
      `;

      const total = entries.reduce((sum, entry) => sum + Number(entry.grams), 0);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          date: date ?? new Date().toISOString().split('T')[0],
          goal_grams: goalGrams,
          total_grams: Math.round(total * 10) / 10,
          entries: entries.map((entry) => ({
            ...entry,
            grams: Number(entry.grams),
            quantity: entry.quantity === null ? null : Number(entry.quantity),
          })),
        }),
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { food_id, quantity, quantity_unit, logged_at } = body;

      const date = logged_at && DATE_RE.test(logged_at) ? logged_at : null;
      let grams: number | null = null;
      let label: string | null = body.label ? String(body.label).trim() : null;

      if (food_id) {
        const [food] = await sql`
          SELECT id, name, serving_size, serving_unit, protein
          FROM protein_foods
          WHERE id = ${food_id} AND (created_by IS NULL OR created_by = ${userId})
        `;
        if (!food) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Food not found' }) };
        }
        // Computed here rather than trusted from the client so the number
        // always matches the food it names.
        grams = proteinGramsFor(
          {
            serving_size: Number(food.serving_size),
            serving_unit: food.serving_unit,
            protein: Number(food.protein),
          },
          Number(quantity),
          quantity_unit || food.serving_unit
        );
        if (grams === null) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: `Cannot measure ${food.name} in ${quantity_unit}` }),
          };
        }
        label = label || food.name;
      } else {
        // Straight from a nutrition label
        const direct = Number(body.grams);
        if (!Number.isFinite(direct) || direct <= 0) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'grams must be a positive number' }),
          };
        }
        grams = Math.round(direct * 10) / 10;
        label = label || 'Protein';
      }

      if (grams > 500) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'That looks like a typo - max 500g in one entry' }),
        };
      }

      const [entry] = await sql`
        INSERT INTO protein_entries (user_id, logged_at, grams, label, food_id, quantity, quantity_unit)
        VALUES (
          ${userId},
          COALESCE(${date}::date, CURRENT_DATE),
          ${grams},
          ${label},
          ${food_id || null},
          ${food_id && Number.isFinite(Number(quantity)) ? Number(quantity) : null},
          ${food_id ? quantity_unit || null : null}
        )
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          ...entry,
          grams: Number(entry.grams),
          quantity: entry.quantity === null ? null : Number(entry.quantity),
        }),
      };
    }

    if (event.httpMethod === 'DELETE' && tail && tail !== 'protein') {
      const result = await sql`
        DELETE FROM protein_entries WHERE id = ${tail} AND user_id = ${userId}
      `;
      if (result.count === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Entry not found' }) };
      }
      return { statusCode: 204, headers, body: '' };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Protein API error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

export { handler };
