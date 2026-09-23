/**
 * Satiety: how long a meal is likely to hold someone, and whether it did.
 *
 * The prediction is the easy half — protein, fibre and fat slow a meal down,
 * and a calorie-dense plate of none of them does not. What makes this worth
 * having is the second half: the gap until the next meal is already in the
 * log, so every prediction can be marked against what actually happened, and
 * the model can be pulled towards this particular person.
 *
 * Nothing here is a clinical claim. It is a rule of thumb that gets less
 * wrong the longer it is used, and the screen says as much.
 */

import type { MacroTotals } from './types.js';

/** Hours a meal of no particular composition is assumed to hold. */
export const BASE_HOURS = 2.6;

/** Never promise less than this, or more. */
export const MIN_HOURS = 1;
export const MAX_HOURS = 7;

/**
 * What each nutrient is worth, in hours per gram per 100 kcal.
 *
 * Expressed against calorie density rather than absolute grams so that a
 * small high-protein snack and a large one are judged on composition rather
 * than size — 20g of protein in a 200 kcal meal is a different signal from
 * 20g in an 800 kcal one.
 */
const WEIGHT = {
  protein: 0.055,
  fiber: 0.075,
  fat: 0.018,
} as const;

/** Sugar pulls the other way: a fast rise and a faster fall. */
const SUGAR_PENALTY = 0.03;

export interface SatietyPrediction {
  /** Hours the meal is expected to hold. */
  hours: number;
  /** The single biggest contributor, for the one-line explanation. */
  driver: 'protein' | 'fiber' | 'fat' | 'sugar' | 'none';
}

const per100 = (grams: number, calories: number): number =>
  calories > 0 ? (grams / calories) * 100 : 0;

/**
 * How long this meal should hold, before any personal calibration.
 *
 * A meal with no calories has no staying power to predict, and returning the
 * base would claim two and a half hours for a glass of water.
 */
export function predictSatiety(
  totals: Pick<MacroTotals, 'calories' | 'protein_g' | 'fat_g' | 'fiber_g' | 'sugar_g'>,
): SatietyPrediction {
  const calories = Math.max(0, totals.calories || 0);
  if (calories <= 0) return { hours: 0, driver: 'none' };

  const contributions = {
    protein: per100(totals.protein_g || 0, calories) * WEIGHT.protein,
    fiber: per100(totals.fiber_g || 0, calories) * WEIGHT.fiber,
    fat: per100(totals.fat_g || 0, calories) * WEIGHT.fat,
    sugar: -per100(totals.sugar_g || 0, calories) * SUGAR_PENALTY,
  };

  // Bigger meals last longer than smaller ones of the same composition, but
  // not proportionally — the curve flattens, so a 1,200 kcal plate does not
  // promise twice what a 600 kcal one does.
  const sizeFactor = Math.min(1.6, Math.sqrt(calories / 500));

  const raw =
    (BASE_HOURS + contributions.protein + contributions.fiber + contributions.fat) * sizeFactor +
    contributions.sugar;

  const hours = Math.min(MAX_HOURS, Math.max(MIN_HOURS, raw));

  const magnitudes: Array<[SatietyPrediction['driver'], number]> = [
    ['protein', contributions.protein],
    ['fiber', contributions.fiber],
    ['fat', contributions.fat],
    ['sugar', Math.abs(contributions.sugar)],
  ];
  const [driver, size] = magnitudes.reduce((top, entry) => (entry[1] > top[1] ? entry : top));

  return { hours, driver: size > 0.05 ? driver : 'none' };
}

export interface SatietyOutcome {
  /** What was predicted, in hours. */
  predictedHours: number;
  /** How long it actually was until the next meal, in hours. */
  actualHours: number;
}

/**
 * The correction factor for one person, from how their meals have gone.
 *
 * The median ratio rather than the mean: one skipped lunch that stretched a
 * gap to nine hours would otherwise drag every future prediction up with it.
 * Clamped, because even a consistent person should not end up with a model
 * that predicts half or double.
 */
export const MIN_CALIBRATION = 0.6;
export const MAX_CALIBRATION = 1.6;

/** Below this many outcomes the sample is too thin to lean on. */
export const CALIBRATION_MIN_SAMPLES = 5;

