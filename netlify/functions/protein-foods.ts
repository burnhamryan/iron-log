import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';

/**
 * GET  /api/protein-foods?q=chicken   - search built-in + your own foods
 * POST /api/protein-foods             - save a food of your own
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

    const users = await sql`SELECT id FROM users WHERE clerk_user_id = ${authResult.clerkUserId}`;
    if (users.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found' }) };
    }
    const userId = users[0].id;

    const pathParts = event.path.split('/').filter(Boolean);
    const foodId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    if (event.httpMethod === 'GET') {
      const query = (event.queryStringParameters?.q || '').trim();
      const limit = Math.min(Math.max(parseInt(event.queryStringParameters?.limit || '25') || 25, 1), 100);

      // Your own foods first, then best name match
      const foods = await sql`
        SELECT id, name, serving_size, serving_unit, protein, category, created_by
        FROM protein_foods
        WHERE (created_by IS NULL OR created_by = ${userId})
          AND (${query} = '' OR name ILIKE ${'%' + query + '%'})
        ORDER BY
          (created_by IS NOT NULL) DESC,
          (${query} <> '' AND lower(name) LIKE lower(${query + '%'})) DESC,
          name
        LIMIT ${limit}
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(
          foods.map((food) => ({
            ...food,
            serving_size: Number(food.serving_size),
            protein: Number(food.protein),
            is_custom: food.created_by !== null,
          }))
        ),
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { name, serving_size, serving_unit, protein } = body;

      if (!name || !serving_size || !serving_unit || protein === undefined || protein === null) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'name, serving_size, serving_unit and protein are required',
          }),
        };
      }

      const [food] = await sql`
        INSERT INTO protein_foods (name, serving_size, serving_unit, protein, category, created_by)
        VALUES (${String(name).trim()}, ${serving_size}, ${serving_unit}, ${protein}, ${body.category || null}, ${userId})
        ON CONFLICT (created_by, lower(name)) WHERE created_by IS NOT NULL
        DO UPDATE SET
          serving_size = EXCLUDED.serving_size,
          serving_unit = EXCLUDED.serving_unit,
          protein = EXCLUDED.protein
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          ...food,
          serving_size: Number(food.serving_size),
          protein: Number(food.protein),
          is_custom: true,
        }),
      };
    }

    if (event.httpMethod === 'DELETE' && foodId && foodId !== 'protein-foods') {
      // Only your own foods can be removed
      const result = await sql`
        DELETE FROM protein_foods WHERE id = ${foodId} AND created_by = ${userId}
      `;
      if (result.count === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Food not found' }) };
      }
      return { statusCode: 204, headers, body: '' };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Protein foods API error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

export { handler };
