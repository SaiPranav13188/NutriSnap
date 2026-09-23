import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_MIN_SAMPLES,
  MAX_CALIBRATION,
  MAX_HOURS,
  MIN_CALIBRATION,
  MIN_HOURS,
  calibrationFactor,
  describeOutcome,
  describeSatiety,
  personalSatiety,
  predictSatiety,
  satietyOutcomesFromLogs,
  type SatietyLog,
  type SatietyOutcome,
} from './satiety.js';

const meal = (over: Partial<Parameters<typeof predictSatiety>[0]> = {}) => ({
  calories: 600,
  protein_g: 25,
  fat_g: 20,
  fiber_g: 6,
  sugar_g: 8,
  ...over,
});

describe('predictSatiety', () => {
  it('holds longer for more protein at the same calories', () => {
    const lean = predictSatiety(meal({ protein_g: 45 }));
    const not = predictSatiety(meal({ protein_g: 8 }));
    expect(lean.hours).toBeGreaterThan(not.hours);
  });

  it('holds longer for more fibre', () => {
    const fibrous = predictSatiety(meal({ fiber_g: 18 }));
    const refined = predictSatiety(meal({ fiber_g: 1 }));
    expect(fibrous.hours).toBeGreaterThan(refined.hours);
  });

  it('holds less when the calories are mostly sugar', () => {
    const sugary = predictSatiety(meal({ sugar_g: 70, protein_g: 4, fiber_g: 0, fat_g: 3 }));
    const balanced = predictSatiety(meal());
    expect(sugary.hours).toBeLessThan(balanced.hours);
  });

  it('judges on composition, not just size', () => {
    // The same macro ratio at half the calories should be close, not half.
    const big = predictSatiety({ calories: 800, protein_g: 40, fat_g: 26, fiber_g: 8, sugar_g: 10 });
    const small = predictSatiety({
      calories: 400,
      protein_g: 20,
      fat_g: 13,
      fiber_g: 4,
      sugar_g: 5,
    });
    expect(big.hours).toBeGreaterThan(small.hours);
    expect(big.hours).toBeLessThan(small.hours * 2);
  });

  it('names what is doing the work', () => {
    expect(predictSatiety(meal({ protein_g: 60, fiber_g: 1, fat_g: 5 })).driver).toBe('protein');
    expect(predictSatiety(meal({ protein_g: 5, fiber_g: 25, fat_g: 4 })).driver).toBe('fiber');
  });

  it('promises nothing for a meal with no calories', () => {
    const none = predictSatiety({
      calories: 0,
      protein_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
    });
    expect(none.hours).toBe(0);
    expect(none.driver).toBe('none');
  });

  it('stays inside a believable range whatever it is fed', () => {
    const absurd = predictSatiety({
      calories: 5000,
      protein_g: 400,
      fat_g: 200,
      fiber_g: 150,
      sugar_g: 0,
    });
    const empty = predictSatiety({
      calories: 90,
      protein_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 22,
    });

    expect(absurd.hours).toBeLessThanOrEqual(MAX_HOURS);
    expect(empty.hours).toBeGreaterThanOrEqual(MIN_HOURS);
  });

  it('does not divide by zero calories with macros present', () => {
    const odd = predictSatiety({
      calories: 0,
      protein_g: 30,
      fat_g: 10,
      fiber_g: 5,
      sugar_g: 2,
    });
    expect(Number.isFinite(odd.hours)).toBe(true);
  });
});

describe('calibrationFactor', () => {
  const outcomes = (ratios: number[]): SatietyOutcome[] =>
    ratios.map((r) => ({ predictedHours: 3, actualHours: 3 * r }));

  it('says nothing until there is enough to go on', () => {
    expect(calibrationFactor(outcomes([1.2, 1.2, 1.2, 1.2]))).toBeNull();
    expect(calibrationFactor([])).toBeNull();
  });

  it('finds a consistent personal drift', () => {
    const factor = calibrationFactor(outcomes([1.2, 1.25, 1.2, 1.15, 1.2]));
    expect(factor).toBeCloseTo(1.2, 2);
  });

  it('is not dragged by one skipped meal', () => {
    // Four normal gaps and one nine-hour outlier: the median holds.
    const factor = calibrationFactor(outcomes([1, 1.1, 1, 0.9, 6]));
    expect(factor).toBeLessThan(1.3);
  });

  it('clamps a person who would otherwise break the model', () => {
    expect(calibrationFactor(outcomes([5, 5, 5, 5, 5]))).toBe(MAX_CALIBRATION);
    expect(calibrationFactor(outcomes([0.1, 0.1, 0.1, 0.1, 0.1]))).toBe(MIN_CALIBRATION);
  });

  it('ignores outcomes with no usable numbers', () => {
    const mixed: SatietyOutcome[] = [
      ...outcomes([1.2, 1.2, 1.2, 1.2, 1.2]),
      { predictedHours: 0, actualHours: 5 },
      { predictedHours: 3, actualHours: 0 },
    ];
    expect(calibrationFactor(mixed)).toBeCloseTo(1.2, 2);
  });

  it('needs exactly the stated minimum, not one fewer', () => {
    const just = outcomes(Array.from({ length: CALIBRATION_MIN_SAMPLES }, () => 1.1));
    expect(calibrationFactor(just)).not.toBeNull();
    expect(calibrationFactor(just.slice(1))).toBeNull();
  });
});

