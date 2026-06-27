import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';
import * as XLSX from 'xlsx';

interface ParsedExercise {
  name: string;
  warmupSets: number;
  workingSets: number;
  repRangeMin: number;
  repRangeMax: number;
  rir: number | null;
  restSeconds: number;
  notes: string | null;
  substitutions: string[];
  category: string | null;
}

interface ParsedWorkout {
  name: string;
  dayNumber: number;
  exercises: ParsedExercise[];
}

interface ParsedWeek {
  weekNumber: number;
  name: string;
  weekType: 'intro' | 'normal' | 'deload';
  workouts: ParsedWorkout[];
}

interface ParsedBlock {
  blockNumber: number;
  name: string;
  weeks: ParsedWeek[];
}

interface ParsedProgram {
  name: string;
  frequencyPerWeek: number;
  source: string;
  blocks: ParsedBlock[];
}

// Category mappings based on exercise names
const CATEGORY_MAPPINGS: Record<string, string> = {
  squat: 'Quads',
  'leg press': 'Quads',
  'leg extension': 'Quads',
  lunge: 'Quads',
  'leg curl': 'Hamstrings',
  rdl: 'Hamstrings',
  deadlift: 'Hamstrings',
  'hip thrust': 'Glutes',
  'glute': 'Glutes',
  'calf': 'Calves',
  bench: 'Chest',
  'chest press': 'Chest',
  'incline': 'Chest',
  fly: 'Chest',
  'pec deck': 'Chest',
  'lat pulldown': 'Back',
  'pull-up': 'Back',
  row: 'Back',
  pullover: 'Back',
  shrug: 'Back',
  'lateral raise': 'Shoulders',
  'shoulder press': 'Shoulders',
  'rear delt': 'Shoulders',
  'y-raise': 'Shoulders',
  curl: 'Biceps',
  'triceps': 'Triceps',
  'tricep': 'Triceps',
  kickback: 'Triceps',
  crunch: 'Abs',
  'ab ': 'Abs',
  wrist: 'Forearms',
  'dead hang': 'Grip',
};

function categorizeExercise(name: string): string | null {
  const lowerName = name.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_MAPPINGS)) {
    if (lowerName.includes(keyword)) {
      return category;
    }
  }
  return null;
}

// Excel date serial number to rep range mapping (common patterns in Min-Max)
const EXCEL_DATE_TO_REP_RANGE: Record<number, [number, number]> = {
  45816: [6, 8],
  45879: [10, 12],
  45847: [8, 10],
  45785: [4, 6],
  45910: [12, 15],
};

function parseRepRange(value: string | number | undefined): [number, number] {
  if (!value) return [8, 12];

  // If it's a number, it might be an Excel date serial
  if (typeof value === 'number') {
    if (EXCEL_DATE_TO_REP_RANGE[value]) {
      return EXCEL_DATE_TO_REP_RANGE[value];
    }
    // Try to interpret as a single rep count
    if (value >= 1 && value <= 30) {
      return [value, value];
    }
    return [8, 12]; // Default
  }

  const str = String(value);
  // Try to match "X-Y" pattern
  const rangeMatch = str.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return [parseInt(rangeMatch[1]), parseInt(rangeMatch[2])];
  }

  // Try single number
  const singleMatch = str.match(/^(\d+)$/);
  if (singleMatch) {
    const num = parseInt(singleMatch[1]);
    return [num, num];
  }

  return [8, 12]; // Default
}

function parseWarmupSets(value: string | number | undefined): number {
  if (!value) return 0;

  const str = String(value);
  // Match patterns like "1-2", "0-1", "2-3"
  const rangeMatch = str.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return parseInt(rangeMatch[1]); // Use the lower bound
  }

  // Single number
  const num = parseInt(str);
  if (!isNaN(num) && num >= 0 && num <= 5) {
    return num;
  }

  return 0;
}

