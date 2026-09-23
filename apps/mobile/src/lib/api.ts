import { supabase } from './supabase';
import type {
  DailyTarget,
  FoodAnalysis,
  FoodLog,
  MacroTotals,
  MealBudget,
  MealSlot,
  MealSuggestion,
  Profile,
  RankedDish,
  ProgressRange,
  Streak,
  WeightLog,
} from '@nutrisnap/core';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Identical surface to the web client (apps/web/src/lib/api.ts) so the two
 * apps stay interchangeable. Every call carries the Supabase access token.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new ApiError(401, 'You are signed out. Sign in again to continue.', 'unauthenticated');
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      `Could not reach the server at ${API_URL}. On a physical phone the API must be on your LAN IP, not localhost.`,
      'network_error',
    );
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.message ?? 'Something went wrong.',
      payload?.error?.code,
    );
  }

  return payload as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export interface AnalysisResponse {
  analysis: FoodAnalysis;
  photo_url: string | null;
}

/** One recorded move of the calorie target, newest first from the API. */
export interface TargetAdjustment {
  id: string;
  previous_calories: number;
  new_calories: number;
  estimated_tdee: number | null;
  reason: string;
  days_analyzed: number | null;
  created_at: string;
}

/** The adaptive engine's verdict — what it would do, or what it just did. */
export interface AdaptiveOutcome {
  shouldAdjust: boolean;
  reason: string;
  estimatedTdee: number | null;
  previousCalories: number;
  newCalories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  applied: boolean;
  daysAnalyzed: number;
}

export interface MenuResponse {
  /** The restaurant, when the menu printed its own name. */
  venue: string | null;
  budget: MealBudget;
  protein_left_g: number;
  /** Already ranked by the server, best first, excluded last. */
  dishes: RankedDish[];
}

export interface DayRollover {
  /** Carried in from the day before. */
  carried_in_kcal: number;
  /** Already moved out of this day into the next. */
  pushed_out_kcal: number;
  already_pushed: boolean;
}

export interface DayResponse {
  date: string;
  logs: FoodLog[];
  totals: MacroTotals;
  targets: DailyTarget | null;
  rollover: DayRollover;
}

