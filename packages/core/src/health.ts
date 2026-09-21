/**
 * Micronutrient targets and the daily health score.
 *
 * Fibre, sugar and sodium are already counted on every log, but nothing ever
 * set a number to judge them against, so they could be displayed and never
 * scored. These targets are derived from the calorie goal rather than stored,
 * because they move with it — a 3000 kcal day needs more fibre than a 1500
 * kcal one, and re-deriving keeps them correct after a plan change without a
 * migration.
 *
 * The constants are public guidance, not invention:
 *   - Fibre: 14 g per 1000 kcal (US Dietary Guidelines for Americans).
 *   - Sugar: under 10% of energy (WHO strong recommendation), at 4 kcal/g.
 *   - Sodium: 2300 mg, the FDA Daily Value and the WHO upper limit alike.
 */

import type { DailyTarget, MacroTotals } from './types.js';

const FIBER_G_PER_1000_KCAL = 14;
const SUGAR_SHARE_OF_ENERGY = 0.1;
const KCAL_PER_G_SUGAR = 4;
const SODIUM_MG_LIMIT = 2300;

export interface MicroTargets {
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

/** Fibre, sugar and sodium goals for a given calorie target. */
export function microTargets(calories: number): MicroTargets {
  const safe = Number.isFinite(calories) && calories > 0 ? calories : 0;
  return {
    fiber_g: Math.round((safe / 1000) * FIBER_G_PER_1000_KCAL),
    sugar_g: Math.round((safe * SUGAR_SHARE_OF_ENERGY) / KCAL_PER_G_SUGAR),
    sodium_mg: SODIUM_MG_LIMIT,
  };
}

export type HealthComponentKey =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'sugar'
  | 'sodium';

export type HealthStatus = 'low' | 'on_track' | 'high';

export interface HealthComponent {
  key: HealthComponentKey;
  label: string;
  status: HealthStatus;
  /** 0..1, how well this one nutrient scored. */
  score: number;
}

export interface HealthScore {
  /** 0..10, the number shown to the user. */
  score: number;
  components: HealthComponent[];
  /** One sentence naming what is on track and what is not. */
  summary: string;
}

/**
 * Calories and protein carry double weight. Missing a protein goal costs
 * muscle in a way that being a few grams off on fat does not, so an average
 * that treats all seven equally would understate the things that matter.
 */
const WEIGHTS: Record<HealthComponentKey, number> = {
  calories: 2,
  protein: 2,
  carbs: 1,
  fat: 1,
  fiber: 1,
  sugar: 1,
  sodium: 1,
};

const LABELS: Record<HealthComponentKey, string> = {
  calories: 'calories',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  fiber: 'fiber',
  sugar: 'sugar',
  sodium: 'sodium',
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * A nutrient you are aiming to hit. A 10% band either side counts as on
 * track; under and over both cost, but under is scored gently because a day
 * in progress is under by definition.
 */
function scoreTarget(consumed: number, target: number): { score: number; status: HealthStatus } {
  if (target <= 0) return { score: 0, status: 'low' };

  const ratio = consumed / target;
  if (ratio < 0.9) return { score: clamp01(ratio / 0.9), status: 'low' };
  if (ratio <= 1.1) return { score: 1, status: 'on_track' };
  return { score: clamp01(1 - (ratio - 1.1) / 0.5), status: 'high' };
}

/**
 * A nutrient you are aiming to stay under, where there is no such thing as
 * too little — so it never reports 'low'.
 */
function scoreLimit(consumed: number, limit: number): { score: number; status: HealthStatus } {
  if (limit <= 0) return { score: 1, status: 'on_track' };

  const ratio = consumed / limit;
  if (ratio <= 1) return { score: 1, status: 'on_track' };
  return { score: clamp01(1 - (ratio - 1) / 0.5), status: 'high' };
}

function joinLabels(items: HealthComponent[]): string {
  const labels = items.map((item) => item.label);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function capitalise(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function buildSummary(components: HealthComponent[]): string {
  const onTrack = components.filter((c) => c.status === 'on_track');
  const low = components.filter((c) => c.status === 'low');
  const high = components.filter((c) => c.status === 'high');

  const parts: string[] = [];
  if (onTrack.length > 0) {
    parts.push(capitalise(`${joinLabels(onTrack)} ${onTrack.length === 1 ? 'is' : 'are'} on track.`));
  }
  if (low.length > 0) parts.push(`You're low on ${joinLabels(low)}.`);
  if (high.length > 0) parts.push(`You're over on ${joinLabels(high)}.`);

  return parts.join(' ');
}

/**
 * Score the day out of 10.
 *
 * An empty day scores zero rather than the seven-or-so out of ten the raw
 * arithmetic would give it: sugar and sodium are limits, and a day with no
 * food trivially satisfies both. Rewarding that would tell the user their best
 * move is to eat nothing.
 */
export function healthScore(totals: MacroTotals, targets: DailyTarget | null): HealthScore {
  if (!targets) {
    return { score: 0, components: [], summary: 'Finish your plan to see a score.' };
  }

  const micro = microTargets(targets.calories);

  const scored: Array<{ key: HealthComponentKey } & ReturnType<typeof scoreTarget>> = [
    { key: 'calories', ...scoreTarget(totals.calories, targets.calories) },
    { key: 'protein', ...scoreTarget(totals.protein_g, targets.protein_g) },
    { key: 'carbs', ...scoreTarget(totals.carbs_g, targets.carbs_g) },
    { key: 'fat', ...scoreTarget(totals.fat_g, targets.fat_g) },
    { key: 'fiber', ...scoreTarget(totals.fiber_g, micro.fiber_g) },
    { key: 'sugar', ...scoreLimit(totals.sugar_g, micro.sugar_g) },
    { key: 'sodium', ...scoreLimit(totals.sodium_mg, micro.sodium_mg) },
  ];

  const components: HealthComponent[] = scored.map((entry) => ({
    key: entry.key,
    label: LABELS[entry.key],
    status: entry.status,
    score: entry.score,
  }));

  if (totals.calories <= 0) {
    return { score: 0, components, summary: 'Nothing logged yet today.' };
  }

  const totalWeight = components.reduce((sum, c) => sum + WEIGHTS[c.key], 0);
  const weighted = components.reduce((sum, c) => sum + c.score * WEIGHTS[c.key], 0);

  return {
    score: Math.round((weighted / totalWeight) * 10),
    components,
    summary: buildSummary(components),
  };
}
