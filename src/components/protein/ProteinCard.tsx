import { useState, useEffect, useCallback } from 'react';
import { proteinApi } from '../../lib/api';
import { formatQuantity } from '../../lib/protein';
import { AddProteinSheet } from './AddProteinSheet';
import type { ProteinDay, ProteinQuickAdd } from '../../types';

export function ProteinCard({ autoOpenAdd = false }: { autoOpenAdd?: boolean }) {
  const [day, setDay] = useState<ProteinDay | null>(null);
  const [quickAdds, setQuickAdds] = useState<ProteinQuickAdd[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(autoOpenAdd);
  const [pending, setPending] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showEntries, setShowEntries] = useState(false);

  const fetchState = useCallback(async () => {
    const [dayRes, quickRes] = await Promise.all([
      proteinApi.getDay(),
      proteinApi.getQuickAdds(6),
    ]);
    return {
      day: dayRes.data ?? null,
      quickAdds: quickRes.data ?? [],
      error: dayRes.error ?? null,
    };
  }, []);

  const load = useCallback(async () => {
    const next = await fetchState();
    setDay(next.day);
    setQuickAdds(next.quickAdds);
    setLoadError(next.error);
  }, [fetchState]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const next = await fetchState();
      if (cancelled) return;
      setDay(next.day);
      setQuickAdds(next.quickAdds);
      setLoadError(next.error);
      setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fetchState]);

  const handleQuickAdd = async (quick: ProteinQuickAdd) => {
    setPending(quick.label);
    // Re-derive from the food when it's a lookup, so a corrected food value
    // flows through; otherwise repeat the grams as logged.
    await proteinApi.create(
      quick.food_id && quick.quantity !== null && quick.quantity_unit
        ? { food_id: quick.food_id, quantity: quick.quantity, quantity_unit: quick.quantity_unit }
        : { grams: quick.grams, label: quick.label }
    );
    await load();
    setPending(null);
  };

  const handleDelete = async (id: string) => {
    setPending(id);
    await proteinApi.delete(id);
    await load();
    setPending(null);
  };

  const total = day?.total_grams ?? 0;
  const goal = day?.goal_grams ?? 200;
  const remaining = Math.max(0, Math.round((goal - total) * 10) / 10);
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  const hitGoal = total >= goal;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm">
      <div className="flex items-end justify-between mb-2">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Protein today
        </h2>
        <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
          <span className={`text-xl font-bold ${
            hitGoal ? 'text-green-600 dark:text-green-400' : 'text-slate-800 dark:text-slate-100'
          }`}>
            {loading ? '--' : total}
          </span>
          {' '}/ {goal} g
        </span>
      </div>

      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-1">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            hitGoal ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        {loading
          ? ' '
          : hitGoal
            ? `Goal hit - ${Math.round((total - goal) * 10) / 10}g over`
            : `${remaining}g to go`}
      </p>

      {/* One tap for the things you eat most */}
      {quickAdds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {quickAdds.map((quick) => (
            <button
              key={`${quick.label}-${quick.quantity}-${quick.quantity_unit}`}
              onClick={() => handleQuickAdd(quick)}
              disabled={pending !== null}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-full transition-colors disabled:opacity-50"
            >
              {pending === quick.label ? '...' : `+${quick.grams}g ${quick.label}`}
            </button>
          ))}
        </div>
      )}

      {loadError && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-3">
          Couldn&apos;t load today&apos;s protein: {loadError}
        </p>
      )}

      <button
        onClick={() => setShowSheet(true)}
        className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
      >
        Add protein
      </button>

      {/* Today's entries, collapsed by default to keep the card small */}
      {day && day.entries.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowEntries((prev) => !prev)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showEntries
              ? 'Hide entries'
              : `${day.entries.length} ${day.entries.length === 1 ? 'entry' : 'entries'} today`}
          </button>

          {showEntries && (
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
              {day.entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between py-2 gap-2">
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-800 dark:text-slate-100 truncate">
                      {entry.label}
                    </span>
                    {entry.quantity !== null && entry.quantity_unit && (
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {formatQuantity(entry.quantity, entry.quantity_unit)}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                      {entry.grams}g
                    </span>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={pending !== null}
                      className="text-slate-400 hover:text-red-500 disabled:opacity-50"
                      aria-label={`Remove ${entry.label}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showSheet && (
        <AddProteinSheet onClose={() => setShowSheet(false)} onAdded={load} />
      )}
    </div>
  );
}
