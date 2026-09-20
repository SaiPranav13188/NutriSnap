'use client';

import { createClient } from './supabase/client';
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

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
 * Every call to the API service carries the user's Supabase access token.
 * The API verifies it and scopes all database access to that user.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = createClient();
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
    throw new ApiError(0, 'Could not reach the server. Check your connection.', 'network_error');
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

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface AnalysisResponse {
  analysis: FoodAnalysis;
  photo_url: string | null;
}

export interface DayResponse {
  date: string;
  logs: FoodLog[];
  totals: MacroTotals;
  targets: DailyTarget | null;
}

export interface DayTotals {
  day: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  log_count: number;
}

export interface WeekResponse {
  days: DayTotals[];
  targets: DailyTarget | null;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface ProgressResponse {
  range: ProgressRange;
  weight: {
    series: SeriesPoint[];
    trend_line: SeriesPoint[];
    current_kg: number | null;
    start_kg: number | null;
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
  streak: Streak;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

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

  getWeek: (days = 7) => request<WeekResponse>(`/api/logs/week?days=${days}`),

  getRecent: (opts: { limit?: number; favoritesOnly?: boolean } = {}) =>
    request<{ logs: FoodLog[] }>(
      `/api/logs/recent?limit=${opts.limit ?? 20}${opts.favoritesOnly ? '&favorites_only=true' : ''}`,
    ),

  createLog: (body: Record<string, unknown>) => post<{ log: FoodLog }>('/api/logs', body),

  updateLog: (id: string, body: Record<string, unknown>) =>
    patch<{ log: FoodLog }>(`/api/logs/${id}`, body),

  deleteLog: (id: string) => request<void>(`/api/logs/${id}`, { method: 'DELETE' }),

  getStreak: () => request<{ streak: Streak }>('/api/streak'),

  logWeight: (weight_kg: number) =>
    post<{ weight_log: WeightLog; targets: DailyTarget | null }>('/api/weight', { weight_kg }),

  getWeights: (limit = 60) => request<{ weight_logs: WeightLog[] }>(`/api/weight?limit=${limit}`),

  getProgress: (range: ProgressRange) => request<ProgressResponse>(`/api/progress?range=${range}`),

  exportData: () => request<Record<string, unknown>>('/api/export'),
};
