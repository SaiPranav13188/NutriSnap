import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  MAX_SESSION_BURN_KCAL,
  estimateCaloriesBurned,
  type ExerciseIntensity,
  type ExerciseKind,
  type Profile,
} from '@nutrisnap/core';
import { requireAuth, HttpError } from '../auth.js';
import { assertTableExists } from '../db-errors.js';

/**
 * Water and exercise logging.
 *
 * Both are plain per-user logs, so they share a file and a shape: post an
 * entry, read a day, delete one. Neither has a "one per day" rule — a glass of
 * water and a workout can happen any number of times.
 */

const dayQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const waterBody = z.object({
  amount_ml: z.number().int().min(1).max(10_000),
  logged_at: z.string().datetime().optional(),
});

const exerciseKinds = [
  'cardio',
  'strength',
  'walk',
  'run',
  'cycle',
  'swim',
  'sport',
  'other',
] as const;

const exerciseBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(exerciseKinds).default('other'),
  duration_min: z.number().int().min(1).max(1440),
  intensity: z.enum(['light', 'moderate', 'vigorous']).optional(),
  /** Omit to have it estimated from the kind, intensity and body weight. */
  calories_burned: z.number().int().min(0).max(MAX_SESSION_BURN_KCAL).optional(),
  notes: z.string().max(500).nullable().optional(),
  logged_at: z.string().datetime().optional(),
});

const todayKey = (): string => new Date().toISOString().slice(0, 10);

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // -------------------------------------------------------------------------
  // Water
  // -------------------------------------------------------------------------

  /** Every sip logged on a day, plus the total. */
  app.get('/api/water', async (request) => {
    const { date = todayKey() } = dayQuery.parse(request.query);

    const { data, error } = await request.db
      .from('water_logs')
      .select('*')
      .eq('user_id', request.user.id)
      .eq('logged_on', date)
      .order('logged_at', { ascending: false });

    assertTableExists(error, 'Water tracking');
    if (error) {
      throw new HttpError(500, `Could not load your water: ${error.message}`, 'water_read_failed');
    }

    const logs = data ?? [];
    const total_ml = logs.reduce((sum, row) => sum + Number(row.amount_ml ?? 0), 0);

    return { date, logs, total_ml };
  });

  app.post('/api/water', async (request, reply) => {
    const body = waterBody.parse(request.body);

    const { data, error } = await request.db
      .from('water_logs')
      .insert({ ...body, user_id: request.user.id })
      .select('*')
      .single();

    assertTableExists(error, 'Water tracking');
    if (error || !data) {
      throw new HttpError(500, `Could not save that: ${error?.message}`, 'water_write_failed');
    }

    return reply.code(201).send({ water_log: data });
  });

  /**
   * Undo the last entry for a day.
   *
   * The water UI is quick-add buttons, so the mistake to recover from is
   * "tapped 250 ml twice", not "want to remove the one from 11am". Undo is a
   * better fit than a list with a delete on each row.
   */
  app.delete('/api/water/last', async (request, reply) => {
    const { date = todayKey() } = dayQuery.parse(request.query);

    const { data, error } = await request.db
      .from('water_logs')
      .select('id')
      .eq('user_id', request.user.id)
      .eq('logged_on', date)
      .order('logged_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    assertTableExists(error, 'Water tracking');
    if (error) {
      throw new HttpError(500, `Could not undo that: ${error.message}`, 'water_read_failed');
    }
    if (!data) throw new HttpError(404, 'Nothing to undo.', 'water_not_found');

    const { error: deleteError } = await request.db
      .from('water_logs')
      .delete()
      .eq('id', data.id)
      .eq('user_id', request.user.id);

    if (deleteError) {
      throw new HttpError(500, `Could not undo that: ${deleteError.message}`, 'water_delete_failed');
    }

    return reply.code(204).send();
  });

  app.delete('/api/water/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const { error } = await request.db
      .from('water_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', request.user.id);

    assertTableExists(error, 'Water tracking');
    if (error) {
      throw new HttpError(500, `Could not delete that: ${error.message}`, 'water_delete_failed');
    }

    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // Exercise
  // -------------------------------------------------------------------------

  app.get('/api/exercise', async (request) => {
    const { date = todayKey() } = dayQuery.parse(request.query);

    const { data, error } = await request.db
      .from('exercise_logs')
      .select('*')
      .eq('user_id', request.user.id)
      .eq('logged_on', date)
      .order('logged_at', { ascending: false });

    assertTableExists(error, 'Workout logging');
    if (error) {
      throw new HttpError(
        500,
        `Could not load your workouts: ${error.message}`,
        'exercise_read_failed',
      );
    }

    const logs = data ?? [];
    return {
      date,
      logs,
      total_calories: logs.reduce((sum, row) => sum + Number(row.calories_burned ?? 0), 0),
      total_minutes: logs.reduce((sum, row) => sum + Number(row.duration_min ?? 0), 0),
    };
  });

  app.post('/api/exercise', async (request, reply) => {
    const body = exerciseBody.parse(request.body);

    // Estimate only when the client did not supply a figure, so a value that
    // came off a watch is stored as measured rather than recomputed.
    let calories = body.calories_burned;
    let source: 'manual' | 'estimated' = 'manual';

    if (calories === undefined) {
      const { data: profile } = await request.db
        .from('profiles')
        .select('current_weight_kg')
        .eq('id', request.user.id)
        .maybeSingle();

      calories = estimateCaloriesBurned({
        kind: body.kind as ExerciseKind,
        intensity: (body.intensity ?? 'moderate') as ExerciseIntensity,
        durationMin: body.duration_min,
        weightKg: (profile as Pick<Profile, 'current_weight_kg'> | null)?.current_weight_kg ?? null,
      });
      source = 'estimated';
    }

    const { data, error } = await request.db
      .from('exercise_logs')
      .insert({
        ...body,
        calories_burned: calories,
        source,
        user_id: request.user.id,
      })
      .select('*')
      .single();

    assertTableExists(error, 'Workout logging');
    if (error || !data) {
      throw new HttpError(
        500,
        `Could not save that workout: ${error?.message}`,
        'exercise_write_failed',
      );
    }

    return reply.code(201).send({ exercise_log: data });
  });

  app.patch('/api/exercise/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const patch = exerciseBody.partial().parse(request.body);

    if (Object.keys(patch).length === 0) {
      throw new HttpError(400, 'Nothing to update.', 'empty_patch');
    }

    const { data, error } = await request.db
      .from('exercise_logs')
      .update(patch)
      .eq('id', id)
      .eq('user_id', request.user.id)
      .select('*')
      .maybeSingle();

    assertTableExists(error, 'Workout logging');
    if (error) {
      throw new HttpError(
        500,
        `Could not update that workout: ${error.message}`,
        'exercise_write_failed',
      );
    }
    if (!data) throw new HttpError(404, 'Workout not found.', 'exercise_not_found');

    return { exercise_log: data };
  });

  app.delete('/api/exercise/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const { error } = await request.db
      .from('exercise_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', request.user.id);

    assertTableExists(error, 'Workout logging');
    if (error) {
      throw new HttpError(
        500,
        `Could not delete that workout: ${error.message}`,
        'exercise_delete_failed',
      );
    }

    return reply.code(204).send();
  });
}
