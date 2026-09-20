import { describe, expect, it } from 'vitest';
import {
  calculateAge,
  calculateBMR,
  calculateMacros,
  calculateTargets,
  calculateTargetsFromProfile,
  dailyDeltaForRate,
  projectGoalDate,
  proteinPerKg,
  calculateTDEE,
} from './calories.js';
import { CALORIE_FLOOR, KCAL_PER_G } from './constants.js';

describe('calculateBMR (Mifflin-St Jeor)', () => {
  // Reference: 30yo male, 80 kg, 180 cm
  //   10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
  it('matches the published male reference value', () => {
    expect(calculateBMR({ gender: 'male', weightKg: 80, heightCm: 180, age: 30 })).toBe(1780);
  });

  // Reference: 30yo female, 65 kg, 165 cm
  //   10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161 = 1370.25
  it('matches the published female reference value', () => {
    expect(calculateBMR({ gender: 'female', weightKg: 65, heightCm: 165, age: 30 })).toBeCloseTo(
      1370.25,
      2,
    );
  });

  it("places 'other' exactly midway between the male and female constants", () => {
    const args = { weightKg: 70, heightCm: 172, age: 28 } as const;
    const male = calculateBMR({ ...args, gender: 'male' });
    const female = calculateBMR({ ...args, gender: 'female' });
    const other = calculateBMR({ ...args, gender: 'other' });
    expect(other).toBeCloseTo((male + female) / 2, 6);
  });

  it('decreases by exactly 5 kcal per year of age', () => {
    const a = calculateBMR({ gender: 'male', weightKg: 80, heightCm: 180, age: 30 });
    const b = calculateBMR({ gender: 'male', weightKg: 80, heightCm: 180, age: 31 });
    expect(a - b).toBe(5);
  });
});

describe('calculateTDEE', () => {
  it.each([
    ['sedentary', 1.2, 2136],
    ['light', 1.375, 2447.5],
    ['moderate', 1.55, 2759],
    ['very_active', 1.725, 3070.5],
    ['extreme', 1.9, 3382],
  ] as const)('applies the %s multiplier (×%s)', (level, _mult, expected) => {
    expect(calculateTDEE(1780, level)).toBeCloseTo(expected, 4);
  });
});

describe('dailyDeltaForRate', () => {
  // 0.5 kg/week × 7700 kcal/kg ÷ 7 days = 550 kcal/day
  it('converts 0.5 kg/week into a 550 kcal/day deficit', () => {
    expect(dailyDeltaForRate('lose', 0.5)).toBeCloseTo(-550, 6);
  });

  it('converts 0.5 kg/week into a 550 kcal/day surplus when gaining', () => {
    expect(dailyDeltaForRate('gain', 0.5)).toBeCloseTo(550, 6);
  });

  it('is zero for maintain regardless of rate', () => {
    expect(dailyDeltaForRate('maintain', 1)).toBe(0);
  });
});

describe('calculateTargets', () => {
  const base = {
    gender: 'male',
    heightCm: 180,
    weightKg: 80,
    age: 30,
    activityLevel: 'moderate',
  } as const;

  it('computes a cutting target end to end', () => {
    // BMR 1780 → TDEE 1780 × 1.55 = 2759 → −550 = 2209 → rounded to 2210
    const t = calculateTargets({ ...base, goal: 'lose', rateKgPerWeek: 0.5 });
    expect(t.bmr).toBe(1780);
    expect(t.tdee).toBeCloseTo(2759, 1);
    expect(t.calories).toBe(2210);
    expect(t.floorApplied).toBe(false);
  });

  it('returns the TDEE unchanged when maintaining', () => {
    const t = calculateTargets({ ...base, goal: 'maintain', rateKgPerWeek: 0.5 });
    expect(t.calories).toBe(2760); // 2759 rounded to the nearest 10
  });

  it('adds a surplus when gaining', () => {
    const t = calculateTargets({ ...base, goal: 'gain', rateKgPerWeek: 0.25 });
    expect(t.calories).toBe(3030); // 2759 + 275 = 3034 → 3030
  });

  it('accepts a date of birth instead of an age', () => {
    const byAge = calculateTargets({ ...base, goal: 'maintain' });
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 30);
    const byDob = calculateTargets({
      gender: 'male',
      heightCm: 180,
      weightKg: 80,
      dateOfBirth: dob.toISOString(),
      activityLevel: 'moderate',
      goal: 'maintain',
    });
    expect(byDob.calories).toBe(byAge.calories);
  });

  describe('safety floor', () => {
    it('never drops a female user below 1200 kcal', () => {
      // Small, sedentary, aggressive deficit — the raw number lands under the floor.
      const t = calculateTargets({
        gender: 'female',
        heightCm: 152,
        weightKg: 48,
        age: 55,
        activityLevel: 'sedentary',
        goal: 'lose',
        rateKgPerWeek: 1.0,
      });
      expect(t.floorApplied).toBe(true);
      expect(t.calories).toBe(CALORIE_FLOOR.female);
    });

    it('never drops a male user below 1500 kcal', () => {
      const t = calculateTargets({
        gender: 'male',
        heightCm: 165,
        weightKg: 58,
        age: 60,
        activityLevel: 'sedentary',
        goal: 'lose',
        rateKgPerWeek: 1.0,
      });
      expect(t.floorApplied).toBe(true);
      expect(t.calories).toBe(CALORIE_FLOOR.male);
    });
  });

  it('rejects impossible inputs rather than returning a nonsense number', () => {
    expect(() => calculateTargets({ ...base, goal: 'lose', weightKg: 0 })).toThrow(/weightKg/);
    expect(() => calculateTargets({ ...base, goal: 'lose', heightCm: 0 })).toThrow(/heightCm/);
    expect(() =>
      calculateTargets({
        gender: 'male',
        heightCm: 180,
        weightKg: 80,
        activityLevel: 'moderate',
        goal: 'lose',
      }),
    ).toThrow(/age.*dateOfBirth/);
  });
});

