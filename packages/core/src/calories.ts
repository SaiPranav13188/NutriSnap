/**
 * The calculation engine. Plan section 2.
 *
 * This is the ONLY place calorie and macro math lives. apps/web, apps/mobile
 * and services/api all import from here so the numbers can never drift between
 * platforms. Every function is pure — no dates read from the ambient clock
 * unless you pass one in, no I/O — which is what makes it straightforward to
 * unit-test against published reference values.
 */

import {
  ACTIVITY_MULTIPLIERS,
  CALORIE_FLOOR,
  DEFAULT_RATE_KG_PER_WEEK,
  FAT_CALORIE_SHARE,
  KCAL_PER_G,
  KCAL_PER_KG_FAT,
  PROTEIN_G_PER_KG,
  PROTEIN_G_PER_KG_TRAINING,
} from './constants.js';
import type { ActivityLevel, Gender, Goal, Profile, TrainingFocus } from './types.js';

export interface TargetInput {
  gender: Gender;
  heightCm: number;
  weightKg: number;
  /** Supply either `age` directly or `dateOfBirth`; `age` wins if both are given. */
  age?: number;
  dateOfBirth?: string | Date;
  activityLevel: ActivityLevel;
  goal: Goal;
  /** kg per week of intended loss or gain. Ignored when goal is 'maintain'. */
  rateKgPerWeek?: number;
  trainingFocus?: TrainingFocus | null;
}

export interface TargetResult {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Intermediate values, surfaced so the UI can explain where the number came from. */
  bmr: number;
  tdee: number;
  /** True when the safety floor clamped the target above the raw goal-adjusted value. */
  floorApplied: boolean;
  /** The daily kcal delta the goal asked for, before the floor. Negative for a deficit. */
  goalDeltaKcal: number;
}

const round = (n: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Whole years between a date of birth and a reference date (defaults to now). */
export function calculateAge(dateOfBirth: string | Date, on: Date = new Date()): number {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    throw new Error(`calculateAge: invalid date of birth "${String(dateOfBirth)}"`);
  }
  let age = on.getFullYear() - dob.getFullYear();
  const monthDiff = on.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Basal Metabolic Rate — Mifflin-St Jeor.
 *   male:   10·kg + 6.25·cm − 5·age + 5
 *   female: 10·kg + 6.25·cm − 5·age − 161
 * `other` takes the midpoint of the two sex constants (−78), which keeps the
 * estimate unbiased rather than silently assigning a gender.
 */
export function calculateBMR(input: {
  gender: Gender;
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  const { gender, weightKg, heightCm, age } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const constant = gender === 'male' ? 5 : gender === 'female' ? -161 : -78;
  return base + constant;
}

/** Total Daily Energy Expenditure = BMR × activity multiplier. */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel];
}

/** Daily kcal delta implied by a weekly rate of weight change. */
export function dailyDeltaForRate(goal: Goal, rateKgPerWeek: number): number {
  if (goal === 'maintain') return 0;
  const magnitude = (Math.abs(rateKgPerWeek) * KCAL_PER_KG_FAT) / 7;
  return goal === 'lose' ? -magnitude : magnitude;
}

/** Grams of protein per kg of bodyweight for this goal and training status. */
export function proteinPerKg(goal: Goal, trainingFocus?: TrainingFocus | null): number {
  if (goal === 'gain' && trainingFocus) {
    const trained = PROTEIN_G_PER_KG_TRAINING[trainingFocus];
    if (trained !== undefined) return trained;
  }
  return PROTEIN_G_PER_KG[goal];
}

/**
 * Split a calorie budget into grams of protein / fat / carbs.
 * Protein is anchored to bodyweight, fat to a share of total calories, and
 * carbs take whatever calories are left over.
 */
