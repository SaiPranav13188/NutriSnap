import { describe, expect, it } from 'vitest';
import { consistency, type DayLogCount } from './consistency.js';
import { resolveWaterTarget, waterTarget } from './activity.js';

const days = (counts: number[]): DayLogCount[] =>
  counts.map((log_count, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, log_count }));

describe('consistency', () => {
  it('counts days with anything on them, not meals', () => {
    const result = consistency(days([3, 0, 1, 0, 2]), 5);
    expect(result.daysLogged).toBe(3);
    expect(result.completeness).toBeCloseTo(0.6);
  });

  it('measures against the window, not against the rows it was given', () => {
    // Four logged days is poor over a month, however few rows arrived.
    const result = consistency(days([1, 1, 1, 1]), 30);
    expect(result.windowDays).toBe(30);
    expect(result.completeness).toBeCloseTo(4 / 30);
  });

  it('reads the recent end when handed more history than it asked for', () => {
    const result = consistency(days([0, 0, 0, 0, 1, 1, 1]), 3);
    expect(result.daysLogged).toBe(3);
  });

  it('agrees with the adaptive engine about what counts as enough', () => {
    expect(consistency(days(Array(30).fill(1)), 30).enoughToAdapt).toBe(true);
    // 70% is the engine's floor, so 21 of 30 clears it and 20 does not.
    expect(consistency(days([...Array(21).fill(1), ...Array(9).fill(0)]), 30).enoughToAdapt).toBe(
      true,
    );
    expect(consistency(days([...Array(20).fill(1), ...Array(10).fill(0)]), 30).enoughToAdapt).toBe(
      false,
    );
  });

  it('says so when there is nothing at all', () => {
    expect(consistency([], 30).summary).toContain('Nothing logged');
    expect(consistency([], 30).completeness).toBe(0);
  });
});

describe('resolveWaterTarget', () => {
  it('derives from weight when no override is set', () => {
    expect(resolveWaterTarget(null, 70)).toBe(waterTarget(70));
    expect(resolveWaterTarget(undefined, 70)).toBe(waterTarget(70));
  });

  it('prefers the number the user chose', () => {
    expect(resolveWaterTarget(3200, 70)).toBe(3200);
  });

  it('lets a deliberate override sit outside the derived range', () => {
    // waterTarget floors at 1500; an override of 900 is a choice, not a slip.
    expect(resolveWaterTarget(900, 70)).toBe(900);
  });

  it('still refuses a figure nobody should be drinking to', () => {
    expect(resolveWaterTarget(99999, 70)).toBe(6000);
    expect(resolveWaterTarget(10, 70)).toBe(500);
  });

  it('falls back rather than trusting rubbish', () => {
    expect(resolveWaterTarget(Number.NaN, 70)).toBe(waterTarget(70));
    expect(resolveWaterTarget(0, 70)).toBe(waterTarget(70));
  });
});
