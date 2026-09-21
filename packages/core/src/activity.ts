/**
 * Water and exercise: targets, unit handling and the burn estimate.
 *
 * Kept here rather than in either client so the number a user sees when they
 * log a workout on the phone matches what the web app would have shown, and
 * so the arithmetic can be tested without mounting a screen.
 */

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

/**
 * Millilitres of water per kilogram of body weight.
 *
 * The common clinical rule of thumb, and it scales, which a flat "2 litres"
 * does not: the same glass count is too little for a 95 kg person and too much
 * for a 45 kg one.
 */
const ML_PER_KG = 35;

/** Bounds on the derived goal, so an extreme weight cannot produce a silly one. */
export const MIN_WATER_ML = 1500;
export const MAX_WATER_ML = 4000;

/** A glass, for the quick-add buttons and the "glasses today" readout. */
export const GLASS_ML = 250;

const ML_PER_FL_OZ = 29.5735;

export const mlToFlOz = (ml: number): number => ml / ML_PER_FL_OZ;
export const flOzToMl = (flOz: number): number => flOz * ML_PER_FL_OZ;

/** Daily water goal in millilitres, derived from body weight. */
export function waterTarget(weightKg: number | null): number {
  if (!weightKg || weightKg <= 0) return 2000;
  const raw = weightKg * ML_PER_KG;
  return Math.round(Math.min(MAX_WATER_ML, Math.max(MIN_WATER_ML, raw)) / 50) * 50;
}

/** "1.8 L" or "62 fl oz" — the readout under the water ring. */
export function formatWater(ml: number, units: 'metric' | 'imperial'): string {
  if (units === 'imperial') return `${Math.round(mlToFlOz(ml))} fl oz`;
  return ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${Math.round(ml)} ml`;
}

// ---------------------------------------------------------------------------
// Exercise
// ---------------------------------------------------------------------------

export type ExerciseKind =
  | 'cardio'
  | 'strength'
  | 'walk'
  | 'run'
  | 'cycle'
  | 'swim'
  | 'sport'
  | 'other';

export type ExerciseIntensity = 'light' | 'moderate' | 'vigorous';

export const EXERCISE_KINDS: ReadonlyArray<{ value: ExerciseKind; label: string; icon: string }> = [
  { value: 'walk', label: 'Walk', icon: '🚶' },
  { value: 'run', label: 'Run', icon: '🏃' },
  { value: 'cycle', label: 'Cycle', icon: '🚴' },
  { value: 'swim', label: 'Swim', icon: '🏊' },
  { value: 'strength', label: 'Strength', icon: '🏋' },
  { value: 'cardio', label: 'Cardio', icon: '⚡' },
  { value: 'sport', label: 'Sport', icon: '⚽' },
  { value: 'other', label: 'Other', icon: '🔥' },
];

export const EXERCISE_INTENSITIES: ReadonlyArray<{ value: ExerciseIntensity; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'vigorous', label: 'Vigorous' },
];

/**
 * Metabolic equivalents, from the Compendium of Physical Activities.
 *
 * One MET is roughly resting metabolism, so a 7 MET activity burns about seven
 * times as much per minute as sitting still. The intensity axis matters more
 * than the label does — a light jog and a hard one differ by nearly double.
 */
const MET: Record<ExerciseKind, Record<ExerciseIntensity, number>> = {
  walk: { light: 2.8, moderate: 3.5, vigorous: 4.3 },
  run: { light: 6.0, moderate: 9.8, vigorous: 11.8 },
  cycle: { light: 4.0, moderate: 8.0, vigorous: 10.0 },
  swim: { light: 5.3, moderate: 7.0, vigorous: 9.8 },
  strength: { light: 3.5, moderate: 5.0, vigorous: 6.0 },
  cardio: { light: 4.5, moderate: 7.0, vigorous: 9.0 },
  sport: { light: 4.0, moderate: 7.0, vigorous: 10.0 },
  other: { light: 3.0, moderate: 4.5, vigorous: 6.0 },
};

/**
 * Ceiling on a single session's burn.
 *
 * Mirrors the check constraint on exercise_logs.calories_burned. Without it
 * the MET formula happily returns six figures for a duration-and-weight pair
 * the form allows, and the insert fails on a constraint the user never saw —
 * a 500 where a clamp would do.
 */
export const MAX_SESSION_BURN_KCAL = 20000;

export function metFor(kind: ExerciseKind, intensity: ExerciseIntensity): number {
  return MET[kind]?.[intensity] ?? MET.other[intensity];
}

/**
 * Estimated calories for a session.
 *
 * kcal = MET x kg x hours. Deliberately an estimate and labelled as one in the
 * UI: without a heart-rate strap there is no honest way to do better, and
 * presenting it as measured would let it quietly distort the calorie budget.
 */
export function estimateCaloriesBurned(params: {
  kind: ExerciseKind;
  intensity: ExerciseIntensity;
  durationMin: number;
  weightKg: number | null;
}): number {
  const { kind, intensity, durationMin, weightKg } = params;
  if (!durationMin || durationMin <= 0) return 0;

  // Without a weight on file, assume a mid-range adult rather than refusing to
  // estimate — a rough number the user can correct beats a blank field.
  const kg = weightKg && weightKg > 0 ? weightKg : 70;
  const hours = durationMin / 60;

  const estimate = Math.round(metFor(kind, intensity) * kg * hours);
  return Math.min(MAX_SESSION_BURN_KCAL, Math.max(0, estimate));
}

/** Minutes of activity a week that public guidance asks for. */
export const WEEKLY_ACTIVE_MINUTES_TARGET = 150;
