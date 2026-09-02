import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { workoutLogsApi } from '../lib/api';
import { useUserContext } from '../contexts/UserContext';
import { convertWeight, type WeightUnit } from '../lib/units';
import { formatDateOnly } from '../lib/dates';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import type { WorkoutLogSummary, WorkoutLogWithExercises, SetLog } from '../types';

const PAGE_SIZE = 20;

function formatDate(date: string): string {
  return formatDateOnly(date, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSet(set: SetLog, unit: WeightUnit): string {
  const reps = set.reps_completed ?? 0;
  if (set.weight_value === null || set.weight_value === undefined) return `BW x ${reps}`;
  return `${convertWeight(Number(set.weight_value), set.weight_unit, unit)} x ${reps}`;
}

function formatDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const minutes = Math.round(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000
  );
  if (minutes <= 0 || minutes > 24 * 60) return null;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function History() {
  const { weightUnit } = useUserContext();
  const [workouts, setWorkouts] = useState<WorkoutLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Map<string, WorkoutLogWithExercises>>(new Map());
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const loadPage = useCallback(async (offset: number) => {
    const response = await workoutLogsApi.list({ limit: PAGE_SIZE, offset });
    if (response.error) {
      setError(response.error);
      return [];
    }
    const page = response.data || [];
    setHasMore(page.length === PAGE_SIZE);
    return page;
  }, []);

  useEffect(() => {
    const fetchFirstPage = async () => {
      setLoading(true);
      const page = await loadPage(0);
      setWorkouts(page);
      setLoading(false);
    };
    fetchFirstPage();
  }, [loadPage]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const page = await loadPage(workouts.length);
    setWorkouts((prev) => [...prev, ...page]);
    setLoadingMore(false);
  };

  const handleToggle = async (workout: WorkoutLogSummary) => {
    if (expandedId === workout.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(workout.id);
    if (details.has(workout.id)) return;

    setDetailLoading(workout.id);
    const response = await workoutLogsApi.get(workout.id);
    if (response.data) {
      setDetails((prev) => new Map(prev).set(workout.id, response.data!));
    }
    setDetailLoading(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Workout History
      </h1>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}

      {workouts.length === 0 && !error ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-8 text-center shadow-sm">
          <p className="text-slate-600 dark:text-slate-400">No workouts logged yet</p>
          <Link
            to="/workout"
            className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
          >
            Start a workout
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {workouts.map((workout) => {
            const detail = details.get(workout.id);
            const duration = formatDuration(workout.started_at, workout.completed_at);

            return (
              <div
                key={workout.id}
                className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => handleToggle(workout)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                >
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                      {workout.workout_name || 'Workout'}
                      {!workout.completed_at && (
                        <span className="ml-2 px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full align-middle">
                          In progress
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatDate(workout.workout_date)} &middot; {workout.exercise_count}{' '}
                      {workout.exercise_count === 1 ? 'exercise' : 'exercises'} &middot;{' '}
                      {workout.set_count} {workout.set_count === 1 ? 'set' : 'sets'}
                      {duration && ` · ${duration}`}
                    </p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${
                      expandedId === workout.id ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedId === workout.id && (
                  <div className="px-4 pb-4">
                    {detailLoading === workout.id ? (
                      <div className="flex justify-center py-4">
                        <LoadingSpinner size="sm" />
                      </div>
                    ) : detail && detail.exercises.length > 0 ? (
                      <div className="space-y-3">
                        {detail.exercises.map((exerciseLog) => (
                          <div key={exerciseLog.id}>
                            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {exerciseLog.exercise?.name || 'Exercise'}
                            </h3>
                            {exerciseLog.sets.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {exerciseLog.sets.map((set) => (
                                  <span
                                    key={set.id}
                                    className="px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                                  >
                                    {formatSet(set, weightUnit)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                No sets logged
                              </p>
                            )}
                          </div>
                        ))}
                        {detail.notes && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 p-2 rounded">
                            {detail.notes}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
                        No exercises logged for this workout
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg shadow-sm text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
