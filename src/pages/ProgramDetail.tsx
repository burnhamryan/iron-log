import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { programsApi, userProgramsApi } from '../lib/api';
import type { ProgramWithBlocks } from '../types';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export function ProgramDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [program, setProgram] = useState<ProgramWithBlocks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;

    const fetchProgram = async () => {
      setLoading(true);
      const response = await programsApi.get(id);
      if (response.data) {
        setProgram(response.data);
        if (response.data.blocks && response.data.blocks.length > 0) {
          setExpandedBlocks(new Set([response.data.blocks[0].id]));
          // Auto-expand first week too
          const firstWeek = response.data.blocks[0].weeks?.[0];
          if (firstWeek) {
            setExpandedWeeks(new Set([firstWeek.id]));
          }
        }
      } else if (response.error) {
        setError(response.error);
      }
      setLoading(false);
    };

    fetchProgram();
  }, [id]);

  const handleStartProgram = async () => {
    if (!id) return;
    setStarting(true);
    const response = await userProgramsApi.start(id);
    if (response.data) {
      navigate('/');
    } else if (response.error) {
      setError(response.error);
    }
    setStarting(false);
  };

  const handleDeleteProgram = async () => {
    if (!id) return;
    setDeleting(true);
    const response = await programsApi.delete(id);
    if (response.error) {
      setError(response.error);
      setDeleting(false);
      setShowDeleteConfirm(false);
    } else {
      navigate('/programs');
    }
  };

  const toggleBlock = (blockId: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const toggleWeek = (weekId: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekId)) {
        next.delete(weekId);
      } else {
        next.add(weekId);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!program?.blocks) return;
    const blockIds = new Set(program.blocks.map(b => b.id));
    const weekIds = new Set<string>();
    program.blocks.forEach(b => b.weeks?.forEach(w => weekIds.add(w.id)));
    setExpandedBlocks(blockIds);
    setExpandedWeeks(weekIds);
  };

  const collapseAll = () => {
    setExpandedBlocks(new Set());
    setExpandedWeeks(new Set());
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="space-y-4">
        <Link
          to="/programs"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Programs
        </Link>
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error || 'Program not found'}
        </div>
      </div>
    );
  }

  const totalExercises = program.blocks?.reduce(
    (sum, b) => sum + (b.weeks?.reduce(
      (wSum, w) => wSum + (w.workouts?.reduce(
        (woSum, wo) => woSum + (wo.exercises?.length || 0), 0) || 0), 0) || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/programs"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-3"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Programs
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{program.name}</h1>
            {program.description && (
              <p className="text-slate-600 dark:text-slate-400 mt-1">{program.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500 dark:text-slate-400">
              <span>{program.frequency_per_week}x per week</span>
              {program.source && <span>by {program.source}</span>}
              <span>{program.blocks?.length || 0} blocks</span>
              <span>{totalExercises} exercises</span>
            </div>
          </div>
          <button
            onClick={handleStartProgram}
            disabled={starting}
            className="flex-shrink-0 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
          >
            {starting ? (
              <>
                <LoadingSpinner size="sm" />
                Starting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Program
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expand/Collapse controls */}
      {program.blocks && program.blocks.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Expand all
          </button>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Collapse all
          </button>
        </div>
      )}

      {/* Blocks */}
      {program.blocks && program.blocks.length > 0 ? (
        <div className="space-y-4">
          {program.blocks.map((block) => (
            <div
              key={block.id}
              className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden"
            >
              {/* Block Header */}
              <button
                onClick={() => toggleBlock(block.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {block.name}
                </h2>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${
                    expandedBlocks.has(block.id) ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Block Content */}
              {expandedBlocks.has(block.id) && block.weeks && (
                <div className="border-t border-slate-200 dark:border-slate-700">
                  {block.weeks.map((week) => (
                    <div key={week.id} className="border-b border-slate-100 dark:border-slate-700 last:border-b-0">
                      {/* Week Header */}
                      <button
                        onClick={() => toggleWeek(week.id)}
                        className="w-full px-6 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {week.name}
                          </span>
                          {week.week_type !== 'normal' && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                week.week_type === 'deload'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              }`}
                            >
                              {week.week_type}
                            </span>
                          )}
                        </div>
                        <svg
                          className={`w-4 h-4 text-slate-400 transition-transform ${
                            expandedWeeks.has(week.id) ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Week Content - Workouts */}
                      {expandedWeeks.has(week.id) && week.workouts && (
                        <div className="px-6 pb-4 space-y-4">
                          {week.workouts.map((workout) => (
                            <div
                              key={workout.id}
                              className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4"
                            >
                              <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-3">
                                {workout.name}
                              </h4>
                              <div className="space-y-1">
                                {workout.exercises?.map((templateExercise) => (
                                  <div
                                    key={templateExercise.id}
                                    className="py-2 border-b border-slate-100 dark:border-slate-600 last:border-b-0"
                                  >
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="font-medium text-slate-700 dark:text-slate-300">
                                        {templateExercise.exercise?.name || 'Unknown Exercise'}
                                      </span>
                                      <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap ml-3">
                                        {templateExercise.working_sets} x {templateExercise.rep_range_min}-
                                        {templateExercise.rep_range_max}
                                        {templateExercise.rir !== null && ` @ ${templateExercise.rir} RIR`}
                                      </span>
                                    </div>
                                    {templateExercise.notes && (
                                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                        {templateExercise.notes}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-8 text-center shadow-sm">
          <p className="text-slate-600 dark:text-slate-400">
            This program has no workout data yet.
          </p>
        </div>
      )}

      {/* Delete Program */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
          Danger Zone
        </h2>
        {showDeleteConfirm ? (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">
              Are you sure you want to delete "{program.name}"? This will remove all blocks, weeks, and workout templates. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteProgram}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Program'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete Program
          </button>
        )}
      </div>
    </div>
  );
}
