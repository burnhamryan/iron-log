import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';
import { isValidTimeZone } from '../../src/lib/dates';

const handler: Handler = async (event: HandlerEvent) => {
  // Handle CORS preflight
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

    // GET - Get current user
    if (event.httpMethod === 'GET') {
      const result = await sql`
        SELECT * FROM users WHERE clerk_user_id = ${clerkUserId}
      `;

      if (result.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'User not found' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result[0]),
      };
    }

    // POST - Create new user
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { email, first_name, last_name } = body;

      if (!email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Email is required' }),
        };
      }

      // Check if user already exists
      const existing = await sql`
        SELECT * FROM users WHERE clerk_user_id = ${clerkUserId}
      `;

      if (existing.length > 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(existing[0]),
        };
      }

      const result = await sql`
        INSERT INTO users (clerk_user_id, email, first_name, last_name)
        VALUES (${clerkUserId}, ${email}, ${first_name || null}, ${last_name || null})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(result[0]),
      };
    }

    // PUT - Update user
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { first_name, last_name, preferred_unit, protein_goal_grams } = body;
      // Ignore a bogus zone rather than storing something that breaks every date
      const timezone = isValidTimeZone(body.timezone) ? body.timezone : null;

      const result = await sql`
        UPDATE users
        SET
          first_name = COALESCE(${first_name}, first_name),
          last_name = COALESCE(${last_name}, last_name),
          preferred_unit = COALESCE(${preferred_unit}, preferred_unit),
          protein_goal_grams = COALESCE(${protein_goal_grams ?? null}, protein_goal_grams),
          timezone = COALESCE(${timezone}, timezone)
        WHERE clerk_user_id = ${clerkUserId}
        RETURNING *
      `;

      if (result.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'User not found' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result[0]),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Users API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

export { handler };
