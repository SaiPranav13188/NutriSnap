import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Service-role client. Bypasses Row Level Security, so every query made with
 * it MUST filter on user_id explicitly — the database will not do it for you
 * here. This client never leaves the API process.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'nutrisnap-api' } },
  },
);

/**
 * A client scoped to one user's JWT. RLS applies, which makes it the safer
 * default for anything that reads or writes that user's own rows.
 */
export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
