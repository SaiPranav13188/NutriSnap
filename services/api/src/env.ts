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

  SUPABASE_URL: z.string().url({ message: 'SUPABASE_URL must be the full https://<ref>.supabase.co URL' }),
  SUPABASE_ANON_KEY: z.string().min(20, 'SUPABASE_ANON_KEY is missing'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY is missing'),

  // Free key from https://aistudio.google.com/apikey — no card required.
  GEMINI_API_KEY: z.string().min(10, 'GEMINI_API_KEY is missing'),
  GEMINI_VISION_MODEL: z.string().default('gemini-2.5-flash'),

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
