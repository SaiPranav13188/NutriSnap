-- ===========================================================================
-- NutriSnap — water, exercise and progress photos
--
-- Three additions that share one shape: a per-user log table, owned rows only,
-- indexed on (user_id, time desc) because every read is "this user's recent
-- entries".
--
-- water_logs and exercise_logs deliberately do NOT carry a unique constraint
-- on the day the way weight_logs does. A weigh-in is once daily by nature; a
-- glass of water and a workout are not.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- water_logs
-- ---------------------------------------------------------------------------
create table if not exists public.water_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- Millilitres. Stored metric like everything else; the client converts for
  -- display. The ceiling is a day's worth, not a glass — water intoxication is
  -- real, and a stray keypress should not poison the day's total.
  amount_ml  int not null check (amount_ml between 1 and 10000),
  logged_at  timestamptz not null default now(),
  logged_on  date generated always as ((logged_at at time zone 'UTC')::date) stored,
  created_at timestamptz not null default now()
);
create index if not exists water_logs_user_logged_idx
  on public.water_logs (user_id, logged_at desc);
create index if not exists water_logs_user_day_idx
  on public.water_logs (user_id, logged_on);

-- ---------------------------------------------------------------------------
-- exercise_logs
--
-- Makes the "Burned" figure on the Progress tab a measurement rather than an
-- assumption. calories_burned is stored rather than derived so that a value
-- imported from a watch is kept verbatim instead of being re-estimated.
-- ---------------------------------------------------------------------------
create table if not exists public.exercise_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 200),
  kind            text not null default 'other'
                    check (kind in ('cardio','strength','walk','run','cycle','swim','sport','other')),
  duration_min    int not null check (duration_min between 1 and 1440),
  calories_burned int not null check (calories_burned between 0 and 20000),
  intensity       text check (intensity in ('light','moderate','vigorous')),
  notes           text check (notes is null or char_length(notes) <= 500),
  source          text not null default 'manual'
                    check (source in ('manual','estimated','imported')),
  logged_at       timestamptz not null default now(),
  logged_on       date generated always as ((logged_at at time zone 'UTC')::date) stored,
  created_at      timestamptz not null default now()
);
create index if not exists exercise_logs_user_logged_idx
  on public.exercise_logs (user_id, logged_at desc);
create index if not exists exercise_logs_user_day_idx
  on public.exercise_logs (user_id, logged_on);

-- ---------------------------------------------------------------------------
-- progress_photos
--
-- storage_path points into the same private bucket meal photos use, under a
-- progress/ prefix. The bytes never live in Postgres; this table is the index
-- and the ownership record.
-- ---------------------------------------------------------------------------
create table if not exists public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  -- Captured alongside the photo so a before/after pair carries the numbers
  -- that went with it, even after later weigh-ins move the current value.
  weight_kg    numeric(5,2) check (weight_kg is null or weight_kg between 25 and 400),
  note         text check (note is null or char_length(note) <= 300),
  taken_at     timestamptz not null default now(),
  taken_on     date generated always as ((taken_at at time zone 'UTC')::date) stored,
  created_at   timestamptz not null default now(),
  unique (user_id, storage_path)
);
create index if not exists progress_photos_user_taken_idx
  on public.progress_photos (user_id, taken_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — same rule as every other table: own rows only.
-- ---------------------------------------------------------------------------
alter table public.water_logs      enable row level security;
alter table public.exercise_logs   enable row level security;
alter table public.progress_photos enable row level security;

alter table public.water_logs      force row level security;
alter table public.exercise_logs   force row level security;
alter table public.progress_photos force row level security;

drop policy if exists "water_logs_select_own" on public.water_logs;
create policy "water_logs_select_own" on public.water_logs
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "water_logs_insert_own" on public.water_logs;
create policy "water_logs_insert_own" on public.water_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "water_logs_update_own" on public.water_logs;
create policy "water_logs_update_own" on public.water_logs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "water_logs_delete_own" on public.water_logs;
create policy "water_logs_delete_own" on public.water_logs
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "exercise_logs_select_own" on public.exercise_logs;
create policy "exercise_logs_select_own" on public.exercise_logs
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "exercise_logs_insert_own" on public.exercise_logs;
create policy "exercise_logs_insert_own" on public.exercise_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "exercise_logs_update_own" on public.exercise_logs;
create policy "exercise_logs_update_own" on public.exercise_logs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "exercise_logs_delete_own" on public.exercise_logs;
create policy "exercise_logs_delete_own" on public.exercise_logs
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "progress_photos_select_own" on public.progress_photos;
create policy "progress_photos_select_own" on public.progress_photos
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "progress_photos_insert_own" on public.progress_photos;
create policy "progress_photos_insert_own" on public.progress_photos
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "progress_photos_update_own" on public.progress_photos;
create policy "progress_photos_update_own" on public.progress_photos
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "progress_photos_delete_own" on public.progress_photos;
create policy "progress_photos_delete_own" on public.progress_photos
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Daily roll-ups, so the clients ask for totals rather than rows.
-- ---------------------------------------------------------------------------
create or replace function public.water_totals_by_day(
  p_user uuid,
  p_from date,
  p_to   date
)
returns table (day date, total_ml bigint, entries bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select logged_on as day,
         sum(amount_ml)::bigint as total_ml,
         count(*)::bigint       as entries
  from public.water_logs
  where user_id = p_user
    and logged_on between p_from and p_to
  group by logged_on
  order by logged_on;
$$;

create or replace function public.exercise_totals_by_day(
  p_user uuid,
  p_from date,
  p_to   date
)
returns table (day date, total_calories bigint, total_minutes bigint, entries bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select logged_on as day,
         sum(calories_burned)::bigint as total_calories,
         sum(duration_min)::bigint    as total_minutes,
         count(*)::bigint             as entries
  from public.exercise_logs
  where user_id = p_user
    and logged_on between p_from and p_to
  group by logged_on
  order by logged_on;
$$;

grant execute on function public.water_totals_by_day(uuid, date, date)    to authenticated;
grant execute on function public.exercise_totals_by_day(uuid, date, date) to authenticated;
