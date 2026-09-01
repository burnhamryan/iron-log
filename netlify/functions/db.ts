import { neon } from '@neondatabase/serverless';
import { BUILT_IN_FOODS } from './lib/proteinFoods';

let dbInitialized = false;

/**
 * Bump when a statement is added to createSchema(). The marker row lets a warm
 * database skip the whole bootstrap in two round trips instead of ~40.
 */
const SCHEMA_VERSION = 1;

/**
 * `CREATE ... IF NOT EXISTS` is not atomic in Postgres: two functions cold
 * starting at once can both pass the existence check, and the loser errors.
 * That stayed invisible while every table already existed - it bites the first
 * time new tables ship and several endpoints are called together. Swallow only
 * that specific collision; anything else is a real failure.
 */
async function ddl(statement: Promise<unknown>): Promise<void> {
  try {
    await statement;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|duplicate key value|tuple concurrently updated/i.test(message)) {
      return;
    }
    throw error;
  }
}

export function getDb() {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Database URL not configured. Set DATABASE_URL environment variable.');
  }
  return neon(databaseUrl);
}

async function createSchema(sql: ReturnType<typeof getDb>) {
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS schema_state (
      id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
      version INTEGER NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Users table
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      preferred_unit TEXT DEFAULT 'imperial' CHECK (preferred_unit IN ('imperial', 'metric')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_user_id)`);

  // Body weight tracking
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS body_weight_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weight_value DECIMAL(5, 2) NOT NULL,
      unit TEXT DEFAULT 'lbs' CHECK (unit IN ('lbs', 'kg')),
      logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, logged_at)
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_body_weight_user_id ON body_weight_logs(user_id)`);

  // Programs
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      frequency_per_week INTEGER DEFAULT 4,
      source TEXT,
      created_by UUID REFERENCES users(id),
      is_template BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Program blocks
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS program_blocks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      block_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(program_id, block_number)
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_program_blocks_program_id ON program_blocks(program_id)`);

  // Block weeks
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS block_weeks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      block_id UUID NOT NULL REFERENCES program_blocks(id) ON DELETE CASCADE,
      week_number INTEGER NOT NULL,
      name TEXT,
      week_type TEXT DEFAULT 'normal' CHECK (week_type IN ('intro', 'normal', 'deload')),
      sort_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(block_id, week_number)
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_block_weeks_block_id ON block_weeks(block_id)`);

  // Workout templates
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      week_id UUID NOT NULL REFERENCES block_weeks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      notes TEXT,
      sort_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(week_id, day_number)
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_workout_templates_week_id ON workout_templates(week_id)`);

  // Exercise library
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS exercises (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      category TEXT,
      equipment TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category)`);
  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name)`);

  // Exercise substitutions
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS exercise_substitutions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      primary_exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      substitute_exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(primary_exercise_id, substitute_exercise_id)
    )
  `);

  // Template exercises
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS template_exercises (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workout_template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
      exercise_id UUID NOT NULL REFERENCES exercises(id),
      exercise_order INTEGER NOT NULL,
      warmup_sets INTEGER DEFAULT 0,
      working_sets INTEGER NOT NULL,
      rep_range_min INTEGER NOT NULL,
      rep_range_max INTEGER NOT NULL,
      rir INTEGER,
      rest_seconds INTEGER DEFAULT 120,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON template_exercises(workout_template_id)`);

  // User programs
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS user_programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      started_at DATE NOT NULL DEFAULT CURRENT_DATE,
      completed_at DATE,
      is_active BOOLEAN DEFAULT true,
      current_block_id UUID REFERENCES program_blocks(id),
      current_week_id UUID REFERENCES block_weeks(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_user_programs_user_id ON user_programs(user_id)`);
  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_user_programs_active ON user_programs(is_active)`);

  // User schedules
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS user_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      is_workout_day BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, day_of_week)
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_user_schedules_user_id ON user_schedules(user_id)`);

  // Workout logs
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS workout_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_program_id UUID REFERENCES user_programs(id),
      workout_template_id UUID REFERENCES workout_templates(id),
      workout_date DATE NOT NULL,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_workout_logs_user_id ON workout_logs(user_id)`);
  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(workout_date)`);

  // Exercise logs
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS exercise_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workout_log_id UUID NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
      exercise_id UUID NOT NULL REFERENCES exercises(id),
      template_exercise_id UUID REFERENCES template_exercises(id),
      exercise_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_exercise_logs_workout ON exercise_logs(workout_log_id)`);
  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_exercise_logs_exercise ON exercise_logs(exercise_id)`);

  // Set logs
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS set_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exercise_log_id UUID NOT NULL REFERENCES exercise_logs(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      set_type TEXT DEFAULT 'working' CHECK (set_type IN ('warmup', 'working')),
      weight_value DECIMAL(6, 2),
      weight_unit TEXT DEFAULT 'lbs' CHECK (weight_unit IN ('lbs', 'kg')),
      reps_completed INTEGER,
      rir_actual INTEGER,
      is_pr BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_set_logs_exercise ON set_logs(exercise_log_id)`);

  // Protein tracking -------------------------------------------------------

  // Daily protein target lives with the user; 200g is the working default.
  await ddl(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS protein_goal_grams INTEGER DEFAULT 200`);

  // Lookup table: built-in foods have created_by NULL, a user's own foods
  // carry their id.
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS protein_foods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      serving_size DECIMAL(10, 2) NOT NULL,
      serving_unit TEXT NOT NULL,
      protein DECIMAL(10, 2) NOT NULL,
      category TEXT,
      created_by UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ddl(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_protein_foods_builtin
    ON protein_foods (lower(name)) WHERE created_by IS NULL
  `);
  await ddl(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_protein_foods_custom
    ON protein_foods (created_by, lower(name)) WHERE created_by IS NOT NULL
  `);
  await ddl(sql`CREATE INDEX IF NOT EXISTS idx_protein_foods_name ON protein_foods (lower(name))`);

  // One row per thing eaten; the day's intake is their sum.
  await ddl(sql`
    CREATE TABLE IF NOT EXISTS protein_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
      grams DECIMAL(6, 2) NOT NULL,
      label TEXT NOT NULL,
      food_id UUID REFERENCES protein_foods(id) ON DELETE SET NULL,
      quantity DECIMAL(10, 2),
      quantity_unit TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ddl(sql`
    CREATE INDEX IF NOT EXISTS idx_protein_entries_user_date
    ON protein_entries (user_id, logged_at DESC)
  `);

  // Seed the built-in foods. Idempotent, so a half-finished previous run
  // repairs itself rather than leaving the lookup permanently empty.
  const rows = BUILT_IN_FOODS.map((food) => ({
    name: food.name,
    serving_size: food.servingSize,
    serving_unit: food.servingUnit,
    protein: food.protein,
    category: food.category,
  }));

  await sql`
    INSERT INTO protein_foods (name, serving_size, serving_unit, protein, category)
    SELECT f.name, f.serving_size, f.serving_unit, f.protein, f.category
    FROM json_to_recordset(${JSON.stringify(rows)}::json)
      AS f(name text, serving_size numeric, serving_unit text, protein numeric, category text)
    ON CONFLICT DO NOTHING
  `;

  // Recorded last, so a failure part-way through is retried next time
  await sql`
    INSERT INTO schema_state (id, version) VALUES (true, ${SCHEMA_VERSION})
    ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, updated_at = NOW()
  `;
}

/** Cheap check so a warm database skips the bootstrap entirely. */
async function schemaIsCurrent(sql: ReturnType<typeof getDb>): Promise<boolean> {
  const [marker] = await sql`SELECT to_regclass('schema_state') AS present`;
  if (!marker?.present) return false;
  const [state] = await sql`SELECT version FROM schema_state LIMIT 1`;
  return state !== undefined && Number(state.version) >= SCHEMA_VERSION;
}

export async function initDb() {
  if (dbInitialized) return;

  const sql = getDb();

  if (await schemaIsCurrent(sql)) {
    dbInitialized = true;
    return;
  }

  await createSchema(sql);
  dbInitialized = true;
}

// Common response headers
export const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
