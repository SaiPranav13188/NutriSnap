-- ===========================================================================
-- Water goal override
--
-- The water ring's target is derived from body weight, which is a reasonable
-- default and a poor rule. Someone training in heat, someone on a medication
-- that changes their intake, or someone whose doctor gave them a number all
-- have a better figure than the formula does, and until now no way to say so.
--
-- Null means "keep deriving it". That is deliberately different from storing
-- the derived number on signup: a stored copy would silently stop tracking
-- the user's weight the first time it changed.
-- ===========================================================================

alter table public.profiles
  add column if not exists water_goal_ml int
    -- Half a litre to six: below the first is not a goal, above the second is
    -- a figure worth discussing with a doctor rather than an app.
    check (water_goal_ml is null or water_goal_ml between 500 and 6000);

comment on column public.profiles.water_goal_ml is
  'Explicit daily water target in millilitres. Null means derive it from body weight.';
