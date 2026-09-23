/**
 * Cardio sessions: heart-rate zones, the calorie estimate, and what each
 * machine is worth showing alongside it.
 *
 * Three ways of arriving at a calorie figure live here, in descending order
 * of trust: a heart rate, which measures the effort; a MET value, which
 * assumes it; and a number the machine reported, which is somebody else's
 * arithmetic. The screen shows whichever it has and says which one it used.
 */

/** The machines and modes this screen knows how to describe. */
export type CardioActivity = 'run' | 'treadmill' | 'row' | 'elliptical' | 'stairs';

/** A reading the secondary stat row can render. */
export type CardioStat = 'pace' | 'distance' | 'strokeRate' | 'resistance' | 'floors' | 'incline';

export interface CardioProfile {
  value: CardioActivity;
  label: string;
  /** Baseline MET, used when nothing better is available. */
  met: number;
  /**
   * The two readings worth the space, in order. Requirement three's mapping
   * object: adding a machine is a new entry here, not a new branch in the UI.
   */
  stats: readonly [CardioStat, CardioStat];
  /** Whether distance and pace can come from GPS rather than a machine. */
  outdoors: boolean;
}

export const CARDIO_ACTIVITIES: readonly CardioProfile[] = [
  { value: 'run', label: 'Run', met: 9.8, stats: ['pace', 'distance'], outdoors: true },
  { value: 'treadmill', label: 'Treadmill', met: 9.0, stats: ['pace', 'distance'], outdoors: false },
  { value: 'row', label: 'Rowing', met: 7.0, stats: ['strokeRate', 'distance'], outdoors: false },
  {
    value: 'elliptical',
    label: 'Elliptical',
    met: 5.0,
    stats: ['resistance', 'distance'],
    outdoors: false,
  },
  { value: 'stairs', label: 'Stairs', met: 9.0, stats: ['incline', 'floors'], outdoors: false },
];

export function cardioProfile(activity: CardioActivity): CardioProfile {
  return CARDIO_ACTIVITIES.find((entry) => entry.value === activity) ?? CARDIO_ACTIVITIES[0]!;
}

export const CARDIO_STAT_LABELS: Readonly<Record<CardioStat, { label: string; unit: string }>> = {
  pace: { label: 'Pace', unit: '/km' },
  distance: { label: 'Distance', unit: 'km' },
  strokeRate: { label: 'Rate', unit: 'spm' },
  resistance: { label: 'Resistance', unit: '' },
  floors: { label: 'Floors', unit: '' },
  incline: { label: 'Incline', unit: '%' },
};

// ---------------------------------------------------------------------------
// Heart rate
// ---------------------------------------------------------------------------

/**
 * Maximum heart rate.
 *
 * 220 minus age is the familiar estimate and it is genuinely rough — the
 * spread across a population is wide enough that a measured figure beats it
 * every time, which is why an entered value always wins.
 */
export function maxHeartRate(age: number | null, entered?: number | null): number {
  if (entered && entered > 0) return entered;
  if (age && age > 0) return Math.round(220 - age);
  // Neither on file: assume a 30-year-old rather than refuse to draw zones.
  return 190;
}

export interface HeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  /** Lower bound as a fraction of maximum heart rate. */
  floor: number;
}

/** The conventional five-zone split, by percentage of maximum. */
export const HR_ZONES: readonly HeartRateZone[] = [
  { zone: 1, label: 'Very light', floor: 0.5 },
  { zone: 2, label: 'Light', floor: 0.6 },
  { zone: 3, label: 'Moderate', floor: 0.7 },
  { zone: 4, label: 'Hard', floor: 0.8 },
  { zone: 5, label: 'Maximum', floor: 0.9 },
];

/**
 * Which zone a heart rate falls in.
 *
 * Anything below zone one's floor is still zone one: a rider pottering along
 * at 45% of maximum is not in "zone zero", and the bar has nowhere to put
 * them.
 */
export function zoneForHeartRate(hr: number, maxHr: number): 1 | 2 | 3 | 4 | 5 {
  if (!(hr > 0) || !(maxHr > 0)) return 1;
  const ratio = hr / maxHr;

  for (let i = HR_ZONES.length - 1; i >= 0; i -= 1) {
    const band = HR_ZONES[i]!;
    if (ratio >= band.floor) return band.zone;
  }
  return 1;
}

