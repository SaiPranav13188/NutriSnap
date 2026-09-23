/**
 * What colour a day's ring is, and why.
 *
 * The calendar strip used to answer one question — did you reach the target,
 * yes or no — and paint the answer green or red. That reads badly for the
 * thing people actually want to know, because it puts a day 40 kcal over and
 * a day 900 kcal over in the same bucket, and calls a day still in progress a
 * failure at ten in the morning.
 *
 * So the states are graded, and the thresholds live here rather than in the
 * strip. The explainer screen reads the same table the strip colours from,
 * which is the point: a legend that is written by hand is a legend that is
 * eventually wrong.
 */

/** Within this much of the target, either side, counts as hitting it. */
export const ON_TARGET_KCAL = 100;

/** From this much over, the day is worth flagging. */
export const CLOSE_OVER_KCAL = 100;

/** From this much over, it is not a near miss any more. */
export const OVER_KCAL = 200;

export type RingState =
  /** Nothing logged, so there is nothing to judge. */
  | 'empty'
  /** Logged, but still well short — a day in progress looks like this. */
  | 'under'
  /** Within `ON_TARGET_KCAL` of the goal. */
  | 'onTarget'
  /** Over, but by less than `OVER_KCAL`. */
  | 'close'
  /** Over by `OVER_KCAL` or more. */
  | 'over';

/**
 * Grade a day.
 *
 * `hasLogs` is passed separately rather than inferred from the calories,
 * because a logged day can legitimately total zero — a black coffee is a log.
 * Inferring it would draw that day as untouched.
 */
export function ringState(params: {
  consumed: number;
  target: number;
  hasLogs: boolean;
}): RingState {
  const { hasLogs } = params;
  const consumed = Number.isFinite(params.consumed) ? params.consumed : 0;
  const target = Number.isFinite(params.target) ? params.target : 0;

  if (!hasLogs) return 'empty';
  // No target to measure against: the ring can still show what was eaten, but
  // it cannot claim the day went well or badly.
  if (target <= 0) return 'under';

  const over = consumed - target;

  if (over >= OVER_KCAL) return 'over';
  if (over >= CLOSE_OVER_KCAL) return 'close';
  if (consumed >= target - ON_TARGET_KCAL) return 'onTarget';
  return 'under';
}

export interface RingLegendEntry {
  state: RingState;
  title: string;
  detail: string;
}

/**
 * The legend, in the order it should be read.
 *
 * `under` is in here even though it is the quiet state, because leaving it out
 * would mean the screen explains four of the five things the strip can draw
 * and silently omits the one a half-finished day shows — which is the state
 * most people will be looking at when they open the explainer.
 */
export const RING_LEGEND: readonly RingLegendEntry[] = [
  {
    state: 'onTarget',
    title: 'Green',
    detail: `On target — within ${ON_TARGET_KCAL} calories of your goal`,
  },
  {
    state: 'close',
    title: 'Yellow',
    detail: `${CLOSE_OVER_KCAL}–${OVER_KCAL - 1} calories over your goal`,
  },
  {
    state: 'over',
    title: 'Red',
    detail: `${OVER_KCAL}+ calories over your goal`,
  },
  {
    state: 'under',
    title: 'Grey',
    detail: `More than ${ON_TARGET_KCAL} calories short — a day still in progress looks like this`,
  },
  {
    state: 'empty',
    title: 'Dotted',
    detail: 'No meals logged that day',
  },
];

/** A day whose ring is worth celebrating. */
export function isRingComplete(state: RingState): boolean {
  return state === 'onTarget';
}
