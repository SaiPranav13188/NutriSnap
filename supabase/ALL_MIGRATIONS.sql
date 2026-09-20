-- =========================================================================
-- NutriSnap — all migrations, combined for pasting into the Supabase
-- SQL editor in one go.
--
-- Open this file, select all (Ctrl+A), copy (Ctrl+C), paste into
-- Supabase dashboard -> SQL Editor -> New query, then click Run.
--
-- Safe to run more than once: every statement is idempotent.
-- Generated from supabase/migrations/ — edit those, not this file.
-- =========================================================================


-- #########################################################################
-- SOURCE: supabase/migrations/20260920000100_init_schema.sql
-- #########################################################################

-- ===========================================================================
-- NutriSnap — initial schema
-- Plan reference: NutriSnap_project_plan.md section 6
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (kept as enums rather than free text so the API and DB agree)
-- ---------------------------------------------------------------------------
do $enum$ begin create type gender_t         as enum ('male','female','other');                                exception when duplicate_object then null; end $enum$;
do $enum$ begin create type goal_t           as enum ('lose','maintain','gain');                               exception when duplicate_object then null; end $enum$;
do $enum$ begin create type activity_level_t as enum ('sedentary','light','moderate','very_active','extreme'); exception when duplicate_object then null; end $enum$;
do $enum$ begin create type meal_type_t      as enum ('breakfast','lunch','dinner','snack');                   exception when duplicate_object then null; end $enum$;
do $enum$ begin create type units_t          as enum ('metric','imperial');                                    exception when duplicate_object then null; end $enum$;
do $enum$ begin create type log_source_t     as enum ('photo','barcode','label','text','manual','favorite');   exception when duplicate_object then null; end $enum$;

-- ---------------------------------------------------------------------------
-- profiles — extends auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            text,
  avatar_url           text,
  gender               gender_t,
  date_of_birth        date,
  height_cm            numeric(5,2) check (height_cm is null or (height_cm between 80 and 260)),
  goal                 goal_t,
  current_weight_kg    numeric(5,2) check (current_weight_kg is null or (current_weight_kg between 25 and 400)),
  goal_weight_kg       numeric(5,2) check (goal_weight_kg    is null or (goal_weight_kg    between 25 and 400)),
  rate_kg_per_week     numeric(3,2) default 0.5 check (rate_kg_per_week is null or (rate_kg_per_week between 0 and 1.5)),
  target_date          date,
  activity_level       activity_level_t,
  workouts_per_week    text,
  training_focus       text,
  focus_area           text,
  dietary_preference   text,
  allergies            text[] default '{}',
  units                units_t not null default 'metric',
  referral_source      text,
  tried_other_apps     boolean,
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- daily_targets — one row per recompute; the newest effective_date wins
-- ---------------------------------------------------------------------------
create table if not exists public.daily_targets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  calories       numeric(7,2) not null check (calories > 0),
  protein_g      numeric(7,2) not null check (protein_g >= 0),
  carbs_g        numeric(7,2) not null check (carbs_g   >= 0),
  fat_g          numeric(7,2) not null check (fat_g     >= 0),
  bmr            numeric(7,2),
  tdee           numeric(7,2),
  source         text not null default 'formula',  -- 'formula' | 'adaptive' | 'manual'
  effective_date date not null default current_date,
  created_at     timestamptz not null default now(),
  unique (user_id, effective_date)
);
create index if not exists daily_targets_user_date_idx
  on public.daily_targets (user_id, effective_date desc);

-- ---------------------------------------------------------------------------
-- food_logs
-- ---------------------------------------------------------------------------
create table if not exists public.food_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  photo_url          text,
  name               text not null,
  serving_multiplier numeric(5,2) not null default 1 check (serving_multiplier > 0),
  estimated_grams    numeric(7,2),
  calories           numeric(7,2) not null default 0 check (calories  >= 0),
  protein_g          numeric(7,2) not null default 0 check (protein_g >= 0),
  carbs_g            numeric(7,2) not null default 0 check (carbs_g   >= 0),
  fat_g              numeric(7,2) not null default 0 check (fat_g     >= 0),
  sugar_g            numeric(7,2) default 0,
  fiber_g            numeric(7,2) default 0,
  sodium_mg          numeric(8,2) default 0,
  ai_confidence      numeric(3,2) check (ai_confidence is null or (ai_confidence between 0 and 1)),
  source             log_source_t not null default 'manual',
  barcode            text,
  ingredients        jsonb not null default '[]'::jsonb,  -- [{name, grams, calories}, ...]
  is_favorite        boolean not null default false,
  meal_type          meal_type_t,
  logged_at          timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index if not exists food_logs_user_logged_idx on public.food_logs (user_id, logged_at desc);
create index if not exists food_logs_user_fav_idx    on public.food_logs (user_id) where is_favorite;

