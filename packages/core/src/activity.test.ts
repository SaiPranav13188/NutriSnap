import { describe, expect, it } from 'vitest';
import {
  EXERCISE_KINDS,
  GLASS_ML,
  MAX_SESSION_BURN_KCAL,
  MAX_WATER_ML,
  MIN_WATER_ML,
  estimateCaloriesBurned,
  flOzToMl,
  formatWater,
  metFor,
  mlToFlOz,
  waterTarget,
} from './activity.js';

describe('waterTarget', () => {
  it('scales with body weight', () => {
    expect(waterTarget(64)).toBe(2250); // 64 * 35 = 2240, rounded to the nearest 50
    expect(waterTarget(90)).toBe(3150);
  });

  it('never drops below the floor for a very light person', () => {
    expect(waterTarget(30)).toBe(MIN_WATER_ML);
  });

  it('never exceeds the ceiling for a very heavy one', () => {
    expect(waterTarget(200)).toBe(MAX_WATER_ML);
  });

  it('falls back to two litres with no weight on file', () => {
    expect(waterTarget(null)).toBe(2000);
    expect(waterTarget(0)).toBe(2000);
  });

  it('lands on a round number, so the goal does not read as 2243 ml', () => {
    for (const kg of [45, 52, 61, 73, 88, 104]) {
      expect(waterTarget(kg) % 50).toBe(0);
    }
  });
});

describe('water units', () => {
  it('round-trips millilitres through fluid ounces', () => {
    expect(flOzToMl(mlToFlOz(1000))).toBeCloseTo(1000, 6);
  });

  it('shows litres once past a litre, millilitres below', () => {
    expect(formatWater(1800, 'metric')).toBe('1.8 L');
    expect(formatWater(750, 'metric')).toBe('750 ml');
  });

  it('shows fluid ounces in imperial', () => {
    expect(formatWater(1000, 'imperial')).toBe('34 fl oz');
  });

  it('uses a sane glass size', () => {
    expect(GLASS_ML).toBe(250);
    expect(formatWater(GLASS_ML * 8, 'metric')).toBe('2.0 L');
  });
});

describe('metFor', () => {
  it('rises with intensity within a kind', () => {
    expect(metFor('run', 'light')).toBeLessThan(metFor('run', 'moderate'));
    expect(metFor('run', 'moderate')).toBeLessThan(metFor('run', 'vigorous'));
  });

  it('ranks running above walking at the same intensity', () => {
    expect(metFor('run', 'moderate')).toBeGreaterThan(metFor('walk', 'moderate'));
  });

  it('has a value for every kind the picker offers', () => {
    for (const kind of EXERCISE_KINDS) {
      for (const intensity of ['light', 'moderate', 'vigorous'] as const) {
        expect(metFor(kind.value, intensity)).toBeGreaterThan(0);
      }
    }
  });
});

describe('estimateCaloriesBurned', () => {
  it('applies kcal = MET x kg x hours', () => {
    // 9.8 MET x 64 kg x 0.5 h = 313.6
    expect(
      estimateCaloriesBurned({
        kind: 'run',
        intensity: 'moderate',
        durationMin: 30,
        weightKg: 64,
      }),
    ).toBe(314);
  });

  it('scales linearly with duration', () => {
    const half = estimateCaloriesBurned({
      kind: 'cycle',
      intensity: 'moderate',
      durationMin: 30,
      weightKg: 70,
    });
    const full = estimateCaloriesBurned({
      kind: 'cycle',
      intensity: 'moderate',
      durationMin: 60,
      weightKg: 70,
    });
    expect(full).toBeCloseTo(half * 2, 0);
  });

  it('scales with body weight', () => {
    const light = estimateCaloriesBurned({
      kind: 'walk',
      intensity: 'moderate',
      durationMin: 60,
      weightKg: 50,
    });
    const heavy = estimateCaloriesBurned({
      kind: 'walk',
      intensity: 'moderate',
      durationMin: 60,
      weightKg: 100,
    });
    expect(heavy).toBeCloseTo(light * 2, 0);
  });

  it('assumes a mid-range adult rather than refusing with no weight on file', () => {
    const guess = estimateCaloriesBurned({
      kind: 'run',
      intensity: 'moderate',
      durationMin: 30,
      weightKg: null,
    });
    expect(guess).toBeGreaterThan(0);
    // 9.8 x 70 x 0.5
    expect(guess).toBe(343);
  });

  it('returns zero for a zero or negative duration', () => {
    expect(
      estimateCaloriesBurned({ kind: 'run', intensity: 'moderate', durationMin: 0, weightKg: 70 }),
    ).toBe(0);
    expect(
      estimateCaloriesBurned({ kind: 'run', intensity: 'moderate', durationMin: -5, weightKg: 70 }),
    ).toBe(0);
  });

  it('stays within the range the database will accept', () => {
    const extreme = estimateCaloriesBurned({
      kind: 'run',
      intensity: 'vigorous',
      durationMin: 1440,
      weightKg: 400,
    });
    // The column caps at 20000; a full day of hard running by a 400 kg person
    // is the worst case the form can produce.
    expect(extreme).toBe(MAX_SESSION_BURN_KCAL);
  });
});
