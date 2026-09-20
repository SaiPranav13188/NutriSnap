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
