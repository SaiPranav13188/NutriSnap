import { describe, expect, it } from 'vitest';
import { healthScore, microTargets } from './health.js';
import type { DailyTarget, MacroTotals } from './types.js';

const targets: DailyTarget = {
  id: 't1',
  user_id: 'u1',
  calories: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 67,
  bmr: 1600,
  tdee: 2200,
  source: 'formula',
  effective_date: '2026-09-21',
  created_at: '2026-09-21T00:00:00Z',
};

/** A day that hits every target exactly. */
function perfectDay(): MacroTotals {
  const micro = microTargets(targets.calories);
  return {
    calories: targets.calories,
    protein_g: targets.protein_g,
    carbs_g: targets.carbs_g,
    fat_g: targets.fat_g,
    fiber_g: micro.fiber_g,
    sugar_g: micro.sugar_g,
    sodium_mg: micro.sodium_mg,
  };
}

describe('microTargets', () => {
  it('scales fibre with calories at 14g per 1000 kcal', () => {
    expect(microTargets(2000).fiber_g).toBe(28);
    expect(microTargets(3050).fiber_g).toBe(43);
  });

  it('caps sugar at a tenth of energy', () => {
    // 2000 kcal -> 200 kcal of sugar -> 50g at 4 kcal/g.
    expect(microTargets(2000).sugar_g).toBe(50);
  });

  it('holds sodium flat, since the limit does not scale with intake', () => {
    expect(microTargets(1200).sodium_mg).toBe(2300);
    expect(microTargets(4000).sodium_mg).toBe(2300);
  });

  it('survives a missing or nonsensical calorie goal', () => {
    expect(microTargets(0)).toEqual({ fiber_g: 0, sugar_g: 0, sodium_mg: 2300 });
    expect(microTargets(-500).fiber_g).toBe(0);
    expect(microTargets(Number.NaN).fiber_g).toBe(0);
  });
});

describe('healthScore', () => {
  it('gives a perfect day full marks', () => {
    const result = healthScore(perfectDay(), targets);
    expect(result.score).toBe(10);
    expect(result.summary).toMatch(/on track/);
  });

  it('scores an empty day zero rather than rewarding the untouched limits', () => {
    // Sugar and sodium are limits, so nothing eaten satisfies both perfectly.
    // Taken at face value that would score well, which would tell the user
    // the best thing to do is skip meals.
    const empty: MacroTotals = {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
    };
    const result = healthScore(empty, targets);
    expect(result.score).toBe(0);
    expect(result.summary).toBe('Nothing logged yet today.');
  });

  it('treats a 10% band either side of a target as on track', () => {
    const day = { ...perfectDay(), protein_g: targets.protein_g * 1.08 };
    const protein = healthScore(day, targets).components.find((c) => c.key === 'protein');
    expect(protein?.status).toBe('on_track');
  });

  it('marks a nutrient low when well under target', () => {
    const day = { ...perfectDay(), protein_g: targets.protein_g * 0.4 };
    const result = healthScore(day, targets);
    expect(result.components.find((c) => c.key === 'protein')?.status).toBe('low');
    expect(result.summary).toMatch(/low on protein/);
    expect(result.score).toBeLessThan(10);
  });

  it('marks a nutrient high when well over target', () => {
    const day = { ...perfectDay(), calories: targets.calories * 1.6 };
    const result = healthScore(day, targets);
    expect(result.components.find((c) => c.key === 'calories')?.status).toBe('high');
    expect(result.summary).toMatch(/over on calories/);
  });

  it('never calls a limit nutrient low, however little is eaten', () => {
    const day = { ...perfectDay(), sugar_g: 0, sodium_mg: 0 };
    const result = healthScore(day, targets);
    expect(result.components.find((c) => c.key === 'sugar')?.status).toBe('on_track');
    expect(result.components.find((c) => c.key === 'sodium')?.status).toBe('on_track');
    expect(result.score).toBe(10);
  });

  it('penalises going over a limit', () => {
    const day = { ...perfectDay(), sodium_mg: 4600 };
    const result = healthScore(day, targets);
    expect(result.components.find((c) => c.key === 'sodium')?.status).toBe('high');
    expect(result.score).toBeLessThan(10);
  });

  it('weights calories and protein above the rest', () => {
    const missProtein = healthScore({ ...perfectDay(), protein_g: 0 }, targets);
    const missFat = healthScore({ ...perfectDay(), fat_g: 0 }, targets);
    expect(missProtein.score).toBeLessThan(missFat.score);
  });

  it('keeps the score inside 0..10 for absurd input', () => {
    const wild = { ...perfectDay(), calories: 99999, sodium_mg: 999999 };
    const result = healthScore(wild, targets);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('reads as a sentence, listing on-track and off-track nutrients', () => {
    const day = { ...perfectDay(), calories: targets.calories * 0.3, protein_g: 0 };
    const summary = healthScore(day, targets).summary;
    expect(summary).toMatch(/^[A-Z]/);
    expect(summary.endsWith('.')).toBe(true);
    expect(summary).toMatch(/[Cc]arbs/);
    expect(summary).toMatch(/You're low on/);
  });

  it('says so plainly when there is no plan yet', () => {
    const result = healthScore(perfectDay(), null);
    expect(result.score).toBe(0);
    expect(result.components).toEqual([]);
    expect(result.summary).toBe('Finish your plan to see a score.');
  });
});
