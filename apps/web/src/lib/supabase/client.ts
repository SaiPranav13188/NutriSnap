'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseUrl } from './url';

/**
 * Browser-side Supabase client. Only ever uses the anon key — Row Level
 * Security is what keeps one user out of another's rows.
 */
export function createClient() {
  return createBrowserClient(
    supabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
