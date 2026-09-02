// User types
export interface User {
  id: string;
  clerk_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  preferred_unit: 'imperial' | 'metric';
  protein_goal_grams: number | null;
  timezone: string | null;
  created_at: string;
}

// Body weight tracking
export interface BodyWeightLog {
  id: string;
  user_id: string;
  weight_value: number;
  unit: 'lbs' | 'kg';
  logged_at: string;
  notes: string | null;
  created_at: string;
}

// Program structure
export interface Program {
  id: string;
  name: string;
  description: string | null;
  frequency_per_week: number;
  source: string | null;
  created_by: string | null;
  is_template: boolean;
  created_at: string;
}

export interface ProgramBlock {
  id: string;
  program_id: string;
  block_number: number;
  name: string;
  sort_order: number;
}

export interface BlockWeek {
  id: string;
  block_id: string;
  week_number: number;
  name: string | null;
  week_type: 'intro' | 'normal' | 'deload';
  sort_order: number;
}

export interface WorkoutTemplate {
  id: string;
  week_id: string;
  name: string;
  day_number: number;
  notes: string | null;
  sort_order: number;
}

// Exercise library
export interface Exercise {
  id: string;
  name: string;
  category: string | null;
  equipment: string | null;
  description: string | null;
}

export interface ExerciseSubstitution {
  id: string;
  primary_exercise_id: string;
  substitute_exercise_id: string;
}

// Template exercises (prescriptions)
export interface TemplateExercise {
  id: string;
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
}

// Extended template exercise with exercise details
export interface TemplateExerciseWithDetails extends TemplateExercise {
  exercise: Exercise;
}

// User programs
export interface UserProgram {
  id: string;
  user_id: string;
  program_id: string;
  started_at: string;
  completed_at: string | null;
  is_active: boolean;
  current_block_id: string | null;
  current_week_id: string | null;
}

// User schedule
export interface UserSchedule {
  id: string;
  user_id: string;
  day_of_week: number;
  is_workout_day: boolean;
}

// Workout logging
export interface WorkoutLog {
  id: string;
  user_id: string;
  user_program_id: string | null;
  workout_template_id: string | null;
  workout_date: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface ExerciseLog {
  id: string;
  workout_log_id: string;
  exercise_id: string;
  template_exercise_id: string | null;
  exercise_order: number;
}

export interface SetLog {
  id: string;
  exercise_log_id: string;
  set_number: number;
  set_type: 'warmup' | 'working';
  weight_value: number | null;
  weight_unit: 'lbs' | 'kg';
  reps_completed: number | null;
  rir_actual: number | null;
  is_pr: boolean;
}

// Extended types for UI
export interface WorkoutTemplateWithExercises extends WorkoutTemplate {
  exercises: TemplateExerciseWithDetails[];
}

export interface BlockWeekWithWorkouts extends BlockWeek {
  workouts: WorkoutTemplateWithExercises[];
}

export interface ProgramBlockWithWeeks extends ProgramBlock {
  weeks: BlockWeekWithWorkouts[];
}

export interface ProgramWithBlocks extends Program {
  blocks: ProgramBlockWithWeeks[];
}

export interface ExerciseLogWithSets extends ExerciseLog {
  exercise: Exercise;
  sets: SetLog[];
}

export interface WorkoutLogWithExercises extends WorkoutLog {
  exercises: ExerciseLogWithSets[];
  workout_name?: string | null;
  day_number?: number | null;
}

// Row shape returned by the workout log list endpoint
export interface WorkoutLogSummary extends WorkoutLog {
  workout_name?: string | null;
  day_number?: number | null;
  exercise_count: number;
  set_count: number;
  total_volume: number;
}

// Sets logged the last time an exercise was performed
export interface LastPerformedSet {
  id: string;
  set_number: number;
  set_type: 'warmup' | 'working';
  weight_value: number | null;
  weight_unit: 'lbs' | 'kg';
  reps_completed: number | null;
  rir_actual: number | null;
}

export interface LastExercisePerformance {
  exercise_id: string;
  workout_log_id: string;
  workout_date: string;
  sets: LastPerformedSet[];
}

// Protein tracking
export interface ProteinFood {
  id: string;
  name: string;
  serving_size: number;
  serving_unit: string;
  protein: number;
  category: string | null;
  created_by: string | null;
  is_custom: boolean;
}

export interface ProteinEntry {
  id: string;
  logged_at: string;
  grams: number;
  label: string;
  food_id: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  created_at: string;
}

export interface ProteinDay {
  date: string;
  goal_grams: number;
  total_grams: number;
  entries: ProteinEntry[];
}

export interface ProteinQuickAdd {
  label: string;
  food_id: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  grams: number;
  uses: number;
}

export interface ProteinSummary {
  goal_grams: number;
  days: { date: string; total_grams: number; entry_count: number }[];
}

export interface CreateProteinEntryInput {
  grams?: number;
  label?: string;
  food_id?: string;
  quantity?: number;
  quantity_unit?: string;
  logged_at?: string;
}

// Progress tracking
export interface ExerciseProgress {
  date: string;
  max_weight: number;
  total_volume: number;
  best_set_reps: number;
  best_set_weight: number;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Form input types
export interface CreateWorkoutLogInput {
  user_program_id?: string;
  workout_template_id?: string;
  workout_date: string;
  notes?: string;
}

export interface CreateSetLogInput {
  exercise_log_id: string;
  set_number: number;
  set_type: 'warmup' | 'working';
  weight_value?: number;
  weight_unit: 'lbs' | 'kg';
  reps_completed?: number;
  rir_actual?: number;
}

export interface CreateBodyWeightLogInput {
  weight_value: number;
  unit: 'lbs' | 'kg';
  logged_at?: string;
  notes?: string;
}
