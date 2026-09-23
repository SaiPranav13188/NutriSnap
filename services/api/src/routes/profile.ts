import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { answersToProfilePatch, isOnboardingComplete, type Profile } from '@nutrisnap/core';
import { requireAuth, HttpError } from '../auth.js';
import { env } from '../env.js';
import { supabaseAdmin } from '../supabase.js';
import { getOrCreateTargets, recomputeAndStoreTargets } from '../services/targets.js';
import { runAdaptiveRecompute } from '../services/adaptive.js';

const onboardingBody = z.object({
  gender: z.enum(['male', 'female', 'other']),
  goal: z.enum(['lose', 'maintain', 'gain']),
  date_of_birth: z.string(),
  height_cm: z.number().min(80).max(260),
  current_weight_kg: z.number().min(25).max(400),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'very_active', 'extreme']),
  workouts_per_week: z.enum(['0', '1-3', '4-6', '7+']).optional(),
  goal_weight_kg: z.number().min(25).max(400).optional(),
  rate_kg_per_week: z.number().min(0).max(1.5).optional(),
  target_date: z.string().nullable().optional(),
  focus_area: z.string().optional(),
  training_focus: z.enum(['strength', 'general_fitness', 'athlete', 'none']).optional(),
  dietary_preference: z.enum(['classic', 'vegetarian', 'vegan', 'pescatarian']).optional(),
  allergies: z.array(z.string()).optional(),
  units: z.enum(['metric', 'imperial']).optional(),
  referral_source: z.string().optional(),
  tried_other_apps: z.boolean().optional(),
  full_name: z.string().optional(),
});

