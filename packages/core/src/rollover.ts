/**
 * Carrying unspent calories into the next day.
 *
 * A day finished under target leaves calories on the table. This lets the user
 * move them forward, but only by choosing to — nothing rolls over on its own,
 * because a target that silently grows overnight stops being a target.
 */

import { fromDateKey, toDateKey } from './calendar.js';

/**
 * The most that can be carried, whatever the shortfall.
 *
 * Eating 1200 under on Monday and being handed all of it on Tuesday is not a
 * plan, it is a binge with permission. The cap keeps the feature useful for
 * the ordinary case — finishing a couple of hundred short — without turning a
 * bad day into a worse one.
 */
export const ROLLOVER_CAP_KCAL = 500;

/**
 * The smallest amount worth moving. Below this the gesture costs more
 * attention than the calories are worth.
 */
export const ROLLOVER_MIN_KCAL = 25;

export interface RolloverQuote {
  /** Calories left unspent on the source day, never negative. */
  unspent: number;
  /** What would actually move, after the cap. */
  amount: number;
  /** False when there is too little to bother with, or nothing left. */
  eligible: boolean;
  /** True when the shortfall was larger than the cap allows. */
  capped: boolean;
}

/**
 * How much of a day's shortfall can move to the next day.
 *
 * Going over target yields nothing: there is no borrowing against tomorrow,
 * only lending to it. Making the debt direction work as well would need a very
 * different conversation about what the app is encouraging.
 */
export function quoteRollover(params: {
  consumed: number;
  target: number;
  cap?: number;
}): RolloverQuote {
  const { consumed, target, cap = ROLLOVER_CAP_KCAL } = params;

  if (!Number.isFinite(consumed) || !Number.isFinite(target) || target <= 0) {
    return { unspent: 0, amount: 0, eligible: false, capped: false };
  }

  const unspent = Math.max(0, Math.round(target - consumed));
  const amount = Math.min(unspent, cap);

  return {
    unspent,
    amount,
    eligible: amount >= ROLLOVER_MIN_KCAL,
    capped: unspent > cap,
  };
}

/** The day a rollover lands on: always the one after the source. */
export function rolloverTargetDate(fromDate: string): string {
  const d = fromDateKey(fromDate);
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
}

/**
 * Whether a day's leftovers may still be pushed.
 *
 * A future day has not happened, so it has no leftovers, and a day already
 * pushed cannot be pushed again — the database enforces that too, but saying
 * so here means the button can be disabled rather than failing on tap.
 */
export function canPushRollover(params: {
  date: string;
  alreadyPushed: boolean;
  quote: RolloverQuote;
  today?: string;
}): boolean {
  const { date, alreadyPushed, quote, today = toDateKey(new Date()) } = params;
  if (alreadyPushed) return false;
  if (date > today) return false;
  return quote.eligible;
}

/** The line under the button, explaining what will happen or why it will not. */
export function describeRollover(params: {
  date: string;
  alreadyPushed: boolean;
  pushedAmount?: number;
  quote: RolloverQuote;
  today?: string;
}): string {
  const { date, alreadyPushed, pushedAmount, quote, today = toDateKey(new Date()) } = params;

  if (alreadyPushed) {
    return pushedAmount
      ? `${pushedAmount} kcal moved to the next day.`
      : 'Already moved to the next day.';
  }

  if (date > today) return 'This day has not happened yet.';
  if (quote.unspent <= 0) return 'Nothing left over on this day.';
  if (!quote.eligible) return `Only ${quote.unspent} kcal left — too little to carry.`;
  if (quote.capped) return `${quote.unspent} kcal left. Up to ${quote.amount} can carry over.`;

  return `${quote.amount} kcal can carry into the next day.`;
}
