import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail fast on a misconfigured deployment rather than 500-ing on the first
 * request that happens to need a missing key.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),

  // Must be the bare project URL. The dashboard also shows a REST endpoint
  // (".../rest/v1"), and copying that one produces requests like
  // "/rest/v1/auth/v1/..." that fail with a misleading "No API key found".
  SUPABASE_URL: z
    .string()
    .url({ message: 'SUPABASE_URL must be the full https://<ref>.supabase.co URL' })
    .refine(
      (value) => {
        try {
          return new URL(value).pathname.replace(/\/+$/, '') === '';
        } catch {
          return false;
        }
      },
      {
        message:
          'SUPABASE_URL must have no path — use https://<ref>.supabase.co, not the /rest/v1 endpoint',
      },
    )
    .transform((value) => new URL(value).origin),
  SUPABASE_ANON_KEY: z.string().min(20, 'SUPABASE_ANON_KEY is missing'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY is missing'),

  // Free key from https://aistudio.google.com/apikey — no card required.
  //
  // Optional on purpose: without it the API still starts and every non-AI
  // route works, so you can use the dashboard, log meals manually and track
  // weight before setting up food photo analysis. The /api/food/analyze*
  // routes return a clear 503 until a key is present.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_VISION_MODEL: z.string().default('gemini-3.6-flash'),
  /**
   * The model for the lighter food calls: meal suggestions, "describe what
   * you ate", and reading leftovers off a plate.
   *
   * Separate from the vision model for two reasons. Free-tier quota is per
   * model per day, and the flagship's allowance is twenty requests — shared
   * with meal scanning, that is a handful of meals before the whole app
   * stops. And none of these needs the flagship: a suggestion is text, and
   * judging how much rice is left is a far simpler question than estimating
   * a meal's nutrition from scratch.
   */
  GEMINI_LIGHT_MODEL: z.string().default('gemini-3.5-flash-lite'),
  /**
   * Reading a restaurant menu. Follows the light model unless set.
   *
   * It is an image call, so the vision model is the obvious home for it, and
   * that is exactly the trap: one menu photograph would spend one of the
   * twenty daily flagship requests that meal scanning depends on, and a menu
   * gets photographed at the moment someone is least able to be told to come
   * back tomorrow.
   *
   * The work itself does not need the flagship either. Once the card is
   * transcribed, estimating a dish from its name and description is the same
   * job "describe what you ate" does on the light model already — the OCR is
   * the easy half. Set it explicitly to point menus at the vision model if
   * the estimates come back weak.
   */
  GEMINI_MENU_MODEL: z.string().optional(),
  // The coach writes prose rather than reading images, so it can use the
  // same fast model; split so either can be pointed elsewhere alone.
  GEMINI_COACH_MODEL: z.string().default('gemini-3.6-flash'),

  /** Comma-separated list. Empty means "reflect any origin" (dev only). */
  API_CORS_ORIGINS: z.string().default(''),

  MEAL_PHOTO_BUCKET: z.string().default('meal-photos'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`\nNutriSnap API cannot start — environment is not configured:\n${issues}\n`);
  console.error('Copy .env.example to services/api/.env and fill in the values.\n');
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins: string[] | true =
  env.API_CORS_ORIGINS.trim().length > 0
    ? env.API_CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : true;

export const isProduction = env.NODE_ENV === 'production';
