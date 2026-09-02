import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';
import { todayIn } from '../../src/lib/dates';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    await initDb();
    const sql = getDb();

    // Verify Clerk JWT and get user ID
    const authResult = await authenticateRequest(event);

    if (!authResult.authenticated || !authResult.clerkUserId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
      };
    }

    const clerkUserId = authResult.clerkUserId;

    // Get user
    const users = await sql`SELECT id, timezone FROM users WHERE clerk_user_id = ${clerkUserId}`;
    if (users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }
    const userId = users[0].id;

    const pathParts = event.path.split('/').filter(Boolean);
    const logId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // GET - List body weight logs
    if (event.httpMethod === 'GET') {
      const limit = parseInt(event.queryStringParameters?.limit || '30');

      const logs = await sql`
        SELECT * FROM body_weight_logs
        WHERE user_id = ${userId}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(logs),
      };
    }

    // POST - Create body weight log
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { weight_value, unit = 'lbs', logged_at, notes } = body;

      if (!weight_value) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'weight_value is required' }),
        };
      }

      const logDate = logged_at || todayIn(users[0].timezone);

      // Upsert - update if exists for same date
      const [log] = await sql`
        INSERT INTO body_weight_logs (user_id, weight_value, unit, logged_at, notes)
        VALUES (${userId}, ${weight_value}, ${unit}, ${logDate}, ${notes || null})
        ON CONFLICT (user_id, logged_at)
        DO UPDATE SET weight_value = ${weight_value}, unit = ${unit}, notes = ${notes || null}
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(log),
      };
    }

    // PUT - Update body weight log
    if (event.httpMethod === 'PUT' && logId && logId !== 'body-weight') {
      const body = JSON.parse(event.body || '{}');
      const { weight_value, unit, notes } = body;

      const [log] = await sql`
        UPDATE body_weight_logs
        SET
          weight_value = COALESCE(${weight_value}, weight_value),
          unit = COALESCE(${unit}, unit),
          notes = COALESCE(${notes}, notes)
        WHERE id = ${logId} AND user_id = ${userId}
        RETURNING *
      `;

      if (!log) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Body weight log not found' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(log),
      };
    }

    // DELETE - Delete body weight log
    if (event.httpMethod === 'DELETE' && logId && logId !== 'body-weight') {
      await sql`DELETE FROM body_weight_logs WHERE id = ${logId} AND user_id = ${userId}`;
      return { statusCode: 204, headers, body: '' };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Body weight API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