function isCsvFile(fileName: string, buffer: Buffer): boolean {
  if (fileName.toLowerCase().endsWith('.csv')) return true;
  const head = buffer.slice(0, 200).toString('utf-8');
  return head.includes('block,') && head.includes('exercise,');
}

function parseCsvProgram(workbook: XLSX.WorkBook, programName?: string): ParsedProgram {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, string | number>[];

  const program: ParsedProgram = {
    name: programName || 'Imported Program',
    frequencyPerWeek: 0,
    source: 'CSV Import',
    blocks: [],
  };

  const blockMap = new Map<number, ParsedBlock>();
  const daySet = new Set<string>();

  for (const row of rows) {
    const blockNum = Number(row['block']);
    const day = String(row['day'] || '');
    const dayName = String(row['day_name'] || '');
    const exerciseName = String(row['exercise'] || '').trim();
    const sets = Number(row['sets']) || 2;
    const repLowRaw = String(row['rep_low'] || '');
    const repHighRaw = String(row['rep_high'] || '');
    const rirRaw = String(row['rir'] || '').trim();
    const rest = String(row['rest'] || '');
    const lastSetTechnique = String(row['last_set_technique'] || '').trim();
    const cue = String(row['cue'] || '').trim();

    if (!exerciseName || isNaN(blockNum)) continue;

    const repLow = repLowRaw.toLowerCase() === 'max' ? 1 : (parseInt(repLowRaw) || 8);
    const repHigh = repHighRaw.toLowerCase() === 'max' ? 1 : (parseInt(repHighRaw) || 12);

    let rir: number | null = null;
    if (rirRaw) {
      const rirParts = rirRaw.split('/').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      if (rirParts.length > 0) {
        rir = rirParts[0];
      }
    }

    let restSeconds = 120;
    const restMatch = rest.match(/(\d+)/);
    if (restMatch) {
      restSeconds = parseInt(restMatch[1]) * 60;
    }

    const notesParts: string[] = [];
    if (cue) notesParts.push(cue);
    if (lastSetTechnique) notesParts.push(`Last set: ${lastSetTechnique}`);
    if (rirRaw.includes('/')) notesParts.push(`RIR per set: ${rirRaw}`);
    if (repLowRaw.toLowerCase() === 'max') notesParts.push('Max hold for time');
    const notes = notesParts.length > 0 ? notesParts.join(' | ') : null;

    if (!blockMap.has(blockNum)) {
      blockMap.set(blockNum, {
        blockNumber: blockNum,
        name: `Block ${blockNum}`,
        weeks: [{
          weekNumber: 1,
          name: 'Week 1',
          weekType: 'normal',
          workouts: [],
        }],
      });
    }

    const block = blockMap.get(blockNum)!;
    const week = block.weeks[0];

    daySet.add(day);
    const dayNumber = day.charCodeAt(0) - 64; // A=1, B=2, C=3, D=4
    let workout = week.workouts.find(w => w.dayNumber === dayNumber);
    if (!workout) {
      workout = { name: dayName, dayNumber, exercises: [] };
      week.workouts.push(workout);
    }

    workout.exercises.push({
      name: exerciseName,
      warmupSets: 0,
      workingSets: sets,
      repRangeMin: repLow,
      repRangeMax: repHigh,
      rir,
      restSeconds,
      notes,
      substitutions: [],
      category: categorizeExercise(exerciseName),
    });
  }

  program.blocks = [...blockMap.values()].sort((a, b) => a.blockNumber - b.blockNumber);
  program.frequencyPerWeek = daySet.size;

  return program;
}

