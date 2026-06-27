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

    const pathParts = event.path.split('/').filter(Boolean);
    const setLogId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // POST - Create set log
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        exercise_log_id,
        set_number,
        set_type = 'working',
        weight_value,
        weight_unit = 'lbs',
        reps_completed,
        rir_actual,
      } = body;

      if (!exercise_log_id || !set_number) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'exercise_log_id and set_number are required' }),
        };
      }

      // Verify ownership: exercise_log -> workout_log -> user
      const ownerCheck = await sql`
        SELECT 1 FROM exercise_logs el
        JOIN workout_logs wl ON el.workout_log_id = wl.id
        WHERE el.id = ${exercise_log_id} AND wl.user_id = ${userId}
      `;
      if (ownerCheck.length === 0) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
      }

      const [setLog] = await sql`
        INSERT INTO set_logs (exercise_log_id, set_number, set_type, weight_value, weight_unit, reps_completed, rir_actual)
        VALUES (${exercise_log_id}, ${set_number}, ${set_type}, ${weight_value || null}, ${weight_unit}, ${reps_completed || null}, ${rir_actual || null})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(setLog),
      };
    }

    // PUT - Update set log
    if (event.httpMethod === 'PUT' && setLogId && setLogId !== 'set-logs') {
      const body = JSON.parse(event.body || '{}');
      const { weight_value, weight_unit, reps_completed, rir_actual, is_pr } = body;

      const [setLog] = await sql`
        UPDATE set_logs sl
        SET
          weight_value = COALESCE(${weight_value}, sl.weight_value),
          weight_unit = COALESCE(${weight_unit}, sl.weight_unit),
          reps_completed = COALESCE(${reps_completed}, sl.reps_completed),
          rir_actual = COALESCE(${rir_actual}, sl.rir_actual),
          is_pr = COALESCE(${is_pr}, sl.is_pr)
        FROM exercise_logs el
        JOIN workout_logs wl ON el.workout_log_id = wl.id
        WHERE sl.id = ${setLogId}
          AND sl.exercise_log_id = el.id
          AND wl.user_id = ${userId}
        RETURNING sl.*
      `;

      if (!setLog) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Set log not found' }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify(setLog) };
    }

    // DELETE - Delete set log
    if (event.httpMethod === 'DELETE' && setLogId && setLogId !== 'set-logs') {
      const result = await sql`
        DELETE FROM set_logs sl
        USING exercise_logs el, workout_logs wl
        WHERE sl.id = ${setLogId}
          AND sl.exercise_log_id = el.id
          AND el.workout_log_id = wl.id
          AND wl.user_id = ${userId}
      `;

      if (result.count === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Set log not found' }) };
      }

      return { statusCode: 204, headers, body: '' };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Set logs API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
