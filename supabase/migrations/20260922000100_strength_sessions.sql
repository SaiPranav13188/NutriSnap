-- ===========================================================================
-- Strength sessions
--
-- A strength workout is not one number. It is a sequence of sets, each with
-- its own exercise, its own working time and its own contribution to the
-- total — and the summary screen has to be able to say which exercise did
-- the most work, and how the session compares with the last five. None of
-- that survives being flattened into a single exercise_logs row, so sets get
-- a table and the session that owns them gets another.
--
-- exercise_logs still receives one row per finished session, because the
-- "Burned today" figure, the Progress tab and the calorie budget all read
-- from there and should not have to learn about a second source. These two
-- tables are the detail behind that row, not a replacement for it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- strength_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.strength_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  -- Denormalised from the sets so the list screen and the rolling average do
  -- not have to aggregate children on every read.
  total_kcal      int not null default 0 check (total_kcal between 0 and 20000),
  set_count       int not null default 0 check (set_count between 0 and 500),

  -- Working time and wall-clock time are different questions: the calorie
  -- maths uses the first, the "how long were you in the gym" figure the
  -- second. Storing both means neither has to be inferred later.
  active_seconds  int not null default 0 check (active_seconds between 0 and 86400),
  total_seconds   int not null default 0 check (total_seconds between 0 and 86400),

  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  logged_on       date generated always as ((started_at at time zone 'UTC')::date) stored,
  created_at      timestamptz not null default now()
);

create index if not exists strength_sessions_user_started_idx
  on public.strength_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- strength_sets
--
-- One row per set, in the order they were performed. `calories` is stored
-- rather than derived so a session keeps the figure it was logged with, even
-- if the MET table is retuned afterwards — the same reason exercise_logs
-- stores calories_burned instead of recomputing it.
-- ---------------------------------------------------------------------------
create table if not exists public.strength_sets (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.strength_sessions(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,

  exercise        text not null check (char_length(exercise) between 1 and 120),
  category        text not null default 'strength'
                    check (category in ('strength', 'circuit', 'bodyweight', 'cardio')),

  set_number      int not null check (set_number between 1 and 500),

  -- Both optional. A bodyweight movement has no load to record, and a set
  -- can be timed without anybody counting the reps.
  reps            int check (reps is null or reps between 1 and 1000),
  weight_kg       numeric(6, 2) check (weight_kg is null or weight_kg between 0 and 1000),

  -- Working seconds only. Rest is excluded before this is written.
  active_seconds  int not null check (active_seconds between 0 and 7200),
  calories        numeric(8, 2) not null check (calories between 0 and 20000),

  logged_at       timestamptz not null default now()
);

create index if not exists strength_sets_session_idx
  on public.strength_sets (session_id, set_number);
create index if not exists strength_sets_user_logged_idx
  on public.strength_sets (user_id, logged_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Same shape as every other table here: a row is visible and writable only
-- by the user whose id it carries, and the policies are forced so that even
-- the table owner cannot read around them.
-- ---------------------------------------------------------------------------
alter table public.strength_sessions enable row level security;
alter table public.strength_sets     enable row level security;

alter table public.strength_sessions force row level security;
alter table public.strength_sets     force row level security;

drop policy if exists "strength_sessions_select_own" on public.strength_sessions;
create policy "strength_sessions_select_own" on public.strength_sessions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "strength_sessions_insert_own" on public.strength_sessions;
create policy "strength_sessions_insert_own" on public.strength_sessions
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "strength_sessions_update_own" on public.strength_sessions;
create policy "strength_sessions_update_own" on public.strength_sessions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "strength_sessions_delete_own" on public.strength_sessions;
create policy "strength_sessions_delete_own" on public.strength_sessions
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "strength_sets_select_own" on public.strength_sets;
create policy "strength_sets_select_own" on public.strength_sets
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "strength_sets_insert_own" on public.strength_sets;
create policy "strength_sets_insert_own" on public.strength_sets
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "strength_sets_delete_own" on public.strength_sets;
create policy "strength_sets_delete_own" on public.strength_sets
  for delete to authenticated
  using (auth.uid() = user_id);
