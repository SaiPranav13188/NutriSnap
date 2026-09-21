/**
 * Derived numbers for the Progress tab: BMI, change-over-period tables, the
 * weekly calorie breakdown and the weigh-in reminder.
 *
 * All of it is arithmetic over series the API already returns, so it lives
 * here rather than in either client — the web and mobile progress screens
 * should never be able to disagree about what "30 day change" means.
 */

import type { SeriesPoint } from './progress.js';

// ---------------------------------------------------------------------------
// BMI
// ---------------------------------------------------------------------------

export type BmiCategory = 'underweight' | 'healthy' | 'overweight' | 'obese';

export interface BmiBand {
  key: BmiCategory;
  label: string;
  /** Inclusive lower bound. */
  min: number;
  /** Exclusive upper bound. */
  max: number;
}

/** WHO adult cut-offs. */
export const BMI_BANDS: readonly BmiBand[] = [
  { key: 'underweight', label: 'Underweight', min: 0, max: 18.5 },
  { key: 'healthy', label: 'Healthy', min: 18.5, max: 25 },
  { key: 'overweight', label: 'Overweight', min: 25, max: 30 },
  { key: 'obese', label: 'Obese', min: 30, max: Number.POSITIVE_INFINITY },
];

/** The span the on-screen scale draws, chosen to cover every realistic BMI. */
export const BMI_SCALE_MIN = 15;
export const BMI_SCALE_MAX = 40;

/** Body mass index, or null when height or weight is missing. */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 100) / 100;
}

export function bmiCategory(value: number): BmiBand {
  return BMI_BANDS.find((band) => value >= band.min && value < band.max) ?? BMI_BANDS[3]!;
}

/** Where to put the marker on the scale, as 0..1 from left to right. */
export function bmiScalePosition(value: number): number {
  const span = BMI_SCALE_MAX - BMI_SCALE_MIN;
  return Math.min(1, Math.max(0, (value - BMI_SCALE_MIN) / span));
}

// ---------------------------------------------------------------------------
// Change over a period
// ---------------------------------------------------------------------------

/**
 * Local YYYY-MM-DD. A function declaration so it hoists above its callers.
 *
 * Deliberately not toISOString: that converts to UTC first, which in any
 * timezone ahead of UTC moves a local midnight back into the previous day and
 * shifts every window boundary by one.
 */
function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type ChangeDirection = 'up' | 'down' | 'flat';

export interface PeriodChange {
  /** Days back, or null for the whole history. */
  days: number | null;
  label: string;
  /** Latest value minus the value at the start of the period. */
  delta: number;
  direction: ChangeDirection;
  /** False when the series does not reach back that far. */
  covered: boolean;
}

export const CHANGE_PERIODS: ReadonlyArray<{ days: number | null; label: string }> = [
  { days: 3, label: '3 day' },
  { days: 7, label: '7 day' },
  { days: 14, label: '14 day' },
  { days: 30, label: '30 day' },
  { days: 90, label: '90 day' },
  { days: null, label: 'All Time' },
];

/**
 * How much a series moved over each of the standard windows.
 *
 * The baseline is the last reading on or before the window's start. When the
 * history is shorter than the window it falls back to the first reading and
 * reports `covered: false`, which is honest about the number being over a
 * shorter span rather than silently showing nothing.
 */
export function periodChanges(
  series: SeriesPoint[],
  options: { flatThreshold?: number; now?: Date } = {},
): PeriodChange[] {
  const { flatThreshold = 0.1, now = new Date() } = options;

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);

  return CHANGE_PERIODS.map(({ days, label }) => {
    if (!latest || sorted.length === 0) {
      return { days, label, delta: 0, direction: 'flat' as const, covered: false };
    }

    if (days === null) {
      const delta = latest.value - sorted[0]!.value;
      return { days, label, delta, direction: directionOf(delta, flatThreshold), covered: true };
    }

    const cutoff = toKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
    const atOrBefore = sorted.filter((p) => p.date <= cutoff).at(-1);
    const baseline = atOrBefore ?? sorted[0]!;
    const delta = latest.value - baseline.value;

    return {
      days,
      label,
      delta,
      direction: directionOf(delta, flatThreshold),
      covered: atOrBefore !== undefined,
    };
  });
}

function directionOf(delta: number, flatThreshold: number): ChangeDirection {
  if (Math.abs(delta) < flatThreshold) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

/** "No change", "+0.4 kg", "-120 kcal" — the text beside each row. */
export function describeChange(change: PeriodChange, unit: string, decimals = 1): string {
  if (change.direction === 'flat') return 'No change';
  const sign = change.delta > 0 ? '+' : '-';
  return `${sign}${Math.abs(change.delta).toFixed(decimals)} ${unit}`;
}

// ---------------------------------------------------------------------------
// Weekly breakdown
// ---------------------------------------------------------------------------

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface DayBucket {
  /** YYYY-MM-DD */
  date: string;
  weekday: string;
  value: number;
  /** False for days that have not happened yet. */
  elapsed: boolean;
}

export interface WeekBucket {
  startDate: string;
  endDate: string;
  days: DayBucket[];
  /** Mean across elapsed days, so a half-finished week is not halved. */
  average: number;
  total: number;
}

/**
 * Seven Sunday-to-Saturday days, `weeksAgo` weeks back from the current week.
 *
 * Days with no data read as zero, which is what the bar chart should show —
 * a day you did not log is a day you have no calories for.
 */
export function weekBucket(
  series: SeriesPoint[],
  weeksAgo = 0,
  now: Date = new Date(),
): WeekBucket {
  const byDate = new Map(series.map((p) => [p.date, p.value]));

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sunday = new Date(today);
  sunday.setDate(sunday.getDate() - today.getDay() - weeksAgo * 7);

  const todayKeyValue = toKey(today);
  const days: DayBucket[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    const key = toKey(d);
    days.push({
      date: key,
      weekday: WEEKDAY_LABELS[d.getDay()] ?? '',
      value: byDate.get(key) ?? 0,
      elapsed: key <= todayKeyValue,
    });
  }

  const elapsed = days.filter((d) => d.elapsed);
  const total = days.reduce((sum, d) => sum + d.value, 0);

  return {
    startDate: days[0]!.date,
    endDate: days[6]!.date,
    days,
    average: elapsed.length > 0 ? total / elapsed.length : 0,
    total,
  };
}

export const WEEK_OPTIONS: ReadonlyArray<{ weeksAgo: number; label: string }> = [
  { weeksAgo: 0, label: 'This wk' },
  { weeksAgo: 1, label: 'Last wk' },
  { weeksAgo: 2, label: '2 wk ago' },
  { weeksAgo: 3, label: '3 wk ago' },
];

// ---------------------------------------------------------------------------
// Weigh-in reminder
// ---------------------------------------------------------------------------

/**
 * Days until the next weigh-in is due, floored at zero.
 *
 * Weight moves too slowly for a daily reading to mean much, and water weight
 * swings enough to be discouraging, so the cadence is weekly by default.
 * Never weighed in returns 0 — it is due now.
 */
export function daysUntilNextWeighIn(
  lastLoggedOn: string | null,
  cadenceDays = 7,
  now: Date = new Date(),
): number {
  if (!lastLoggedOn) return 0;

  const [y, m, d] = lastLoggedOn.split('-').map(Number);
  if (!y || !m || !d) return 0;

  const last = new Date(y, m - 1, d);
  const due = new Date(y, m - 1, d + cadenceDays);
  if (Number.isNaN(last.getTime())) return 0;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.ceil((due.getTime() - today.getTime()) / 86_400_000));
}