export function calculateMacros(params: {
  calories: number;
  weightKg: number;
  goal: Goal;
  trainingFocus?: TrainingFocus | null;
}): { protein_g: number; carbs_g: number; fat_g: number } {
  const { calories, weightKg, goal, trainingFocus } = params;

  const protein_g = weightKg * proteinPerKg(goal, trainingFocus);
  const fat_g = (FAT_CALORIE_SHARE * calories) / KCAL_PER_G.fat;

  const remaining = calories - protein_g * KCAL_PER_G.protein - fat_g * KCAL_PER_G.fat;
  // At very low targets with a high protein anchor the remainder can go
  // negative; carbs floor at zero rather than reporting a nonsense number.
  const carbs_g = Math.max(0, remaining / KCAL_PER_G.carbs);

  return {
    protein_g: round(protein_g),
    carbs_g: round(carbs_g),
    fat_g: round(fat_g),
  };
}

/**
 * The headline function: profile in, daily targets out.
 * Calories are rounded to the nearest 10 (that is how the app displays them,
 * and rounding once here stops the UI and the database disagreeing).
 */
export function calculateTargets(input: TargetInput): TargetResult {
  const { gender, heightCm, weightKg, activityLevel, goal, trainingFocus } = input;

  if (!(heightCm > 0)) throw new Error('calculateTargets: heightCm must be greater than 0');
  if (!(weightKg > 0)) throw new Error('calculateTargets: weightKg must be greater than 0');

  const age =
    input.age ?? (input.dateOfBirth !== undefined ? calculateAge(input.dateOfBirth) : undefined);
  if (age === undefined) {
    throw new Error('calculateTargets: provide either `age` or `dateOfBirth`');
  }
  if (!(age > 0)) throw new Error('calculateTargets: age must be greater than 0');

  const rateKgPerWeek = input.rateKgPerWeek ?? DEFAULT_RATE_KG_PER_WEEK;

  const bmr = calculateBMR({ gender, weightKg, heightCm, age });
  const tdee = calculateTDEE(bmr, activityLevel);

  const goalDeltaKcal = dailyDeltaForRate(goal, rateKgPerWeek);
  const raw = tdee + goalDeltaKcal;

  const floor = CALORIE_FLOOR[gender];
  const floorApplied = raw < floor;
  const calories = round(Math.max(raw, floor) / 10) * 10;

  const macros = calculateMacros({ calories, weightKg, goal, trainingFocus });

  return {
    calories,
    ...macros,
    bmr: round(bmr, 1),
    tdee: round(tdee, 1),
    floorApplied,
    goalDeltaKcal: round(goalDeltaKcal, 1),
  };
}

/**
 * Convenience wrapper for calling the engine with a row straight out of the
 * `profiles` table. Returns null when the profile is not yet complete enough
 * to compute anything, so callers can render an onboarding prompt instead.
 */
export function calculateTargetsFromProfile(
  profile: Pick<
    Profile,
    | 'gender'
    | 'height_cm'
    | 'current_weight_kg'
    | 'date_of_birth'
    | 'activity_level'
    | 'goal'
    | 'rate_kg_per_week'
    | 'training_focus'
  >,
  now: Date = new Date(),
): TargetResult | null {
  const { gender, height_cm, current_weight_kg, date_of_birth, activity_level, goal } = profile;

  if (!gender || !height_cm || !current_weight_kg || !date_of_birth || !activity_level || !goal) {
    return null;
  }

  return calculateTargets({
    gender,
    heightCm: height_cm,
    weightKg: current_weight_kg,
    age: calculateAge(date_of_birth, now),
    activityLevel: activity_level,
    goal,
    rateKgPerWeek: profile.rate_kg_per_week ?? DEFAULT_RATE_KG_PER_WEEK,
    trainingFocus: profile.training_focus,
  });
}

/**
 * Estimated date the user reaches their goal weight at the chosen rate.
 * Used for the dotted projection line on the Progress chart (plan 10.6).
 * Returns null when the goal is maintain, already met, or pointing the wrong way.
 */
export function projectGoalDate(params: {
  currentWeightKg: number;
  goalWeightKg: number;
  rateKgPerWeek: number;
  from?: Date;
}): Date | null {
  const { currentWeightKg, goalWeightKg, rateKgPerWeek, from = new Date() } = params;
  const delta = goalWeightKg - currentWeightKg;
  if (delta === 0 || rateKgPerWeek <= 0) return null;

  const weeks = Math.abs(delta) / rateKgPerWeek;
  const result = new Date(from.getTime());
  result.setDate(result.getDate() + Math.ceil(weeks * 7));
  return result;
}
