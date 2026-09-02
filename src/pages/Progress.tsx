import { useState, useEffect } from 'react';
import { exercisesApi, progressApi, bodyWeightApi, proteinApi } from '../lib/api';
import type { Exercise, ExerciseProgress, BodyWeightLog, ProteinSummary } from '../types';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ProteinTab } from '../components/protein/ProteinTab';
import { useUserContext } from '../contexts/UserContext';
import { formatDateOnly } from '../lib/dates';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export function Progress() {
  const { weightUnit } = useUserContext();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [exerciseProgress, setExerciseProgress] = useState<ExerciseProgress[]>([]);
  const [bodyWeightLogs, setBodyWeightLogs] = useState<BodyWeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'exercises' | 'bodyweight' | 'protein'>('exercises');
  const [proteinSummary, setProteinSummary] = useState<ProteinSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const [exercisesRes, bodyWeightRes, proteinRes] = await Promise.all([
        exercisesApi.list(),
        bodyWeightApi.list({ limit: 30 }),
        proteinApi.getSummary(30),
      ]);

      if (exercisesRes.data) {
        setExercises(exercisesRes.data);
      }
      if (bodyWeightRes.data) {
        setBodyWeightLogs(bodyWeightRes.data);
      }
      if (proteinRes.data) {
        setProteinSummary(proteinRes.data);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (selectedExercise) {
      setProgressLoading(true);
      setProgressError(null);
      progressApi.getExerciseProgress(selectedExercise, { days: 90 }).then((res) => {
        if (res.data) {
          setExerciseProgress(res.data);
        } else if (res.error) {
          setProgressError(res.error);
        }
        setProgressLoading(false);
      });
    }
  }, [selectedExercise]);

  const filteredExercises = searchQuery
    ? exercises.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : exercises;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Progress
      </h1>

      {/* Tab Selector */}
      <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('exercises')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'exercises'
              ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Exercises
        </button>
        <button
          onClick={() => setActiveTab('bodyweight')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'bodyweight'
              ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Body Weight
        </button>
        <button
          onClick={() => setActiveTab('protein')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'protein'
              ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Protein
        </button>
      </div>

      {activeTab === 'protein' ? (
        <ProteinTab summary={proteinSummary} />
      ) : activeTab === 'exercises' ? (
        <div className="space-y-6">
          {/* Exercise Selector */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Select Exercise
            </label>
            <input
              type="text"
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 mb-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
            >
              <option value="">Choose an exercise...</option>
              {filteredExercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                  {exercise.category ? ` (${exercise.category})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Progress Chart */}
          {selectedExercise && (
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
                Weight Progress
              </h2>
              {progressLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner size="md" />
                </div>
              ) : progressError ? (
                <div className="text-center py-8 text-red-500 dark:text-red-400">
                  <p>{progressError}</p>
                </div>
              ) : exerciseProgress.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={exerciseProgress}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis
                        dataKey="date"
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        tickFormatter={(value) => formatDateOnly(value, { month: 'short', day: 'numeric' })}
                      />
                      <YAxis
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF' }}
                        label={{
                          value: weightUnit,
                          angle: -90,
                          position: 'insideLeft',
                          fill: '#9CA3AF',
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: 'none',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#F3F4F6' }}
                        labelFormatter={(value) => formatDateOnly(value)}
                      />
                      <Line
                        type="monotone"
                        dataKey="max_weight"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        dot={{ fill: '#3B82F6', r: 4 }}
                        activeDot={{ r: 6 }}
                        name={`Max Weight (${weightUnit})`}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <p>No data yet for this exercise</p>
                  <p className="text-sm mt-1">Start logging workouts to see progress</p>
                </div>
              )}
            </div>
          )}

          {!selectedExercise && (
            <div className="bg-white dark:bg-slate-800 rounded-lg p-8 text-center shadow-sm">
              <svg
                className="w-16 h-16 mx-auto text-slate-400 dark:text-slate-600 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <p className="text-slate-600 dark:text-slate-400">
                Select an exercise to view your progress over time
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
            Body Weight History
          </h2>
          {bodyWeightLogs.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={bodyWeightLogs
                    .slice()
                    .reverse()
                    .map((log) => ({
                      date: formatDateOnly(log.logged_at),
                      weight: log.weight_value,
                    }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <YAxis
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF' }}
                    domain={['auto', 'auto']}
                    label={{
                      value: weightUnit,
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#9CA3AF',
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#F3F4F6' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={{ fill: '#10B981', r: 4 }}
                    activeDot={{ r: 6 }}
                    name={`Body Weight (${weightUnit})`}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <p>No body weight data yet</p>
              <p className="text-sm mt-1">Log your weight from the home page</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
