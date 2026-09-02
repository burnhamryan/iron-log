import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  userProgramsApi,
  programsApi,
  workoutLogsApi,
  exerciseLogsApi,
  setLogsApi,
  exerciseHistoryApi,
} from '../lib/api';
import { useUserContext } from '../contexts/UserContext';
import { localToday } from '../lib/dates';
import { useRestTimer } from '../contexts/restTimerContext';
import { type WeightUnit } from '../lib/units';
import {
  lastWeightIn,
  formatLastSet,
  formatLastDate,
  workingSetsOf,
  previousSetFor,
} from '../lib/lastPerformance';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import type {
  UserProgram,
  ProgramWithBlocks,
  WorkoutTemplateWithExercises,
  TemplateExerciseWithDetails,
  WorkoutLogWithExercises,
  LastExercisePerformance,
} from '../types';

interface UserProgramWithDetails extends UserProgram {
  program_name?: string;
  frequency_per_week?: number;
}

interface SetState {
  weight: string;
  reps: string;
  logged: boolean;
  setLogId?: string;
}

interface ExerciseState {
  exerciseLogId: string | null;
  sets: SetState[];
  expanded: boolean;
}

type LastPerformanceMap = Map<string, LastExercisePerformance>;

function findTemplateInProgram(
  program: ProgramWithBlocks | null,
  templateId: string | null
): WorkoutTemplateWithExercises | null {
  if (!program || !templateId) return null;
  for (const block of program.blocks || []) {
    for (const week of block.weeks || []) {
      const match = week.workouts?.find((w) => w.id === templateId);
      if (match) return match;
    }
  }
  return null;
}

