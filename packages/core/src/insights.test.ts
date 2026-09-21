import { describe, expect, it } from 'vitest';
import {
  BMI_BANDS,
  bmi,
  bmiCategory,
  bmiScalePosition,
  daysUntilNextWeighIn,
  describeChange,
  periodChanges,
  weekBucket,
} from './insights.js';
import type { SeriesPoint } from './progress.js';

describe('bmi', () => {
  it('computes weight over height squared', () => {
    // 64 kg at 172.6 cm is the 21.45 the reference screen shows.
    expect(bmi(64, 172.6)).toBeCloseTo(21.48, 1);
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2);
  });

  it('returns null when either measurement is missing', () => {
    expect(bmi(null, 175)).toBeNull();
    expect(bmi(70, null)).toBeNull();
    expect(bmi(0, 175)).toBeNull();
    expect(bmi(70, 0)).toBeNull();
  });
});

describe('bmiCategory', () => {
  it('uses the WHO cut-offs', () => {
    expect(bmiCategory(17).key).toBe('underweight');
    expect(bmiCategory(22).key).toBe('healthy');
    expect(bmiCategory(27).key).toBe('overweight');
    expect(bmiCategory(35).key).toBe('obese');
  });

  it('puts each boundary in the higher band', () => {
    expect(bmiCategory(18.5).key).toBe('healthy');
    expect(bmiCategory(25).key).toBe('overweight');
    expect(bmiCategory(30).key).toBe('obese');
  });

  it('covers the whole number line without a gap', () => {
    for (let v = 10; v < 60; v += 0.5) {
      expect(BMI_BANDS.some((b) => v >= b.min && v < b.max)).toBe(true);
    }
  });
});

describe('bmiScalePosition', () => {
  it('maps the scale ends to 0 and 1', () => {
    expect(bmiScalePosition(15)).toBe(0);
    expect(bmiScalePosition(40)).toBe(1);
  });

  it('clamps beyond the drawn scale rather than running off the bar', () => {
    expect(bmiScalePosition(5)).toBe(0);
    expect(bmiScalePosition(80)).toBe(1);
  });

  it('places a mid value in the middle', () => {
    expect(bmiScalePosition(27.5)).toBeCloseTo(0.5, 5);
  });
});

describe('periodChanges', () => {
  const now = new Date(2026, 8, 21); // 21 September 2026

  const series: SeriesPoint[] = [
    { date: '2026-06-01', value: 70 },
    { date: '2026-08-22', value: 68 },
    { date: '2026-09-07', value: 66 },
    { date: '2026-09-14', value: 65 },
    { date: '2026-09-18', value: 64.5 },
    { date: '2026-09-21', value: 64 },
  ];

  it('returns a row per standard window', () => {
    const rows = periodChanges(series, { now });
    expect(rows.map((r) => r.label)).toEqual([
      '3 day',
      '7 day',
      '14 day',
      '30 day',
      '90 day',
      'All Time',
    ]);
  });

  it('measures against the last reading on or before the window start', () => {
    const rows = periodChanges(series, { now });
    // 7 days back is 14 September, which has a reading of 65.
    expect(rows.find((r) => r.days === 7)?.delta).toBeCloseTo(-1, 5);
  });

  it('measures all time from the first reading', () => {
    const all = periodChanges(series, { now }).find((r) => r.days === null);
    expect(all?.delta).toBeCloseTo(-6, 5);
    expect(all?.direction).toBe('down');
  });

  it('flags a window the history does not reach back to', () => {
    const short: SeriesPoint[] = [{ date: '2026-09-20', value: 64 }];
    const rows = periodChanges(short, { now });
    expect(rows.find((r) => r.days === 90)?.covered).toBe(false);
  });

  it('reports no change for a single reading', () => {
    const one: SeriesPoint[] = [{ date: '2026-09-21', value: 64 }];
    for (const row of periodChanges(one, { now })) {
      expect(row.delta).toBe(0);
      expect(row.direction).toBe('flat');
    }
  });

  it('survives an empty series', () => {
    const rows = periodChanges([], { now });
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.direction === 'flat' && !r.covered)).toBe(true);
  });

  it('sorts unordered input before measuring', () => {
    const shuffled = [...series].reverse();
    expect(periodChanges(shuffled, { now })).toEqual(periodChanges(series, { now }));
  });

  it('treats a move under the threshold as flat', () => {
    const flat: SeriesPoint[] = [
      { date: '2026-09-14', value: 64.02 },
      { date: '2026-09-21', value: 64 },
    ];
    expect(periodChanges(flat, { now }).find((r) => r.days === 7)?.direction).toBe('flat');
  });

  it('takes a wider threshold for units that move in larger steps', () => {
    const kcal: SeriesPoint[] = [
      { date: '2026-09-14', value: 2500 },
      { date: '2026-09-21', value: 2510 },
    ];
    const rows = periodChanges(kcal, { now, flatThreshold: 25 });
    expect(rows.find((r) => r.days === 7)?.direction).toBe('flat');
  });
});