describe('calculateMacros', () => {
  it('anchors protein to bodyweight and fat to 27.5% of calories', () => {
    const m = calculateMacros({ calories: 2000, weightKg: 80, goal: 'lose' });
    expect(m.protein_g).toBe(160); // 80 kg × 2.0 g/kg
    expect(m.fat_g).toBe(61); // 0.275 × 2000 ÷ 9 = 61.1
  });

  it('makes the three macros add back up to the calorie target', () => {
    const calories = 2210;
    const m = calculateMacros({ calories, weightKg: 80, goal: 'lose' });
    const fromMacros =
      m.protein_g * KCAL_PER_G.protein + m.carbs_g * KCAL_PER_G.carbs + m.fat_g * KCAL_PER_G.fat;
    // Rounding each macro to whole grams costs a few kcal; anything under 15 is fine.
    expect(Math.abs(fromMacros - calories)).toBeLessThan(15);
  });

  it('floors carbs at zero instead of going negative on an extreme target', () => {
    const m = calculateMacros({ calories: 800, weightKg: 120, goal: 'lose' });
    expect(m.carbs_g).toBe(0);
  });
});

describe('proteinPerKg', () => {
  it('gives a cut the highest non-training multiplier', () => {
    expect(proteinPerKg('lose')).toBe(2.0);
    expect(proteinPerKg('maintain')).toBe(1.6);
  });

  it('raises protein for a bulking user who actually lifts', () => {
    expect(proteinPerKg('gain', 'none')).toBe(1.8);
    expect(proteinPerKg('gain', 'strength')).toBe(2.2);
    expect(proteinPerKg('gain', 'athlete')).toBe(2.2);
  });

  it('does not raise protein for training when cutting', () => {
    expect(proteinPerKg('lose', 'strength')).toBe(2.0);
  });
});

describe('calculateAge', () => {
  it('counts whole years only', () => {
    expect(calculateAge('1994-06-15', new Date('2024-06-14'))).toBe(29);
    expect(calculateAge('1994-06-15', new Date('2024-06-15'))).toBe(30);
  });

  it('throws on an unparseable date', () => {
    expect(() => calculateAge('not-a-date')).toThrow(/invalid date of birth/);
  });
});

describe('calculateTargetsFromProfile', () => {
  const profile = {
    gender: 'female',
    height_cm: 165,
    current_weight_kg: 65,
    date_of_birth: '1994-01-01',
    activity_level: 'light',
    goal: 'lose',
    rate_kg_per_week: 0.5,
    training_focus: null,
  } as const;

  it('computes targets from a profile row', () => {
    const t = calculateTargetsFromProfile(profile, new Date('2024-01-01'));
    expect(t).not.toBeNull();
    expect(t!.calories).toBeGreaterThan(1200);
  });

  it('returns null when the profile is incomplete', () => {
    expect(
      calculateTargetsFromProfile({ ...profile, height_cm: null }, new Date('2024-01-01')),
    ).toBeNull();
  });
});

describe('projectGoalDate', () => {
  it('projects a loss goal the right number of weeks out', () => {
    const from = new Date('2024-01-01T00:00:00Z');
    const date = projectGoalDate({
      currentWeightKg: 80,
      goalWeightKg: 75,
      rateKgPerWeek: 0.5,
      from,
    });
    // 5 kg ÷ 0.5 kg/week = 10 weeks = 70 days
    expect(date).not.toBeNull();
    expect(Math.round((date!.getTime() - from.getTime()) / 86_400_000)).toBe(70);
  });

  it('returns null when there is nothing to project', () => {
    expect(
      projectGoalDate({ currentWeightKg: 80, goalWeightKg: 80, rateKgPerWeek: 0.5 }),
    ).toBeNull();
    expect(projectGoalDate({ currentWeightKg: 80, goalWeightKg: 75, rateKgPerWeek: 0 })).toBeNull();
  });
});
