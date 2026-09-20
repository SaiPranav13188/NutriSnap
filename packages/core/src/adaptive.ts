/**
 * Adaptive calorie targets — plan section 10.1.
 *
 * Mifflin-St Jeor is an estimate built from population averages, so after a
 * couple of weeks of real data we have something better: the user's own
 * intake measured against their own weight change. If they ate 1800 kcal/day
 * for 14 days and lost less than the formula predicted, their true TDEE is
 * higher than we assumed, and the target should move rather than the user
 * being told to try harder.
 *
 *   estimated_TDEE = mean_daily_intake − (weight_change_kg × 7700 / days)
 */

import { CALORIE_FLOOR, KCAL_PER_KG_FAT } from './constants.js';
import { calculateMacros, dailyDeltaForRate } from './calories.js';
import type { Gender, Goal, TrainingFocus } from './types.js';

/** Minimum history before we trust the observed number over the formula. */
export const MIN_DAYS_FOR_ADAPTATION = 14;
/** At least this share of days must have food logs, or intake data is too sparse. */
export const MIN_LOGGING_COMPLETENESS = 0.7;
/** Never move the target by more than this in a single recompute. */
export const MAX_ADJUSTMENT_KCAL = 250;
/** Ignore changes smaller than this — it is noise, not signal. */
export const MIN_MEANINGFUL_ADJUSTMENT_KCAL = 25;

export interface AdaptiveInput {
  /** One entry per day in the window; days with no logs should be omitted, not zeroed. */
  dailyIntakes: number[];
  /** Number of calendar days the window spans. */
  daysElapsed: number;
  weightStartKg: number;
  weightEndKg: number;
  currentTargetCalories: number;
  /** The formula's TDEE, used as a sanity anchor. */
  formulaTdee: number;
  gender: Gender;
  goal: Goal;
  rateKgPerWeek: number;
  weightKg: number;
  trainingFocus?: TrainingFocus | null;
}

export interface AdaptiveResult {
  shouldAdjust: boolean;
  reason: string;
  estimatedTdee: number | null;
  previousCalories: number;
  newCalories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function estimateTdeeFromHistory(params: {
  dailyIntakes: number[];
  daysElapsed: number;
  weightStartKg: number;
  weightEndKg: number;
}): number | null {
  const { dailyIntakes, daysElapsed, weightStartKg, weightEndKg } = params;
  if (dailyIntakes.length === 0 || daysElapsed <= 0) return null;

  const meanIntake = dailyIntakes.reduce((s, v) => s + v, 0) / dailyIntakes.length;
  const weightChangeKg = weightEndKg - weightStartKg;
  const dailyEnergyFromTissue = (weightChangeKg * KCAL_PER_KG_FAT) / daysElapsed;

  // Gaining weight means intake exceeded expenditure, so subtract the surplus.
  return meanIntake - dailyEnergyFromTissue;
}

/**
 * Decide whether to move the user's target, and to what. Conservative by
 * design: it refuses on thin data, caps the step size, and never drops below
 * the safety floor.
 */
export function computeAdaptiveTarget(input: AdaptiveInput): AdaptiveResult {
  const {
    dailyIntakes,
    daysElapsed,
    weightStartKg,
    weightEndKg,
    currentTargetCalories,
    formulaTdee,
    gender,
    goal,
    rateKgPerWeek,
    weightKg,
    trainingFocus,
  } = input;

  const unchanged = (reason: string, estimatedTdee: number | null = null): AdaptiveResult => ({
    shouldAdjust: false,
    reason,
    estimatedTdee,
    previousCalories: currentTargetCalories,
    newCalories: currentTargetCalories,
    ...calculateMacros({ calories: currentTargetCalories, weightKg, goal, trainingFocus }),
  });

  if (daysElapsed < MIN_DAYS_FOR_ADAPTATION) {
    return unchanged(`Needs at least ${MIN_DAYS_FOR_ADAPTATION} days of history.`);
  }

  const completeness = dailyIntakes.length / daysElapsed;
  if (completeness < MIN_LOGGING_COMPLETENESS) {
    return unchanged(
      `Only ${Math.round(completeness * 100)}% of days were logged — not enough to adjust reliably.`,
    );
  }

  const estimatedTdee = estimateTdeeFromHistory({
    dailyIntakes,
    daysElapsed,
    weightStartKg,
    weightEndKg,
  });
  if (estimatedTdee === null || !Number.isFinite(estimatedTdee)) {
    return unchanged('Could not estimate energy expenditure from this window.');
  }

  // Guard against a wild estimate from a bad weigh-in: stay within ±35% of the formula.
  if (estimatedTdee < formulaTdee * 0.65 || estimatedTdee > formulaTdee * 1.35) {
    return unchanged(
      'Observed data is too far from the expected range — likely a logging or weigh-in outlier.',
      Math.round(estimatedTdee),
    );
  }

  const desired = estimatedTdee + dailyDeltaForRate(goal, rateKgPerWeek);
  const delta = desired - currentTargetCalories;

  if (Math.abs(delta) < MIN_MEANINGFUL_ADJUSTMENT_KCAL) {
    return unchanged('Your target is already tracking reality closely.', Math.round(estimatedTdee));
  }

  const capped = Math.sign(delta) * Math.min(Math.abs(delta), MAX_ADJUSTMENT_KCAL);
  const floor = CALORIE_FLOOR[gender];
  const newCalories = Math.round(Math.max(currentTargetCalories + capped, floor) / 10) * 10;

  if (newCalories === currentTargetCalories) {
    return unchanged('Adjustment would be blocked by the safety floor.', Math.round(estimatedTdee));
  }

  const direction = newCalories > currentTargetCalories ? 'up' : 'down';
  return {
    shouldAdjust: true,
    reason:
      `Based on your last ${daysElapsed} days, your body is burning about ` +
      `${Math.round(estimatedTdee)} kcal a day, so we moved your target ${direction} ` +
      `from ${currentTargetCalories} to ${newCalories} kcal.`,
    estimatedTdee: Math.round(estimatedTdee),
    previousCalories: currentTargetCalories,
    newCalories,
    ...calculateMacros({ calories: newCalories, weightKg, goal, trainingFocus }),
  };
}

/**
 * Plateau detection for the gentle nudge on the Progress tab (plan 10.6).
 * A plateau is only interesting when the user is actively trying to move.
 */
export function detectPlateau(params: {
  weights: Array<{ date: string; value: number }>;
  goal: Goal;
  days?: number;
  thresholdKg?: number;
}): { plateaued: boolean; days: number; message: string | null } {
  const { weights, goal, days = 10, thresholdKg = 0.3 } = params;

  if (goal === 'maintain' || weights.length < 2) {
    return { plateaued: false, days: 0, message: null };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const recent = weights.filter((w) => new Date(w.date) >= cutoff);

  if (recent.length < 3) return { plateaued: false, days: recent.length, message: null };

  const values = recent.map((w) => w.value);
  const spread = Math.max(...values) - Math.min(...values);

  if (spread > thresholdKg) return { plateaued: false, days: recent.length, message: null };

  return {
    plateaued: true,
    days,
    message: `Your weight hasn't moved in ${days} days. Want to adjust your target, or check how consistently you're logging?`,
  };
}
