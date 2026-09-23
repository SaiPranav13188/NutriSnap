import { describe, expect, it } from 'vitest';
import {
  CUISINES,
  CUISINES_PER_REQUEST,
  FOOD_ILLUSTRATIONS,
  cuisinesForDay,
  MEAL_SHARE,
  MEAL_SLOTS,
  MIN_MEAL_KCAL,
  describeBudget,
  mealCalorieBudget,
  nutrientLeaders,
  reconcileSuggestion,
  safeIllustration,
  totalsFromItems,
  type SuggestionItem,
} from './suggest.js';

describe('mealCalorieBudget', () => {
  const target = 2000;

  it('keeps a meal inside its usual share of the day', () => {
    // Nothing logged yet: breakfast must not be offered all 2000.
    const budget = mealCalorieBudget({ slot: 'breakfast', remainingKcal: 2000, targetKcal: target });
    expect(budget.max).toBeLessThan(700);
    expect(budget.max).toBe(Math.round(MEAL_SHARE.breakfast * target * 1.25));
  });

  it('gives dinner more room than breakfast on the same day', () => {
    const breakfast = mealCalorieBudget({
      slot: 'breakfast',
      remainingKcal: 2000,
      targetKcal: target,
    });
    const dinner = mealCalorieBudget({ slot: 'dinner', remainingKcal: 2000, targetKcal: target });
    expect(dinner.max).toBeGreaterThan(breakfast.max);
  });

  it('never suggests more than is actually left', () => {
    const budget = mealCalorieBudget({ slot: 'dinner', remainingKcal: 300, targetKcal: target });
    expect(budget.max).toBeLessThanOrEqual(300);
  });

  it('says so when the day is spent', () => {
    const budget = mealCalorieBudget({ slot: 'dinner', remainingKcal: 40, targetKcal: target });
    expect(budget.overspent).toBe(true);
    expect(budget.max).toBe(40);
  });

  it('treats an overspent day as spent rather than going negative', () => {
    const budget = mealCalorieBudget({ slot: 'lunch', remainingKcal: -500, targetKcal: target });
    expect(budget.overspent).toBe(true);
    expect(budget.min).toBe(0);
    expect(budget.max).toBe(0);
  });

  it('always leaves a range worth cooking for', () => {
    const budget = mealCalorieBudget({ slot: 'lunch', remainingKcal: 900, targetKcal: target });
    expect(budget.min).toBeGreaterThanOrEqual(MIN_MEAL_KCAL);
    expect(budget.max).toBeGreaterThanOrEqual(budget.min);
  });

  it('does not divide by a missing target', () => {
    const budget = mealCalorieBudget({ slot: 'lunch', remainingKcal: 600, targetKcal: 0 });
    expect(Number.isFinite(budget.min)).toBe(true);
    expect(Number.isFinite(budget.max)).toBe(true);
  });
});

describe('safeIllustration', () => {
  it('passes the ones that exist through', () => {
    for (const name of FOOD_ILLUSTRATIONS) {
      expect(safeIllustration(name)).toBe(name);
    }
  });

  it('falls back rather than rendering nothing', () => {
    expect(safeIllustration('sushi')).toBe('bowl');
    expect(safeIllustration('')).toBe('bowl');
  });
});

describe('describeBudget', () => {
  it('reads as a range', () => {
    expect(describeBudget({ min: 420, max: 530, overspent: false })).toBe('420–530 kcal');
  });

  it('says what is wrong rather than showing zero to zero', () => {
    expect(describeBudget({ min: 0, max: 0, overspent: true })).toContain('Nothing left');
  });
});

