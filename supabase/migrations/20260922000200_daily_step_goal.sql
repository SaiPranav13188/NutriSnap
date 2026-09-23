-- ===========================================================================
-- Daily step goal
--
-- The Personal details screen shows a step goal alongside height, weight and
-- date of birth, so it has to live where the rest of those do. Everything on
-- that screen is read from `profiles` in one request; keeping this one field
-- in device storage instead would mean a screen that is mostly server state
-- with one row that silently disagrees after a reinstall.
--
-- It does not feed the calorie maths. Activity level already carries that,
-- and counting the same movement twice would inflate the target. This is a
-- target to walk to, which the app can measure a tracked session against.
-- ===========================================================================

alter table public.profiles
  add column if not exists daily_step_goal int not null default 10000
    -- Wide enough for someone training, bounded so a slipped keypress cannot
    -- store a goal no one could walk.
    check (daily_step_goal between 1000 and 50000);

comment on column public.profiles.daily_step_goal is
  'Steps per day the user is aiming for. Display and session comparison only — it does not affect calorie targets.';