const profilePatchBody = onboardingBody.partial().extend({
  onboarding_completed: z.boolean().optional(),
  /**
   * Bounds match the column's check constraint, so a bad value is refused
   * here with a readable message rather than by Postgres with a raw one.
   */
  daily_step_goal: z.number().int().min(1000).max(50000).optional(),
  /** Null clears the override and goes back to deriving it from weight. */
  water_goal_ml: z.number().int().min(500).max(6000).nullable().optional(),
});

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /** The signed-in user's profile, with today's targets attached. */
  app.get('/api/profile', async (request) => {
    const { data, error } = await request.db
      .from('profiles')
      .select('*')
      .eq('id', request.user.id)
      .single();

    if (error || !data) throw new HttpError(404, 'Profile not found.', 'profile_not_found');

    const targets = await getOrCreateTargets(request.db, request.user.id);
    return { profile: data as Profile, targets };
  });

  /**
   * Save the onboarding quiz and compute the user's first set of targets.
   * The quiz runs before signup, so the client holds the answers and posts
   * them here immediately after the account exists.
   */
  app.post('/api/onboarding/complete', async (request) => {
    const answers = onboardingBody.parse(request.body);

    if (!isOnboardingComplete(answers)) {
      throw new HttpError(
        400,
        'Some required answers are missing or inconsistent.',
        'onboarding_incomplete',
      );
    }

    const patch = {
      ...answersToProfilePatch(answers),
      ...(answers.full_name ? { full_name: answers.full_name } : {}),
    };

    const { data, error } = await request.db
      .from('profiles')
      .update(patch)
      .eq('id', request.user.id)
      .select('*')
      .single();

    if (error || !data) {
      throw new HttpError(500, `Could not save your answers: ${error?.message}`, 'profile_write_failed');
    }

    const targets = await recomputeAndStoreTargets(request.db, request.user.id, data as Profile);
    return { profile: data as Profile, targets };
  });

  /**
   * Edit body stats or goal. Any change here invalidates the stored targets,
   * so they are recomputed in the same request.
   */
  app.patch('/api/profile', async (request) => {
    const patch = profilePatchBody.parse(request.body);

    if (Object.keys(patch).length === 0) {
      throw new HttpError(400, 'Nothing to update.', 'empty_patch');
    }

    const { data, error } = await request.db
      .from('profiles')
      .update(patch)
      .eq('id', request.user.id)
      .select('*')
      .single();

    if (error || !data) {
      throw new HttpError(500, `Could not update your profile: ${error?.message}`, 'profile_write_failed');
    }

    const profile = data as Profile;
    const affectsTargets = [
      'gender',
      'date_of_birth',
      'height_cm',
      'current_weight_kg',
      'goal',
      'rate_kg_per_week',
      'activity_level',
      'training_focus',
    ].some((key) => key in patch);

    const targets = affectsTargets
      ? await recomputeAndStoreTargets(request.db, request.user.id, profile)
      : await getOrCreateTargets(request.db, request.user.id);

    return { profile, targets };
  });

  /** Current daily targets. */
  app.get('/api/targets', async (request) => {
    const targets = await getOrCreateTargets(request.db, request.user.id);
    if (!targets) {
      throw new HttpError(
        404,
        'No targets yet — finish onboarding first.',
        'targets_not_found',
      );
    }
    return { targets };
  });

  /** Force a recompute, e.g. from the settings screen. */
  app.post('/api/targets/calculate', async (request) => {
    const targets = await recomputeAndStoreTargets(request.db, request.user.id);
    return { targets };
  });

  /**
   * What the user's own data says their target should be.
   *
   * Read-only: it runs the engine and reports the verdict without moving
   * anything. The screen shows this before offering the button, because a
   * calorie target that changes on its own while someone is looking at it is
   * not a target, it is a surprise.
   */
  app.get('/api/targets/adaptive', async (request) => {
    const outcome = await runAdaptiveRecompute(request.db, request.user.id, { apply: false });
    return { adaptive: outcome };
  });

  /** Accept the adjustment above and write it. */
  app.post('/api/targets/adaptive', async (request) => {
    const outcome = await runAdaptiveRecompute(request.db, request.user.id, { apply: true });
    const targets = await getOrCreateTargets(request.db, request.user.id);
    return { adaptive: outcome, targets };
  });

  /** Every time the target has moved, and why. */
  app.get('/api/targets/adjustments', async (request) => {
    const { data, error } = await request.db
      .from('target_adjustments')
      .select('*')
      .eq('user_id', request.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new HttpError(
        500,
        `Could not load your target history: ${error.message}`,
        'adjustments_read_failed',
      );
    }

    return { adjustments: data ?? [] };
  });

  /**
   * Delete the account and everything behind it.
   *
   * Every app store that lets an app create an account requires one of these,
   * and more to the point, an app that will export your data but not destroy
   * it is only half honest about whose data it is.
   *
   * Order matters. The stored objects go first, because they are the only
   * part not covered by a foreign key: deleting the auth user cascades
   * through `profiles` and takes every row with it, and once that has
   * happened there is nothing left that knows which files were this user's.
   * A failure here therefore leaves the account intact and says so, rather
   * than half-deleting someone.
   */
  app.delete('/api/profile', async (request) => {
    const userId = request.user.id;

    const { confirm } = z
      .object({
        /**
         * The client sends the account's own email back. It is the one thing
         * a mis-routed or replayed request cannot know, and it makes an
         * accidental tap impossible to complete.
         */
        confirm: z.string().min(1),
      })
      .parse(request.body ?? {});

    if (confirm.trim().toLowerCase() !== (request.user.email ?? '').toLowerCase()) {
      throw new HttpError(
        400,
        'Type your email address exactly to confirm deletion.',
        'confirmation_mismatch',
      );
    }

    /**
     * Meals and progress shots share the one bucket, each under a folder
     * named for the user. Paged rather than listed once: `list` caps at a
     * thousand, and somebody who has photographed three meals a day for a
     * year is past that.
     */
    for (;;) {
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from(env.MEAL_PHOTO_BUCKET)
        .list(userId, { limit: 1000 });

      if (listError) {
        throw new HttpError(
          500,
          `Could not read your photos, so nothing was deleted: ${listError.message}`,
          'delete_photos_failed',
        );
      }

      if (!files || files.length === 0) break;

      const { error } = await supabaseAdmin.storage
        .from(env.MEAL_PHOTO_BUCKET)
        .remove(files.map((file) => `${userId}/${file.name}`));

      if (error) {
        throw new HttpError(
          500,
          `Could not delete your photos, so nothing was deleted: ${error.message}`,
          'delete_photos_failed',
        );
      }

      // A short final page means that was the last of them.
      if (files.length < 1000) break;
    }

    // `profiles.id` references auth.users on delete cascade, and every other
    // table references profiles the same way, so this one call empties them.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      throw new HttpError(
        500,
        `Could not delete your account: ${error.message}`,
        'delete_account_failed',
      );
    }

    return { deleted: true };
  });

  /** Plan 10.10 — full data export. */
  app.get('/api/export', async (request) => {
    const userId = request.user.id;
    const [profile, targets, foodLogs, weightLogs, streak] = await Promise.all([
      request.db.from('profiles').select('*').eq('id', userId).single(),
      request.db.from('daily_targets').select('*').eq('user_id', userId).order('effective_date'),
      request.db.from('food_logs').select('*').eq('user_id', userId).order('logged_at'),
      request.db.from('weight_logs').select('*').eq('user_id', userId).order('logged_at'),
      request.db.from('streaks').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    return {
      exported_at: new Date().toISOString(),
      profile: profile.data,
      daily_targets: targets.data ?? [],
      food_logs: foodLogs.data ?? [],
      weight_logs: weightLogs.data ?? [],
      streak: streak.data,
    };
  });
}