describe('MEAL_SLOTS', () => {
  it('covers the three meals and nothing else', () => {
    expect(MEAL_SLOTS.map((slot) => slot.value)).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('has a share for every slot', () => {
    for (const slot of MEAL_SLOTS) {
      expect(MEAL_SHARE[slot.value]).toBeGreaterThan(0);
    }
  });
});

describe('nutrientLeaders', () => {
  const item = (over: Partial<SuggestionItem>): SuggestionItem => ({
    name: 'Thing',
    amount: '100 g',
    calories: 100,
    protein_g: 5,
    carbs_g: 10,
    fat_g: 3,
    fiber_g: 2,
    ...over,
  });

  it('names the item that supplies most of each nutrient', () => {
    const leaders = nutrientLeaders([
      item({ name: 'Paneer', protein_g: 20, fiber_g: 0, carbs_g: 3, fat_g: 18 }),
      item({ name: 'Roti', protein_g: 4, fiber_g: 2, carbs_g: 40, fat_g: 2 }),
      item({ name: 'Spinach', protein_g: 2, fiber_g: 6, carbs_g: 3, fat_g: 0 }),
    ]);

    expect(leaders.protein).toBe('Paneer');
    expect(leaders.carbs).toBe('Roti');
    expect(leaders.fiber).toBe('Spinach');
    expect(leaders.fat).toBe('Paneer');
  });

  it('says nothing when no single item carries the nutrient', () => {
    // Four items with a quarter each: none is "the" source.
    const even = [1, 2, 3, 4].map((n) => item({ name: `Item ${n}`, protein_g: 5 }));
    expect(nutrientLeaders(even).protein).toBeUndefined();
  });

  it('leaves out a nutrient nothing supplies', () => {
    const leaders = nutrientLeaders([item({ name: 'Oil', fiber_g: 0, protein_g: 0 })]);
    expect(leaders.fiber).toBeUndefined();
    expect(leaders.protein).toBeUndefined();
  });

  it('handles an empty meal', () => {
    expect(nutrientLeaders([])).toEqual({});
  });
});

describe('totalsFromItems', () => {
  it('adds the parts up', () => {
    const totals = totalsFromItems([
      {
        name: 'A',
        amount: '1',
        calories: 100,
        protein_g: 10,
        carbs_g: 5,
        fat_g: 2,
        fiber_g: 1,
      },
      {
        name: 'B',
        amount: '1',
        calories: 250,
        protein_g: 6,
        carbs_g: 30,
        fat_g: 8,
        fiber_g: 4,
      },
    ]);

    expect(totals).toEqual({
      calories: 350,
      protein_g: 16,
      carbs_g: 35,
      fat_g: 10,
      fiber_g: 5,
    });
  });

  it('is zero for a meal with no parts', () => {
    expect(totalsFromItems([])).toEqual({
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
    });
  });
});

describe('reconcileSuggestion', () => {
  const base = {
    name: 'Paneer Bhurji',
    note: 'Scrambled paneer',
    illustration: 'curry' as const,
    calories: 750,
    protein_g: 40,
    carbs_g: 60,
    fat_g: 40,
    fiber_g: 8,
    items: [
      { name: 'Paneer', amount: '180 g', calories: 320, protein_g: 25, carbs_g: 5, fat_g: 24, fiber_g: 0 },
      { name: 'Paratha', amount: '2', calories: 197, protein_g: 8, carbs_g: 34, fat_g: 6, fiber_g: 5 },
    ],
  };

  it('replaces drifting totals with the sum of the parts', () => {
    // Stated 750; the parts add to 517.
    const fixed = reconcileSuggestion(base);
    expect(fixed.calories).toBe(517);
    expect(fixed.protein_g).toBe(33);
    expect(fixed.fiber_g).toBe(5);
  });

  it('leaves everything else alone', () => {
    const fixed = reconcileSuggestion(base);
    expect(fixed.name).toBe(base.name);
    expect(fixed.illustration).toBe(base.illustration);
    expect(fixed.items).toBe(base.items);
  });

  it('keeps the stated totals when there is no breakdown', () => {
    const bare = { ...base, items: [] };
    expect(reconcileSuggestion(bare).calories).toBe(750);
  });

  it('is a no-op when the two already agree', () => {
    const agreed = { ...base, calories: 517, protein_g: 33, carbs_g: 39, fat_g: 30, fiber_g: 5 };
    const fixed = reconcileSuggestion(agreed);
    expect(fixed.calories).toBe(agreed.calories);
    expect(fixed.protein_g).toBe(agreed.protein_g);
  });
});

describe('cuisinesForDay', () => {
  it('is stable for the same day and meal', () => {
    expect(cuisinesForDay('2026-09-22', 'breakfast')).toEqual(
      cuisinesForDay('2026-09-22', 'breakfast'),
    );
  });

  it('gives different days different cuisines', () => {
    const monday = cuisinesForDay('2026-09-22', 'dinner');
    const tuesday = cuisinesForDay('2026-09-23', 'dinner');
    expect(monday).not.toEqual(tuesday);
  });

  it('gives the meals of one day different cuisines', () => {
    const breakfast = cuisinesForDay('2026-09-22', 'breakfast');
    const dinner = cuisinesForDay('2026-09-22', 'dinner');
    expect(breakfast).not.toEqual(dinner);
  });

  it('never repeats a cuisine within one request', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      for (const slot of ['breakfast', 'lunch', 'dinner'] as const) {
        const picked = cuisinesForDay(day, slot);
        expect(new Set(picked).size).toBe(picked.length);
      }
    }
  });

  it('returns as many as asked for', () => {
    expect(cuisinesForDay('2026-09-22', 'lunch', 3)).toHaveLength(3);
    expect(cuisinesForDay('2026-09-22', 'lunch')).toHaveLength(CUISINES_PER_REQUEST);
  });

  it('cannot ask for more than exist, or fewer than one', () => {
    expect(cuisinesForDay('2026-09-22', 'lunch', 99)).toHaveLength(CUISINES.length);
    expect(cuisinesForDay('2026-09-22', 'lunch', 0)).toHaveLength(1);
  });

  it('spreads across the list over a fortnight rather than circling a few', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 14; day += 1) {
      for (const c of cuisinesForDay(`2026-09-${String(day).padStart(2, '0')}`, 'dinner')) {
        seen.add(c);
      }
    }
    // Two weeks of dinners should have reached most of the list.
    expect(seen.size).toBeGreaterThanOrEqual(CUISINES.length - 2);
  });
});