function parseMinMaxProgram(workbook: XLSX.WorkBook): ParsedProgram {
  const program: ParsedProgram = {
    name: 'Min-Max Program',
    frequencyPerWeek: 4,
    source: 'Jeff Nippard',
    blocks: [],
  };

  // Process the main sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number)[][];

  // Update frequency from sheet name
  const freqMatch = sheetName.match(/(\d+)x/);
  if (freqMatch) {
    program.frequencyPerWeek = parseInt(freqMatch[1]);
  }

  let currentBlock: ParsedBlock | null = null;
  let currentWeek: ParsedWeek | null = null;
  let currentWorkout: ParsedWorkout | null = null;
  let exerciseOrder = 0;

  // In the Min-Max Excel:
  // Column B (index 1): Block names, Week names, Workout names
  // Column C (index 2): Exercise names (same row as workout, or standalone)
  // Column D (index 3): Last-Set Intensity Technique
  // Column E (index 4): Warm-up Sets
  // Column F (index 5): Working Sets
  // Column G (index 6): Rep Range
  // Column L (index 11): RIR Set 1
  // Column N (index 13): Rest
  // Column O (index 14): Substitution 1
  // Column P (index 15): Substitution 2
  // Column Q (index 16): Notes

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const colB = String(row[1] || '').trim(); // Block/Week/Workout names
    const colC = String(row[2] || '').trim(); // Exercise names or headers
    const lowerB = colB.toLowerCase();
    const lowerC = colC.toLowerCase();

    // Skip program notes and copyright rows
    if (
      lowerB.includes('important program notes') ||
      lowerB.includes('the min-max program') ||
      lowerB.includes('copyright') ||
      lowerB.includes('warm-up protocol')
    ) {
      continue;
    }

    // Skip header rows
    if (lowerC === 'exercise' || lowerC.includes('tracking load') || lowerC === 'load') {
      continue;
    }

    // Detect Block headers (in column B)
    if (lowerB.includes('block') && !lowerB.includes('exercise')) {
      const blockNum = parseInt(colB.match(/\d+/)?.[0] || String(program.blocks.length + 1));
      currentBlock = {
        blockNumber: blockNum,
        name: colB,
        weeks: [],
      };
      program.blocks.push(currentBlock);
      currentWeek = null;
      currentWorkout = null;
      continue;
    }

    // Detect Week headers (in column B)
    // Format: "Week 1" with "Exercise" in column C indicates start of actual week content
    // "Intro Week" or "Deload Week" alone (without "Exercise" in C) are just labels for the next week
    // Skip notes that happen to contain "week"
    if (lowerB.includes('week') && !lowerB.includes('per week') && !lowerB.includes('program notes') && colB.length < 50) {
      if (!currentBlock) {
        currentBlock = { blockNumber: 1, name: 'Block 1', weeks: [] };
        program.blocks.push(currentBlock);
      }

      // If "Exercise" is in column C, this is the actual week header row
      // Otherwise it's just a descriptive label (like "Intro Week" before "Week 1")
      if (lowerC === 'exercise') {
        const weekNum = parseInt(colB.match(/\d+/)?.[0] || String(currentBlock.weeks.length + 1));

        // Check if previous row was a label like "Intro Week" or "Deload Week"
        let weekType: 'intro' | 'normal' | 'deload' = 'normal';
        let weekName = colB; // e.g., "Week 1"
        if (i > 0 && data[i - 1]) {
          const prevB = String(data[i - 1][1] || '').toLowerCase();
          if (prevB.includes('intro')) {
            weekType = 'intro';
            weekName = colB + ' (Intro)'; // e.g., "Week 1 (Intro)"
          } else if (prevB.includes('deload')) {
            weekType = 'deload';
            weekName = colB + ' (Deload)'; // e.g., "Week 7 (Deload)"
          }
        }

        currentWeek = {
          weekNumber: weekNum,
          name: weekName,
          weekType,
          workouts: [],
        };
        currentBlock.weeks.push(currentWeek);
        currentWorkout = null;
      }
      // If no "Exercise" in column C, this is just a label - skip it
      continue;
    }

    // Detect rest day markers
    if (lowerB.includes('rest day')) {
      continue;
    }

    // Detect workout day headers (Full Body, Upper, Lower, Arms/Delts) - in column B
    const workoutNames = ['full body', 'upper', 'lower', 'arms', 'arms/delts', 'push', 'pull', 'legs'];
    if (workoutNames.some((w) => lowerB === w || lowerB.startsWith(w))) {
      if (!currentWeek) {
        if (!currentBlock) {
          currentBlock = { blockNumber: 1, name: 'Block 1', weeks: [] };
          program.blocks.push(currentBlock);
        }
        currentWeek = {
          weekNumber: 1,
          name: 'Week 1',
          weekType: 'normal',
          workouts: [],
        };
        currentBlock.weeks.push(currentWeek);
      }

      currentWorkout = {
        name: colB,
        dayNumber: currentWeek.workouts.length + 1,
        exercises: [],
      };
      currentWeek.workouts.push(currentWorkout);
      exerciseOrder = 0;

      // The first exercise is in column C on the same row
      if (colC && !lowerC.includes('exercise')) {
        addExerciseToWorkout(currentWorkout, colC, row, exerciseOrder++);
      }
      continue;
    }

    // Parse exercise rows - exercise name in column C when column B is empty
    if (colC && !colB && currentWorkout && !lowerC.includes('exercise') && !lowerC.includes('load')) {
      addExerciseToWorkout(currentWorkout, colC, row, exerciseOrder++);
    }
  }

  return program;
}

