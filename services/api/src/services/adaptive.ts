import {
  MIN_DAYS_FOR_ADAPTATION,
  calculateTargetsFromProfile,
  computeAdaptiveTarget,
  type AdaptiveResult,
  type Profile,
} from '@nutrisnap/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from '../auth.js';
import { supabaseAdmin } from '../supabase.js';
import { getOrCreateTargets } from './targets.js';

/**
 * Running the adaptive engine against a user's own history.
 *
 * `computeAdaptiveTarget` has existed in core, tested, since the plan was
 * written, and nothing ever called it — so every user has been living on a
 * Mifflin-St Jeor estimate built from population averages, with a fortnight
 * of their own measured intake and weight sitting unused on disk beside it.
 * This is the wiring.
 *
 * The decision is entirely core's. Everything here is fetching what it needs
 * and writing down what it said, because a rule about when it is safe to move
 * somebody's calorie target belongs somewhere it can be unit tested, not in a
 * route handler.
 */

/** How much history to hand the engine. It refuses on less than a fortnight. */
const WINDOW_DAYS = 28;

export interface AdaptiveOutcome extends AdaptiveResult {
  /** Whether a new target row was actually written. */
  applied: boolean;
  daysAnalyzed: number;
}

/**
 * Work out whether the user's target should move, and move it if so.
 *
 * `apply` false runs the whole thing and reports what would happen without
 * writing — what the "why did my target change" screen calls to show someone
 * where they stand before anything is decided on their behalf.
 */
export async function runAdaptiveRecompute(
  db: SupabaseClient,
  userId: string,
  options: { apply: boolean },
): Promise<AdaptiveOutcome> {
  const { data: profileRow, error: profileError } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError || !profileRow) {
    throw new HttpError(404, 'Profile not found.', 'profile_not_found');
  }

  const profile = profileRow as Profile;
  const formula = calculateTargetsFromProfile(profile);

  if (!formula) {
    throw new HttpError(
      400,
      'Finish the quiz first — adapting your target needs your body stats.',
      'profile_incomplete',
    );
  }

  const current = await getOrCreateTargets(db, userId);
  if (!current) {
    throw new HttpError(404, 'No targets yet — finish onboarding first.', 'targets_not_found');
  }

  const from = new Date();
  from.setDate(from.getDate() - (WINDOW_DAYS - 1));
  const fromKey = from.toISOString().slice(0, 10);
  const toKey = new Date().toISOString().slice(0, 10);

  const [{ data: dayRows }, { data: weightRows }] = await Promise.all([
    db.rpc('nutrition_totals_by_day', { p_user: userId, p_from: fromKey, p_to: toKey }),
    db
      .from('weight_logs')
      .select('weight_kg, logged_on')
      .eq('user_id', userId)
      .gte('logged_on', fromKey)
      .order('logged_on', { ascending: true }),
  ]);

  /**
   * Days with no food on them are left out rather than passed as zero.
   *
   * The engine averages what it is given, so a zero would be read as a day of
   * fasting and drag the estimated intake down — which is the one error that
   * would make it cut an already-low target.
   */
  const dailyIntakes = (dayRows ?? [])
    .filter((row: { log_count?: number }) => Number(row.log_count ?? 0) > 0)
    .map((row: { calories?: number }) => Number(row.calories ?? 0));

  const weights = (weightRows ?? []) as Array<{ weight_kg: number; logged_on: string }>;

  if (weights.length < 2) {
    return {
      ...unchangedFrom(current.calories, profile),
      reason: 'Two weigh-ins at least a fortnight apart are needed before your target can adapt.',
      applied: false,
      daysAnalyzed: 0,
    };
  }

  const first = weights[0]!;
  const last = weights[weights.length - 1]!;

  // The span the weights actually cover, not the window asked for: two
  // weigh-ins three days apart say nothing about a month.
  const daysElapsed = Math.round(
    (new Date(last.logged_on).getTime() - new Date(first.logged_on).getTime()) / 86_400_000,
  );

  const result = computeAdaptiveTarget({
    dailyIntakes,
    daysElapsed,
    weightStartKg: Number(first.weight_kg),
    weightEndKg: Number(last.weight_kg),
    currentTargetCalories: Number(current.calories),
    formulaTdee: formula.tdee,
    gender: profile.gender ?? 'other',
    goal: profile.goal ?? 'maintain',
    rateKgPerWeek: Number(profile.rate_kg_per_week ?? 0.5),
    weightKg: Number(profile.current_weight_kg ?? last.weight_kg),
    trainingFocus: profile.training_focus,
  });

  if (!result.shouldAdjust || !options.apply) {
    return { ...result, applied: false, daysAnalyzed: daysElapsed };
  }

  const effectiveDate = toKey;

  const { error: targetError } = await db.from('daily_targets').upsert(
    {
      user_id: userId,
      calories: result.newCalories,
      protein_g: result.protein_g,
      carbs_g: result.carbs_g,
      fat_g: result.fat_g,
      bmr: formula.bmr,
      // The measured figure replaces the formula's guess, which is the whole
      // point of having run this.
      tdee: result.estimatedTdee ?? formula.tdee,
      source: 'adaptive',
      effective_date: effectiveDate,
    },
    { onConflict: 'user_id,effective_date' },
  );

  if (targetError) {
    throw new HttpError(
      500,
      `Could not save your adapted target: ${targetError.message}`,
      'targets_write_failed',
    );
  }

  /**
   * The audit row goes through the service role because the table is
   * deliberately read-only to its owner: a record of why somebody's target
   * moved is worth nothing if the person it describes can rewrite it.
   */
  const { error: auditError } = await supabaseAdmin.from('target_adjustments').insert({
    user_id: userId,
    previous_calories: result.previousCalories,
    new_calories: result.newCalories,
    estimated_tdee: result.estimatedTdee,
    reason: result.reason,
    days_analyzed: daysElapsed,
  });

  // The target moved; failing the request over the paper trail would leave
  // the user with a changed number and an error message.
  if (auditError) {
    return { ...result, applied: true, daysAnalyzed: daysElapsed };
  }

  return { ...result, applied: true, daysAnalyzed: daysElapsed };
}

/** The shape core returns when it declines, without re-running the macros. */
function unchangedFrom(calories: number, profile: Profile): AdaptiveResult {
  const formula = calculateTargetsFromProfile(profile);
  return {
    shouldAdjust: false,
    reason: `Needs at least ${MIN_DAYS_FOR_ADAPTATION} days of history.`,
    estimatedTdee: null,
    previousCalories: calories,
    newCalories: calories,
    protein_g: formula?.protein_g ?? 0,
    carbs_g: formula?.carbs_g ?? 0,
    fat_g: formula?.fat_g ?? 0,
  };
}
