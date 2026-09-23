import { z } from 'zod';
import { dayWindow } from '@nutrisnap/core';

export { dayWindow };

/**
 * A day, as the person living it means it.
 *
 * Every day-bucketed table carries a `logged_on` column generated as
 * `(logged_at at time zone 'UTC')::date`, and for a long time the reads
 * filtered on it. That is only correct for users sitting on UTC. Everyone
 * else has a window each day where their clock and the column disagree about
 * what day it is — five and a half hours of it in India, where a walk logged
 * at half past midnight was stored under the previous day and then looked for
 * under the current one. It saved correctly and vanished.
 *
 * So day-scoped reads take the caller's offset and filter on the instant
 * instead: from local midnight to local midnight, converted to UTC. The
 * column stays as it is — it still backs the indexes and the weekly rollups —
 * but nothing that has to agree with a person's own calendar depends on it.
 */
export const dayQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /**
   * Minutes east of UTC, as the client's own clock reports it: India is +330,
   * New York is -300. Absent, everything falls back to UTC, which is what the
   * behaviour was before and is right for a caller that does not say.
   */
  tz_offset: z.coerce.number().int().min(-840).max(840).optional(),
});

/**
 * Just the offset, for a request that is not scoped to one day but still has
 * to agree with the caller's calendar.
 *
 * The streak is the case this exists for. It is not a day-scoped read — it
 * walks the whole history — but it counts *consecutive days*, so it cannot be
 * computed without knowing where the caller's days begin and end. Bucketing
 * it in UTC gave anyone east of UTC a streak one short of what they had
 * actually done, because a meal logged before their offset had elapsed landed
 * on the previous UTC day and left today looking empty.
 *
 * Unknown query keys are stripped rather than rejected, so this can be
 * parsed off a query string that carries other things too.
 */
export const tzQuery = z.object({
  tz_offset: z.coerce.number().int().min(-840).max(840).optional(),
});

/** The offset a request carries, or UTC if it does not say. */
export function tzOffsetOf(query: unknown): number {
  return tzQuery.parse(query ?? {}).tz_offset ?? 0;
}
