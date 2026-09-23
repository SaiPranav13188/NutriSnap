/**
 * Water and exercise: targets, unit handling and the burn estimate.
 *
 * Kept here rather than in either client so the number a user sees when they
 * log a workout on the phone matches what the web app would have shown, and
 * so the arithmetic can be tested without mounting a screen.
 */

import { formatNumber } from './units.js';

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

/** The bounds an explicit override is allowed to take, matching the column. */
export const WATER_OVERRIDE_MIN_ML = 500;
export const WATER_OVERRIDE_MAX_ML = 6000;

/**
 * The goal actually shown, which is the user's own figure where they set one.
 *
 * The override is allowed outside the derived range on purpose: the formula's
 * floor and ceiling exist to stop a body weight producing an absurd goal, and
 * neither applies to a number somebody typed in deliberately.
 */
export function resolveWaterTarget(
  overrideMl: number | null | undefined,
  weightKg: number | null,
): number {
  if (typeof overrideMl === 'number' && Number.isFinite(overrideMl) && overrideMl > 0) {
    return Math.round(
      Math.min(WATER_OVERRIDE_MAX_ML, Math.max(WATER_OVERRIDE_MIN_ML, overrideMl)),
    );
  }
  return waterTarget(weightKg);
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

// ---------------------------------------------------------------------------
// Tracked walks and runs
//
// A session counted by the phone's pedometer knows something the form does
// not: how fast the user actually moved. That turns intensity from a dropdown
// the user guesses at into a figure derived from the steps they took, which
// is the whole reason for tracking rather than typing.
// ---------------------------------------------------------------------------

/** Kinds the pedometer can measure. Cycling and swimming do not produce steps. */
export type TrackableKind = 'walk' | 'run';

export function isTrackableKind(kind: ExerciseKind): kind is TrackableKind {
  return kind === 'walk' || kind === 'run';
}

/**
 * Stride length as a fraction of height.
 *
 * The walking figure is the standard 0.413 anthropometric ratio. Running
 * stride is longer at the same height because of the flight phase, so it gets
 * its own multiplier rather than sharing one and under-reporting distance by
 * about a third.
 */
const STRIDE_RATIO: Record<TrackableKind, number> = { walk: 0.413, run: 0.62 };

/** Falls back to a median adult height rather than refusing to convert. */
const DEFAULT_HEIGHT_CM = 168;

export function strideLengthM(kind: TrackableKind, heightCm: number | null): number {
  const cm = heightCm && heightCm > 0 ? heightCm : DEFAULT_HEIGHT_CM;
  return (cm * STRIDE_RATIO[kind]) / 100;
}

/**
 * MET by speed, from the Compendium of Physical Activities.
 *
 * Each entry is the lower bound of a band in km/h. Read downwards: the first
 * threshold the speed clears wins. Walking tops out where running begins;
 * above that the run table takes over, which is why a kind is still needed
 * even though the speed is measured.
 */
const PACE_MET: Record<TrackableKind, ReadonlyArray<readonly [number, number]>> = {
  walk: [
    [7.2, 8.0],
    [6.4, 6.3],
    [5.6, 4.3],
    [4.8, 3.5],
    [4.0, 3.0],
    [3.2, 2.8],
    [0, 2.0],
  ],
  run: [
    [16.1, 14.5],
    [14.5, 13.5],
    [12.9, 11.8],
    [11.3, 11.0],
    [9.7, 9.8],
    [8.0, 8.3],
    [6.4, 6.0],
    [0, 4.5],
  ],
};

export function metForPace(kind: TrackableKind, speedKmh: number): number {
  const bands = PACE_MET[kind];
  for (const [floor, met] of bands) {
    if (speedKmh >= floor) return met;
  }
  // The last band has a floor of zero, so the loop above always returns. This
  // is here for the type, not for a case that can happen.
  return MET[kind].light;
}

/**
 * Which of the three labels a measured pace amounts to.
 *
 * The session still has to store an intensity, because that is the column the
 * table has and what the rest of the app reads. This maps the measurement
 * back onto it rather than leaving whatever the user had selected before they
 * set off.
 */
export function intensityForPace(kind: TrackableKind, speedKmh: number): ExerciseIntensity {
  const met = metForPace(kind, speedKmh);
  const bands = MET[kind];
  if (met >= bands.vigorous) return 'vigorous';
  if (met >= bands.moderate) return 'moderate';
  return 'light';
}

export interface TrackedSession {
  /** Metres covered, from steps times stride length. */
  distanceM: number;
  speedKmh: number;
  met: number;
  intensity: ExerciseIntensity;
  calories: number;
}

/**
 * What a tracked walk or run adds up to.
 *
 * Unlike `estimateCaloriesBurned` this is not a guess at effort — the pace it
 * works from was counted, not chosen. It is still a formula rather than a
 * heart-rate reading, and the screen says so.
 */
export function summariseTrackedSession(params: {
  kind: TrackableKind;
  steps: number;
  elapsedSec: number;
  heightCm: number | null;
  weightKg: number | null;
}): TrackedSession {
  const { kind, steps, elapsedSec, heightCm, weightKg } = params;

  const distanceM = Math.max(0, steps) * strideLengthM(kind, heightCm);
  const hours = Math.max(0, elapsedSec) / 3600;

  // A session with no time on the clock has no pace, and dividing by it would
  // report an infinite one.
  const speedKmh = hours > 0 ? distanceM / 1000 / hours : 0;

  const met = metForPace(kind, speedKmh);
  const kg = weightKg && weightKg > 0 ? weightKg : 70;
  const calories = Math.min(MAX_SESSION_BURN_KCAL, Math.max(0, Math.round(met * kg * hours)));

  return {
    distanceM,
    speedKmh,
    met,
    intensity: intensityForPace(kind, speedKmh),
    calories,
  };
}

/**
 * "4,182 steps · 3.1 km · 5.2 km/h", for the workout's notes line.
 *
 * Takes only the two fields it prints rather than a whole session, so a
 * caller holding a trimmed-down record of one does not have to reconstruct
 * the parts this never looks at.
 */
export function describeTrackedSession(
  steps: number,
  session: Pick<TrackedSession, 'distanceM' | 'speedKmh'>,
): string {
  return [
    `${formatNumber(steps)} steps`,
    `${(session.distanceM / 1000).toFixed(2)} km`,
    `${session.speedKmh.toFixed(1)} km/h`,
  ].join(' · ');
}

// ---------------------------------------------------------------------------
// Counting steps from raw motion
//
// Android guards its hardware step counter behind ACTIVITY_RECOGNITION, and
// that permission is not always grantable — Expo Go, for one, cannot hand it
// out. The accelerometer is not guarded at all, and walking is a strikingly
// regular signal: one vertical impact per footfall. Counting those peaks is
// less accurate than the dedicated sensor, but it is a real step count rather
// than a stopwatch, and it works everywhere.
// ---------------------------------------------------------------------------

/**
 * How fast the baseline follows the signal.
 *
 * The accelerometer reports gravity as well as movement, so ~1g is present
 * even lying still, and it shifts as the phone is reoriented. A slow
 * exponential mean tracks that offset and leaves the footfalls standing
 * proud of it — fast enough to follow a pocket turning over, far too slow to
 * follow a stride.
 */
const BASELINE_ALPHA = 0.08;

/** How far above the baseline, in g, counts as a footfall. */
const TRIGGER_G = 0.11;

/**
 * How far it has to fall back before the next one counts.
 *
 * Without this gap a single noisy peak crossing the trigger line several
 * times on its way up would register as several steps.
 */
const RELEASE_G = 0.045;

/** 230 steps a minute — past a sprinter's cadence, so anything faster is noise. */
const MIN_STEP_MS = 260;

export interface StepDetector {
  baseline: number;
  /** True once a peak has been counted and before the signal has fallen back. */
  armed: boolean;
  lastStepMs: number;
  steps: number;
  /** The baseline is meaningless until it has seen a sample to start from. */
  seeded: boolean;
}

export function createStepDetector(): StepDetector {
  return { baseline: 1, armed: false, lastStepMs: 0, steps: 0, seeded: false };
}

/**
 * Feed one accelerometer reading in. Returns the running step total.
 *
 * Takes the magnitude rather than three axes on purpose: it is what makes the
 * count independent of how the phone is being carried. A stride registers the
 * same whether the phone is upright in a pocket, flat in a hand or upside
 * down in a bag.
 */
export function feedStepDetector(
  detector: StepDetector,
  magnitudeG: number,
  timestampMs: number,
): number {
  if (!detector.seeded) {
    detector.baseline = magnitudeG;
    detector.seeded = true;
    return detector.steps;
  }

  detector.baseline += BASELINE_ALPHA * (magnitudeG - detector.baseline);
  const excess = magnitudeG - detector.baseline;

  if (!detector.armed && excess > TRIGGER_G) {
    // A step, unless it arrives too soon after the last one to be one.
    if (timestampMs - detector.lastStepMs >= MIN_STEP_MS) {
      detector.steps += 1;
      detector.lastStepMs = timestampMs;
    }
    detector.armed = true;
  } else if (detector.armed && excess < RELEASE_G) {
    detector.armed = false;
  }

  return detector.steps;
}

/** Magnitude of an accelerometer sample, in g. */
export function accelerationMagnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

// ---------------------------------------------------------------------------
// Cycling, by speed
//
// The generic light/moderate/vigorous axis is too coarse for a ride: the
// difference between pottering and racing is a factor of two in MET, and a
// rider knows which they are doing. These are the Compendium's cycling bands,
// keyed by the speed that separates them.
// ---------------------------------------------------------------------------

export type CyclingTier = 'easy' | 'steady' | 'brisk' | 'fast';

export const CYCLING_TIERS: ReadonlyArray<{
  value: CyclingTier;
  label: string;
  /** Upper bound in mph; null on the open-ended top band. */
  maxMph: number | null;
  met: number;
}> = [
  { value: 'easy', label: '<10', maxMph: 10, met: 6 },
  { value: 'steady', label: '10–14', maxMph: 14, met: 8 },
  { value: 'brisk', label: '14–16', maxMph: 16, met: 10 },
  { value: 'fast', label: '16+', maxMph: null, met: 12 },
];

export function metForCyclingTier(tier: CyclingTier): number {
  return CYCLING_TIERS.find((band) => band.value === tier)?.met ?? 8;
}

/**
 * The band a speed falls in.
 *
 * Boundaries belong to the band above: 14 mph is the start of 14–16, not the
 * end of 10–14, which is how the Compendium reads them.
 */
export function cyclingTierForSpeed(mph: number): CyclingTier {
  if (mph < 10) return 'easy';
  if (mph < 14) return 'steady';
  if (mph < 16) return 'brisk';
  return 'fast';
}

/**
 * kcal per minute at a given effort.
 *
 * The ride screen needs a rate rather than a total, because it accumulates a
 * second at a time and the rider can change band mid-ride.
 */
export function cyclingBurnPerMinute(met: number, weightKg: number | null): number {
  const kg = weightKg && weightKg > 0 ? weightKg : 70;
  return (met * kg) / 60;
}

/** Whole hundreds of kcal crossed, which is what the ride screen celebrates. */
export function milestonesCrossed(kcal: number): number {
  return Math.max(0, Math.floor(kcal / 100));
}

/** Metres per second, as a GPS fix reports it, into the mph the bands use. */
export function mpsToMph(mps: number): number {
  return mps * 2.2369362920544;
}

const EARTH_RADIUS_M = 6371000;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance between two fixes, in metres.
 *
 * Needed because `coords.speed` is not always populated — plenty of Android
 * devices report null or -1 — and a speed derived from two positions and the
 * gap between them is better than no speed at all.
 */
export function haversineMeters(from: LatLng, to: LatLng): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** How far past a band's edge the rider must be before the band changes. */
const TIER_HYSTERESIS_MPH = 0.6;

/** Where each band begins, in mph. */
const TIER_FLOOR: Record<CyclingTier, number> = { easy: 0, steady: 10, brisk: 14, fast: 16 };

/**
 * The band a measured speed should move the ride to, given where it is now.
 *
 * Not simply `cyclingTierForSpeed`: a rider sitting on 14 mph would otherwise
 * flap between two bands several times a minute as the GPS wobbles, and every
 * flip changes the MET the calorie count is accumulating at. A band has to be
 * cleared by a margin before it is entered, and fallen below by the same
 * margin before it is left.
 */
export function nextCyclingTier(
  current: CyclingTier,
  mph: number,
  marginMph = TIER_HYSTERESIS_MPH,
): CyclingTier {
  const raw = cyclingTierForSpeed(mph);
  if (raw === current) return current;

  const order = CYCLING_TIERS.map((band) => band.value);
  const goingUp = order.indexOf(raw) > order.indexOf(current);

  // Climbing: clear the new band's floor by the margin.
  if (goingUp) return mph >= TIER_FLOOR[raw] + marginMph ? raw : current;

  // Easing off: drop below the band being left by the same margin.
  return mph <= TIER_FLOOR[current] - marginMph ? raw : current;
}
