/**
 * Validates the Supabase project URL.
 *
 * The Supabase dashboard shows several URLs, and it is easy to copy the REST
 * endpoint (`https://<ref>.supabase.co/rest/v1`) instead of the project URL.
 * The client appends its own service paths, so a URL with a path already on it
 * produces requests like `/rest/v1/auth/v1/authorize` — which hit PostgREST
 * instead of the auth service and fail with a misleading
 * "No API key found in request".
 *
 * Failing here, with an explanation, is far cheaper than debugging that.
 */
export function supabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!raw) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not set. Copy apps/web/.env.local.example to ' +
        'apps/web/.env.local and fill it in, then restart the dev server.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${raw}"`);
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  if (path !== '') {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must be the project URL with no path, but it ends in "${path}". ` +
        `Use "${parsed.origin}" instead — find it in the Supabase dashboard under ` +
        'Project Settings → Data API → Project URL.',
    );
  }

  return parsed.origin;
}
