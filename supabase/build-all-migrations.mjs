#!/usr/bin/env node
/**
 * Regenerate supabase/ALL_MIGRATIONS.sql from supabase/migrations/.
 *
 * The combined file is what gets pasted into the Supabase SQL editor, and it
 * drifts the moment a migration is added and the concatenation is not redone.
 * Generating it removes that failure mode.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

const header = `-- =========================================================================
-- NutriSnap — all migrations, combined for pasting into the Supabase
-- SQL editor in one go.
--
-- Open this file, select all (Ctrl+A), copy (Ctrl+C), paste into
-- Supabase dashboard -> SQL Editor -> New query, then click Run.
--
-- Safe to run more than once: every statement is idempotent.
-- Generated from supabase/migrations/ — edit those, not this file.
-- Regenerate with: node supabase/build-all-migrations.mjs
-- =========================================================================

`;

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const body = files
  .map((name) => {
    const banner = [
      '',
      '-- #########################################################################',
      `-- SOURCE: supabase/migrations/${name}`,
      '-- #########################################################################',
      '',
    ].join('\n');
    return banner + readFileSync(join(migrationsDir, name), 'utf8');
  })
  .join('\n');

writeFileSync(join(here, 'ALL_MIGRATIONS.sql'), header + body, 'utf8');
console.log(`ALL_MIGRATIONS.sql rebuilt from ${files.length} migrations:`);
for (const name of files) console.log(`  - ${name}`);
