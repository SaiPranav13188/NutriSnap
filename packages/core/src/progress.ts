/**
 * Progress-tab helpers: the 90D / 1M / 6M / 1Y / ALL range filter, series
 * bucketing, trend detection and the encouragement copy under the chart.
 * Plan section 3.4.
 */

import type { ProgressRange } from './types.js';

export const PROGRESS_RANGES: ReadonlyArray<{ value: ProgressRange; label: string }> = [
  { value: '90d', label: '90D' },
  { value: '1m', label: '1M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'ALL' },
];

/** Start timestamp for a range, or null for 'all' (meaning "no lower bound"). */
export function rangeStartDate(range: ProgressRange, now: Date = new Date()): Date | null {
  const d = new Date(now.getTime());
  switch (range) {
    case '90d':
      d.setDate(d.getDate() - 90);
      return d;
    case '1m':
      d.setMonth(d.getMonth() - 1);
      return d;
    case '6m':
      d.setMonth(d.getMonth() - 6);
      return d;
    case '1y':
      d.setFullYear(d.getFullYear() - 1);
      return d;
    case 'all':
      return null;
  }
}

export function isProgressRange(value: unknown): value is ProgressRange {
  return typeof value === 'string' && PROGRESS_RANGES.some((r) => r.value === value);
}

export interface SeriesPoint {
  date: string; // ISO date, YYYY-MM-DD
  value: number;
}

/**
 * Collapse a dense series into at most `maxPoints` averaged buckets so a
 * 1Y or ALL chart stays readable and cheap to render. Order is preserved.
 */
export function bucketSeries(points: SeriesPoint[], maxPoints = 60): SeriesPoint[] {
  if (points.length <= maxPoints) return points;

  const size = Math.ceil(points.length / maxPoints);
  const out: SeriesPoint[] = [];

  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    const avg = chunk.reduce((s, p) => s + p.value, 0) / chunk.length;
    // Label the bucket with its last date so the most recent point is exact.
    const last = chunk[chunk.length - 1];
    if (last) out.push({ date: last.date, value: Math.round(avg * 100) / 100 });
  }

  return out;
}

/** Simple moving average — smooths day-to-day water-weight noise. */
export function movingAverage(points: SeriesPoint[], window = 7): SeriesPoint[] {
  if (window <= 1) return points;
  return points.map((p, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = points.slice(start, i + 1);
    const avg = slice.reduce((s, q) => s + q.value, 0) / slice.length;
    return { date: p.date, value: Math.round(avg * 100) / 100 };
  });
}

export type TrendDirection = 'down' | 'up' | 'flat' | 'insufficient';

export interface Trend {
  direction: TrendDirection;
  /** Absolute change from the first point to the last, in the series' unit. */
  change: number;
  /** Percentage change relative to the first point. */
  percentChange: number;
  first: number | null;
  last: number | null;
}

export function computeTrend(points: SeriesPoint[], flatThreshold = 0.2): Trend {
  if (points.length < 2) {
    const only = points[0];
    return {
      direction: 'insufficient',
      change: 0,
      percentChange: 0,
      first: only?.value ?? null,
      last: only?.value ?? null,
    };
  }

  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  const change = last - first;
  const percentChange = first !== 0 ? (change / first) * 100 : 0;

  let direction: TrendDirection = 'flat';
  if (Math.abs(change) >= flatThreshold) direction = change < 0 ? 'down' : 'up';

  return {
    direction,
    change: Math.round(change * 100) / 100,
    percentChange: Math.round(percentChange * 100) / 100,
    first,
    last,
  };
}

/**
 * The line that renders under the Progress chart. It reads the trend against
 * what the user is actually trying to do, so losing weight while bulking is
 * not congratulated.
 */
export function encouragementMessage(trend: Trend, goal: 'lose' | 'maintain' | 'gain'): string {
  if (trend.direction === 'insufficient') {
    return 'Log a few more weigh-ins and your trend will show up here.';
  }

  const magnitude = Math.abs(trend.change).toFixed(1);

  if (goal === 'maintain') {
    return trend.direction === 'flat'
      ? 'Rock steady. Holding your weight is its own kind of win.'
      : `You've moved ${magnitude} kg. Nudge your intake to settle back into your range.`;
  }

  const movingRightWay =
    (goal === 'lose' && trend.direction === 'down') || (goal === 'gain' && trend.direction === 'up');

  if (movingRightWay) {
    return `Great job — ${magnitude} kg in the right direction. Consistency is key, keep it up!`;
  }

  if (trend.direction === 'flat') {
    return "Your weight has held steady. Give it another week, or adjust your target if it doesn't budge.";
  }

  return `You're ${magnitude} kg off your intended direction. That happens — check your logging consistency this week.`;
}

/**
 * Week-over-week change for the "Daily Average Calories" card.
 * Expects a series ordered oldest → newest, one point per day.
 */
export function weekOverWeekChange(points: SeriesPoint[]): {
  thisWeekAvg: number;
  lastWeekAvg: number;
  percentChange: number;
} {
  const mean = (arr: SeriesPoint[]): number =>
    arr.length ? arr.reduce((s, p) => s + p.value, 0) / arr.length : 0;

  const thisWeek = points.slice(-7);
  const lastWeek = points.slice(-14, -7);

  const thisWeekAvg = mean(thisWeek);
  const lastWeekAvg = mean(lastWeek);
  const percentChange = lastWeekAvg > 0 ? ((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 100 : 0;

  return {
    thisWeekAvg: Math.round(thisWeekAvg),
    lastWeekAvg: Math.round(lastWeekAvg),
    percentChange: Math.round(percentChange * 10) / 10,
  };
}

/** Fraction of the way from start weight to goal weight, clamped to 0..1. */
export function goalProgress(startKg: number, currentKg: number, goalKg: number): number {
  const total = goalKg - startKg;
  if (total === 0) return 1;
  const done = currentKg - startKg;
  return Math.min(1, Math.max(0, done / total));
}
