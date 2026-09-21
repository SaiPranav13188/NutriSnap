import { supabase } from './supabase';
import type {
  DailyTarget,
  FoodAnalysis,
  FoodLog,
  MacroTotals,
  Profile,
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

export const api = {
  getProfile: () => request<{ profile: Profile; targets: DailyTarget | null }>('/api/profile'),

  completeOnboarding: (answers: Record<string, unknown>) =>
    post<{ profile: Profile; targets: DailyTarget }>('/api/onboarding/complete', answers),

  updateProfile: (body: Record<string, unknown>) =>
    patch<{ profile: Profile; targets: DailyTarget | null }>('/api/profile', body),

  getTargets: () => request<{ targets: DailyTarget }>('/api/targets'),

  recalculateTargets: () => post<{ targets: DailyTarget }>('/api/targets/calculate'),

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

  getPhotoUrl: (path: string) =>
    request<{ url: string }>(`/api/food/photo-url?path=${encodeURIComponent(path)}`),

  getDay: (date?: string) => request<DayResponse>(`/api/logs${date ? `?date=${date}` : ''}`),

  getWeek: (days = 7) => request<{ days: DayTotals[]; targets: DailyTarget | null }>(
    `/api/logs/week?days=${days}`,
  ),

  getRecent: (limit = 20) => request<{ logs: FoodLog[] }>(`/api/logs/recent?limit=${limit}`),

  getFavorites: (limit = 20) =>
    request<{ logs: FoodLog[] }>(`/api/logs/recent?limit=${limit}&favorites_only=true`),

  getLog: (id: string) => request<{ log: FoodLog }>(`/api/logs/${id}`),

  createLog: (body: Record<string, unknown>) => post<{ log: FoodLog }>('/api/logs', body),

  updateLog: (id: string, body: Record<string, unknown>) =>
    patch<{ log: FoodLog }>(`/api/logs/${id}`, body),

  deleteLog: (id: string) => request<void>(`/api/logs/${id}`, { method: 'DELETE' }),

  getStreak: () => request<{ streak: Streak }>('/api/streak'),

  logWeight: (weight_kg: number) =>
    post<{ weight_log: WeightLog; targets: DailyTarget | null }>('/api/weight', { weight_kg }),

  getProgress: (range: ProgressRange) => request<ProgressResponse>(`/api/progress?range=${range}`),

  exportData: () => request<Record<string, unknown>>('/api/export'),

  // --- Water -------------------------------------------------------------

  getWater: (date?: string) =>
    request<{ date: string; logs: WaterLog[]; total_ml: number }>(
      `/api/water${date ? `?date=${date}` : ''}`,
    ),

  addWater: (amount_ml: number) =>
    post<{ water_log: WaterLog }>('/api/water', { amount_ml }),

  undoWater: (date?: string) =>
    request<void>(`/api/water/last${date ? `?date=${date}` : ''}`, { method: 'DELETE' }),

  // --- Exercise ----------------------------------------------------------

  getExercise: (date?: string) =>
    request<{
      date: string;
      logs: ExerciseLog[];
      total_calories: number;
      total_minutes: number;
    }>(`/api/exercise${date ? `?date=${date}` : ''}`),

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
