import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ROLLOVER_MIN_KCAL,
  quoteRollover,
  rolloverTargetDate,
  sumTotals,
  type FoodLog,
} from '@nutrisnap/core';
import { requireAuth, HttpError } from '../auth.js';
import { assertTableExists } from '../db-errors.js';
import { getOrCreateTargets } from '../services/targets.js';

/**
 * Pushing a day's unspent calories into the next day.
 *
 * The amount is computed here, from the day's own rows, rather than taken from
 * the request. A client-supplied figure would be a number the user could set
 * to anything they liked.
 */

const dateParam = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function dayBounds(date: string): { from: string; to: string } {
  return {
    from: new Date(`${date}T00:00:00.000Z`).toISOString(),
    to: new Date(`${date}T23:59:59.999Z`).toISOString(),
  };
}

const todayKey = (): string => new Date().toISOString().slice(0, 10);

export async function rolloverRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /**
   * Move a day's leftovers forward.
   *
   * The unique constraint on (user_id, from_date) is what actually prevents a
   * double push; the check below is only so the common case returns a sentence
   * rather than a constraint violation.
   */
  app.post('/api/rollover', async (request, reply) => {
    const { date } = dateParam.parse(request.body);

    if (date > todayKey()) {
      throw new HttpError(
        400,
        'That day has not happened yet.',
        'rollover_future_day',
      );
    }

    const { from, to } = dayBounds(date);

    const { data: logRows, error: logError } = await request.db
      .from('food_logs')
      .select('*')
      .eq('user_id', request.user.id)
      .gte('logged_at', from)
      .lte('logged_at', to);

    if (logError) {
      throw new HttpError(500, `Could not read that day: ${logError.message}`, 'logs_read_failed');
    }

    const targets = await getOrCreateTargets(request.db, request.user.id);
    if (!targets) {
      throw new HttpError(400, 'Finish onboarding to set a target first.', 'no_targets');
    }

    const totals = sumTotals((logRows ?? []) as FoodLog[]);
    const quote = quoteRollover({ consumed: totals.calories, target: targets.calories });

    if (!quote.eligible) {
      throw new HttpError(
        400,
        quote.unspent > 0
          ? `Only ${quote.unspent} kcal left over — under the ${ROLLOVER_MIN_KCAL} kcal minimum.`
          : 'Nothing left over on that day.',
        'rollover_not_eligible',
      );
    }

    const { data, error } = await request.db
      .from('calorie_rollovers')
      .insert({
        user_id: request.user.id,
        from_date: date,
        to_date: rolloverTargetDate(date),
        amount_kcal: quote.amount,
      })
      .select('*')
      .single();

    assertTableExists(error, 'Calorie rollover');

    // 23505 is unique_violation: this day has already been pushed.
    if (error?.code === '23505') {
      throw new HttpError(
        409,
        'That day has already been carried over.',
        'rollover_already_done',
      );
    }

    if (error || !data) {
      throw new HttpError(
        500,
        `Could not carry those calories over: ${error?.message}`,
        'rollover_write_failed',
      );
    }

    return reply.code(201).send({ rollover: data });
  });

  /** Undo a push, so a tap is never a one-way door. */
  app.delete('/api/rollover/:date', async (request, reply) => {
    const { date } = dateParam.parse(request.params);

    const { data, error } = await request.db
      .from('calorie_rollovers')
      .delete()
      .eq('user_id', request.user.id)
      .eq('from_date', date)
      .select('id');

    assertTableExists(error, 'Calorie rollover');
    if (error) {
      throw new HttpError(500, `Could not undo that: ${error.message}`, 'rollover_delete_failed');
    }
    if (!data || data.length === 0) {
      throw new HttpError(404, 'Nothing to undo for that day.', 'rollover_not_found');
    }

    return reply.code(204).send();
  });
}
