/**
 * Shared domain types. These mirror the Postgres schema in supabase/migrations
 * one-for-one — if you change a column, change it here too.
 */

export type Gender = 'male' | 'female' | 'other';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extreme';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Units = 'metric' | 'imperial';
export type LogSource = 'photo' | 'barcode' | 'label' | 'text' | 'manual' | 'favorite';

/** Answers to "are you currently training?" — drives the protein multiplier. */
export type TrainingFocus = 'strength' | 'general_fitness' | 'athlete' | 'none';

export type WorkoutsPerWeek = '0' | '1-3' | '4-6' | '7+';

export type DietaryPreference = 'classic' | 'vegetarian' | 'vegan' | 'pescatarian';

export type ProgressRange = '90d' | '1m' | '6m' | '1y' | 'all';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  gender: Gender | null;
  date_of_birth: string | null; // ISO date
  height_cm: number | null;
  goal: Goal | null;
  current_weight_kg: number | null;
  goal_weight_kg: number | null;
  rate_kg_per_week: number | null;
  target_date: string | null;
  activity_level: ActivityLevel | null;
  workouts_per_week: WorkoutsPerWeek | null;
  training_focus: TrainingFocus | null;
  focus_area: string | null;
  dietary_preference: DietaryPreference | null;
  allergies: string[];
  units: Units;
  /**
   * Steps per day the user is aiming for. Shown on Personal details and used
   * to judge a tracked walk; deliberately not part of the calorie maths,
   * which already counts movement through `activity_level`.
   */
  daily_step_goal: number;
  /** Explicit water target in ml. Null means derive it from body weight. */
  water_goal_ml: number | null;
  referral_source: string | null;
  tried_other_apps: boolean | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyTarget {
  id: string;
  user_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  bmr: number | null;
  tdee: number | null;
  source: 'formula' | 'adaptive' | 'manual';
  effective_date: string;
  created_at: string;
}

export interface Ingredient {
  name: string;
  grams: number;
  calories: number;
}

export interface FoodLog {
  id: string;
  user_id: string;
  photo_url: string | null;
  name: string;
  serving_multiplier: number;
  estimated_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  ai_confidence: number | null;
  source: LogSource;
  barcode: string | null;
  ingredients: Ingredient[];
  is_favorite: boolean;
  meal_type: MealType | null;
  logged_at: string;
  created_at: string;
}

export interface WeightLog {
  id: string;
  user_id: string;
  weight_kg: number;
  logged_at: string;
  logged_on: string;
  created_at: string;
}

export interface Streak {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_logged_date: string | null;
  updated_at: string;
}

/** The five numbers every nutrition surface in the app is built from. */
export interface MacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  sodium_mg: number;
}

/** Shape the vision model must return from /api/food/analyze. */
export interface FoodAnalysis {
  name: string;
  confidence: number; // 0..1
  estimated_grams: number;
  ingredients: Ingredient[];
  totals: MacroTotals;
  notes?: string;
}
