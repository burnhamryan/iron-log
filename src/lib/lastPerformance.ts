// Helpers for showing what was lifted the last time an exercise was performed.
import { convertWeight, type WeightUnit } from './units';
import type { LastExercisePerformance, LastPerformedSet } from '../types';

/** Weight as entered last time, expressed in the unit the user is currently using. */
export function lastWeightIn(set: LastPerformedSet, unit: WeightUnit): number | null {
  if (set.weight_value === null || set.weight_value === undefined) return null;
  return convertWeight(Number(set.weight_value), set.weight_unit, unit);
}

export function formatLastSet(set: LastPerformedSet, unit: WeightUnit): string {
  const reps = set.reps_completed ?? 0;
  const weight = lastWeightIn(set, unit);
  return weight === null ? `BW x ${reps}` : `${weight} x ${reps}`;
}

export function formatLastDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Working sets only - warmups aren't matched against the prescription. */
export function workingSetsOf(
  performance: LastExercisePerformance | undefined
): LastPerformedSet[] {
  if (!performance) return [];
  const working = performance.sets.filter((s) => s.set_type === 'working');
  return working.length > 0 ? working : performance.sets;
}

/**
 * What was lifted for a given set index last time. Falls back to the final set
 * when last session had fewer sets than today's prescription.
 */
export function previousSetFor(
  previousSets: LastPerformedSet[],
  setIndex: number
): LastPerformedSet | undefined {
  if (previousSets.length === 0) return undefined;
  return previousSets[setIndex] ?? previousSets[previousSets.length - 1];
}
