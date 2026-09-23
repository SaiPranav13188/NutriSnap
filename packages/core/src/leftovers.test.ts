import { describe, expect, it } from 'vitest';
import {
  LEFTOVER_NOISE_FLOOR,
  applyLeftovers,
  describeEaten,
  isCorrectionMeaningful,
} from './leftovers.js';
import type { Ingredient, MacroTotals } from './types.js';

const totals = (over: Partial<MacroTotals> = {}): MacroTotals => ({
  calories: 800,
  protein_g: 40,
  carbs_g: 90,
  fat_g: 28,
  sugar_g: 12,
  fiber_g: 9,
  sodium_mg: 900,
  ...over,
});

const MEAL: Ingredient[] = [
  { name: 'Chicken breast', grams: 150, calories: 250 },
  { name: 'Basmati rice', grams: 200, calories: 400 },
  { name: 'Green salad', grams: 100, calories: 150 },
];

describe('applyLeftovers', () => {
  it('leaves a finished plate alone', () => {
    const result = applyLeftovers({ ingredients: MEAL, totals: totals(), leftovers: [] });

    expect(result.eatenFraction).toBe(1);
    expect(result.totals.calories).toBe(800);
    expect(result.ingredients[1]!.grams).toBe(200);
  });

  it('scales an ingredient by what is left of it', () => {
    const result = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: 'Basmati rice', remaining: 0.5 }],
    });

    // Half the rice left: 200 kcal of 800 uneaten.
    expect(result.ingredients[1]!.calories).toBe(200);
    expect(result.ingredients[1]!.grams).toBe(100);
    expect(result.eatenFraction).toBeCloseTo(600 / 800, 6);
    expect(result.totals.calories).toBeCloseTo(600, 6);
  });

  it('weights the correction by calories, not by ingredient count', () => {
    // Leaving the whole salad (150 kcal) is a smaller correction than
    // leaving the whole rice (400 kcal), though each is one of three items.
    const salad = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: 'Green salad', remaining: 1 }],
    });
    const rice = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: 'Basmati rice', remaining: 1 }],
    });

    expect(salad.eatenFraction).toBeCloseTo(650 / 800, 6);
    expect(rice.eatenFraction).toBeCloseTo(400 / 800, 6);
    expect(rice.eatenFraction).toBeLessThan(salad.eatenFraction);
  });

  it('scales every macro with the calories eaten', () => {
    const result = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: 'Basmati rice', remaining: 1 }],
    });

    expect(result.eatenFraction).toBeCloseTo(0.5, 6);
    expect(result.totals.protein_g).toBeCloseTo(20, 6);
    expect(result.totals.fiber_g).toBeCloseTo(4.5, 6);
    expect(result.totals.sodium_mg).toBeCloseTo(450, 6);
  });

  it('matches names regardless of case and spacing', () => {
    const result = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: '  basmati   RICE ', remaining: 1 }],
    });
    expect(result.ingredients[1]!.calories).toBe(0);
  });

  it('assumes anything unmentioned was eaten', () => {
    // A report of what remains will not mention an empty space.
    const result = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: 'Chicken breast', remaining: 0.2 }],
    });

    expect(result.ingredients[1]!.calories).toBe(400);
    expect(result.ingredients[2]!.calories).toBe(150);
  });

  it('ignores an ingredient the meal does not contain', () => {
    const result = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: 'Naan bread', remaining: 1 }],
    });
    expect(result.eatenFraction).toBe(1);
  });

  it('clamps a fraction outside nought to one', () => {
    const over = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: 'Basmati rice', remaining: 4 }],
    });
    const under = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: 'Basmati rice', remaining: -2 }],
    });

    expect(over.ingredients[1]!.calories).toBe(0);
    expect(under.ingredients[1]!.calories).toBe(400);
  });

  it('survives a nonsense fraction', () => {
    const result = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: [{ name: 'Basmati rice', remaining: Number.NaN }],
    });
    expect(Number.isFinite(result.eatenFraction)).toBe(true);
    expect(result.eatenFraction).toBe(1);
  });

  it('falls back to one fraction when nothing is itemised', () => {
    const result = applyLeftovers({
      ingredients: [],
      totals: totals(),
      leftovers: [],
      overallRemaining: 0.25,
    });

    expect(result.eatenFraction).toBe(0.75);
    expect(result.totals.calories).toBe(600);
    expect(result.ingredients).toEqual([]);
  });

  it('treats an unitemised meal with no report as finished', () => {
    const result = applyLeftovers({ ingredients: [], totals: totals(), leftovers: [] });
    expect(result.eatenFraction).toBe(1);
    expect(result.totals.calories).toBe(800);
  });

  it('does not wipe out a meal whose ingredients carry no calories', () => {
    const free: Ingredient[] = [
      { name: 'A', grams: 100, calories: 0 },
      { name: 'B', grams: 100, calories: 0 },
    ];
    const result = applyLeftovers({
      ingredients: free,
      totals: totals(),
      leftovers: [{ name: 'A', remaining: 1 }],
    });

    // Half the items left, so half the meal — not a division by zero.
    expect(result.eatenFraction).toBeCloseTo(0.5, 6);
    expect(Number.isFinite(result.totals.calories)).toBe(true);
  });

  it('handles a plate that was not touched at all', () => {
    const result = applyLeftovers({
      ingredients: MEAL,
      totals: totals(),
      leftovers: MEAL.map((item) => ({ name: item.name, remaining: 1 })),
    });

    expect(result.eatenFraction).toBe(0);
    expect(result.totals.calories).toBe(0);
    expect(result.totals.protein_g).toBe(0);
  });
});

describe('isCorrectionMeaningful', () => {
  it('ignores the couple of percent two photos always differ by', () => {
    expect(isCorrectionMeaningful(1)).toBe(false);
    expect(isCorrectionMeaningful(0.97)).toBe(false);
    expect(isCorrectionMeaningful(1 - LEFTOVER_NOISE_FLOOR)).toBe(false);
  });

  it('accepts a real leftover', () => {
    expect(isCorrectionMeaningful(0.9)).toBe(true);
    expect(isCorrectionMeaningful(0.5)).toBe(true);
    expect(isCorrectionMeaningful(0)).toBe(true);
  });
});

describe('describeEaten', () => {
  it('reads as a person would say it', () => {
    expect(describeEaten(1)).toBe('Finished the lot');
    expect(describeEaten(0.5)).toBe('About half eaten');
    expect(describeEaten(0.75)).toBe('About three quarters eaten');
    expect(describeEaten(0.25)).toBe('About a quarter eaten');
    expect(describeEaten(0)).toBe('None of it eaten');
  });

  it('gives a percentage when no phrase fits', () => {
    expect(describeEaten(0.37)).toBe('About 37% eaten');
  });

  it('does not report a fraction outside the range', () => {
    expect(describeEaten(1.4)).toBe('Finished the lot');
    expect(describeEaten(-1)).toBe('None of it eaten');
  });
});
