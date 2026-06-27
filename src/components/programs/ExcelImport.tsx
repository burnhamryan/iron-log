import { useState, useRef } from 'react';
import { programsApi } from '../../lib/api';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface ExcelImportProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportSummary {
  blocks: number;
  workouts: number;
  exercises: number;
}

export function ExcelImport({ onClose, onSuccess }: ExcelImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [programName, setProgramName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

  const isValidFile = (name: string) =>
    ACCEPTED_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!isValidFile(selectedFile.name)) {
        setError('Please select a CSV or Excel file (.csv, .xlsx, .xls)');
        return;
      }
      setFile(selectedFile);
      setError(null);
      if (!programName) {
        const baseName = selectedFile.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        setProgramName(baseName);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (!isValidFile(droppedFile.name)) {
        setError('Please select a CSV or Excel file (.csv, .xlsx, .xls)');
        return;
      }
      setFile(droppedFile);
      setError(null);
      if (!programName) {
        const baseName = droppedFile.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        setProgramName(baseName);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (programName.trim()) {
        formData.append('programName', programName.trim());
      }

      const response = await programsApi.import(formData);

      if (response.error) {
        setError(response.error);
      } else if (response.data) {
        setSummary(response.data.summary);
      }
    } catch {
      setError('Failed to import program. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (summary) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
              Program Imported
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {programName || file?.name || 'Your program'} is ready to use.
            </p>
            <div className="flex justify-center gap-6 mb-6 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{summary.blocks}</div>
                <div className="text-slate-500 dark:text-slate-400">Blocks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{summary.workouts}</div>
                <div className="text-slate-500 dark:text-slate-400">Workouts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{summary.exercises}</div>
                <div className="text-slate-500 dark:text-slate-400">Exercises</div>
              </div>
            </div>
            <button
              onClick={onSuccess}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
            >
              View Program
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            Import Program
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Program Name
            </label>
            <input
              type="text"
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder="e.g. Min-Max Program"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              file
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {file ? (
              <div className="text-green-600 dark:text-green-400">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm mt-1">Click to change file</p>
              </div>
            ) : (
              <div className="text-slate-500 dark:text-slate-400">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="font-medium">Drop file here</p>
                <p className="text-sm mt-1">CSV or Excel (.csv, .xlsx, .xls)</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            <p className="font-medium mb-1">Supported formats:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>CSV with columns: block, day, exercise, sets, reps, etc.</li>
              <li>Jeff Nippard Min-Max Program (Excel)</li>
            </ul>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Importing...
                </>
              ) : (
                'Import Program'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
