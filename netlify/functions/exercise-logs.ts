import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';

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

    // POST - Create exercise log
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { workout_log_id, exercise_id, template_exercise_id, exercise_order } = body;

      if (!workout_log_id || !exercise_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'workout_log_id and exercise_id are required' }),
        };
      }

      // Verify the workout log belongs to this user
      const ownerCheck = await sql`
        SELECT 1 FROM workout_logs WHERE id = ${workout_log_id} AND user_id = ${userId}
      `;
      if (ownerCheck.length === 0) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      }

      const [exerciseLog] = await sql`
        INSERT INTO exercise_logs (workout_log_id, exercise_id, template_exercise_id, exercise_order)
        VALUES (${workout_log_id}, ${exercise_id}, ${template_exercise_id || null}, ${exercise_order || 1})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(exerciseLog),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Exercise logs API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