export interface DayTotals {
  day: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  log_count: number;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface WaterLog {
  id: string;
  amount_ml: number;
  logged_at: string;
  logged_on: string;
}

export interface ExerciseLog {
  id: string;
  name: string;
  kind: string;
  duration_min: number;
  calories_burned: number;
  intensity: 'light' | 'moderate' | 'vigorous' | null;
  notes: string | null;
  source: 'manual' | 'estimated' | 'imported';
  logged_at: string;
  logged_on: string;
}

export interface ProgressPhoto {
  id: string;
  storage_path: string;
  weight_kg: number | null;
  note: string | null;
  taken_at: string;
  taken_on: string;
  /** Signed, and therefore renderable. Null when the object has gone missing. */
  url: string | null;
}

export interface ProgressResponse {
  range: ProgressRange;
  profile: {
    height_cm: number | null;
    goal: 'lose' | 'maintain' | 'gain' | null;
    units: 'metric' | 'imperial';
  };
  weight: {
    series: SeriesPoint[];
    trend_line: SeriesPoint[];
    current_kg: number | null;
    start_kg: number | null;
    last_logged_on: string | null;
    goal_kg: number | null;
    goal_progress: number | null;
    projected_goal_date: string | null;
    trend: { direction: string; change: number; percentChange: number };
    message: string;
    plateau: { plateaued: boolean; days: number; message: string | null };
  };
  calories: {
    series: SeriesPoint[];
    macro_series: Array<{ date: string; protein_g: number; carbs_g: number; fat_g: number }>;
    week_over_week: { thisWeekAvg: number; lastWeekAvg: number; percentChange: number };
    target: number | null;
    tdee: number | null;
  };
  expenditure: {
    series: SeriesPoint[];
    current: number | null;
  };
  streak: Streak;
}

/**
 * The query string for a day-scoped request.
 *
 * The offset travels with every one of them. Without it the server buckets
 * days in UTC, and anyone east or west of it loses the hours where their own
 * calendar disagrees — a walk logged at half past midnight in India was
 * stored against the previous day and then looked for under the current one.
 */
function dayParams(date?: string): string {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  // getTimezoneOffset is minutes *behind* UTC, so it is negated to read as
  // minutes east: India comes out as +330.
  params.set('tz_offset', String(-new Date().getTimezoneOffset()));
  return `?${params.toString()}`;
}

export interface StrengthSession {
  id: string;
  total_kcal: number;
  set_count: number;
  active_seconds: number;
  total_seconds: number;
  started_at: string;
  ended_at: string | null;
  logged_on: string;
}

export interface StrengthSet {
  id: string;
  exercise: string;
  category: 'strength' | 'circuit' | 'bodyweight' | 'cardio';
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  active_seconds: number;
  calories: number;
}

export const api = {
  getProfile: () => request<{ profile: Profile; targets: DailyTarget | null }>('/api/profile'),

  completeOnboarding: (answers: Record<string, unknown>) =>
    post<{ profile: Profile; targets: DailyTarget }>('/api/onboarding/complete', answers),

  updateProfile: (body: Record<string, unknown>) =>
    patch<{ profile: Profile; targets: DailyTarget | null }>('/api/profile', body),

  getTargets: () => request<{ targets: DailyTarget }>('/api/targets'),

  recalculateTargets: () => post<{ targets: DailyTarget }>('/api/targets/calculate'),

  /** What the user's own logged history says their target should be. */
  getAdaptive: () => request<{ adaptive: AdaptiveOutcome }>('/api/targets/adaptive'),

  /** Accept that verdict and move the target. */
  applyAdaptive: () =>
    post<{ adaptive: AdaptiveOutcome; targets: DailyTarget | null }>('/api/targets/adaptive'),

  getTargetAdjustments: () =>
    request<{ adjustments: TargetAdjustment[] }>('/api/targets/adjustments'),

  /**
   * Irreversible. `confirm` must be the account's own email address, which is
   * what stops a stray tap from finishing the job.
   */
  deleteAccount: (confirm: string) =>
    request<{ deleted: true }>('/api/profile', {
      method: 'DELETE',
      body: JSON.stringify({ confirm }),
    }),

  analyzePhoto: (body: {
    image: string;
    media_type?: string;
    correction?: string;
    previous?: FoodAnalysis;
    store_photo?: boolean;
  }) => post<AnalysisResponse>('/api/food/analyze', body),

  analyzeText: (description: string) =>
    post<AnalysisResponse>('/api/food/analyze-text', { description }),

  analyzeLabel: (body: { image: string; media_type?: string }) =>
    post<AnalysisResponse>('/api/food/analyze-label', body),

  lookupBarcode: (code: string) => request<AnalysisResponse>(`/api/food/barcode/${code}`),

  /** Photograph a restaurant menu and get it ranked against what is left today. */
  analyzeMenu: (body: { image: string; media_type?: string; slot: MealSlot }) =>
    post<MenuResponse>('/api/food/analyze-menu', {
      ...body,
      tz_offset: -new Date().getTimezoneOffset(),
    }),

  /** `exclude` carries the dishes already on screen, for "more ideas". */
  suggestMeals: (slot: MealSlot, exclude?: readonly string[]) =>
    post<{ budget: MealBudget; suggestions: MealSuggestion[] }>('/api/food/suggest', {
      slot,
      tz_offset: -new Date().getTimezoneOffset(),
      ...(exclude && exclude.length > 0 ? { exclude } : {}),
    }),

  getPhotoUrl: (path: string) =>
    request<{ url: string }>(`/api/food/photo-url?path=${encodeURIComponent(path)}`),

  getDay: (date?: string) => request<DayResponse>(`/api/logs${dayParams(date)}`),

  getWeek: (days = 7) => request<{ days: DayTotals[]; targets: DailyTarget | null }>(
    `/api/logs/week?days=${days}`,
  ),

  getRecent: (limit = 20) => request<{ logs: FoodLog[] }>(`/api/logs/recent?limit=${limit}`),

  getFavorites: (limit = 20) =>
    request<{ logs: FoodLog[] }>(`/api/logs/recent?limit=${limit}&favorites_only=true`),

  getLog: (id: string) => request<{ log: FoodLog }>(`/api/logs/${id}`),

  createLog: (body: Record<string, unknown>) =>
    post<{ log: FoodLog }>(`/api/logs${dayParams()}`, body),

  updateLog: (id: string, body: Record<string, unknown>) =>
    patch<{ log: FoodLog }>(`/api/logs/${id}`, body),

  /** Plate-diff: correct a logged meal by a photo of what was left. */
  correctLeftovers: (id: string, image: string, media_type?: string) =>
    post<{ log: FoodLog; changed: boolean; eaten_fraction: number; note: string }>(
      `/api/logs/${id}/leftovers`,
      { image, media_type },
    ),

  deleteLog: (id: string) =>
    request<void>(`/api/logs/${id}${dayParams()}`, { method: 'DELETE' }),

  getStreak: () => request<{ streak: Streak }>(`/api/streak${dayParams()}`),

  logWeight: (weight_kg: number) =>
    post<{ weight_log: WeightLog; targets: DailyTarget | null }>('/api/weight', { weight_kg }),

  getProgress: (range: ProgressRange) =>
    request<ProgressResponse>(
      `/api/progress?range=${range}&tz_offset=${-new Date().getTimezoneOffset()}`,
    ),

  exportData: () => request<Record<string, unknown>>('/api/export'),

  // --- Water -------------------------------------------------------------

  getWater: (date?: string) =>
    request<{ date: string; logs: WaterLog[]; total_ml: number }>(`/api/water${dayParams(date)}`),

  addWater: (amount_ml: number) =>
    post<{ water_log: WaterLog }>('/api/water', { amount_ml }),

  undoWater: (date?: string) =>
    request<void>(`/api/water/last${dayParams(date)}`, { method: 'DELETE' }),

  // --- Exercise ----------------------------------------------------------

  getExercise: (date?: string) =>
    request<{
      date: string;
      logs: ExerciseLog[];
      total_calories: number;
      total_minutes: number;
    }>(`/api/exercise${dayParams(date)}`),

  // --- Strength sessions --------------------------------------------------

  getStrengthSessions: (limit = 5) =>
    request<{ sessions: StrengthSession[] }>(`/api/strength/sessions?limit=${limit}`),

  getStrengthSession: (id: string) =>
    request<{ session: StrengthSession; sets: StrengthSet[] }>(`/api/strength/sessions/${id}`),

  saveStrengthSession: (body: {
    active_seconds: number;
    total_seconds: number;
    started_at?: string;
    sets: Array<Record<string, unknown>>;
  }) => post<{ session: StrengthSession }>('/api/strength/sessions', body),

  addExercise: (body: Record<string, unknown>) =>
    post<{ exercise_log: ExerciseLog }>('/api/exercise', body),

  deleteExercise: (id: string) => request<void>(`/api/exercise/${id}`, { method: 'DELETE' }),

  // --- Progress photos ---------------------------------------------------

  getProgressPhotos: () => request<{ photos: ProgressPhoto[] }>('/api/progress/photos'),

  addProgressPhoto: (body: {
    image: string;
    media_type?: string;
    weight_kg?: number | null;
    note?: string | null;
  }) => post<{ photo: ProgressPhoto }>('/api/progress/photos', body),

  deleteProgressPhoto: (id: string) =>
    request<void>(`/api/progress/photos/${id}`, { method: 'DELETE' }),

  // --- Coach -------------------------------------------------------------

  pushRollover: (date: string) =>
    post<{ rollover: { amount_kcal: number } }>('/api/rollover', { date }),

  undoRollover: (date: string) =>
    request<void>(`/api/rollover/${date}`, { method: 'DELETE' }),

  getCoachPrompts: () => request<{ prompts: string[] }>('/api/coach/prompts'),

  askCoach: (question: string) => post<{ answer: string }>('/api/coach/ask', { question }),
};
