import { useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { useUserContext } from '../contexts/UserContext';
import { usersApi, workoutLogsApi, bodyWeightApi } from '../lib/api';

export function Settings() {
  const { user, refreshUser } = useAuthContext();
  const { preferredUnit, setPreferredUnit, isDarkMode, toggleDarkMode } = useUserContext();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUnitChange = async (unit: 'imperial' | 'metric') => {
    setPreferredUnit(unit);
    setSaving(true);
    setMessage(null);

    const response = await usersApi.update({ preferred_unit: unit });

    if (response.error) {
      setMessage({ type: 'error', text: response.error });
    } else {
      setMessage({ type: 'success', text: 'Preferences saved!' });
      refreshUser();
    }

    setSaving(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExportData = async () => {
    setExporting(true);
    setMessage(null);

    try {
      const [workoutsRes, bodyWeightRes] = await Promise.all([
        workoutLogsApi.list({ limit: 1000 }),
        bodyWeightApi.list({ limit: 1000 }),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        workouts: workoutsRes.data || [],
        body_weight: bodyWeightRes.data || [],
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iron-log-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: 'Data exported successfully!' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to export data' });
    }

    setExporting(false);
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Settings
      </h1>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Account Info */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Account
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
              Email
            </label>
            <p className="text-slate-800 dark:text-slate-100">{user?.email || '-'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400">
              Name
            </label>
            <p className="text-slate-800 dark:text-slate-100">
              {user?.first_name || user?.last_name
                ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Unit Preference */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Units
        </h2>
        <div className="flex gap-4">
          <button
            onClick={() => handleUnitChange('imperial')}
            disabled={saving}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
              preferredUnit === 'imperial'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            <div className="font-semibold">Imperial</div>
            <div className="text-sm mt-1">lbs, ft, in</div>
          </button>
          <button
            onClick={() => handleUnitChange('metric')}
            disabled={saving}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
              preferredUnit === 'metric'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            <div className="font-semibold">Metric</div>
            <div className="text-sm mt-1">kg, cm</div>
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Appearance
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">Dark Mode</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Use dark theme for the app
            </p>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              isDarkMode ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <div
              className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                isDarkMode ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Data */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Data
        </h2>
        <div className="space-y-4">
          <button
            onClick={handleExportData}
            disabled={exporting}
            className="w-full text-left px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {exporting ? 'Exporting...' : 'Export Data'}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Download all your workout data as JSON
            </p>
          </button>
        </div>
      </div>

      {/* App Info */}
      <div className="text-center text-sm text-slate-500 dark:text-slate-400">
        <p>Iron Log v1.0.0</p>
      </div>
    </div>
  );
}