-- ---------------------------------------------------------------------------
-- weight_logs — one weigh-in per user per calendar day (upsert on conflict)
-- ---------------------------------------------------------------------------
create table if not exists public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  weight_kg  numeric(5,2) not null check (weight_kg between 25 and 400),
  logged_at  timestamptz not null default now(),
  logged_on  date generated always as ((logged_at at time zone 'UTC')::date) stored,
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);
create index if not exists weight_logs_user_logged_idx on public.weight_logs (user_id, logged_at desc);

-- ---------------------------------------------------------------------------
-- streaks
-- ---------------------------------------------------------------------------
create table if not exists public.streaks (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  current_streak   int not null default 0,
  longest_streak   int not null default 0,
  last_logged_date date,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- target_adjustments — adaptive TDEE recomputes (plan section 10.1)
-- ---------------------------------------------------------------------------
create table if not exists public.target_adjustments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  previous_calories numeric(7,2) not null,
  new_calories      numeric(7,2) not null,
  estimated_tdee    numeric(7,2),
  reason            text not null,
  days_analyzed     int,
  created_at        timestamptz not null default now()
);
create index if not exists target_adjustments_user_idx on public.target_adjustments (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end $fn$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile + streak row when a user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.streaks (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- #########################################################################
-- SOURCE: supabase/migrations/20260920000200_rls_policies.sql
-- #########################################################################

-- ===========================================================================
-- NutriSnap — Row Level Security
--
-- Rule: a user may only ever touch rows they own.
--   * public.profiles keys ownership on `id` (it IS auth.users.id)
--   * every other table keys ownership on `user_id`
--
-- The service role key used by services/api bypasses RLS by design; that key
-- must never reach a browser or the mobile bundle.
-- ===========================================================================

alter table public.profiles           enable row level security;
alter table public.daily_targets      enable row level security;
alter table public.food_logs          enable row level security;
alter table public.weight_logs        enable row level security;
alter table public.streaks            enable row level security;
alter table public.target_adjustments enable row level security;

-- Deny-by-default is what RLS already does once enabled; force it so that even
-- a table owner connecting directly is subject to the policies below.
alter table public.profiles           force row level security;
alter table public.daily_targets      force row level security;
alter table public.food_logs          force row level security;
alter table public.weight_logs        force row level security;
alter table public.streaks            force row level security;
alter table public.target_adjustments force row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- daily_targets
-- ---------------------------------------------------------------------------
drop policy if exists "daily_targets_select_own" on public.daily_targets;
create policy "daily_targets_select_own" on public.daily_targets
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "daily_targets_insert_own" on public.daily_targets;
create policy "daily_targets_insert_own" on public.daily_targets
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "daily_targets_update_own" on public.daily_targets;
create policy "daily_targets_update_own" on public.daily_targets
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "daily_targets_delete_own" on public.daily_targets;
create policy "daily_targets_delete_own" on public.daily_targets
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- food_logs
-- ---------------------------------------------------------------------------
drop policy if exists "food_logs_select_own" on public.food_logs;
create policy "food_logs_select_own" on public.food_logs
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "food_logs_insert_own" on public.food_logs;
create policy "food_logs_insert_own" on public.food_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "food_logs_update_own" on public.food_logs;
create policy "food_logs_update_own" on public.food_logs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "food_logs_delete_own" on public.food_logs;
create policy "food_logs_delete_own" on public.food_logs
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- weight_logs
-- ---------------------------------------------------------------------------
drop policy if exists "weight_logs_select_own" on public.weight_logs;
create policy "weight_logs_select_own" on public.weight_logs
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "weight_logs_insert_own" on public.weight_logs;
create policy "weight_logs_insert_own" on public.weight_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "weight_logs_update_own" on public.weight_logs;
create policy "weight_logs_update_own" on public.weight_logs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "weight_logs_delete_own" on public.weight_logs;
create policy "weight_logs_delete_own" on public.weight_logs
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- streaks
-- ---------------------------------------------------------------------------
drop policy if exists "streaks_select_own" on public.streaks;
create policy "streaks_select_own" on public.streaks
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "streaks_insert_own" on public.streaks;
create policy "streaks_insert_own" on public.streaks
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "streaks_update_own" on public.streaks;
create policy "streaks_update_own" on public.streaks
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- target_adjustments — read-only to the user; only the API (service role)
-- writes these, so no insert/update/delete policy is granted.
-- ---------------------------------------------------------------------------
drop policy if exists "target_adjustments_select_own" on public.target_adjustments;
create policy "target_adjustments_select_own" on public.target_adjustments
  for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: private meal-photos bucket, one folder per user.
-- Object path convention: "<user_id>/<uuid>.jpg" — the first path segment is
-- the owner, which is what these policies check.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  10485760,  -- 10 MB
  array['image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meal_photos_select_own" on storage.objects;
create policy "meal_photos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "meal_photos_insert_own" on storage.objects;
create policy "meal_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "meal_photos_update_own" on storage.objects;
create policy "meal_photos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "meal_photos_delete_own" on storage.objects;
create policy "meal_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);


-- #########################################################################
-- SOURCE: supabase/migrations/20260920000300_functions.sql
-- #########################################################################

-- ===========================================================================
-- NutriSnap — aggregation + streak helper functions
--
-- These run as `security definer` but every one of them filters on the
-- caller's auth.uid(), so an authenticated client calling them via RPC can
-- still only ever see its own rows. The API may pass an explicit user id only
-- when it holds the service role key (auth.uid() is null in that case).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Per-day nutrition totals over a date range (drives the week strip, the
-- daily-average-calories card and the stacked macro-over-time chart).
-- ---------------------------------------------------------------------------
create or replace function public.nutrition_totals_by_day(
  p_user uuid,
  p_from date,
  p_to   date
)
returns table (
  day        date,
  calories   numeric,
  protein_g  numeric,
  carbs_g    numeric,
  fat_g      numeric,
  sugar_g    numeric,
  fiber_g    numeric,
  sodium_mg  numeric,
  log_count  bigint
)
language sql
security definer
set search_path = public
as $fn$
  select
    d::date                                  as day,
    coalesce(sum(f.calories),  0)::numeric   as calories,
    coalesce(sum(f.protein_g), 0)::numeric   as protein_g,
    coalesce(sum(f.carbs_g),   0)::numeric   as carbs_g,
    coalesce(sum(f.fat_g),     0)::numeric   as fat_g,
    coalesce(sum(f.sugar_g),   0)::numeric   as sugar_g,
    coalesce(sum(f.fiber_g),   0)::numeric   as fiber_g,
    coalesce(sum(f.sodium_mg), 0)::numeric   as sodium_mg,
    count(f.id)                              as log_count
  from generate_series(p_from, p_to, interval '1 day') as d
  left join public.food_logs f
    on f.user_id = p_user
   and (f.logged_at at time zone 'UTC')::date = d::date
  where p_user = coalesce(auth.uid(), p_user)
  group by d
  order by d;
$fn$;

-- ---------------------------------------------------------------------------
-- Recompute a user's logging streak from their food_logs history.
-- Called after a log is written. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_streak(p_user uuid)
returns public.streaks
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_current  int := 0;
  v_longest  int := 0;
  v_run      int := 0;
  v_prev     date;
  v_day      date;
  v_last     date;
  v_today    date := current_date;
begin
  if p_user <> coalesce(auth.uid(), p_user) then
    raise exception 'not authorized';
  end if;

  for v_day in
    select distinct (logged_at at time zone 'UTC')::date as d
    from public.food_logs
    where user_id = p_user
    order by d
  loop
    if v_prev is not null and v_day = v_prev + 1 then
      v_run := v_run + 1;
    else
      v_run := 1;
    end if;

    if v_run > v_longest then
      v_longest := v_run;
    end if;

    v_prev := v_day;
  end loop;

  v_last := v_prev;

  -- The streak is only "current" if the most recent logged day is today or
  -- yesterday; otherwise it has been broken.
  if v_last is not null and v_last >= v_today - 1 then
    v_current := v_run;
  else
    v_current := 0;
  end if;

  insert into public.streaks (user_id, current_streak, longest_streak, last_logged_date, updated_at)
  values (p_user, v_current, v_longest, v_last, now())
  on conflict (user_id) do update
    set current_streak   = excluded.current_streak,
        longest_streak   = greatest(public.streaks.longest_streak, excluded.longest_streak),
        last_logged_date = excluded.last_logged_date,
        updated_at       = now();

  return (select s from public.streaks s where s.user_id = p_user);
end $fn$;

-- ---------------------------------------------------------------------------
-- Weight series for the Progress chart. Returns raw points; the API decides
-- how to bucket them for the 90D / 1M / 6M / 1Y / ALL filters.
-- ---------------------------------------------------------------------------
create or replace function public.weight_series(
  p_user uuid,
  p_from timestamptz
)
returns table (logged_on date, weight_kg numeric)
language sql
security definer
set search_path = public
as $fn$
  select w.logged_on, w.weight_kg
  from public.weight_logs w
  where w.user_id = p_user
    and p_user = coalesce(auth.uid(), p_user)
    and (p_from is null or w.logged_at >= p_from)
  order by w.logged_on;
$fn$;

grant execute on function public.nutrition_totals_by_day(uuid, date, date) to authenticated;
grant execute on function public.recompute_streak(uuid)                    to authenticated;
grant execute on function public.weight_series(uuid, timestamptz)          to authenticated;