describe('describeChange', () => {
  const now = new Date(2026, 8, 21);

  it('says "No change" rather than "+0.0 kg"', () => {
    const rows = periodChanges([{ date: '2026-09-21', value: 64 }], { now });
    expect(describeChange(rows[0]!, 'kg')).toBe('No change');
  });

  it('signs a gain and a loss', () => {
    const down = periodChanges(
      [
        { date: '2026-09-14', value: 65 },
        { date: '2026-09-21', value: 64 },
      ],
      { now },
    ).find((r) => r.days === 7)!;
    expect(describeChange(down, 'kg')).toBe('-1.0 kg');

    const up = periodChanges(
      [
        { date: '2026-09-14', value: 64 },
        { date: '2026-09-21', value: 65.5 },
      ],
      { now },
    ).find((r) => r.days === 7)!;
    expect(describeChange(up, 'kg')).toBe('+1.5 kg');
  });

  it('takes a decimal count, for units that are not weighed in tenths', () => {
    const up = periodChanges(
      [
        { date: '2026-09-14', value: 2400 },
        { date: '2026-09-21', value: 2550 },
      ],
      { now, flatThreshold: 25 },
    ).find((r) => r.days === 7)!;
    expect(describeChange(up, 'Kcal', 0)).toBe('+150 Kcal');
  });
});

describe('weekBucket', () => {
  // Monday 21 September 2026.
  const now = new Date(2026, 8, 21);

  const series: SeriesPoint[] = [
    { date: '2026-09-20', value: 2000 }, // Sunday
    { date: '2026-09-21', value: 1000 }, // Monday
    { date: '2026-09-14', value: 1500 }, // Monday the week before
  ];

  it('runs Sunday to Saturday', () => {
    const week = weekBucket(series, 0, now);
    expect(week.days).toHaveLength(7);
    expect(week.days.map((d) => d.weekday)).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
    expect(week.startDate).toBe('2026-09-20');
    expect(week.endDate).toBe('2026-09-26');
  });

  it('steps back a whole week at a time', () => {
    const last = weekBucket(series, 1, now);
    expect(last.startDate).toBe('2026-09-13');
    expect(last.endDate).toBe('2026-09-19');
    expect(last.days.find((d) => d.date === '2026-09-14')?.value).toBe(1500);
  });

  it('reads a day with no data as zero', () => {
    const week = weekBucket(series, 0, now);
    expect(week.days.find((d) => d.date === '2026-09-22')?.value).toBe(0);
  });

  it('marks days that have not happened yet', () => {
    const week = weekBucket(series, 0, now);
    expect(week.days.find((d) => d.date === '2026-09-21')?.elapsed).toBe(true);
    expect(week.days.find((d) => d.date === '2026-09-22')?.elapsed).toBe(false);
  });

  it('averages over elapsed days, so a part-week is not dragged down', () => {
    // Sunday 2000 + Monday 1000 over two elapsed days is 1500, not 3000/7.
    const week = weekBucket(series, 0, now);
    expect(week.total).toBe(3000);
    expect(week.average).toBe(1500);
  });

  it('averages a fully elapsed week across all seven days', () => {
    const last = weekBucket(series, 1, now);
    expect(last.average).toBeCloseTo(1500 / 7, 5);
  });

  it('returns zeroes rather than throwing on an empty series', () => {
    const week = weekBucket([], 0, now);
    expect(week.total).toBe(0);
    expect(week.average).toBe(0);
    expect(week.days.every((d) => d.value === 0)).toBe(true);
  });
});

describe('daysUntilNextWeighIn', () => {
  const now = new Date(2026, 8, 21);

  it('counts forward from the last weigh-in', () => {
    expect(daysUntilNextWeighIn('2026-09-19', 7, now)).toBe(5);
  });

  it('is due now when never weighed in', () => {
    expect(daysUntilNextWeighIn(null, 7, now)).toBe(0);
  });

  it('is due now when overdue, rather than going negative', () => {
    expect(daysUntilNextWeighIn('2026-08-01', 7, now)).toBe(0);
  });

  it('is due today on the cadence boundary', () => {
    expect(daysUntilNextWeighIn('2026-09-14', 7, now)).toBe(0);
  });

  it('takes a different cadence', () => {
    expect(daysUntilNextWeighIn('2026-09-20', 14, now)).toBe(13);
  });

  it('shrugs off a malformed date', () => {
    expect(daysUntilNextWeighIn('not-a-date', 7, now)).toBe(0);
  });
});
