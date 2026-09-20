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
