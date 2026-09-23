import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROLLING_SESSIONS } from '@nutrisnap/core';
import { requireAuth, HttpError } from '../auth.js';
import { assertTableExists } from '../db-errors.js';
import { dayQuery, dayWindow } from '../lib/day.js';

const setBody = z.object({
  exercise: z.string().min(1).max(120),
  category: z.enum(['strength', 'circuit', 'bodyweight', 'cardio']).default('strength'),
  set_number: z.number().int().min(1).max(500),
  reps: z.number().int().min(1).max(1000).nullable().optional(),
  weight_kg: z.number().min(0).max(1000).nullable().optional(),
  active_seconds: z.number().int().min(0).max(7200),
  calories: z.number().min(0).max(20000),
  /**
   * When the set finished.
   *
   * Without it every set in a session shares the transaction's `now()`, and
   * `set_number` counts per exercise rather than per session — so reading
   * them back in order gave "Bench 1, Press-ups 1, Bench 2", which is not
   * what anybody did.
   */
  logged_at: z.string().datetime().optional(),
});

const sessionBody = z.object({
  active_seconds: z.number().int().min(0).max(86400),
  total_seconds: z.number().int().min(0).max(86400),
  started_at: z.string().datetime().optional(),
  sets: z.array(setBody).min(1).max(500),
});

/**
 * Strength sessions.
 *
 * The session is written whole rather than a set at a time: a workout that
 * half-saved because the phone lost signal between the fourth and fifth set
 * would leave a row nobody can interpret, and the screen already holds the
 * whole thing in memory until the user finishes.
 */
export async function strengthRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /**
   * Past sessions, newest first.
   *
   * `limit` defaults to the rolling window the summary card compares
   * against, because that is what the client asks for most often.
   */
  app.get('/api/strength/sessions', async (request) => {
    const { limit = ROLLING_SESSIONS, date, tz_offset } = z
      .object({ limit: z.coerce.number().int().min(1).max(100).optional() })
      .merge(dayQuery)
      .parse(request.query);

    let query = request.db
      .from('strength_sessions')
      .select('*')
      .eq('user_id', request.user.id)
      .order('started_at', { ascending: false })
      .limit(limit);

    // With a date, the caller wants one day rather than the recent past.
    if (date !== undefined) {
      const window = dayWindow(date, tz_offset);
      query = query.gte('started_at', window.from).lt('started_at', window.to);
    }

    const { data, error } = await query;

    assertTableExists(error, 'Strength sessions');
    if (error) {
      throw new HttpError(
        500,
        `Could not load your sessions: ${error.message}`,
        'strength_read_failed',
      );
    }

    return { sessions: data ?? [] };
  });

  /** One session with the sets that made it up, in the order performed. */
  app.get('/api/strength/sessions/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const { data: session, error } = await request.db
      .from('strength_sessions')
      .select('*')
      .eq('user_id', request.user.id)
      .eq('id', id)
      .maybeSingle();

    assertTableExists(error, 'Strength sessions');
    if (error) {
      throw new HttpError(
        500,
        `Could not load that session: ${error.message}`,
        'strength_read_failed',
      );
    }
    if (!session) throw new HttpError(404, 'That session does not exist.', 'session_not_found');

    const { data: sets, error: setsError } = await request.db
      .from('strength_sets')
      .select('*')
      .eq('session_id', id)
      // The order they were performed in. set_number is a per-exercise
      // counter, so it is the tie-break, not the sort.
      .order('logged_at', { ascending: true })
      .order('set_number', { ascending: true });

    if (setsError) {
      throw new HttpError(
        500,
        `Could not load that session's sets: ${setsError.message}`,
        'strength_read_failed',
      );
    }

    return { session, sets: sets ?? [] };
  });

  app.post('/api/strength/sessions', async (request, reply) => {
    const body = sessionBody.parse(request.body);

    const totalKcal = Math.round(body.sets.reduce((sum, set) => sum + set.calories, 0));

    const { data: session, error } = await request.db
      .from('strength_sessions')
      .insert({
        user_id: request.user.id,
        total_kcal: totalKcal,
        set_count: body.sets.length,
        active_seconds: body.active_seconds,
        total_seconds: body.total_seconds,
        started_at: body.started_at ?? new Date().toISOString(),
        ended_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    assertTableExists(error, 'Strength sessions');
    if (error || !session) {
      throw new HttpError(
        500,
        `Could not save that session: ${error?.message}`,
        'strength_write_failed',
      );
    }

    const { error: setsError } = await request.db.from('strength_sets').insert(
      body.sets.map((set) => ({
        session_id: (session as { id: string }).id,
        user_id: request.user.id,
        exercise: set.exercise,
        category: set.category,
        set_number: set.set_number,
        reps: set.reps ?? null,
        weight_kg: set.weight_kg ?? null,
        active_seconds: set.active_seconds,
        calories: set.calories,
        ...(set.logged_at ? { logged_at: set.logged_at } : {}),
      })),
    );

    if (setsError) {
      // A session with no sets is worse than no session: it would count
      // towards the rolling average while explaining nothing.
      await request.db.from('strength_sessions').delete().eq('id', (session as { id: string }).id);
      throw new HttpError(
        500,
        `Could not save that session's sets: ${setsError.message}`,
        'strength_write_failed',
      );
    }

    // The day's "Burned" figure, the Progress tab and the calorie budget all
    // read exercise_logs, so the session lands there too. The detail tables
    // are what is behind this row, not a replacement for it.
    const { data: log, error: logError } = await request.db
      .from('exercise_logs')
      .insert({
        user_id: request.user.id,
        name: 'Strength session',
        kind: 'strength',
        duration_min: Math.max(1, Math.round(body.total_seconds / 60)),
        calories_burned: totalKcal,
        notes: `${body.sets.length} sets · ${Math.round(body.active_seconds / 60)} min working`,
        source: 'manual',
      })
      .select('*')
      .single();

    if (logError) {
      throw new HttpError(
        500,
        `Saved the session but could not log it: ${logError.message}`,
        'exercise_write_failed',
      );
    }

    return reply.code(201).send({ session, exercise_log: log });
  });

  app.delete('/api/strength/sessions/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    // The sets go with it: the foreign key cascades.
    const { error } = await request.db
      .from('strength_sessions')
      .delete()
      .eq('user_id', request.user.id)
      .eq('id', id);

    assertTableExists(error, 'Strength sessions');
    if (error) {
      throw new HttpError(
        500,
        `Could not delete that session: ${error.message}`,
        'strength_delete_failed',
      );
    }

    return reply.code(204).send();
  });
}
