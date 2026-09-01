import { useState, useEffect, useRef, useCallback } from 'react';
import { proteinApi, proteinFoodsApi } from '../../lib/api';
import { proteinGramsFor, unitOptionsFor } from '../../lib/protein';
import { LoadingSpinner } from '../common/LoadingSpinner';
import type { ProteinFood } from '../../types';

type Mode = 'food' | 'grams';

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Two ways in, because that's all this needs: look a food up and give a
 * weight, or type the grams straight off a nutrition label.
 */
export function AddProteinSheet({ onClose, onAdded }: Props) {
  const [mode, setMode] = useState<Mode>('food');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProteinFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProteinFood | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [directGrams, setDirectGrams] = useState('');
  const [directLabel, setDirectLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const [searchError, setSearchError] = useState<string | null>(null);

  const runSearch = useCallback(async (term: string) => {
    setSearching(true);
    const response = await proteinFoodsApi.search(term, 25);
    // Distinguish "nothing matched" from "the lookup failed" - showing the
    // former for both hides real breakage.
    setSearchError(response.error ?? null);
    setResults(response.data || []);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (mode !== 'food' || selected) return;
    const timeout = setTimeout(() => runSearch(query), query ? 200 : 0);
    return () => clearTimeout(timeout);
  }, [query, mode, selected, runSearch]);

  const handleSelect = (food: ProteinFood) => {
    setSelected(food);
    const units = unitOptionsFor(food);
    setUnit(units[0]);
    // Default to one serving, in the food's own terms where that reads naturally
    setQuantity(units[0] === food.serving_unit ? String(food.serving_size) : '');
    setError(null);
  };

  const preview =
    selected && quantity
      ? proteinGramsFor(selected, parseFloat(quantity), unit)
      : null;

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);

    const response =
      mode === 'food' && selected
        ? await proteinApi.create({
            food_id: selected.id,
            quantity: parseFloat(quantity),
            quantity_unit: unit,
          })
        : await proteinApi.create({
            grams: parseFloat(directGrams),
            label: directLabel.trim() || undefined,
          });

    setSaving(false);
    if (response.error) {
      setError(response.error);
      return;
    }
    onAdded();
    onClose();
  };

  const canSubmit =
    mode === 'food'
      ? selected !== null && preview !== null && preview > 0
      : parseFloat(directGrams) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full md:max-w-md bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl p-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Add protein
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode switch */}
        <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1 mb-4">
          {(['food', 'grams'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {m === 'food' ? 'Look up a food' : 'Type grams'}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        {mode === 'grams' ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Straight off the label - just the protein grams.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                placeholder="grams"
                value={directGrams}
                onChange={(e) => setDirectGrams(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
                className="w-24 px-3 py-2 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
              <span className="text-slate-500 dark:text-slate-400 text-sm">g of</span>
              <input
                type="text"
                placeholder="what it was (optional)"
                value={directLabel}
                onChange={(e) => setDirectLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
                className="flex-1 min-w-0 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        ) : selected ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100">{selected.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selected.protein}g protein per {selected.serving_size} {selected.serving_unit}
                </p>
              </div>
              <button
                onClick={() => { setSelected(null); setQuantity(''); }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
              >
                Change
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                placeholder="how much"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
                className="w-28 px-3 py-2 text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              />
              {unitOptionsFor(selected).length > 1 ? (
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                >
                  {unitOptionsFor(selected).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              ) : (
                <span className="text-slate-600 dark:text-slate-300 text-sm">{unit}</span>
              )}
              <span className="ml-auto text-lg font-semibold text-slate-800 dark:text-slate-100">
                {preview === null ? '--' : `${preview}g`}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search foods (chicken, yogurt, whey...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
            />
            {searching ? (
              <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>
            ) : searchError ? (
              <div className="py-6 text-center space-y-2">
                <p className="text-sm text-red-600 dark:text-red-400">
                  Food lookup failed: {searchError}
                </p>
                <button
                  onClick={() => runSearch(query)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : results.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                {query
                  ? `Nothing matched "${query}". Use "Type grams" for anything with a label.`
                  : 'Start typing to search foods.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {results.map((food) => (
                  <li key={food.id}>
                    <button
                      onClick={() => handleSelect(food)}
                      className="w-full text-left py-2.5 flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-slate-800 dark:text-slate-100 truncate">
                          {food.name}
                          {food.is_custom && (
                            <span className="ml-1.5 text-[10px] text-blue-600 dark:text-blue-400">yours</span>
                          )}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {food.protein}g per {food.serving_size} {food.serving_unit}
                        </span>
                      </span>
                      <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || saving}
          className="w-full mt-5 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:dark:bg-slate-600 text-white rounded-lg font-medium transition-colors"
        >
          {saving ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  );
}
