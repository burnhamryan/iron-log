import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

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
    const users = await sql`SELECT id FROM users WHERE clerk_user_id = ${clerkUserId}`;
    if (users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }
    const userId = users[0].id;

    const pathParts = event.path.split('/').filter(Boolean);
    const workoutLogId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // GET - List or get single workout log
    if (event.httpMethod === 'GET') {
      if (workoutLogId && workoutLogId !== 'workout-logs') {
        // Get single workout with exercises and sets
        const workoutLogs = await sql`
          SELECT wl.*, wt.name as workout_name, wt.day_number
          FROM workout_logs wl
          LEFT JOIN workout_templates wt ON wl.workout_template_id = wt.id
          WHERE wl.id = ${workoutLogId} AND wl.user_id = ${userId}
        `;

        if (workoutLogs.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Workout log not found' }),
          };
        }

        const workoutLog = workoutLogs[0];

        // Get exercise logs with sets
        const exerciseLogs = await sql`
          SELECT el.*, e.name, e.category, e.equipment
          FROM exercise_logs el
          JOIN exercises e ON el.exercise_id = e.id
          WHERE el.workout_log_id = ${workoutLogId}
          ORDER BY el.exercise_order
        `;

        const exercisesWithSets = await Promise.all(
          exerciseLogs.map(async (el) => {
            const sets = await sql`
              SELECT * FROM set_logs
              WHERE exercise_log_id = ${el.id}
              ORDER BY set_number
            `;
            return {
              ...el,
              exercise: {
                id: el.exercise_id,
                name: el.name,
                category: el.category,
                equipment: el.equipment,
              },
              sets: sets.map((set) => ({ ...set, weight_value: toNumber(set.weight_value) })),
            };
          })
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...workoutLog,
            exercises: exercisesWithSets,
          }),
        };
      }

      // List workout logs
      const params = event.queryStringParameters || {};
      const limit = Math.min(Math.max(parseInt(params.limit || '20') || 20, 1), 100);
      const offset = Math.max(parseInt(params.offset || '0') || 0, 0);
      // 'all' | 'completed' | 'in_progress'
      const status = ['completed', 'in_progress'].includes(params.status || '')
        ? (params.status as string)
        : 'all';
      // Workouts that were started but never logged against are noise in history.
      const includeEmpty = params.include_empty === 'true' ? 'true' : 'false';

      const workoutLogs = await sql`
        SELECT
          wl.*,
          wt.name as workout_name,
          wt.day_number,
          stats.exercise_count,
          stats.set_count,
          stats.total_volume
        FROM workout_logs wl
        LEFT JOIN workout_templates wt ON wl.workout_template_id = wt.id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(DISTINCT el.id) FILTER (WHERE sl.id IS NOT NULL) AS exercise_count,
            COUNT(sl.id) AS set_count,
            COALESCE(SUM(sl.weight_value * sl.reps_completed), 0) AS total_volume
          FROM exercise_logs el
          LEFT JOIN set_logs sl ON sl.exercise_log_id = el.id
          WHERE el.workout_log_id = wl.id
        ) stats ON TRUE
        WHERE wl.user_id = ${userId}
          AND (
            ${status} = 'all'
            OR (${status} = 'completed' AND wl.completed_at IS NOT NULL)
            OR (${status} = 'in_progress' AND wl.completed_at IS NULL)
          )
          AND (${includeEmpty}::boolean OR stats.set_count > 0)
        ORDER BY wl.workout_date DESC, wl.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(
          workoutLogs.map((log) => ({
            ...log,
            exercise_count: Number(log.exercise_count ?? 0),
            set_count: Number(log.set_count ?? 0),
            total_volume: toNumber(log.total_volume) ?? 0,
          }))
        ),
      };
    }

    // POST - Create workout log
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { user_program_id, workout_template_id, workout_date, notes } = body;

      const [workoutLog] = await sql`
        INSERT INTO workout_logs (user_id, user_program_id, workout_template_id, workout_date, started_at, notes)
        VALUES (${userId}, ${user_program_id || null}, ${workout_template_id || null}, ${workout_date || new Date().toISOString().split('T')[0]}, NOW(), ${notes || null})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(workoutLog),
      };
    }

    // PUT - Update workout log
    if (event.httpMethod === 'PUT' && workoutLogId) {
      const body = JSON.parse(event.body || '{}');
      const { completed_at, notes } = body;

      const [workoutLog] = await sql`
        UPDATE workout_logs
        SET
          completed_at = COALESCE(${completed_at || null}, completed_at),
          notes = COALESCE(${notes ?? null}, notes)
        WHERE id = ${workoutLogId} AND user_id = ${userId}
        RETURNING *
      `;

      if (!workoutLog) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Workout log not found' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(workoutLog),
      };
    }

    // DELETE - Delete workout log
    if (event.httpMethod === 'DELETE' && workoutLogId) {
      await sql`DELETE FROM workout_logs WHERE id = ${workoutLogId} AND user_id = ${userId}`;
      return { statusCode: 204, headers, body: '' };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Workout logs API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