function addExerciseToWorkout(
  workout: ParsedWorkout,
  exerciseName: string,
  row: (string | number)[],
  order: number
): void {
  const [repMin, repMax] = parseRepRange(row[6]);
  const warmupSets = parseWarmupSets(row[4]);

  let workingSets = 2;
  if (row[5]) {
    const setsVal = parseInt(String(row[5]));
    if (!isNaN(setsVal) && setsVal > 0 && setsVal < 10) {
      workingSets = setsVal;
    }
  }

  let rir: number | null = null;
  const rirCol = row[11];
  if (typeof rirCol === 'number' && rirCol >= 0 && rirCol <= 4) {
    rir = rirCol;
  }

  let restSeconds = 120;
  const restCell = String(row[13] || '');
  const restMatch = restCell.match(/(\d+)\s*[-–]?\s*(\d*)\s*min/);
  if (restMatch) {
    restSeconds = parseInt(restMatch[1]) * 60;
  }

  const substitutions: string[] = [];
  if (row[14] && String(row[14]).trim() && !String(row[14]).toLowerCase().includes('see notes')) {
    substitutions.push(String(row[14]).trim());
  }
  if (row[15] && String(row[15]).trim() && !String(row[15]).toLowerCase().includes('see notes')) {
    substitutions.push(String(row[15]).trim());
  }

  workout.exercises.push({
    name: exerciseName,
    warmupSets,
    workingSets,
    repRangeMin: repMin,
    repRangeMax: repMax,
    rir,
    restSeconds,
    notes: row[16] ? String(row[16]).trim() : null,
    substitutions,
    category: categorizeExercise(exerciseName),
  });
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
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

    // Get user ID from database
    let userId = null;
    const user = await sql`
      SELECT id FROM users WHERE clerk_user_id = ${authResult.clerkUserId}
    `;
    if (user.length > 0) {
      userId = user[0].id;
    }

    // Parse the multipart form data
    const contentType = event.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Expected multipart/form-data' }),
      };
    }

    // Extract boundary
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Could not find boundary in content-type' }),
      };
    }

    const boundary = boundaryMatch[1];
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '');

    // Simple multipart parsing to get file content and form fields
    const parts = body.toString('binary').split(`--${boundary}`);
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let programName = '';

    for (const part of parts) {
      if (part.includes('filename=')) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          fileName = filenameMatch[1];
        }
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const content = part.slice(headerEnd + 4);
          const cleanContent = content.replace(/\r\n--$/, '');
          fileBuffer = Buffer.from(cleanContent, 'binary');
        }
      } else if (part.includes('name="programName"')) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          programName = part.slice(headerEnd + 4).replace(/\r\n--$/, '').trim();
        }
      }
    }

    if (!fileBuffer) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No file found in request' }),
      };
    }

    // Detect format and parse
    let parsedProgram: ParsedProgram;
    if (isCsvFile(fileName, fileBuffer)) {
      const csvText = fileBuffer.toString('utf-8');
      const workbook = XLSX.read(csvText, { type: 'string' });
      parsedProgram = parseCsvProgram(workbook, programName || undefined);
    } else {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      parsedProgram = parseMinMaxProgram(workbook);
      if (programName) {
        parsedProgram.name = programName;
      }
    }

    // OPTIMIZED: Collect all unique exercises first to minimize DB round-trips
    const allExerciseNames = new Set<string>();
    const allSubstitutionNames = new Set<string>();

    for (const parsedBlock of parsedProgram.blocks) {
      for (const parsedWeek of parsedBlock.weeks) {
        for (const parsedWorkout of parsedWeek.workouts) {
          for (const ex of parsedWorkout.exercises) {
            allExerciseNames.add(ex.name.toLowerCase());
            for (const sub of ex.substitutions) {
              allSubstitutionNames.add(sub.toLowerCase());
            }
          }
        }
      }
    }

    // Combine all exercise names (main + substitutions)
    const allNames = new Set([...allExerciseNames, ...allSubstitutionNames]);

    // Get all existing exercises in one query
    const existingExercises = await sql`
      SELECT id, LOWER(name) as lower_name, name FROM exercises
      WHERE LOWER(name) = ANY(${[...allNames]})
    `;

    const exerciseMap = new Map<string, { id: string; name: string }>();
    for (const ex of existingExercises) {
      exerciseMap.set(ex.lower_name, { id: ex.id, name: ex.name });
    }

    // Find exercises that need to be created
    const exercisesToCreate: { name: string; category: string | null }[] = [];
    for (const name of allNames) {
      if (!exerciseMap.has(name)) {
        // Find the original cased name
        let originalName = name;
        for (const parsedBlock of parsedProgram.blocks) {
          for (const parsedWeek of parsedBlock.weeks) {
            for (const parsedWorkout of parsedWeek.workouts) {
              for (const ex of parsedWorkout.exercises) {
                if (ex.name.toLowerCase() === name) {
                  originalName = ex.name;
                  break;
                }
                for (const sub of ex.substitutions) {
                  if (sub.toLowerCase() === name) {
                    originalName = sub;
                    break;
                  }
                }
              }
            }
          }
        }
        exercisesToCreate.push({
          name: originalName,
          category: categorizeExercise(originalName),
        });
      }
    }

    // Batch insert new exercises if any
    if (exercisesToCreate.length > 0) {
      const newExercises = await sql`
        INSERT INTO exercises (name, category)
        SELECT * FROM UNNEST(
          ${exercisesToCreate.map(e => e.name)}::text[],
          ${exercisesToCreate.map(e => e.category)}::text[]
        ) AS t(name, category)
        RETURNING id, LOWER(name) as lower_name, name
      `;

      for (const ex of newExercises) {
        exerciseMap.set(ex.lower_name, { id: ex.id, name: ex.name });
      }
    }

    // Create program in database
    const [program] = await sql`
      INSERT INTO programs (name, description, frequency_per_week, source, created_by)
      VALUES (
        ${parsedProgram.name},
        ${'Imported from Excel'},
        ${parsedProgram.frequencyPerWeek},
        ${parsedProgram.source},
        ${userId}
      )
      RETURNING *
    `;

    // Batch insert all blocks
    const blockInserts = parsedProgram.blocks.map(b => ({
      program_id: program.id,
      block_number: b.blockNumber,
      name: b.name,
      sort_order: b.blockNumber,
    }));

    const blocks = await sql`
      INSERT INTO program_blocks (program_id, block_number, name, sort_order)
      SELECT * FROM UNNEST(
        ${blockInserts.map(b => b.program_id)}::uuid[],
        ${blockInserts.map(b => b.block_number)}::int[],
        ${blockInserts.map(b => b.name)}::text[],
        ${blockInserts.map(b => b.sort_order)}::int[]
      ) AS t(program_id, block_number, name, sort_order)
      RETURNING *
    `;

    // Create block ID mapping
    const blockMap = new Map<number, string>();
    for (const block of blocks) {
      blockMap.set(block.block_number, block.id);
    }

    // Batch insert all weeks
    const weekInserts: { block_id: string; week_number: number; name: string; week_type: string; sort_order: number }[] = [];
    for (const parsedBlock of parsedProgram.blocks) {
      const blockId = blockMap.get(parsedBlock.blockNumber)!;
      for (const parsedWeek of parsedBlock.weeks) {
        weekInserts.push({
          block_id: blockId,
          week_number: parsedWeek.weekNumber,
          name: parsedWeek.name,
          week_type: parsedWeek.weekType,
          sort_order: parsedWeek.weekNumber,
        });
      }
    }

    const weeks = await sql`
      INSERT INTO block_weeks (block_id, week_number, name, week_type, sort_order)
      SELECT * FROM UNNEST(
        ${weekInserts.map(w => w.block_id)}::uuid[],
        ${weekInserts.map(w => w.week_number)}::int[],
        ${weekInserts.map(w => w.name)}::text[],
        ${weekInserts.map(w => w.week_type)}::text[],
        ${weekInserts.map(w => w.sort_order)}::int[]
      ) AS t(block_id, week_number, name, week_type, sort_order)
      RETURNING *
    `;

    // Create week ID mapping (block_id + week_number -> week_id)
    const weekMap = new Map<string, string>();
    for (const week of weeks) {
      weekMap.set(`${week.block_id}-${week.week_number}`, week.id);
    }

    // Batch insert all workouts
    const workoutInserts: { week_id: string; name: string; day_number: number; sort_order: number; block_num: number; week_num: number }[] = [];
    for (const parsedBlock of parsedProgram.blocks) {
      const blockId = blockMap.get(parsedBlock.blockNumber)!;
      for (const parsedWeek of parsedBlock.weeks) {
        const weekId = weekMap.get(`${blockId}-${parsedWeek.weekNumber}`)!;
        for (const parsedWorkout of parsedWeek.workouts) {
          workoutInserts.push({
            week_id: weekId,
            name: parsedWorkout.name,
            day_number: parsedWorkout.dayNumber,
            sort_order: parsedWorkout.dayNumber,
            block_num: parsedBlock.blockNumber,
            week_num: parsedWeek.weekNumber,
          });
        }
      }
    }

    const workouts = await sql`
      INSERT INTO workout_templates (week_id, name, day_number, sort_order)
      SELECT * FROM UNNEST(
        ${workoutInserts.map(w => w.week_id)}::uuid[],
        ${workoutInserts.map(w => w.name)}::text[],
        ${workoutInserts.map(w => w.day_number)}::int[],
        ${workoutInserts.map(w => w.sort_order)}::int[]
      ) AS t(week_id, name, day_number, sort_order)
      RETURNING *
    `;

    // Create workout ID mapping (week_id + day_number -> workout_id)
    const workoutMap = new Map<string, string>();
    for (const workout of workouts) {
      workoutMap.set(`${workout.week_id}-${workout.day_number}`, workout.id);
    }

    // Batch insert all template exercises
    const templateExerciseInserts: {
      workout_template_id: string;
      exercise_id: string;
      exercise_order: number;
      warmup_sets: number;
      working_sets: number;
      rep_range_min: number;
      rep_range_max: number;
      rir: number | null;
      rest_seconds: number;
      notes: string | null;
    }[] = [];

    // Track substitutions to batch insert
    const substitutionPairs: { primary_id: string; substitute_id: string }[] = [];

    for (const parsedBlock of parsedProgram.blocks) {
      const blockId = blockMap.get(parsedBlock.blockNumber)!;
      for (const parsedWeek of parsedBlock.weeks) {
        const weekId = weekMap.get(`${blockId}-${parsedWeek.weekNumber}`)!;
        for (const parsedWorkout of parsedWeek.workouts) {
          const workoutId = workoutMap.get(`${weekId}-${parsedWorkout.dayNumber}`)!;

          for (let i = 0; i < parsedWorkout.exercises.length; i++) {
            const parsedExercise = parsedWorkout.exercises[i];
            const exerciseData = exerciseMap.get(parsedExercise.name.toLowerCase());

            if (exerciseData) {
              templateExerciseInserts.push({
                workout_template_id: workoutId,
                exercise_id: exerciseData.id,
                exercise_order: i + 1,
                warmup_sets: parsedExercise.warmupSets,
                working_sets: parsedExercise.workingSets,
                rep_range_min: parsedExercise.repRangeMin,
                rep_range_max: parsedExercise.repRangeMax,
                rir: parsedExercise.rir,
                rest_seconds: parsedExercise.restSeconds,
                notes: parsedExercise.notes,
              });

              // Collect substitutions
              for (const subName of parsedExercise.substitutions) {
                const subData = exerciseMap.get(subName.toLowerCase());
                if (subData) {
                  substitutionPairs.push({
                    primary_id: exerciseData.id,
                    substitute_id: subData.id,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Batch insert template exercises
    if (templateExerciseInserts.length > 0) {
      await sql`
        INSERT INTO template_exercises (
          workout_template_id, exercise_id, exercise_order,
          warmup_sets, working_sets, rep_range_min, rep_range_max,
          rir, rest_seconds, notes
        )
        SELECT * FROM UNNEST(
          ${templateExerciseInserts.map(e => e.workout_template_id)}::uuid[],
          ${templateExerciseInserts.map(e => e.exercise_id)}::uuid[],
          ${templateExerciseInserts.map(e => e.exercise_order)}::int[],
          ${templateExerciseInserts.map(e => e.warmup_sets)}::int[],
          ${templateExerciseInserts.map(e => e.working_sets)}::int[],
          ${templateExerciseInserts.map(e => e.rep_range_min)}::int[],
          ${templateExerciseInserts.map(e => e.rep_range_max)}::int[],
          ${templateExerciseInserts.map(e => e.rir)}::int[],
          ${templateExerciseInserts.map(e => e.rest_seconds)}::int[],
          ${templateExerciseInserts.map(e => e.notes)}::text[]
        ) AS t(workout_template_id, exercise_id, exercise_order, warmup_sets, working_sets, rep_range_min, rep_range_max, rir, rest_seconds, notes)
      `;
    }

    // Batch insert substitutions (deduplicate first)
    const uniqueSubs = new Map<string, { primary_id: string; substitute_id: string }>();
    for (const sub of substitutionPairs) {
      const key = `${sub.primary_id}-${sub.substitute_id}`;
      uniqueSubs.set(key, sub);
    }

    const subsToInsert = [...uniqueSubs.values()];
    if (subsToInsert.length > 0) {
      await sql`
        INSERT INTO exercise_substitutions (primary_exercise_id, substitute_exercise_id)
        SELECT * FROM UNNEST(
          ${subsToInsert.map(s => s.primary_id)}::uuid[],
          ${subsToInsert.map(s => s.substitute_id)}::uuid[]
        ) AS t(primary_exercise_id, substitute_exercise_id)
        ON CONFLICT DO NOTHING
      `;
    }

    const totalWorkouts = parsedProgram.blocks.reduce(
      (sum, b) => sum + b.weeks.reduce((wSum, w) => wSum + w.workouts.length, 0), 0
    );

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'Program imported successfully',
        program,
        summary: {
          blocks: parsedProgram.blocks.length,
          workouts: totalWorkouts,
          exercises: allExerciseNames.size,
        },
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Excel import error:', errorMessage);
    console.error('Stack trace:', errorStack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to import program',
        details: errorMessage,
      }),
    };
  }
};

export { handler };
