import type { ActivityLevel, Gender, Goal, TrainingFocus } from './types.js';

/** Plan section 2, step 2 — TDEE multipliers. */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  extreme: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, { title: string; subtitle: string }> = {
  sedentary: { title: 'Sedentary', subtitle: 'Little or no exercise, desk job' },
  light: { title: 'Lightly active', subtitle: '1–3 workouts per week' },
  moderate: { title: 'Moderately active', subtitle: '3–5 workouts per week' },
  very_active: { title: 'Very active', subtitle: '6–7 workouts per week' },
  extreme: { title: 'Extremely active', subtitle: 'Physical job or training twice a day' },
};

/** Energy density used to convert a weekly rate of change into a daily delta. */
export const KCAL_PER_KG_FAT = 7700;

/** Atwater factors. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * Hard safety floor on the daily calorie target (plan section 2, step 3).
 * `other` uses the lower of the two published floors; the app never pushes a
 * user below this no matter how aggressive a rate of loss they pick.
 */
export const CALORIE_FLOOR: Record<Gender, number> = {
  male: 1500,
  female: 1200,
  other: 1200,
};

/**
 * Protein grams per kg of bodyweight (plan section 2, step 4).
 * A deficit gets the high end of the range because protein is what preserves
 * lean mass when calories are low; a lean bulk with real training gets the
 * highest value of all.
 */
export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose: 2.0,
  maintain: 1.6,
  gain: 1.8,
};

/** Bump applied on top of PROTEIN_G_PER_KG.gain when the user actually trains. */
export const PROTEIN_G_PER_KG_TRAINING: Partial<Record<TrainingFocus, number>> = {
  strength: 2.2,
  athlete: 2.2,
};

/** Share of total calories that comes from fat (plan uses 25–30%; 27.5% is the midpoint). */
export const FAT_CALORIE_SHARE = 0.275;

/** Default weekly rate of weight change when the user has not chosen one. */
export const DEFAULT_RATE_KG_PER_WEEK = 0.5;

/** Rates offered in the onboarding quiz, per goal. */
export const LOSS_RATES_KG_PER_WEEK = [0.25, 0.5, 0.75, 1.0] as const;
export const GAIN_RATES_KG_PER_WEEK = [0.25, 0.5, 0.75] as const;
