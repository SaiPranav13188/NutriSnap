import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, HttpError } from '../auth.js';
import { tzOffsetOf } from '../lib/day.js';
import { getOrCreateTargets, recomputeAndStoreTargets } from '../services/targets.js';
import {
  bucketSeries,
  computeTrend,
  detectPlateau,
  encouragementMessage,
  goalProgress,
  isProgressRange,
  movingAverage,
  projectGoalDate,
  rangeStartDate,
  weekOverWeekChange,
  type Profile,
  type ProgressRange,
  type SeriesPoint,
} from '@nutrisnap/core';

const weightBody = z.object({
  weight_kg: z.number().min(25).max(400),
  logged_at: z.string().datetime().optional(),
});

export async function progressRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /**
   * Everything the Progress tab renders, for one range filter.
   * Ranges are the 90D / 1M / 6M / 1Y / ALL segmented control.
   */
  app.get('/api/progress', async (request) => {
    const { range = '90d' } = z.object({ range: z.string().optional() }).parse(request.query);

    if (!isProgressRange(range)) {
      throw new HttpError(400, 'Range must be one of 90d, 1m, 6m, 1y, all.', 'invalid_range');
    }

    const userId = request.user.id;
    const start = rangeStartDate(range as ProgressRange);
    const startIso = start?.toISOString() ?? null;

    // Bring the streak up to date before reading it. The stored row is only
    // written when a log is written, so a streak broken by not logging would
    // otherwise keep showing the number it had when the logging stopped.
    await request.db
      .rpc('recompute_streak', { p_user: userId, p_tz_offset: tzOffsetOf(request.query) })
      .then(({ error }) => {
        if (error) request.log.warn({ err: error }, 'streak recompute failed');
      });

    const [profileResult, weightResult, streakResult] = await Promise.all([
      request.db.from('profiles').select('*').eq('id', userId).single(),
      request.db.rpc('weight_series', { p_user: userId, p_from: startIso }),
      request.db.from('streaks').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    if (profileResult.error || !profileResult.data) {
      throw new HttpError(404, 'Profile not found.', 'profile_not_found');
    }
    const profile = profileResult.data as Profile;

    // Calorie series: from the range start (capped at a year of daily rows so
    // an "ALL" request on a long-lived account stays a reasonable query).
    const calorieFrom = start ?? new Date(Date.now() - 365 * 86_400_000);
    const caloriesResult = await request.db.rpc('nutrition_totals_by_day', {
      p_user: userId,
      p_from: calorieFrom.toISOString().slice(0, 10),
      p_to: new Date().toISOString().slice(0, 10),
    });

    const rawWeights: SeriesPoint[] = (weightResult.data ?? []).map(
      (row: { logged_on: string; weight_kg: number }) => ({
        date: row.logged_on,
        value: Number(row.weight_kg),
      }),
    );

    const dayRows: Array<{
      day: string;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      log_count: number;
    }> = (caloriesResult.data ?? []).map((row: Record<string, unknown>) => ({
      day: String(row.day),
      calories: Number(row.calories ?? 0),
      protein_g: Number(row.protein_g ?? 0),
      carbs_g: Number(row.carbs_g ?? 0),
      fat_g: Number(row.fat_g ?? 0),
      log_count: Number(row.log_count ?? 0),
    }));

    const weightSeries = bucketSeries(rawWeights, 90);
    const trend = computeTrend(weightSeries);

    // Week-over-week average only counts days that were actually logged;
    // including untouched days would drag the average toward zero.
    const loggedCalorieDays: SeriesPoint[] = dayRows
      .filter((d) => d.log_count > 0)
      .map((d) => ({ date: d.day, value: d.calories }));

    const targets = await getOrCreateTargets(request.db, userId);

    // Stored targets carry the TDEE that was in force from each date, so the
    // history of the estimate is already on disk — the adaptive recompute
    // writes a new row whenever it moves.
    const expenditureResult = await request.db
      .from('daily_targets')
      .select('effective_date, tdee')
      .eq('user_id', userId)
      .not('tdee', 'is', null)
      .order('effective_date', { ascending: true });

    const expenditureSeries: SeriesPoint[] = (expenditureResult.data ?? []).map(
      (row: { effective_date: string; tdee: number | null }) => ({
        date: row.effective_date,
        value: Number(row.tdee ?? 0),
      }),
    );

    const currentWeight = rawWeights.at(-1)?.value ?? profile.current_weight_kg ?? null;
    const startWeight = rawWeights[0]?.value ?? profile.current_weight_kg ?? null;

    return {
      range,
      // Height and goal never change inside a range, but BMI and the goal
      // copy need them and a second round trip for two fields is wasteful.
      profile: {
        height_cm: profile.height_cm,
        goal: profile.goal,
        units: profile.units ?? 'metric',
      },
      weight: {
        series: weightSeries,
        trend_line: movingAverage(weightSeries, 7),
        current_kg: currentWeight,
        start_kg: startWeight,
        /** Drives the "next weigh-in" countdown. */
        last_logged_on: rawWeights.at(-1)?.date ?? null,
        goal_kg: profile.goal_weight_kg,
        goal_progress:
          startWeight !== null && currentWeight !== null && profile.goal_weight_kg !== null
            ? goalProgress(startWeight, currentWeight, profile.goal_weight_kg)
            : null,
        projected_goal_date:
          currentWeight !== null && profile.goal_weight_kg !== null && profile.rate_kg_per_week
            ? projectGoalDate({
                currentWeightKg: currentWeight,
                goalWeightKg: profile.goal_weight_kg,
                rateKgPerWeek: profile.rate_kg_per_week,
              })
            : null,
        trend,
        message: encouragementMessage(trend, profile.goal ?? 'maintain'),
        plateau: detectPlateau({ weights: rawWeights, goal: profile.goal ?? 'maintain' }),
      },
      calories: {
        series: dayRows.map((d) => ({ date: d.day, value: d.calories })),
        macro_series: dayRows.map((d) => ({
          date: d.day,
          protein_g: d.protein_g,
          carbs_g: d.carbs_g,
          fat_g: d.fat_g,
        })),
        week_over_week: weekOverWeekChange(loggedCalorieDays),
        target: targets?.calories ?? null,
        tdee: targets?.tdee ?? null,
      },
      expenditure: {
        series: expenditureSeries,
        current: targets?.tdee ?? null,
      },
      streak: streakResult.data ?? { current_streak: 0, longest_streak: 0, last_logged_date: null },
    };
  });

  /**
   * Log a weigh-in. One per day — a second entry for the same date replaces
   * the first rather than skewing the trend line with two points.
   * The profile's current weight follows the latest weigh-in, which in turn
   * feeds the target recompute.
   */
  app.post('/api/weight', async (request) => {
    const body = weightBody.parse(request.body);
    const loggedAt = body.logged_at ?? new Date().toISOString();

    const { data, error } = await request.db
      .from('weight_logs')
      .upsert(
        { user_id: request.user.id, weight_kg: body.weight_kg, logged_at: loggedAt },
        { onConflict: 'user_id,logged_on' },
      )
      .select('*')
      .single();

    if (error || !data) {
      throw new HttpError(500, `Could not save that weigh-in: ${error?.message}`, 'weight_write_failed');
    }

    // Only the most recent weigh-in should move the profile weight; a
    // back-dated entry is history, not a new current weight.
    const { data: latest } = await request.db
      .from('weight_logs')
      .select('weight_kg, logged_at')
      .eq('user_id', request.user.id)
      .order('logged_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let targets = null;
    if (latest && Number(latest.weight_kg) === body.weight_kg) {
      await request.db
        .from('profiles')
        .update({ current_weight_kg: body.weight_kg })
        .eq('id', request.user.id);
      targets = await recomputeAndStoreTargets(request.db, request.user.id);
    }

    return { weight_log: data, targets };
  });

  app.get('/api/weight', async (request) => {
    const { limit = 60 } = z
      .object({ limit: z.coerce.number().int().min(1).max(365).optional() })
      .parse(request.query);

    const { data, error } = await request.db
      .from('weight_logs')
      .select('*')
      .eq('user_id', request.user.id)
      .order('logged_at', { ascending: false })
      .limit(limit);

    if (error) throw new HttpError(500, `Could not load weigh-ins: ${error.message}`, 'weight_read_failed');
    return { weight_logs: data ?? [] };
  });
}
