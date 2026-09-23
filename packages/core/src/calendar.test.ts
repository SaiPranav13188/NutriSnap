import { describe, expect, it } from 'vitest';
import {
  ageInYears,
  birthYearRange,
  buildDateKey,
  dayWindow,
  buildDateStrip,
  daysInMonth,
  defaultBirthDateKey,
  describeDate,
  fromDateKey,
  indexOfDate,
  splitDateKey,
  toDateKey,
  todayKey,
} from './calendar.js';

describe('toDateKey', () => {
  it('formats a local date, not a UTC one', () => {
    // Late evening local time would roll over to the next day under
    // toISOString in any timezone ahead of UTC.
    expect(toDateKey(new Date(2026, 8, 20, 23, 30))).toBe('2026-09-20');
  });

  it('zero-pads month and day', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('fromDateKey', () => {
  it('round-trips with toDateKey', () => {
    expect(toDateKey(fromDateKey('2026-02-28'))).toBe('2026-02-28');
  });

  it('parses as local midnight rather than UTC', () => {
    const d = fromDateKey('2026-09-20');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(20);
  });
});

describe('buildDateStrip', () => {
  const now = new Date(2026, 8, 20); // 20 Sep 2026

  it('spans the requested window, inclusive of both ends', () => {
    const strip = buildDateStrip({ daysBack: 10, daysForward: 2, now });
    expect(strip).toHaveLength(13);
    expect(strip[0]!.date).toBe('2026-09-10');
    expect(strip.at(-1)!.date).toBe('2026-09-22');
  });

  it('runs oldest to newest', () => {
    const strip = buildDateStrip({ daysBack: 5, daysForward: 0, now });
    const dates = strip.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('marks exactly one day as today', () => {
    const strip = buildDateStrip({ daysBack: 30, daysForward: 5, now });
    const todays = strip.filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]!.date).toBe('2026-09-20');
  });

  it('flags future days so they can be disabled', () => {
    const strip = buildDateStrip({ daysBack: 2, daysForward: 3, now });
    expect(strip.filter((d) => d.isFuture).map((d) => d.date)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]);
  });

  it('never marks today or the past as future', () => {
    const strip = buildDateStrip({ daysBack: 40, daysForward: 3, now });
    for (const day of strip) {
      if (day.date <= '2026-09-20') expect(day.isFuture).toBe(false);
    }
  });

  it('gives correct weekday letters', () => {
    // 20 Sep 2026 is a Sunday.
    const strip = buildDateStrip({ daysBack: 1, daysForward: 0, now });
    expect(strip.at(-1)!.weekdayLetter).toBe('S');
    expect(strip[0]!.weekdayLetter).toBe('S'); // Saturday the 19th
  });

  it('marks the first of the month for a divider', () => {
    const strip = buildDateStrip({ daysBack: 25, daysForward: 0, now });
    const starts = strip.filter((d) => d.isMonthStart);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.date).toBe('2026-09-01');
  });

  it('crosses a month boundary correctly', () => {
    const strip = buildDateStrip({ daysBack: 3, daysForward: 0, now: new Date(2026, 9, 2) });
    expect(strip.map((d) => d.date)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});

describe('indexOfDate', () => {
  const strip = buildDateStrip({ daysBack: 5, daysForward: 0, now: new Date(2026, 8, 20) });

  it('finds a date in the strip', () => {
    expect(strip[indexOfDate(strip, '2026-09-18')]!.date).toBe('2026-09-18');
  });

  it('falls back to the last entry when absent', () => {
    expect(indexOfDate(strip, '1999-01-01')).toBe(strip.length - 1);
  });
});

describe('describeDate', () => {
  const now = new Date(2026, 8, 20);

  it('names today and yesterday', () => {
    expect(describeDate('2026-09-20', now)).toBe('Today');
    expect(describeDate('2026-09-19', now)).toBe('Yesterday');
  });

  it('writes out other dates in the same year without the year', () => {
    expect(describeDate('2026-09-10', now)).not.toMatch(/2026/);
  });

  it('includes the year for a different one', () => {
    expect(describeDate('2025-09-10', now)).toMatch(/2025/);
  });
});

describe('todayKey', () => {
  it('agrees with toDateKey', () => {
    const now = new Date(2026, 8, 20, 18, 45);
    expect(todayKey(now)).toBe(toDateKey(now));
  });
});

describe('daysInMonth', () => {
  it('knows the short months', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 9)).toBe(30);
  });

  it('knows the long months', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('handles February across the leap rules', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28); // divisible by 100, not a leap year
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400, is a leap year
  });
});