describe('personalSatiety', () => {
  it('is the plain prediction until there is history', () => {
    const result = personalSatiety(meal(), []);
    expect(result.calibrated).toBe(false);
    expect(result.hours).toBeCloseTo(predictSatiety(meal()).hours, 6);
  });

  it('bends towards the person once there is', () => {
    const history: SatietyOutcome[] = Array.from({ length: 6 }, () => ({
      predictedHours: 3,
      actualHours: 3.9,
    }));
    const result = personalSatiety(meal(), history);

    expect(result.calibrated).toBe(true);
    expect(result.hours).toBeGreaterThan(predictSatiety(meal()).hours);
  });

  it('stays in range even after calibration', () => {
    const history: SatietyOutcome[] = Array.from({ length: 6 }, () => ({
      predictedHours: 1,
      actualHours: 10,
    }));
    const result = personalSatiety(meal({ calories: 2000, protein_g: 150 }), history);
    expect(result.hours).toBeLessThanOrEqual(MAX_HOURS);
  });

  it('does not calibrate a meal with nothing to predict', () => {
    const history: SatietyOutcome[] = Array.from({ length: 6 }, () => ({
      predictedHours: 3,
      actualHours: 4,
    }));
    const result = personalSatiety({ calories: 0, protein_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }, history);
    expect(result.hours).toBe(0);
    expect(result.calibrated).toBe(false);
  });
});

describe('describeSatiety', () => {
  it('reads as a sentence with a reason', () => {
    const line = describeSatiety({ hours: 4, driver: 'protein' });
    expect(line).toBe('Should hold you about 4 hours — the protein in it.');
  });

  it('uses halves rather than decimals', () => {
    expect(describeSatiety({ hours: 3.4, driver: 'none' })).toBe('Should hold you about 3½ hours.');
  });

  it('says nothing about a meal it cannot judge', () => {
    expect(describeSatiety({ hours: 0, driver: 'none' })).toBe('');
  });

  it('gets the singular right', () => {
    expect(describeSatiety({ hours: 1, driver: 'none' })).toContain('1 hour.');
  });
});

describe('describeOutcome', () => {
  it('calls a near miss a hit', () => {
    expect(describeOutcome({ predictedHours: 4, actualHours: 4.5 })).toContain('about as long');
  });

  it('says when a meal held longer', () => {
    expect(describeOutcome({ predictedHours: 3, actualHours: 5 })).toBe(
      'That held you 2h longer than expected.',
    );
  });

  it('says when it did not', () => {
    expect(describeOutcome({ predictedHours: 5, actualHours: 3 })).toBe(
      'You were hungry 2h sooner than expected.',
    );
  });

  it('says nothing without both numbers', () => {
    expect(describeOutcome({ predictedHours: 0, actualHours: 4 })).toBe('');
    expect(describeOutcome({ predictedHours: 4, actualHours: 0 })).toBe('');
  });
});

describe('satietyOutcomesFromLogs', () => {
  const at = (hour: number, over: Partial<SatietyLog> = {}): SatietyLog => ({
    logged_at: `2026-09-22T${String(hour).padStart(2, '0')}:00:00.000Z`,
    calories: 600,
    protein_g: 25,
    fat_g: 20,
    fiber_g: 6,
    sugar_g: 8,
    ...over,
  });

  it('pairs each meal with the next one', () => {
    const outcomes = satietyOutcomesFromLogs([at(8), at(12), at(16)]);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]!.actualHours).toBe(4);
    expect(outcomes[1]!.actualHours).toBe(4);
  });

  it('does not care what order they arrive in', () => {
    const forwards = satietyOutcomesFromLogs([at(8), at(12), at(16)]);
    const backwards = satietyOutcomesFromLogs([at(16), at(8), at(12)]);
    expect(backwards).toEqual(forwards);
  });

  it('drops the overnight gap rather than learning from it', () => {
    // 20:00 to 08:00 the next day is sleep, not satiety.
    const outcomes = satietyOutcomesFromLogs([
      at(20),
      { ...at(8), logged_at: '2026-09-23T08:00:00.000Z' },
    ]);
    expect(outcomes).toHaveLength(0);
  });

  it('keeps a long but plausible gap', () => {
    const outcomes = satietyOutcomesFromLogs([at(8), at(14)]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.actualHours).toBe(6);
  });

  it('drops a gap right on the limit', () => {
    expect(satietyOutcomesFromLogs([at(8), at(17)])).toHaveLength(0);
    expect(satietyOutcomesFromLogs([at(8), at(16)])).toHaveLength(1);
  });

  it('has nothing to say about a single meal', () => {
    expect(satietyOutcomesFromLogs([at(8)])).toEqual([]);
    expect(satietyOutcomesFromLogs([])).toEqual([]);
  });

  it('skips meals it cannot predict', () => {
    const outcomes = satietyOutcomesFromLogs([at(8, { calories: 0 }), at(11), at(14)]);
    // The zero-calorie meal produces no prediction, so only one pair survives.
    expect(outcomes).toHaveLength(1);
  });

  it('survives an unparseable timestamp', () => {
    const outcomes = satietyOutcomesFromLogs([
      { ...at(8), logged_at: 'not a date' },
      at(12),
      at(15),
    ]);
    expect(outcomes.every((o) => Number.isFinite(o.actualHours))).toBe(true);
  });

  it('treats a null fibre or sugar as zero rather than breaking', () => {
    const outcomes = satietyOutcomesFromLogs([
      at(8, { fiber_g: null, sugar_g: null }),
      at(12),
    ]);
    expect(outcomes).toHaveLength(1);
    expect(Number.isFinite(outcomes[0]!.predictedHours)).toBe(true);
  });
});
