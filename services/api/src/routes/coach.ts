import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  formatNumber,
  healthScore,
  microTargets,
  sumTotals,
  waterTarget,
  type DailyTarget,
  type MacroTotals,
  type Profile,
} from '@nutrisnap/core';
import { requireAuth, HttpError } from '../auth.js';
import { getOrCreateTargets } from '../services/targets.js';
import { askCoach } from '../ai/coach.js';

/**
 * The coach endpoint.
 *
 * The interesting half is not the model call but what it is given. The summary
 * is assembled here, from this user's rows only, and is the sole source the
 * prompt permits an answer to draw on. Sending raw table dumps would be both
 * larger and easier for the model to misread.
 */

const askBody = z.object({
  question: z.string().min(3).max(500),
});

const DAYS_OF_CONTEXT = 14;

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

interface DayRow {
  day: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  log_count: number;
}

export async function coachRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /** Suggested questions, so the input is not a blank box. */
  app.get('/api/coach/prompts', async () => ({
    prompts: [
      'How did this week go?',
      'Why has my weight stalled?',
      'Am I getting enough protein?',
      'What should I change tomorrow?',
      'Where are most of my calories coming from?',
    ],
  }));

  app.post('/api/coach/ask', async (request) => {
    const { question } = askBody.parse(request.body);
    const userId = request.user.id;

    const to = new Date();
    const from = new Date(to.getTime() - (DAYS_OF_CONTEXT - 1) * 86_400_000);

    const [profileResult, dayResult, weightResult, exerciseResult, waterResult, streakResult] =
      await Promise.all([
        request.db.from('profiles').select('*').eq('id', userId).single(),
        request.db.rpc('nutrition_totals_by_day', {
          p_user: userId,
          p_from: dayKey(from),
          p_to: dayKey(to),
        }),
        request.db
          .from('weight_logs')
          .select('logged_on, weight_kg')
          .eq('user_id', userId)
          .order('logged_on', { ascending: false })
          .limit(10),
        request.db
          .from('exercise_logs')
          .select('logged_on, name, kind, duration_min, calories_burned')
          .eq('user_id', userId)
          .gte('logged_on', dayKey(from))
          .order('logged_on', { ascending: false })
          .limit(30),
        request.db.rpc('water_totals_by_day', {
          p_user: userId,
          p_from: dayKey(from),
          p_to: dayKey(to),
        }),
        request.db.from('streaks').select('*').eq('user_id', userId).maybeSingle(),
      ]);

    if (profileResult.error || !profileResult.data) {
      throw new HttpError(404, 'Profile not found.', 'profile_not_found');
    }

    const profile = profileResult.data as Profile;
    const targets = (await getOrCreateTargets(request.db, userId)) as DailyTarget | null;

    const days = (dayResult.data ?? []) as DayRow[];
    const logged = days.filter((d) => d.log_count > 0);

    const totals: MacroTotals = sumTotals(logged);
    const divisor = Math.max(1, logged.length);
    const average: MacroTotals = {
      calories: totals.calories / divisor,
      protein_g: totals.protein_g / divisor,
      carbs_g: totals.carbs_g / divisor,
      fat_g: totals.fat_g / divisor,
      sugar_g: totals.sugar_g / divisor,
      fiber_g: totals.fiber_g / divisor,
      sodium_mg: totals.sodium_mg / divisor,
    };

    const lines: string[] = [];

    lines.push('## Plan');
    lines.push(`- Goal: ${profile.goal ?? 'not set'}`);
    lines.push(
      `- Current weight: ${profile.current_weight_kg ?? 'unknown'} kg; goal weight: ${profile.goal_weight_kg ?? 'not set'} kg`,
    );
    if (profile.rate_kg_per_week) {
      lines.push(`- Intended rate: ${profile.rate_kg_per_week} kg per week`);
    }
    if (targets) {
      const micro = microTargets(targets.calories);
      lines.push(
        `- Daily targets: ${formatNumber(Math.round(targets.calories))} kcal, ` +
          `${Math.round(targets.protein_g)}g protein, ${Math.round(targets.carbs_g)}g carbs, ` +
          `${Math.round(targets.fat_g)}g fat, ${micro.fiber_g}g fiber`,
      );
      if (targets.tdee) {
        lines.push(
          `- Estimated daily burn (TDEE): ${Math.round(targets.tdee)} kcal. This is an estimate, not a measurement.`,
        );
      }
    } else {
      lines.push('- No targets set yet; onboarding is incomplete.');
    }

    lines.push('');
    lines.push(`## Last ${DAYS_OF_CONTEXT} days of food logging`);
    lines.push(`- Days with any food logged: ${logged.length} of ${DAYS_OF_CONTEXT}`);

    if (logged.length === 0) {
      lines.push('- Nothing has been logged in this window.');
    } else {
      lines.push(
        `- Average on logged days: ${Math.round(average.calories)} kcal, ` +
          `${Math.round(average.protein_g)}g protein, ${Math.round(average.carbs_g)}g carbs, ` +
          `${Math.round(average.fat_g)}g fat, ${Math.round(average.fiber_g)}g fiber, ` +
          `${Math.round(average.sugar_g)}g sugar, ${Math.round(average.sodium_mg)}mg sodium`,
      );
      lines.push('- Per day:');
      for (const day of days) {
        lines.push(
          day.log_count > 0
            ? `  - ${day.day}: ${Math.round(day.calories)} kcal, ${Math.round(day.protein_g)}g protein (${day.log_count} meals)`
            : `  - ${day.day}: nothing logged`,
        );
      }

      if (targets) {
        const score = healthScore(average, targets);
        lines.push(`- Health score on those averages: ${score.score}/10. ${score.summary}`);
      }
    }

    const weights = (weightResult.data ?? []) as Array<{ logged_on: string; weight_kg: number }>;
    lines.push('');
    lines.push('## Weigh-ins (most recent first)');
    lines.push(
      weights.length > 0
        ? weights.map((w) => `- ${w.logged_on}: ${w.weight_kg} kg`).join('\n')
        : '- No weigh-ins recorded.',
    );

    const workouts = (exerciseResult.data ?? []) as Array<{
      logged_on: string;
      name: string;
      kind: string;
      duration_min: number;
      calories_burned: number;
    }>;
    lines.push('');
    lines.push(`## Workouts in the last ${DAYS_OF_CONTEXT} days`);
    lines.push(
      workouts.length > 0
        ? workouts
            .map(
              (w) =>
                `- ${w.logged_on}: ${w.name} (${w.kind}), ${w.duration_min} min, ~${w.calories_burned} kcal estimated`,
            )
            .join('\n')
        : '- No workouts logged.',
    );

    const water = (waterResult.data ?? []) as Array<{ day: string; total_ml: number }>;
    const goalMl = waterTarget(profile.current_weight_kg ?? null);
    lines.push('');
    lines.push(`## Water (goal ${goalMl} ml a day)`);
    lines.push(
      water.length > 0
        ? water.map((w) => `- ${w.day}: ${w.total_ml} ml`).join('\n')
        : '- No water logged.',
    );

    const streak = streakResult.data as { current_streak?: number } | null;
    lines.push('');
    lines.push(`## Streak`);
    lines.push(`- Current logging streak: ${streak?.current_streak ?? 0} days`);

    const answer = await askCoach({ question, context: { summary: lines.join('\n') } });

    return { answer };
  });
}
