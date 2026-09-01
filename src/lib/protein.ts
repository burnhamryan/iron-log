// Protein maths shared by the API (which is authoritative) and the UI preview.

export const DEFAULT_PROTEIN_GOAL = 200;

const GRAMS_PER_OZ = 28.3495;
const ML_PER_FL_OZ = 29.5735;

export interface ProteinFoodLike {
  serving_size: number;
  serving_unit: string;
  protein: number;
}

/** Units that measure the same physical thing can be converted between. */
const WEIGHT_UNITS: Record<string, number> = { g: 1, oz: GRAMS_PER_OZ };
const VOLUME_UNITS: Record<string, number> = { ml: 1, 'fl oz': ML_PER_FL_OZ };

function convertQuantity(quantity: number, from: string, to: string): number | null {
  if (from === to) return quantity;
  if (from in WEIGHT_UNITS && to in WEIGHT_UNITS) {
    return (quantity * WEIGHT_UNITS[from]) / WEIGHT_UNITS[to];
  }
  if (from in VOLUME_UNITS && to in VOLUME_UNITS) {
    return (quantity * VOLUME_UNITS[from]) / VOLUME_UNITS[to];
  }
  // Count-based servings (1 bar, 2 slices) only make sense in their own unit
  return null;
}

/**
 * Grams of protein in `quantity` `quantityUnit` of `food`, or null when the
 * unit can't be reconciled with the food's serving unit.
 */
export function proteinGramsFor(
  food: ProteinFoodLike,
  quantity: number,
  quantityUnit: string
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const servingSize = Number(food.serving_size);
  if (!Number.isFinite(servingSize) || servingSize <= 0) return null;

  const inServingUnits = convertQuantity(quantity, quantityUnit, food.serving_unit);
  if (inServingUnits === null) return null;

  const grams = Number(food.protein) * (inServingUnits / servingSize);
  if (!Number.isFinite(grams) || grams < 0) return null;
  return Math.round(grams * 10) / 10;
}

/** Units offered for a given food: weights and volumes convert, counts don't. */
export function unitOptionsFor(food: ProteinFoodLike): string[] {
  if (food.serving_unit in WEIGHT_UNITS) return ['oz', 'g'];
  if (food.serving_unit in VOLUME_UNITS) return ['fl oz', 'ml'];
  return [food.serving_unit];
}

/** "8 oz" / "1 bar" / "2 slices" */
export function formatQuantity(quantity: number, unit: string): string {
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded} ${unit}`;
}
