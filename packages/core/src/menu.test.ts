import { describe, expect, it } from 'vitest';
import { describeMenu, rankMenu, type MenuDish } from './menu.js';
import type { MealBudget } from './suggest.js';

const budget: MealBudget = { min: 400, max: 700, overspent: false };

const dish = (over: Partial<MenuDish> = {}): MenuDish => ({
  name: 'Grilled chicken salad',
  description: 'Chicken, leaves, vinaigrette',
  section: 'Mains',
  calories: 550,
  protein_g: 40,
  carbs_g: 20,
  fat_g: 28,
  fiber_g: 6,
  conflicts: [],
  confidence: 0.7,
  ...over,
});

describe('rankMenu', () => {
  it('puts a dish inside the budget above one over it', () => {
    const ranked = rankMenu(
      [dish({ name: 'Lasagne', calories: 1100 }), dish({ name: 'Salad', calories: 550 })],
      { budget, proteinLeftG: 60 },
    );

    expect(ranked[0]!.dish.name).toBe('Salad');
    expect(ranked[0]!.verdict).toBe('fits');
    expect(ranked[1]!.verdict).toBe('over');
  });

  it('breaks a tie between two fitting dishes on protein', () => {
    const ranked = rankMenu(
      [
        dish({ name: 'Pasta', calories: 550, protein_g: 12 }),
        dish({ name: 'Chicken', calories: 550, protein_g: 45 }),
      ],
      { budget, proteinLeftG: 60 },
    );

    expect(ranked[0]!.dish.name).toBe('Chicken');
  });

  it('ignores protein once none is owed, rather than rewarding it anyway', () => {
    const ranked = rankMenu(
      [
        dish({ name: 'Pasta', calories: 550, protein_g: 12 }),
        dish({ name: 'Chicken', calories: 550, protein_g: 45 }),
      ],
      { budget, proteinLeftG: 0 },
    );

    expect(ranked[0]!.score).toBeCloseTo(ranked[1]!.score);
  });

  it('penalises going over more steeply than coming in light', () => {
    const [light] = rankMenu([dish({ calories: 250, protein_g: 0 })], {
      budget,
      proteinLeftG: 0,
    });
    const [over] = rankMenu([dish({ calories: 850, protein_g: 0 })], {
      budget,
      proteinLeftG: 0,
    });

    // 150 under the floor versus 150 over the ceiling.
    expect(light!.score).toBeGreaterThan(over!.score);
  });

  it('ranks anything that breaks a rule last, however well it would have fitted', () => {
    const ranked = rankMenu(
      [
        dish({ name: 'Perfect but prawns', calories: 550, protein_g: 45, conflicts: ['shellfish'] }),
        dish({ name: 'Enormous pie', calories: 1400, protein_g: 10 }),
      ],
      { budget, proteinLeftG: 60 },
    );

    expect(ranked[0]!.dish.name).toBe('Enormous pie');
    expect(ranked[1]!.verdict).toBe('excluded');
  });

  it('keeps the excluded dish on the list and says why', () => {
    const [entry] = rankMenu([dish({ conflicts: ['shellfish', 'peanuts'] })], {
      budget,
      proteinLeftG: 60,
    });

    expect(entry!.reason).toContain('shellfish and peanuts');
  });

  it('ranks by least damage once the day is spent', () => {
    const spent: MealBudget = { min: 0, max: 40, overspent: true };
    const ranked = rankMenu(
      [dish({ name: 'Big', calories: 900 }), dish({ name: 'Small', calories: 300 })],
      { budget: spent, proteinLeftG: 20 },
    );

    expect(ranked[0]!.dish.name).toBe('Small');
    expect(ranked[0]!.verdict).toBe('over');
    expect(ranked[0]!.reason).toContain('already spent');
  });

  it('survives a menu nothing could be read from', () => {
    expect(rankMenu([], { budget, proteinLeftG: 60 })).toEqual([]);
  });
});

describe('describeMenu', () => {
  it('counts what fits', () => {
    const ranked = rankMenu(
      [dish({ calories: 550 }), dish({ calories: 560 }), dish({ calories: 1400 })],
      { budget, proteinLeftG: 60 },
    );

    expect(describeMenu(ranked)).toBe('Read 3 dishes. 2 fit what is left.');
  });

  it('says so when nothing fits', () => {
    const ranked = rankMenu([dish({ calories: 1400 })], { budget, proteinLeftG: 60 });
    expect(describeMenu(ranked)).toContain('None of them fit');
  });

  it('counts what is off the list separately', () => {
    const ranked = rankMenu(
      [dish({ calories: 550 }), dish({ calories: 550, conflicts: ['beef'] })],
      { budget, proteinLeftG: 60 },
    );

    expect(describeMenu(ranked)).toBe('Read 2 dishes. 1 fits what is left, and 1 is off your list.');
  });

  it('blames the photo when it read nothing', () => {
    expect(describeMenu([])).toContain('Nothing readable');
  });
});
