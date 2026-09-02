import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';
import { todayIn, daysBefore } from '../../src/lib/dates';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
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

    // /progress/exercise/:exerciseId
    if (pathParts.includes('exercise')) {
      const exerciseIndex = pathParts.indexOf('exercise');
      const exerciseId = pathParts[exerciseIndex + 1];

      if (!exerciseId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Exercise ID required' }),
        };
      }

      const days = parseInt(event.queryStringParameters?.days || '90');
      const startDate = daysBefore(todayIn(users[0].timezone), days);

      // Get progress data for the exercise
      const progress = await sql`
        SELECT
          wl.workout_date as date,
          MAX(sl.weight_value) as max_weight,
          SUM(sl.weight_value * sl.reps_completed) as total_volume,
          MAX(sl.reps_completed) as best_set_reps,
          (
            SELECT sl2.weight_value
            FROM set_logs sl2
            JOIN exercise_logs el2 ON sl2.exercise_log_id = el2.id
            WHERE el2.workout_log_id = wl.id
              AND el2.exercise_id = ${exerciseId}
              AND sl2.reps_completed = MAX(sl.reps_completed)
            LIMIT 1
          ) as best_set_weight
        FROM workout_logs wl
        JOIN exercise_logs el ON wl.id = el.workout_log_id
        JOIN set_logs sl ON el.id = sl.exercise_log_id
        WHERE wl.user_id = ${userId}
          AND el.exercise_id = ${exerciseId}
          AND wl.workout_date >= ${startDate}::date
          AND sl.set_type = 'working'
        GROUP BY wl.id, wl.workout_date
        ORDER BY wl.workout_date ASC
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(progress),
      };
    }

    // /progress/prs - Get personal records
    if (pathParts.includes('prs')) {
      const prs = await sql`
        SELECT DISTINCT ON (el.exercise_id)
          e.id as exercise_id,
          e.name as exercise_name,
          sl.weight_value,
          sl.weight_unit,
          sl.reps_completed,
          wl.workout_date
        FROM set_logs sl
        JOIN exercise_logs el ON sl.exercise_log_id = el.id
        JOIN workout_logs wl ON el.workout_log_id = wl.id
        JOIN exercises e ON el.exercise_id = e.id
        WHERE wl.user_id = ${userId}
          AND sl.is_pr = true
        ORDER BY el.exercise_id, sl.weight_value DESC
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(prs),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid progress endpoint' }),
    };
  } catch (error) {
    console.error('Progress API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
