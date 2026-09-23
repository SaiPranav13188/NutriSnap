/**
 * Plate-diff: correcting a meal by what was left on the plate.
 *
 * A photo taken before eating shows the food that was served, which is not
 * the food that was eaten. Half a portion of rice pushed to the side is the
 * single largest source of error in photo-based tracking, and nothing in the
 * original estimate can see it.
 *
 * So the plate gets photographed again afterwards, and the model reports how
 * much of each ingredient is still there. The arithmetic of turning those
 * fractions back into a corrected meal lives here, where it can be tested
 * without a camera.
 */

import type { Ingredient, MacroTotals } from './types.js';

export interface LeftoverFraction {
  /** Matches an ingredient on the original log. */
  name: string;
  /** How much of it is still on the plate: 0 ate it all, 1 touched none of it. */
  remaining: number;
}

export interface PlateDiff {
  ingredients: Ingredient[];
  totals: MacroTotals;
  /**
   * The share of the original meal that was actually eaten, 0 to 1.
   *
   * Weighted by calories rather than by count, because leaving the whole
   * salad is not the same correction as leaving the whole naan.
   */
  eatenFraction: number;
}

const clampFraction = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Names come back from a model, so matching is forgiving about case and spacing. */
const normalise = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

function scaleTotals(totals: MacroTotals, factor: number): MacroTotals {
  return {
    calories: totals.calories * factor,
    protein_g: totals.protein_g * factor,
    carbs_g: totals.carbs_g * factor,
    fat_g: totals.fat_g * factor,
    sugar_g: totals.sugar_g * factor,
    fiber_g: totals.fiber_g * factor,
    sodium_mg: totals.sodium_mg * factor,
  };
}

/**
 * Apply what was left to what was logged.
 *
 * Ingredients carry calories but not macros, so the macros are scaled by the
 * fraction of calories eaten rather than per-ingredient. That is the honest
 * approximation available from the data: it is exact when the leftovers have
 * the same macro mix as the meal, and directionally right when they do not.
 *
 * An ingredient the report does not mention is assumed eaten, because a model
 * listing what remains will not list an empty space.
 */
export function applyLeftovers(params: {
  ingredients: readonly Ingredient[];
  totals: MacroTotals;
  leftovers: readonly LeftoverFraction[];
  /**
   * Used when the meal has no itemised ingredients — a barcode scan, or a
   * meal typed in as a sentence. Ignored when ingredients are present.
   */
  overallRemaining?: number;
}): PlateDiff {
  const { ingredients, totals, leftovers } = params;

  // Nothing itemised: one fraction for the whole plate is all there is.
  if (ingredients.length === 0) {
    const eaten = 1 - clampFraction(params.overallRemaining ?? 0);
    return { ingredients: [], totals: scaleTotals(totals, eaten), eatenFraction: eaten };
  }

  const byName = new Map<string, number>();
  for (const entry of leftovers) {
    byName.set(normalise(entry.name), clampFraction(entry.remaining));
  }

  const eatenIngredients: Ingredient[] = ingredients.map((item) => {
    const remaining = byName.get(normalise(item.name)) ?? 0;
    const eaten = 1 - remaining;
    return {
      name: item.name,
      grams: item.grams * eaten,
      calories: item.calories * eaten,
    };
  });

  const originalKcal = ingredients.reduce((sum, item) => sum + (item.calories || 0), 0);
  const eatenKcal = eatenIngredients.reduce((sum, item) => sum + item.calories, 0);

  /**
   * With no calories to weight by, fall back to the plain average of the
   * fractions — a meal whose ingredients all read zero still has a total,
   * and dividing by that zero would wipe it out.
   */
  const eatenFraction =
    originalKcal > 0
      ? eatenKcal / originalKcal
      : ingredients.reduce(
          (sum, item) => sum + (1 - (byName.get(normalise(item.name)) ?? 0)),
          0,
        ) / ingredients.length;

  return {
    ingredients: eatenIngredients,
    totals: scaleTotals(totals, eatenFraction),
    eatenFraction,
  };
}

/** "You ate about three quarters of it", for the confirmation line. */
export function describeEaten(fraction: number): string {
  const percent = Math.round(clampFraction(fraction) * 100);

  if (percent >= 98) return 'Finished the lot';
  if (percent <= 2) return 'None of it eaten';
  if (percent >= 70 && percent <= 80) return 'About three quarters eaten';
  if (percent >= 45 && percent <= 55) return 'About half eaten';
  if (percent >= 20 && percent <= 30) return 'About a quarter eaten';
  return `About ${percent}% eaten`;
}

/**
 * Whether a correction is worth writing.
 *
 * A model asked to compare two photographs of the same plate will report a
 * few percent of difference from lighting and angle alone. Rewriting a log
 * for that would be noise dressed up as precision.
 */
export const LEFTOVER_NOISE_FLOOR = 0.05;

export function isCorrectionMeaningful(eatenFraction: number): boolean {
  // Compared with a hair of tolerance, because `1 - 0.95` is 0.05000000000000004
  // in binary floating point — a threshold that fires on its own boundary is
  // one nobody can reason about.
  return 1 - clampFraction(eatenFraction) > LEFTOVER_NOISE_FLOOR + 1e-9;
}