/**
 * Calories per minute from heart rate, after Keytel et al. (2005).
 *
 * The published equations are in kilojoules per minute, hence the division by
 * 4.184. They are fitted to steady aerobic work, so a resting or barely
 * raised heart rate can drive them negative — clamped at zero rather than
 * allowed to subtract from the session.
 */
export function keytelCaloriesPerMinute(params: {
  heartRate: number;
  weightKg: number;
  age: number;
  gender: 'male' | 'female' | 'other';
}): number {
  const { heartRate, weightKg, age, gender } = params;
  if (!(heartRate > 0)) return 0;

  const kjPerMin =
    gender === 'female'
      ? -20.4022 + 0.4472 * heartRate - 0.1263 * weightKg + 0.074 * age
      : -55.0969 + 0.6309 * heartRate + 0.1988 * weightKg + 0.2017 * age;

  return Math.max(0, kjPerMin / 4.184);
}

// ---------------------------------------------------------------------------
// MET fallback
// ---------------------------------------------------------------------------

/**
 * Running MET by pace, in minutes per kilometre.
 *
 * Read downwards: the first pace the runner is quicker than wins. Slower than
 * the last entry is a jog at eight METs rather than nothing.
 */
const RUN_MET_BY_PACE: ReadonlyArray<readonly [number, number]> = [
  [3.7, 12.0],
  [4.3, 11.0],
  [5.0, 10.0],
  [5.6, 9.8],
  [6.2, 9.0],
  [7.5, 8.3],
];

/**
 * The MET to accumulate at.
 *
 * Pace refines it where there is one — a twelve-minute kilometre and a
 * four-minute kilometre are not the same activity — and everything else falls
 * back to the profile's baseline.
 */
export function metForCardio(
  activity: CardioActivity,
  options: { paceMinPerKm?: number | null } = {},
): number {
  const profile = cardioProfile(activity);
  const pace = options.paceMinPerKm;

  if ((activity === 'run' || activity === 'treadmill') && pace && pace > 0) {
    for (const [threshold, met] of RUN_MET_BY_PACE) {
      if (pace <= threshold) return met;
    }
    return 8.0;
  }

  return profile.met;
}

// ---------------------------------------------------------------------------
// Reconciling two sources
// ---------------------------------------------------------------------------

/** How far apart two calorie figures may be before the screen says so. */
export const DIVERGENCE_THRESHOLD = 0.15;

export interface Divergence {
  /** |a - b| as a fraction of the larger, so neither source is privileged. */
  ratio: number;
  diverged: boolean;
}

/**
 * Compare our estimate with a machine's own.
 *
 * Measured against the larger of the two on purpose: dividing by whichever
 * happened to be ours would make the same gap look different depending on
 * which way round it fell.
 */
export function compareCalorieSources(
  ours: number,
  theirs: number,
  threshold = DIVERGENCE_THRESHOLD,
): Divergence {
  const larger = Math.max(Math.abs(ours), Math.abs(theirs));
  if (larger === 0) return { ratio: 0, diverged: false };

  const ratio = Math.abs(ours - theirs) / larger;
  return { ratio, diverged: ratio > threshold };
}

// ---------------------------------------------------------------------------
// Time in zone
// ---------------------------------------------------------------------------

export type ZoneTotals = Record<1 | 2 | 3 | 4 | 5, number>;

export const emptyZoneTotals = (): ZoneTotals => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

export interface ZoneSlice {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  seconds: number;
  kcal: number;
  /** Fraction of the session spent here, 0 to 1. */
  share: number;
}

/** The summary's bar chart: minutes and calories per zone, zone one first. */
export function zoneBreakdown(seconds: ZoneTotals, kcal: ZoneTotals): ZoneSlice[] {
  const total = HR_ZONES.reduce((sum, band) => sum + (seconds[band.zone] ?? 0), 0);

  return HR_ZONES.map((band) => ({
    zone: band.zone,
    label: band.label,
    seconds: seconds[band.zone] ?? 0,
    kcal: kcal[band.zone] ?? 0,
    share: total > 0 ? (seconds[band.zone] ?? 0) / total : 0,
  }));
}

/** "5:42" from minutes per kilometre, or a dash when there is no pace yet. */
export function formatPace(minPerKm: number | null): string {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0) return '—';
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  return seconds === 60
    ? `${minutes + 1}:00`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Minutes per kilometre from metres covered over seconds elapsed. */
export function paceFromDistance(metres: number, seconds: number): number | null {
  if (!(metres > 0) || !(seconds > 0)) return null;
  return seconds / 60 / (metres / 1000);
}
