/**
 * Aggregation helpers used by the dashboard rings and the day view.
 */

import type { FoodLog, Ingredient, MacroTotals } from './types.js';

export const EMPTY_TOTALS: MacroTotals = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  sugar_g: 0,
  fiber_g: 0,
  sodium_mg: 0,
};

const n = (v: number | null | undefined): number => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);

/** Sum a day's logs into the single totals object the rings render from. */
export function sumTotals(logs: Array<Partial<MacroTotals>>): MacroTotals {
  return logs.reduce<MacroTotals>(
    (acc, log) => ({
      calories: acc.calories + n(log.calories),
      protein_g: acc.protein_g + n(log.protein_g),
      carbs_g: acc.carbs_g + n(log.carbs_g),
      fat_g: acc.fat_g + n(log.fat_g),
      sugar_g: acc.sugar_g + n(log.sugar_g),
      fiber_g: acc.fiber_g + n(log.fiber_g),
      sodium_mg: acc.sodium_mg + n(log.sodium_mg),
    }),
    { ...EMPTY_TOTALS },
  );
}

/**
 * Scale a set of totals by a serving multiplier — the "1x / 2x" stepper on the
 * results screen. Values are stored already-scaled, so this is applied when the
 * user changes the stepper, not on read.
 */
export function scaleTotals(totals: MacroTotals, multiplier: number): MacroTotals {
  const m = multiplier > 0 ? multiplier : 1;
  return {
    calories: totals.calories * m,
    protein_g: totals.protein_g * m,
    carbs_g: totals.carbs_g * m,
    fat_g: totals.fat_g * m,
    sugar_g: totals.sugar_g * m,
    fiber_g: totals.fiber_g * m,
    sodium_mg: totals.sodium_mg * m,
  };
}

export function scaleIngredients(ingredients: Ingredient[], multiplier: number): Ingredient[] {
  const m = multiplier > 0 ? multiplier : 1;
  return ingredients.map((i) => ({
    name: i.name,
    grams: i.grams * m,
    calories: i.calories * m,
  }));
}

/** Recompute totals from an edited ingredient list (the "Fix Results" flow). */
export function totalsFromIngredients(
  ingredients: Ingredient[],
  base: MacroTotals,
  baseIngredients: Ingredient[],
): MacroTotals {
  const baseCalories = baseIngredients.reduce((s, i) => s + n(i.calories), 0);
  const nextCalories = ingredients.reduce((s, i) => s + n(i.calories), 0);
  if (baseCalories <= 0) return { ...base, calories: nextCalories };

  // Macros scale proportionally with the calories that survived the edit —
  // it is an approximation, but it keeps the rings consistent when a user
  // removes "croutons" without us re-querying the model.
  const ratio = nextCalories / baseCalories;
  return { ...scaleTotals(base, ratio), calories: nextCalories };
}

export interface RingProgress {
  consumed: number;
  target: number;
  remaining: number;
  /** 0..1, clamped — what the ring arc actually draws. */
  ratio: number;
  /** Unclamped percentage, so the UI can say "112%" when a user goes over. */
  percent: number;
  over: boolean;
}

export function ringProgress(consumed: number, target: number): RingProgress {
  const safeTarget = target > 0 ? target : 0;
  const remaining = safeTarget - consumed;
  const percent = safeTarget > 0 ? (consumed / safeTarget) * 100 : 0;
  return {
    consumed,
    target: safeTarget,
    remaining,
    ratio: safeTarget > 0 ? Math.min(1, Math.max(0, consumed / safeTarget)) : 0,
    percent,
    over: consumed > safeTarget && safeTarget > 0,
  };
}

/** Group a day's logs into the four meal buckets, newest first within each. */
export function groupByMeal(logs: FoodLog[]): Record<string, FoodLog[]> {
  const groups: Record<string, FoodLog[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const log of logs) {
    const key = log.meal_type ?? inferMealType(new Date(log.logged_at));
    (groups[key] ??= []).push(log);
  }
  return groups;
}

/** Best-guess meal slot from a timestamp, for logs saved without one. */
export function inferMealType(at: Date): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = at.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 22) return 'dinner';
  return 'snack';
}
