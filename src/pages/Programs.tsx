import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { programsApi } from '../lib/api';
import type { Program } from '../types';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ExcelImport } from '../components/programs/ExcelImport';

export function Programs() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const fetchPrograms = async () => {
    setLoading(true);
    const response = await programsApi.list();
    if (response.data) {
      setPrograms(response.data);
    } else if (response.error) {
      setError(response.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPrograms();
  }, []);

  const handleImportSuccess = () => {
    setShowImport(false);
    fetchPrograms();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Programs
        </h1>
        <button
          onClick={() => setShowImport(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Import
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error}
        </div>
      )}

      {programs.length === 0 ? (
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
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            No programs yet
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Import a workout program to get started
          </p>
          <button
            onClick={() => setShowImport(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Import Your First Program
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {programs.map((program) => (
            <Link
              key={program.id}
              to={`/programs/${program.id}`}
              className="block bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {program.name}
                  </h2>
                  {program.description && (
                    <p className="text-slate-600 dark:text-slate-400 mt-1">
                      {program.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-sm text-slate-500 dark:text-slate-400">
                    <span>{program.frequency_per_week}x per week</span>
                    {program.source && <span>by {program.source}</span>}
                  </div>
                </div>
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
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <ExcelImport onClose={() => setShowImport(false)} onSuccess={handleImportSuccess} />
      )}
    </div>
  );
}