export function Workout() {
  const { weightUnit } = useUserContext();
  const { startRest, stopRest } = useRestTimer();
  const [loading, setLoading] = useState(true);
  const [activeProgram, setActiveProgram] = useState<UserProgramWithDetails | null>(null);
  const [programDetails, setProgramDetails] = useState<ProgramWithBlocks | null>(null);
  const [currentWeekWorkouts, setCurrentWeekWorkouts] = useState<WorkoutTemplateWithExercises[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutTemplateWithExercises | null>(null);
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const [exerciseStates, setExerciseStates] = useState<Map<string, ExerciseState>>(new Map());
  const [lastPerformance, setLastPerformance] = useState<LastPerformanceMap>(new Map());
  const [startingWorkout, setStartingWorkout] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [showNotes, setShowNotes] = useState<Set<string>>(new Set());

  // Read by the mount effect, which must not re-run when the unit toggle changes
  const weightUnitRef = useRef<WeightUnit>(weightUnit);
  useEffect(() => {
    weightUnitRef.current = weightUnit;
  }, [weightUnit]);

  const fetchLastPerformance = useCallback(
    async (workout: WorkoutTemplateWithExercises, excludeWorkoutLogId?: string) => {
      const exerciseIds = Array.from(
        new Set((workout.exercises || []).map((te) => te.exercise?.id).filter(Boolean) as string[])
      );
      if (exerciseIds.length === 0) return new Map() as LastPerformanceMap;

      const response = await exerciseHistoryApi.getLastPerformed(exerciseIds, excludeWorkoutLogId);
      const map: LastPerformanceMap = new Map();
      for (const entry of response.data || []) {
        map.set(entry.exercise_id, entry);
      }
      return map;
    },
    []
  );

  const buildExerciseStates = useCallback(
    (
      workout: WorkoutTemplateWithExercises,
      history: LastPerformanceMap,
      existingLog: WorkoutLogWithExercises | null,
      unit: WeightUnit
    ) => {
      const states = new Map<string, ExerciseState>();

      workout.exercises?.forEach((te) => {
        const loggedExercise = existingLog?.exercises?.find(
          (el) => el.template_exercise_id === te.id || el.exercise_id === te.exercise?.id
        );
        const loggedSets = (loggedExercise?.sets || []).filter((s) => s.set_type === 'working');
        const previousSets = workingSetsOf(history.get(te.exercise?.id || ''));
        const setCount = Math.max(
          te.working_sets,
          ...loggedSets.map((s) => s.set_number),
          0
        );

        const sets: SetState[] = Array.from({ length: setCount }, (_, index) => {
          const logged = loggedSets.find((s) => s.set_number === index + 1);
          if (logged) {
            // Stored in whichever unit was active when it was logged
            const loggedWeight = lastWeightIn(logged, unit);
            return {
              weight: loggedWeight === null ? '' : String(loggedWeight),
              reps: logged.reps_completed === null ? '' : String(logged.reps_completed),
              logged: true,
              setLogId: logged.id,
            };
          }
          // Pre-fill with what was lifted for this set last time so the common
          // case (same weight again) is a single tap.
          const previous = previousSetFor(previousSets, index);
          const previousWeight = previous ? lastWeightIn(previous, unit) : null;
          return {
            weight: previousWeight === null ? '' : String(previousWeight),
            reps: '',
            logged: false,
          };
        });

        states.set(te.id, {
          exerciseLogId: loggedExercise?.id ?? null,
          sets,
          expanded: false,
        });
      });

      // Expand the first exercise that still has sets to log
      const firstUnfinished =
        workout.exercises?.find((te) => !states.get(te.id)?.sets.every((s) => s.logged)) ||
        workout.exercises?.[0];
      if (firstUnfinished && states.has(firstUnfinished.id)) {
        states.get(firstUnfinished.id)!.expanded = true;
      }

      return states;
    },
    []
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const [programsResponse, inProgressResponse] = await Promise.all([
        userProgramsApi.list(),
        workoutLogsApi.list({ status: 'in_progress', limit: 1, include_empty: true }),
      ]);

      let details: ProgramWithBlocks | null = null;

      if (programsResponse.data) {
        const active = programsResponse.data.find((p: UserProgramWithDetails) => p.is_active);
        setActiveProgram(active || null);

        if (active) {
          const detailsResponse = await programsApi.get(active.program_id);
          if (detailsResponse.data) {
            details = detailsResponse.data;
            setProgramDetails(details);

            if (active.current_week_id && details.blocks) {
              for (const block of details.blocks) {
                if (block.weeks) {
                  const currentWeek = block.weeks.find(w => w.id === active.current_week_id);
                  if (currentWeek && currentWeek.workouts) {
                    setCurrentWeekWorkouts(currentWeek.workouts);
                    break;
                  }
                }
              }
            }
          }
        }
      }

      // Pick back up an unfinished workout instead of silently starting a new one
      const inProgress = inProgressResponse.data?.[0];
      const template = findTemplateInProgram(details, inProgress?.workout_template_id ?? null);

      if (inProgress && template) {
        const fullLog = await workoutLogsApi.get(inProgress.id);
        const history = await fetchLastPerformance(template, inProgress.id);
        setLastPerformance(history);
        setExerciseStates(
          buildExerciseStates(template, history, fullLog.data ?? null, weightUnitRef.current)
        );
        setSelectedWorkout(template);
        setWorkoutLogId(inProgress.id);
        setResumed(true);
      }

      setLoading(false);
    };

    fetchData();
  }, [buildExerciseStates, fetchLastPerformance]);

  const handleStartWorkout = async (workout: WorkoutTemplateWithExercises) => {
    if (!activeProgram) return;
    setStartingWorkout(true);

    const response = await workoutLogsApi.create({
      user_program_id: activeProgram.id,
      workout_template_id: workout.id,
      workout_date: localToday(),
    });

    if (response.data) {
      const history = await fetchLastPerformance(workout, response.data.id);
      setLastPerformance(history);
      setExerciseStates(buildExerciseStates(workout, history, null, weightUnit));
      setWorkoutLogId(response.data.id);
      setSelectedWorkout(workout);
      setResumed(false);
    }
    setStartingWorkout(false);
  };

  const ensureExerciseLog = async (templateExercise: TemplateExerciseWithDetails): Promise<string | null> => {
    if (!workoutLogId) return null;

    const state = exerciseStates.get(templateExercise.id);
    if (state?.exerciseLogId) return state.exerciseLogId;

    const response = await exerciseLogsApi.create({
      workout_log_id: workoutLogId,
      exercise_id: templateExercise.exercise.id,
      template_exercise_id: templateExercise.id,
      exercise_order: templateExercise.exercise_order,
    });

    if (response.data) {
      setExerciseStates(prev => {
        const next = new Map(prev);
        const es = next.get(templateExercise.id);
        if (es) {
          es.exerciseLogId = response.data!.id;
        }
        return next;
      });
      return response.data.id;
    }
    return null;
  };

  const handleLogSet = async (templateExercise: TemplateExerciseWithDetails, setIndex: number) => {
    const state = exerciseStates.get(templateExercise.id);
    if (!state) return;

    const setData = state.sets[setIndex];
    const weight = parseFloat(setData.weight);
    const reps = parseInt(setData.reps);
    if (isNaN(reps) || reps <= 0) return;

    const exerciseLogId = await ensureExerciseLog(templateExercise);
    if (!exerciseLogId) return;

    const unit: 'lbs' | 'kg' = weightUnit === 'kg' ? 'kg' : 'lbs';

    const response = await setLogsApi.create({
      exercise_log_id: exerciseLogId,
      set_number: setIndex + 1,
      set_type: 'working',
      weight_value: isNaN(weight) ? undefined : weight,
      weight_unit: unit as 'lbs' | 'kg',
      reps_completed: reps,
    });

    if (response.data) {
      setExerciseStates(prev => {
        const next = new Map(prev);
        const es = next.get(templateExercise.id);
        if (es) {
          es.sets[setIndex].logged = true;
          es.sets[setIndex].setLogId = response.data!.id;

          // Carry forward weight to next unlogged set
          const nextUnlogged = es.sets.findIndex((s, i) => i > setIndex && !s.logged);
          if (nextUnlogged !== -1 && !es.sets[nextUnlogged].weight && setData.weight) {
            es.sets[nextUnlogged].weight = setData.weight;
          }

          // Auto-expand next exercise if all sets logged
          const allLogged = es.sets.every(s => s.logged);
          if (allLogged) {
            es.expanded = false;
            const exercises = selectedWorkout?.exercises || [];
            const currentIdx = exercises.findIndex(e => e.id === templateExercise.id);
            const nextExercise = exercises[currentIdx + 1];
            if (nextExercise) {
              const nextState = next.get(nextExercise.id);
              if (nextState) nextState.expanded = true;
            }
          }
        }
        return next;
      });

      // Rest runs in the layout, so it keeps going if you leave this screen
      if (templateExercise.rest_seconds > 0) {
        startRest(templateExercise.rest_seconds);
      }
    }
  };

  const handleUnlogSet = async (templateExerciseId: string, setIndex: number) => {
    const state = exerciseStates.get(templateExerciseId);
    const setLogId = state?.sets[setIndex]?.setLogId;
    if (!setLogId) return;

    const response = await setLogsApi.delete(setLogId);
    if (response.error) return;

    setExerciseStates(prev => {
      const next = new Map(prev);
      const es = next.get(templateExerciseId);
      if (es) {
        es.sets[setIndex].logged = false;
        es.sets[setIndex].setLogId = undefined;
      }
      return next;
    });
  };

  const updateSetField = (templateExerciseId: string, setIndex: number, field: 'weight' | 'reps', value: string) => {
    setExerciseStates(prev => {
      const next = new Map(prev);
      const es = next.get(templateExerciseId);
      if (es) {
        es.sets[setIndex][field] = value;
      }
      return next;
    });
  };

  const toggleExpand = (templateExerciseId: string) => {
    setExerciseStates(prev => {
      const next = new Map(prev);
      const es = next.get(templateExerciseId);
      if (es) {
        es.expanded = !es.expanded;
      }
      return next;
    });
  };

  const toggleNotes = (id: string) => {
    setShowNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closeWorkout = () => {
    setSelectedWorkout(null);
    setWorkoutLogId(null);
    setExerciseStates(new Map());
    setLastPerformance(new Map());
    setResumed(false);
  };

  const getCompletionCount = useCallback(() => {
    let total = 0;
    let logged = 0;
    exerciseStates.forEach(es => {
      total += es.sets.length;
      logged += es.sets.filter(s => s.logged).length;
    });
    return { total, logged };
  }, [exerciseStates]);

  const handleFinishWorkout = async () => {
    const { logged } = getCompletionCount();

    if (workoutLogId) {
      if (logged === 0) {
        // Nothing was logged - don't leave an empty session in the history
        const discard = window.confirm(
          'No sets were logged. Discard this workout?'
        );
        if (!discard) return;
        await workoutLogsApi.delete(workoutLogId);
      } else {
        await workoutLogsApi.update(workoutLogId, {
          completed_at: new Date().toISOString(),
        });
      }
    }

    stopRest();
    closeWorkout();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Active workout view
  if (selectedWorkout) {
    const { total, logged } = getCompletionCount();
    const progress = total > 0 ? (logged / total) * 100 : 0;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={closeWorkout}
              className="p-1 -ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Back to workout list"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 truncate">
              {selectedWorkout.name}
            </h1>
          </div>
          <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">
            {logged}/{total} sets
          </span>
        </div>

        {resumed && (
          <div className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg px-3 py-2">
            Picked up where you left off - your logged sets were saved.
          </div>
        )}

        {/* Progress bar */}
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Exercise List */}
        <div className="space-y-3">
          {selectedWorkout.exercises?.map((templateExercise, index) => {
            const state = exerciseStates.get(templateExercise.id);
            if (!state) return null;
            const allLogged = state.sets.every(s => s.logged);
            const history = lastPerformance.get(templateExercise.exercise?.id || '');
            const previousSets = workingSetsOf(history);

            return (
              <div
                key={templateExercise.id}
                className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden ${
                  allLogged ? 'ring-1 ring-green-500/30' : ''
                }`}
              >
                {/* Exercise header - clickable to expand/collapse */}
                <button
                  onClick={() => toggleExpand(templateExercise.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      allLogged
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {allLogged ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                        {templateExercise.exercise?.name || 'Exercise'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {templateExercise.working_sets}x {templateExercise.rep_range_min}-{templateExercise.rep_range_max}
                        {templateExercise.rir !== null && ` @ RIR ${templateExercise.rir}`}
                        {templateExercise.rest_seconds > 0 && ` | ${Math.round(templateExercise.rest_seconds / 60)}min rest`}
                      </p>
                      {previousSets.length > 0 && history && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 truncate mt-0.5">
                          Last {formatLastDate(history.workout_date)}:{' '}
                          {previousSets.map((s) => formatLastSet(s, weightUnit)).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${state.expanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded: notes + set inputs */}
                {state.expanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Notes/cues toggle */}
                    {templateExercise.notes && (
                      <div>
                        <button
                          onClick={() => toggleNotes(templateExercise.id)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {showNotes.has(templateExercise.id) ? 'Hide cues' : 'Show cues'}
                        </button>
                        {showNotes.has(templateExercise.id) && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 bg-slate-50 dark:bg-slate-700/50 p-2 rounded leading-relaxed">
                            {templateExercise.notes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Set inputs */}
                    <div className="space-y-2">
                      {state.sets.map((setData, setIndex) => {
                        const previous = previousSets[setIndex];
                        return (
                          <div key={setIndex} className="space-y-0.5">
                            <div
                              className={`flex items-center gap-2 p-2 rounded-lg ${
                                setData.logged
                                  ? 'bg-green-50 dark:bg-green-900/20'
                                  : 'bg-slate-50 dark:bg-slate-700/50'
                              }`}
                            >
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-8 text-center">
                                S{setIndex + 1}
                              </span>
                              <input
                                type="number"
                                inputMode="decimal"
                                placeholder={
                                  previous && lastWeightIn(previous, weightUnit) !== null
                                    ? String(lastWeightIn(previous, weightUnit))
                                    : weightUnit
                                }
                                value={setData.weight}
                                onChange={(e) => updateSetField(templateExercise.id, setIndex, 'weight', e.target.value)}
                                disabled={setData.logged}
                                className="w-20 px-2 py-1.5 text-sm text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50"
                              />
                              <span className="text-slate-400 text-xs">x</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                placeholder={previous?.reps_completed ? String(previous.reps_completed) : 'reps'}
                                value={setData.reps}
                                onChange={(e) => updateSetField(templateExercise.id, setIndex, 'reps', e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleLogSet(templateExercise, setIndex)}
                                disabled={setData.logged}
                                className="w-16 px-2 py-1.5 text-sm text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50"
                              />
                              {setData.logged ? (
                                <button
                                  onClick={() => handleUnlogSet(templateExercise.id, setIndex)}
                                  className="ml-auto px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 flex-shrink-0"
                                >
                                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Undo
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleLogSet(templateExercise, setIndex)}
                                  disabled={!setData.reps}
                                  className="ml-auto px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:dark:bg-slate-600 text-white rounded-lg transition-colors flex-shrink-0"
                                >
                                  Log
                                </button>
                              )}
                            </div>
                            {previous && !setData.logged && (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 pl-11">
                                Last time: {formatLastSet(previous, weightUnit)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Finish Workout Button */}
        <button
          onClick={handleFinishWorkout}
          className="w-full px-4 py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
        >
          Finish Workout ({logged}/{total} sets logged)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Start Workout
        </h1>
        <Link
          to="/history"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Workout history
        </Link>
      </div>

      {/* From Program Section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          From Program
        </h2>

        {activeProgram && programDetails ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {activeProgram.program_name || programDetails.name}
              </span>
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                Active
              </span>
            </div>

            {currentWeekWorkouts.length > 0 ? (
              <div className="space-y-3">
                {currentWeekWorkouts.map((workout) => (
                  <button
                    key={workout.id}
                    onClick={() => handleStartWorkout(workout)}
                    disabled={startingWorkout}
                    className="w-full text-left p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-slate-800 dark:text-slate-100">
                          Day {workout.day_number}: {workout.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {workout.exercises?.slice(0, 4).map(e => e.exercise?.name).filter(Boolean).join(', ')}
                          {(workout.exercises?.length || 0) > 4 && ` +${(workout.exercises?.length || 0) - 4} more`}
                        </p>
                      </div>
                      {startingWorkout ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <svg
                          className="w-5 h-5 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                No workouts found for current week
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <p>No active program</p>
            <Link
              to="/programs"
              className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
            >
              Start a program first
            </Link>
          </div>
        )}
      </div>

      {/* Import prompt when no program */}
      {!activeProgram && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Get Started
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Import a workout program to start tracking your lifts
          </p>
          <Link
            to="/programs"
            className="block w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-center font-medium"
          >
            Import a Program
          </Link>
        </div>
      )}
    </div>
  );
}
