import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/exercise-history?exercise_ids=uuid,uuid&exclude_workout_log_id=uuid
 *
 * For each requested exercise, returns the sets logged the last time the user
 * performed it. Used by the workout screen to show "last time" weight and reps.
 */
const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
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

    const exerciseIds = (event.queryStringParameters?.exercise_ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => UUID_RE.test(id));

    if (exerciseIds.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'exercise_ids query parameter is required' }),
      };
    }

    const excludeId = event.queryStringParameters?.exclude_workout_log_id;
    const excludeWorkoutLogId = excludeId && UUID_RE.test(excludeId) ? excludeId : null;

    // Most recent workout containing each exercise, plus every set from it.
    const rows = await sql`
      WITH ranked AS (
        SELECT
          el.exercise_id,
          el.id AS exercise_log_id,
          wl.id AS workout_log_id,
          wl.workout_date,
          ROW_NUMBER() OVER (
            PARTITION BY el.exercise_id
            ORDER BY wl.workout_date DESC, wl.created_at DESC
          ) AS rn
        FROM exercise_logs el
        JOIN workout_logs wl ON el.workout_log_id = wl.id
        WHERE wl.user_id = ${userId}
          AND el.exercise_id = ANY(string_to_array(${exerciseIds.join(',')}, ',')::uuid[])
          AND (${excludeWorkoutLogId}::uuid IS NULL OR wl.id <> ${excludeWorkoutLogId}::uuid)
          AND EXISTS (SELECT 1 FROM set_logs sl WHERE sl.exercise_log_id = el.id)
      )
      SELECT
        r.exercise_id,
        r.workout_log_id,
        r.workout_date,
        sl.id AS set_id,
        sl.set_number,
        sl.set_type,
        sl.weight_value,
        sl.weight_unit,
        sl.reps_completed,
        sl.rir_actual
      FROM ranked r
      JOIN set_logs sl ON sl.exercise_log_id = r.exercise_log_id
      WHERE r.rn = 1
      ORDER BY r.exercise_id, sl.set_number
    `;

    const byExercise = new Map<string, {
      exercise_id: string;
      workout_log_id: string;
      workout_date: string;
      sets: Record<string, unknown>[];
    }>();

    for (const row of rows) {
      let entry = byExercise.get(row.exercise_id);
      if (!entry) {
        entry = {
          exercise_id: row.exercise_id,
          workout_log_id: row.workout_log_id,
          workout_date: row.workout_date,
          sets: [],
        };
        byExercise.set(row.exercise_id, entry);
      }
      entry.sets.push({
        id: row.set_id,
        set_number: row.set_number,
        set_type: row.set_type,
        weight_value: row.weight_value === null ? null : Number(row.weight_value),
        weight_unit: row.weight_unit,
        reps_completed: row.reps_completed,
        rir_actual: row.rir_actual,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(Array.from(byExercise.values())),
    };
  } catch (error) {
    console.error('Exercise history API error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

export { handler };
