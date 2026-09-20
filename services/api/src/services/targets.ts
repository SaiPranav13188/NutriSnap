import { calculateTargetsFromProfile, type Profile } from '@nutrisnap/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from '../auth.js';

export interface StoredTarget {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  bmr: number | null;
  tdee: number | null;
  source: string;
  effective_date: string;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Recompute a user's targets from their current profile and store them under
 * today's date. Called after onboarding and any time body stats or goal
 * change — the plan's "recalculate whenever weight/goal changes" rule.
 */
export async function recomputeAndStoreTargets(
  db: SupabaseClient,
  userId: string,
  profile?: Profile,
): Promise<StoredTarget> {
  let row = profile;

  if (!row) {
    const { data, error } = await db.from('profiles').select('*').eq('id', userId).single();
    if (error || !data) {
      throw new HttpError(404, 'Profile not found.', 'profile_not_found');
    }
    row = data as Profile;
  }

  const targets = calculateTargetsFromProfile(row);
  if (!targets) {
    throw new HttpError(
      400,
      'Your profile is missing the details we need to calculate targets. Finish onboarding first.',
      'profile_incomplete',
    );
  }

  const record = {
    user_id: userId,
    calories: targets.calories,
    protein_g: targets.protein_g,
    carbs_g: targets.carbs_g,
    fat_g: targets.fat_g,
    bmr: targets.bmr,
    tdee: targets.tdee,
    source: 'formula',
    effective_date: today(),
  };

  const { data, error } = await db
    .from('daily_targets')
    .upsert(record, { onConflict: 'user_id,effective_date' })
    .select('calories, protein_g, carbs_g, fat_g, bmr, tdee, source, effective_date')
    .single();

  if (error) {
    throw new HttpError(500, `Could not save your targets: ${error.message}`, 'targets_write_failed');
  }

  return data as StoredTarget;
}

/** The target in force today — the most recent row at or before today. */
export async function getCurrentTargets(
  db: SupabaseClient,
  userId: string,
): Promise<StoredTarget | null> {
  const { data, error } = await db
    .from('daily_targets')
    .select('calories, protein_g, carbs_g, fat_g, bmr, tdee, source, effective_date')
    .eq('user_id', userId)
    .lte('effective_date', today())
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, `Could not read your targets: ${error.message}`, 'targets_read_failed');
  }

  return (data as StoredTarget | null) ?? null;
}

/**
 * Read targets, computing them on the fly if the user has a complete profile
 * but no stored row yet (e.g. they onboarded before this table existed).
 */
export async function getOrCreateTargets(
  db: SupabaseClient,
  userId: string,
): Promise<StoredTarget | null> {
  const existing = await getCurrentTargets(db, userId);
  if (existing) return existing;

  try {
    return await recomputeAndStoreTargets(db, userId);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'profile_incomplete') return null;
    throw error;
  }
}
