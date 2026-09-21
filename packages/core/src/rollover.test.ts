import { describe, expect, it } from 'vitest';
import {
  ROLLOVER_CAP_KCAL,
  ROLLOVER_MIN_KCAL,
  canPushRollover,
  describeRollover,
  quoteRollover,
  rolloverTargetDate,
} from './rollover.js';

describe('quoteRollover', () => {
  it('carries the whole shortfall when it is under the cap', () => {
    const q = quoteRollover({ consumed: 1800, target: 2000 });
    expect(q.unspent).toBe(200);
    expect(q.amount).toBe(200);
    expect(q.eligible).toBe(true);
    expect(q.capped).toBe(false);
  });

  it('caps a large shortfall', () => {
    // A day 1200 under should not hand 1200 to tomorrow.
    const q = quoteRollover({ consumed: 800, target: 2000 });
    expect(q.unspent).toBe(1200);
    expect(q.amount).toBe(ROLLOVER_CAP_KCAL);
    expect(q.capped).toBe(true);
  });

  it('yields nothing when the day went over', () => {
    const q = quoteRollover({ consumed: 2400, target: 2000 });
    expect(q.unspent).toBe(0);
    expect(q.amount).toBe(0);
    expect(q.eligible).toBe(false);
  });

  it('yields nothing on an exactly met target', () => {
    expect(quoteRollover({ consumed: 2000, target: 2000 }).eligible).toBe(false);
  });

  it('refuses a shortfall too small to be worth moving', () => {
    const q = quoteRollover({ consumed: 2000 - (ROLLOVER_MIN_KCAL - 1), target: 2000 });
    expect(q.unspent).toBe(ROLLOVER_MIN_KCAL - 1);
    expect(q.eligible).toBe(false);
  });

  it('accepts exactly the minimum', () => {
    expect(quoteRollover({ consumed: 2000 - ROLLOVER_MIN_KCAL, target: 2000 }).eligible).toBe(true);
  });

  it('never exceeds what the database column accepts', () => {
    // amount_kcal is checked between 1 and 1000.
    const q = quoteRollover({ consumed: 0, target: 99999 });
    expect(q.amount).toBeLessThanOrEqual(1000);
    expect(q.amount).toBeGreaterThanOrEqual(1);
  });

  it('survives a missing or nonsensical target', () => {
    expect(quoteRollover({ consumed: 500, target: 0 }).eligible).toBe(false);
    expect(quoteRollover({ consumed: 500, target: -100 }).eligible).toBe(false);
    expect(quoteRollover({ consumed: Number.NaN, target: 2000 }).eligible).toBe(false);
  });

  it('takes a caller-supplied cap', () => {
    expect(quoteRollover({ consumed: 1000, target: 2000, cap: 300 }).amount).toBe(300);
  });
});

describe('rolloverTargetDate', () => {
  it('lands on the next day', () => {
    expect(rolloverTargetDate('2026-09-21')).toBe('2026-09-22');
  });

  it('crosses a month boundary', () => {
    expect(rolloverTargetDate('2026-09-30')).toBe('2026-10-01');
  });

  it('crosses a year boundary', () => {
    expect(rolloverTargetDate('2026-12-31')).toBe('2027-01-01');
  });

  it('handles February in a leap year', () => {
    expect(rolloverTargetDate('2024-02-28')).toBe('2024-02-29');
    expect(rolloverTargetDate('2024-02-29')).toBe('2024-03-01');
  });

  it('handles February in a non-leap year', () => {
    expect(rolloverTargetDate('2026-02-28')).toBe('2026-03-01');
  });
});

describe('canPushRollover', () => {
  const today = '2026-09-21';
  const good = quoteRollover({ consumed: 1800, target: 2000 });

  it('allows a past day with something left over', () => {
    expect(canPushRollover({ date: '2026-09-20', alreadyPushed: false, quote: good, today })).toBe(
      true,
    );
  });

  it('allows today', () => {
    expect(canPushRollover({ date: today, alreadyPushed: false, quote: good, today })).toBe(true);
  });

  it('refuses a day that has not happened', () => {
    expect(canPushRollover({ date: '2026-09-22', alreadyPushed: false, quote: good, today })).toBe(
      false,
    );
  });

  it('refuses a day already pushed, so tapping twice cannot double it', () => {
    expect(canPushRollover({ date: today, alreadyPushed: true, quote: good, today })).toBe(false);
  });

  it('refuses when there is nothing eligible to move', () => {
    const over = quoteRollover({ consumed: 2400, target: 2000 });
    expect(canPushRollover({ date: today, alreadyPushed: false, quote: over, today })).toBe(false);
  });
});

describe('describeRollover', () => {
  const today = '2026-09-21';

  it('reports what was already moved', () => {
    expect(
      describeRollover({
        date: today,
        alreadyPushed: true,
        pushedAmount: 180,
        quote: quoteRollover({ consumed: 1820, target: 2000 }),
        today,
      }),
    ).toBe('180 kcal moved to the next day.');
  });

  it('says when a day went over', () => {
    expect(
      describeRollover({
        date: today,
        alreadyPushed: false,
        quote: quoteRollover({ consumed: 2400, target: 2000 }),
        today,
      }),
    ).toBe('Nothing left over on this day.');
  });

  it('names the cap when the shortfall is bigger than it', () => {
    const text = describeRollover({
      date: today,
      alreadyPushed: false,
      quote: quoteRollover({ consumed: 800, target: 2000 }),
      today,
    });
    expect(text).toContain('1200 kcal left');
    expect(text).toContain(`${ROLLOVER_CAP_KCAL} can carry`);
  });

  it('states the plain case simply', () => {
    expect(
      describeRollover({
        date: today,
        alreadyPushed: false,
        quote: quoteRollover({ consumed: 1800, target: 2000 }),
        today,
      }),
    ).toBe('200 kcal can carry into the next day.');
  });

  it('explains a future day rather than offering the button', () => {
    expect(
      describeRollover({
        date: '2026-09-25',
        alreadyPushed: false,
        quote: quoteRollover({ consumed: 0, target: 2000 }),
        today,
      }),
    ).toBe('This day has not happened yet.');
  });

  it('always ends in a full stop, since it renders as a sentence', () => {
    const cases = [
      { consumed: 1800, target: 2000 },
      { consumed: 2400, target: 2000 },
      { consumed: 800, target: 2000 },
      { consumed: 1990, target: 2000 },
    ];
    for (const c of cases) {
      const text = describeRollover({
        date: today,
        alreadyPushed: false,
        quote: quoteRollover(c),
        today,
      });
      expect(text.endsWith('.')).toBe(true);
    }
  });
});
