import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { answersToProfilePatch, isOnboardingComplete, type Profile } from '@nutrisnap/core';
import { requireAuth, HttpError } from '../auth.js';
import { getOrCreateTargets, recomputeAndStoreTargets } from '../services/targets.js';

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
