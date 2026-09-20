import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, HttpError } from '../auth.js';
import { getOrCreateTargets } from '../services/targets.js';
import { inferMealType, sumTotals, type FoodLog } from '@nutrisnap/core';

const ingredientSchema = z.object({
  name: z.string(),
  grams: z.number().nonnegative(),
  calories: z.number().nonnegative(),
});

const logBody = z.object({
  name: z.string().min(1).max(200),
  photo_url: z.string().nullable().optional(),
  serving_multiplier: z.number().positive().max(50).default(1),
  estimated_grams: z.number().nonnegative().nullable().optional(),
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  sugar_g: z.number().nonnegative().default(0),
  fiber_g: z.number().nonnegative().default(0),
  sodium_mg: z.number().nonnegative().default(0),
  ai_confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.enum(['photo', 'barcode', 'label', 'text', 'manual', 'favorite']).default('manual'),
  barcode: z.string().nullable().optional(),
  ingredients: z.array(ingredientSchema).default([]),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).nullable().optional(),
  is_favorite: z.boolean().default(false),
  logged_at: z.string().datetime().optional(),
});

const DAY = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

function dayBounds(date: string): { from: string; to: string } {
  return {
    from: new Date(`${date}T00:00:00.000Z`).toISOString(),
    to: new Date(`${date}T23:59:59.999Z`).toISOString(),
  };
}

export async function logRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /** A day's logs plus its totals and the targets they are measured against. */
  app.get('/api/logs', async (request) => {
    const { date = new Date().toISOString().slice(0, 10) } = DAY.parse(request.query);
    const { from, to } = dayBounds(date);

    const { data, error } = await request.db
      .from('food_logs')
      .select('*')
      .eq('user_id', request.user.id)
      .gte('logged_at', from)
      .lte('logged_at', to)
      .order('logged_at', { ascending: false });

    if (error) throw new HttpError(500, `Could not load your logs: ${error.message}`, 'logs_read_failed');

    const logs = (data ?? []) as FoodLog[];
    const targets = await getOrCreateTargets(request.db, request.user.id);

    return { date, logs, totals: sumTotals(logs), targets };
  });

  /** Commit a reviewed analysis (or a manual entry) to the diary. */
  app.post('/api/logs', async (request) => {
    const body = logBody.parse(request.body);
    const loggedAt = body.logged_at ?? new Date().toISOString();

    const record = {
      ...body,
      logged_at: loggedAt,
      meal_type: body.meal_type ?? inferMealType(new Date(loggedAt)),
      user_id: request.user.id,
    };

    const { data, error } = await request.db.from('food_logs').insert(record).select('*').single();

    if (error || !data) {
      throw new HttpError(500, `Could not save that meal: ${error?.message}`, 'log_write_failed');
    }

    // Keep the flame honest. A failure here should not fail the log itself.
    const { error: streakError } = await request.db.rpc('recompute_streak', {
      p_user: request.user.id,
    });
    if (streakError) request.log.warn({ err: streakError }, 'streak recompute failed');

    return { log: data as FoodLog };
  });

  /** Edit a log — the serving stepper and ingredient edits both land here. */
  app.patch('/api/logs/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const patch = logBody.partial().parse(request.body);

    if (Object.keys(patch).length === 0) {
      throw new HttpError(400, 'Nothing to update.', 'empty_patch');
    }

    const { data, error } = await request.db
      .from('food_logs')
      .update(patch)
      .eq('id', id)
      .eq('user_id', request.user.id)
      .select('*')
      .maybeSingle();

    if (error) throw new HttpError(500, `Could not update that meal: ${error.message}`, 'log_write_failed');
    if (!data) throw new HttpError(404, 'Meal not found.', 'log_not_found');

    return { log: data as FoodLog };
  });

  app.delete('/api/logs/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const { error } = await request.db
      .from('food_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', request.user.id);

    if (error) throw new HttpError(500, `Could not delete that meal: ${error.message}`, 'log_delete_failed');

    await request.db.rpc('recompute_streak', { p_user: request.user.id });
    return reply.code(204).send();
  });

  /** Favourites and recents power one-tap re-logging. */
  app.get('/api/logs/recent', async (request) => {
    const { limit = 20, favorites_only = false } = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).optional(),
        favorites_only: z.coerce.boolean().optional(),
      })
      .parse(request.query);

    let query = request.db
      .from('food_logs')
      .select('*')
      .eq('user_id', request.user.id)
      .order('logged_at', { ascending: false })
      .limit(limit);

    if (favorites_only) query = query.eq('is_favorite', true);

    const { data, error } = await query;
    if (error) throw new HttpError(500, `Could not load recents: ${error.message}`, 'logs_read_failed');

    return { logs: (data ?? []) as FoodLog[] };
  });

  /**
   * The date strip: one totals row per day for the last N days.
   *
   * The cap is a year, not a month. The mobile strip scrolls 90 days back and
   * asks for all of them at once; capping at 31 made that request a validation
   * error, which took the whole dashboard load down with it.
   */
  app.get('/api/logs/week', async (request) => {
    const { days = 7 } = z
      .object({ days: z.coerce.number().int().min(1).max(366).optional() })
      .parse(request.query);

    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));

    const { data, error } = await request.db.rpc('nutrition_totals_by_day', {
      p_user: request.user.id,
      p_from: from.toISOString().slice(0, 10),
      p_to: to.toISOString().slice(0, 10),
    });

    if (error) throw new HttpError(500, `Could not load your week: ${error.message}`, 'week_read_failed');

    const targets = await getOrCreateTargets(request.db, request.user.id);
    return { days: data ?? [], targets };
  });

  /** Streak card on the Progress tab. */
  app.get('/api/streak', async (request) => {
    const { data, error } = await request.db
      .from('streaks')
      .select('*')
      .eq('user_id', request.user.id)
      .maybeSingle();

    if (error) throw new HttpError(500, `Could not load your streak: ${error.message}`, 'streak_read_failed');

    return {
      streak: data ?? {
        user_id: request.user.id,
        current_streak: 0,
        longest_streak: 0,
        last_logged_date: null,
      },
    };
  });
}