export function calibrationFactor(outcomes: readonly SatietyOutcome[]): number | null {
  const ratios = outcomes
    .filter((o) => o.predictedHours > 0 && o.actualHours > 0)
    .map((o) => o.actualHours / o.predictedHours)
    .sort((a, b) => a - b);

  if (ratios.length < CALIBRATION_MIN_SAMPLES) return null;

  const middle = Math.floor(ratios.length / 2);
  const median =
    ratios.length % 2 === 0 ? (ratios[middle - 1]! + ratios[middle]!) / 2 : ratios[middle]!;

  return Math.min(MAX_CALIBRATION, Math.max(MIN_CALIBRATION, median));
}

/** The prediction this person should actually be shown. */
export function personalSatiety(
  totals: Parameters<typeof predictSatiety>[0],
  outcomes: readonly SatietyOutcome[],
): SatietyPrediction & { calibrated: boolean } {
  const base = predictSatiety(totals);
  const factor = calibrationFactor(outcomes);

  if (base.hours <= 0 || factor === null) {
    return { ...base, calibrated: false };
  }

  return {
    hours: Math.min(MAX_HOURS, Math.max(MIN_HOURS, base.hours * factor)),
    driver: base.driver,
    calibrated: true,
  };
}

/** "Should hold you about 4 hours", for the line under a logged meal. */
export function describeSatiety(prediction: SatietyPrediction): string {
  if (prediction.hours <= 0) return '';

  const rounded = Math.round(prediction.hours * 2) / 2;
  const amount = Number.isInteger(rounded) ? `${rounded}` : `${Math.floor(rounded)}½`;
  const unit = rounded === 1 ? 'hour' : 'hours';

  const because: Record<SatietyPrediction['driver'], string> = {
    protein: 'the protein in it',
    fiber: 'the fibre in it',
    fat: 'the fat in it',
    sugar: 'how sugary it is',
    none: '',
  };

  const reason = because[prediction.driver];
  return reason
    ? `Should hold you about ${amount} ${unit} — ${reason}.`
    : `Should hold you about ${amount} ${unit}.`;
}

/** How the prediction turned out, for the line that grades it. */
export function describeOutcome(outcome: SatietyOutcome): string {
  const { predictedHours, actualHours } = outcome;
  if (predictedHours <= 0 || actualHours <= 0) return '';

  const drift = actualHours - predictedHours;
  if (Math.abs(drift) < 0.75) return 'That one held you about as long as expected.';

  const hours = Math.abs(Math.round(drift * 2) / 2);
  return drift > 0
    ? `That held you ${hours}h longer than expected.`
    : `You were hungry ${hours}h sooner than expected.`;
}

/**
 * Gaps longer than this are not a meal holding someone.
 *
 * Dinner to breakfast is twelve hours of sleep, not twelve hours of satiety,
 * and letting those into the calibration would teach it that everything holds
 * forever. A gap this long says nothing either way, so it is dropped rather
 * than counted.
 */
export const MAX_USABLE_GAP_HOURS = 8;

export interface SatietyLog {
  logged_at: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
}

/**
 * Turn a run of logged meals into graded predictions.
 *
 * Every meal but the last has a next one, and the gap between them is what
 * actually happened — so the history needed to calibrate is already on disk
 * and no new table has to be written. Order does not matter; the logs are
 * sorted before they are paired.
 */
export function satietyOutcomesFromLogs(logs: readonly SatietyLog[]): SatietyOutcome[] {
  const byTime = [...logs].sort(
    (a, b) => Date.parse(a.logged_at) - Date.parse(b.logged_at),
  );

  const outcomes: SatietyOutcome[] = [];

  for (let i = 0; i < byTime.length - 1; i += 1) {
    const meal = byTime[i]!;
    const next = byTime[i + 1]!;

    const start = Date.parse(meal.logged_at);
    const end = Date.parse(next.logged_at);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const actualHours = (end - start) / 3_600_000;
    if (!(actualHours > 0) || actualHours > MAX_USABLE_GAP_HOURS) continue;

    const { hours } = predictSatiety({
      calories: meal.calories,
      protein_g: meal.protein_g,
      fat_g: meal.fat_g,
      fiber_g: meal.fiber_g ?? 0,
      sugar_g: meal.sugar_g ?? 0,
    });
    if (hours <= 0) continue;

    outcomes.push({ predictedHours: hours, actualHours });
  }

  return outcomes;
}