describe('splitDateKey', () => {
  it('splits a valid key', () => {
    expect(splitDateKey('2005-07-08')).toEqual({ year: 2005, month: 7, day: 8 });
  });

  it('rejects malformed strings', () => {
    expect(splitDateKey('2005-7-8')).toBeNull();
    expect(splitDateKey('not a date')).toBeNull();
    expect(splitDateKey('')).toBeNull();
  });

  it('rejects days the month does not have', () => {
    expect(splitDateKey('2026-02-30')).toBeNull();
    expect(splitDateKey('2026-13-01')).toBeNull();
    expect(splitDateKey('2026-04-31')).toBeNull();
  });

  it('accepts 29 February only in a leap year', () => {
    expect(splitDateKey('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(splitDateKey('2026-02-29')).toBeNull();
  });
});

describe('buildDateKey', () => {
  it('zero-pads', () => {
    expect(buildDateKey({ year: 2005, month: 7, day: 8 })).toBe('2005-07-08');
  });

  it('clamps the day down to the length of the month', () => {
    // Spinning the month wheel from March to February must not strand the
    // day wheel on a date that does not exist.
    expect(buildDateKey({ year: 2026, month: 2, day: 31 })).toBe('2026-02-28');
    expect(buildDateKey({ year: 2024, month: 2, day: 31 })).toBe('2024-02-29');
    expect(buildDateKey({ year: 2026, month: 4, day: 31 })).toBe('2026-04-30');
  });

  it('clamps out-of-range months and days', () => {
    expect(buildDateKey({ year: 2026, month: 0, day: 0 })).toBe('2026-01-01');
    expect(buildDateKey({ year: 2026, month: 99, day: 99 })).toBe('2026-12-31');
  });

  it('round-trips through splitDateKey', () => {
    const key = buildDateKey({ year: 1998, month: 11, day: 3 });
    expect(splitDateKey(key)).toEqual({ year: 1998, month: 11, day: 3 });
  });
});

describe('birthYearRange', () => {
  it('spans the ages the quiz accepts', () => {
    expect(birthYearRange(new Date(2026, 8, 20))).toEqual({ min: 1906, max: 2013 });
  });

  it('only offers years the quiz would accept', () => {
    const now = new Date(2026, 8, 20);
    const { min, max } = birthYearRange(now);
    // Someone born on this calendar day in the youngest offered year turns 13
    // today, so the wheel never shows a year the next screen rejects.
    expect(ageInYears(new Date(max, 8, 20), now)).toBe(13);
    expect(ageInYears(new Date(min, 8, 20), now)).toBe(120);
  });
});

describe('defaultBirthDateKey', () => {
  it('starts the wheels at a plausible adult birth date', () => {
    expect(defaultBirthDateKey(new Date(2026, 8, 20))).toBe('2001-01-01');
  });

  it('falls inside the selectable year range', () => {
    const now = new Date(2026, 8, 20);
    const parts = splitDateKey(defaultBirthDateKey(now));
    const { min, max } = birthYearRange(now);
    expect(parts).not.toBeNull();
    expect(parts!.year).toBeGreaterThanOrEqual(min);
    expect(parts!.year).toBeLessThanOrEqual(max);
  });
});

describe('ageInYears', () => {
  it('counts a birthday that falls today', () => {
    expect(ageInYears(new Date(2013, 8, 20), new Date(2026, 8, 20))).toBe(13);
  });

  it('does not count a birthday that has not arrived yet', () => {
    expect(ageInYears(new Date(2013, 8, 21), new Date(2026, 8, 20))).toBe(12);
    expect(ageInYears(new Date(2013, 11, 31), new Date(2026, 8, 20))).toBe(12);
  });

  it('counts a birthday already passed this year', () => {
    expect(ageInYears(new Date(2013, 0, 1), new Date(2026, 8, 20))).toBe(13);
  });

  it('is negative for a date in the future', () => {
    expect(ageInYears(new Date(2030, 0, 1), new Date(2026, 8, 20))).toBeLessThan(0);
  });
});

describe('dayWindow', () => {
  const IST = 330;
  const NEW_YORK = -300;

  /** The walk that went missing: 00:21 on 22 September, Indian time. */
  const WALK = Date.parse('2026-09-21T18:51:06.080Z');

  const covers = (window: { from: string; to: string }, instant: number): boolean =>
    instant >= Date.parse(window.from) && instant < Date.parse(window.to);

  it('runs local midnight to local midnight', () => {
    const window = dayWindow('2026-09-22', IST);
    expect(window.from).toBe('2026-09-21T18:30:00.000Z');
    expect(window.to).toBe('2026-09-22T18:30:00.000Z');
  });

  it('puts a small-hours workout on the day it was done', () => {
    expect(covers(dayWindow('2026-09-22', IST), WALK)).toBe(true);
    expect(covers(dayWindow('2026-09-21', IST), WALK)).toBe(false);
  });

  it('is what UTC bucketing got wrong', () => {
    // The same instant, bucketed in UTC, lands on the day before.
    expect(covers(dayWindow('2026-09-21', 0), WALK)).toBe(true);
    expect(covers(dayWindow('2026-09-22', 0), WALK)).toBe(false);
  });

  it('works west of UTC as well as east', () => {
    const window = dayWindow('2026-09-22', NEW_YORK);
    expect(window.from).toBe('2026-09-22T05:00:00.000Z');
    expect(window.to).toBe('2026-09-23T05:00:00.000Z');
  });

  it('covers the whole day and no more', () => {
    for (const offset of [0, IST, NEW_YORK, 840, -840]) {
      const window = dayWindow('2026-03-01', offset);
      expect(Date.parse(window.to) - Date.parse(window.from)).toBe(86_400_000);
    }
  });

  it('leaves no gap or overlap between consecutive days', () => {
    expect(dayWindow('2026-09-21', IST).to).toBe(dayWindow('2026-09-22', IST).from);
  });

  it('defaults to UTC, which is the behaviour it replaced', () => {
    const window = dayWindow('2026-09-22');
    expect(window.from).toBe('2026-09-22T00:00:00.000Z');
  });

  it('works out an unnamed today in the callers own zone', () => {
    // 23:00 UTC is already tomorrow in India and still today in New York.
    const at = Date.parse('2026-09-21T23:00:00.000Z');
    const original = Date.now;
    Date.now = () => at;
    try {
      expect(dayWindow(undefined, IST).date).toBe('2026-09-22');
      expect(dayWindow(undefined, 0).date).toBe('2026-09-21');
      expect(dayWindow(undefined, NEW_YORK).date).toBe('2026-09-21');
    } finally {
      Date.now = original;
    }
  });
});
