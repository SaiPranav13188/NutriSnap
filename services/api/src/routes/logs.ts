import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, HttpError } from '../auth.js';
import { getOrCreateTargets } from '../services/targets.js';
import { dayQuery, dayWindow, tzOffsetOf } from '../lib/day.js';
import { applyLeftovers, isCorrectionMeaningful } from '@nutrisnap/core';
import { readLeftovers } from '../ai/leftovers.js';
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



/** Accepts a bare base64 payload or a full data URI, as the food route does. */
function normaliseLeftoverImage(
  input: string,
  fallbackMediaType = 'image/jpeg',
): { base64: string; mediaType: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(input);
  if (match) return { mediaType: match[1] ?? fallbackMediaType, base64: match[2] ?? '' };
  return { base64: input, mediaType: fallbackMediaType };
}

export async function logRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /** A day's logs plus its totals and the targets they are measured against. */
  app.get('/api/logs', async (request) => {
    const query = dayQuery.parse(request.query);
    const { date, from, to } = dayWindow(query.date, query.tz_offset);

    const { data, error } = await request.db
      .from('food_logs')
      .select('*')
      .eq('user_id', request.user.id)
      .gte('logged_at', from)
      .lt('logged_at', to)
      .order('logged_at', { ascending: false });

    if (error) throw new HttpError(500, `Could not load your logs: ${error.message}`, 'logs_read_failed');

    const logs = (data ?? []) as FoodLog[];
    const targets = await getOrCreateTargets(request.db, request.user.id);

    // Rollovers touching this day: what was carried in from yesterday, and
    // whether today's own leftovers have already been pushed forward. Both
    // come back as facts rather than folded into the target, so the screen
    // can show where an unusual allowance came from.
    const { data: rolloverRows, error: rolloverError } = await request.db
      .from('calorie_rollovers')
      .select('from_date, to_date, amount_kcal')
      .eq('user_id', request.user.id)
      .or(`from_date.eq.${date},to_date.eq.${date}`);

    // A missing table here must not take the whole day down: the rest of
    // this response is what the dashboard is actually for.
    const rollovers = rolloverError ? [] : (rolloverRows ?? []);

    const carriedIn = rollovers
      .filter((r) => r.to_date === date)
      .reduce((sum, r) => sum + Number(r.amount_kcal ?? 0), 0);

    const pushedOut = rollovers.find((r) => r.from_date === date) ?? null;

    return {
      date,
      logs,
      totals: sumTotals(logs),
      targets,
      rollover: {
        carried_in_kcal: carriedIn,
        pushed_out_kcal: pushedOut ? Number(pushedOut.amount_kcal) : 0,
        already_pushed: pushedOut !== null,
      },
    };
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
      p_tz_offset: tzOffsetOf(request.query),
    });
    if (streakError) request.log.warn({ err: streakError }, 'streak recompute failed');

    return { log: data as FoodLog };
  });

  /** Edit a log — the serving stepper and ingredient edits both land here. */
  /**
   * One meal in full, for the detail screen a log row opens.
   *
   * The dashboard already holds the day's logs, but reading the row from the
   * list would make the screen unopenable from anywhere else — a notification,
   * a deep link, or a reload once the list has moved on to another date.
   */
  app.get('/api/logs/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const { data, error } = await request.db
      .from('food_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', request.user.id)
      .maybeSingle();

    if (error) throw new HttpError(500, `Could not load that meal: ${error.message}`, 'log_read_failed');
    if (!data) throw new HttpError(404, 'Meal not found.', 'log_not_found');

    return { log: data as FoodLog };
  });

  /**
   * Plate-diff: correct a logged meal by a photograph of what was left.
   *
   * The original analysis is not revisited. The model only reports how much
   * of each ingredient is still on the plate, and the meal is scaled down by
   * that — so a good first estimate cannot be overwritten by a bad second
   * photograph.
   */
  app.post('/api/logs/:id/leftovers', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ image: z.string().min(1), media_type: z.string().optional() })
      .parse(request.body);

    const { data: existing, error: readError } = await request.db
      .from('food_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', request.user.id)
      .maybeSingle();

    if (readError) {
      throw new HttpError(500, `Could not load that meal: ${readError.message}`, 'logs_read_failed');
    }
    if (!existing) throw new HttpError(404, 'That meal does not exist.', 'log_not_found');

    const log = existing as FoodLog;
    const { base64, mediaType } = normaliseLeftoverImage(body.image, body.media_type);

    const report = await readLeftovers({
      base64,
      mediaType,
      served: log.ingredients ?? [],
      mealName: log.name,
    });

    const diff = applyLeftovers({
      ingredients: log.ingredients ?? [],
      totals: {
        calories: Number(log.calories ?? 0),
        protein_g: Number(log.protein_g ?? 0),
        carbs_g: Number(log.carbs_g ?? 0),
        fat_g: Number(log.fat_g ?? 0),
        sugar_g: Number(log.sugar_g ?? 0),
        fiber_g: Number(log.fiber_g ?? 0),
        sodium_mg: Number(log.sodium_mg ?? 0),
      },
      leftovers: report.empty_plate ? [] : report.leftovers,
      overallRemaining: report.empty_plate
        ? 0
        : (report.leftovers[0]?.remaining ?? 0),
    });

    // Two photographs of the same plate differ by a few percent on lighting
    // alone. Rewriting the log for that would be noise dressed as precision.
    if (!isCorrectionMeaningful(diff.eatenFraction)) {
      return { log, changed: false, eaten_fraction: diff.eatenFraction, note: report.note };
    }

    const { data: updated, error } = await request.db
      .from('food_logs')
      .update({
        calories: Math.round(diff.totals.calories),
        protein_g: Math.round(diff.totals.protein_g),
        carbs_g: Math.round(diff.totals.carbs_g),
        fat_g: Math.round(diff.totals.fat_g),
        sugar_g: Math.round(diff.totals.sugar_g),
        fiber_g: Math.round(diff.totals.fiber_g),
        sodium_mg: Math.round(diff.totals.sodium_mg),
        ingredients: diff.ingredients.map((item) => ({
          name: item.name,
          grams: Math.round(item.grams),
          calories: Math.round(item.calories),
        })),
      })
      .eq('id', id)
      .eq('user_id', request.user.id)
      .select('*')
      .single();

    if (error || !updated) {
      throw new HttpError(500, `Could not correct that meal: ${error?.message}`, 'logs_write_failed');
    }

    return { log: updated, changed: true, eaten_fraction: diff.eatenFraction, note: report.note };
  });

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

    await request.db.rpc('recompute_streak', {
      p_user: request.user.id,
      p_tz_offset: tzOffsetOf(request.query),
    });
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

  /**
   * Streak card on the Progress tab.
   *
   * This recomputes before reading, because the stored row is only written
   * when a log is written. A streak broken by *not* logging has no write to
   * trigger it, so the flame stayed lit on the old number indefinitely —
   * someone who last logged a week ago still saw the streak they had when
   * they stopped. The recompute is idempotent, and needs the caller's offset
   * to know where their days end.
   */
  app.get('/api/streak', async (request) => {
    const { error: recomputeError } = await request.db.rpc('recompute_streak', {
      p_user: request.user.id,
      p_tz_offset: tzOffsetOf(request.query),
    });
    // A stale number still beats no number, so this only gets logged.
    if (recomputeError) request.log.warn({ err: recomputeError }, 'streak recompute failed');

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
