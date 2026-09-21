import { HttpError } from './auth.js';

/**
 * Turning database failures into something a person can act on.
 *
 * The case that prompted this: a feature shipped ahead of its migration, and
 * the screen showed "Could not find the table 'public.exercise_logs' in the
 * schema cache". That is PostgREST talking to itself. It tells the user
 * nothing about what to do, and it leaks internal schema names into the UI.
 */

interface DbError {
  code?: string;
  message?: string;
}

/**
 * PostgREST reports an unknown table as PGRST205 once its schema cache has
 * settled, and Postgres itself raises 42P01 (undefined_table). Either can
 * surface depending on where the request is caught, so both count.
 */
export function isMissingTable(error: DbError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;

  // Older PostgREST builds report it only in the message.
  return /could not find the table|relation .* does not exist/i.test(error.message ?? '');
}

/**
 * Raise the "run the migration" error, or return so the caller can handle a
 * genuine failure its own way.
 */
export function assertTableExists(error: DbError | null | undefined, feature: string): void {
  if (!isMissingTable(error)) return;

  throw new HttpError(
    503,
    `${feature} needs a database update. Apply the latest migration: copy supabase/ALL_MIGRATIONS.sql into the Supabase SQL editor and run it.`,
    'migration_required',
  );
}
