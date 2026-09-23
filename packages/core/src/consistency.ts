/**
 * How reliably someone is actually logging.
 *
 * A streak answers "did you log yesterday" and nothing else. It is a good
 * nudge and a bad summary: it resets to zero on a single missed day, which
 * makes someone who logs six days a week for a month look identical to
 * someone who has never logged at all.
 *
 * This sits alongside it and answers the question the adaptive engine
 * actually cares about — across a window, how much of it do we have — because
 * that is what decides whether the app knows enough to change anybody's
 * target.
 */

import { MIN_LOGGING_COMPLETENESS } from './adaptive.js';

export interface DayLogCount {
  /** YYYY-MM-DD. */
  day: string;
  log_count: number;
}

export interface Consistency {
  /** Days in the window with at least one meal on them. */
  daysLogged: number;
  /** Days the window spans. */
  windowDays: number;
  /** 0..1. */
  completeness: number;
  /**
   * Whether this is enough history for the adaptive engine to act on.
   *
   * Read from the same constant the engine refuses on, so the card cannot
   * promise an adjustment the recompute will then decline to make.
   */
  enoughToAdapt: boolean;
  /** One line for the card. */
  summary: string;
}

/** How many of the last `windowDays` were logged. */
export function consistency(days: readonly DayLogCount[], windowDays = 30): Consistency {
  const window = Math.max(1, Math.round(windowDays));

  // The caller may hand over more history than the window asks about; the
  // rows arrive oldest first, so the tail is the recent end.
  const recent = days.slice(-window);
  const daysLogged = recent.filter((day) => (day.log_count ?? 0) > 0).length;
  const completeness = daysLogged / window;

  return {
    daysLogged,
    windowDays: window,
    completeness,
    enoughToAdapt: completeness >= MIN_LOGGING_COMPLETENESS,
    summary: summarise(daysLogged, window, completeness),
  };
}

function summarise(daysLogged: number, window: number, completeness: number): string {
  if (daysLogged === 0) return `Nothing logged in the last ${window} days.`;

  const of = `${daysLogged} of the last ${window} days`;

  if (completeness >= 0.9) return `Logged ${of}. That is about as complete as it gets.`;
  if (completeness >= MIN_LOGGING_COMPLETENESS) {
    return `Logged ${of} — enough for your target to be adjusted from real data.`;
  }
  return `Logged ${of}. Above ${Math.round(MIN_LOGGING_COMPLETENESS * 100)}% your target can start adapting to you.`;
}
