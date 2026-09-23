/**
 * Strength sessions: what a set costs, and what a session adds up to.
 *
 * A strength workout is mostly standing still. Timing a session end to end
 * and running the usual MET formula over it would count the rest as work and
 * roughly treble the figure, so the arithmetic here only ever sees the
 * seconds a set was actually being performed.
 */

import { formatNumber } from './units.js';

/** The categories a movement can fall into for the purposes of the MET table. */
export type SetCategory = 'strength' | 'circuit' | 'bodyweight' | 'cardio';

/**
 * Metabolic equivalents per category.
 *
 * Deliberately a plain lookup rather than a switch, so retuning it is a data
 * change: swap a number, or pass a table of your own to `caloriesForSet`.
 * The values are the Compendium's, for resistance training, circuit work,
 * calisthenics and general cardio-machine effort respectively.
 */
export const SET_MET: Readonly<Record<SetCategory, number>> = {
  strength: 5.0,
  circuit: 8.0,
  bodyweight: 4.5,
  cardio: 7.0,
};

export const SET_CATEGORIES: ReadonlyArray<{
  value: SetCategory;
  label: string;
  /** Whether a load is worth asking for. */
  loaded: boolean;
}> = [
  { value: 'strength', label: 'Strength', loaded: true },
  { value: 'circuit', label: 'Circuit', loaded: false },
  { value: 'bodyweight', label: 'Bodyweight', loaded: false },
  { value: 'cardio', label: 'Cardio', loaded: false },
];

/** Assumed when the profile carries no body weight, as elsewhere in the app. */
const DEFAULT_BODY_WEIGHT_KG = 70;

export function metForCategory(
  category: SetCategory,
  table: Readonly<Record<SetCategory, number>> = SET_MET,
): number {
  return table[category] ?? SET_MET.strength;
}

/**
 * What one set burned.
 *
 * The weight in the formula is the body being moved, not the load on the bar:
 * a MET is a multiple of that person's resting metabolism. So a bodyweight
 * movement needs no load entered and is not penalised for lacking one — the
 * category carries the intensity, which is the whole point of requirement
 * eight.
 */
export function caloriesForSet(params: {
  category: SetCategory;
  activeSeconds: number;
  bodyWeightKg: number | null;
  metTable?: Readonly<Record<SetCategory, number>>;
}): number {
  const { category, activeSeconds, bodyWeightKg, metTable } = params;
  if (!(activeSeconds > 0)) return 0;

  const kg = bodyWeightKg && bodyWeightKg > 0 ? bodyWeightKg : DEFAULT_BODY_WEIGHT_KG;
  const met = metForCategory(category, metTable);

  return (met * kg * activeSeconds) / 3600;
}

export interface LoggedSet {
  exercise: string;
  category: SetCategory;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  activeSeconds: number;
  calories: number;
}

export interface ExerciseBreakdown {
  exercise: string;
  sets: number;
  activeSeconds: number;
  calories: number;
  /** Fraction of the session's calories, 0 to 1. */
  share: number;
}

/**
 * Which exercise did the most work, and how the rest compare.
 *
 * Sorted by contribution rather than by the order they were performed: the
 * question the summary answers is "what did this session actually consist
 * of", and the biggest contributor is the headline.
 */
export function breakdownByExercise(sets: readonly LoggedSet[]): ExerciseBreakdown[] {
  const total = sets.reduce((sum, set) => sum + set.calories, 0);
  const byName = new Map<string, ExerciseBreakdown>();

  for (const set of sets) {
    const existing = byName.get(set.exercise) ?? {
      exercise: set.exercise,
      sets: 0,
      activeSeconds: 0,
      calories: 0,
      share: 0,
    };

    existing.sets += 1;
    existing.activeSeconds += set.activeSeconds;
    existing.calories += set.calories;
    byName.set(set.exercise, existing);
  }

  const rows = [...byName.values()];
  for (const row of rows) row.share = total > 0 ? row.calories / total : 0;

  return rows.sort((a, b) => b.calories - a.calories);
}

export interface SessionComparison {
  /** Mean kcal over the sessions compared against; null when there are none. */
  average: number | null;
  /** This session minus that mean. */
  delta: number | null;
  /** The delta as a fraction of the mean, for a percentage. */
  deltaRatio: number | null;
  /** How many past sessions the mean was taken over. */
  sampleSize: number;
}

/** How many past sessions the summary card measures against. */
export const ROLLING_SESSIONS = 5;

/**
 * This session against the recent past.
 *
 * `previous` is expected newest first and may be shorter than the window —
 * a second-ever session compares against one, and a first compares against
 * nothing, which the card has to say rather than implying a 100% improvement
 * over zero.
 */
export function compareWithRecent(
  kcal: number,
  previous: readonly number[],
  window = ROLLING_SESSIONS,
): SessionComparison {
  const sample = previous.slice(0, window);
  if (sample.length === 0) {
    return { average: null, delta: null, deltaRatio: null, sampleSize: 0 };
  }

  const average = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const delta = kcal - average;

  return {
    average,
    delta,
    deltaRatio: average > 0 ? delta / average : null,
    sampleSize: sample.length,
  };
}

/** "218 kcal · 12 sets · 24 min", for the summary card's subtitle. */
export function describeSession(params: {
  kcal: number;
  sets: number;
  totalSeconds: number;
}): string {
  const minutes = Math.max(1, Math.round(params.totalSeconds / 60));
  return [
    `${formatNumber(Math.round(params.kcal))} kcal`,
    `${params.sets} set${params.sets === 1 ? '' : 's'}`,
    `${minutes} min`,
  ].join(' · ');
}
