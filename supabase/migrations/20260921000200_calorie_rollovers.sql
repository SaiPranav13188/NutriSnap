-- ===========================================================================
-- NutriSnap — calorie rollovers
--
-- Carrying a day's unspent calories into the next one, on request.
--
-- Deliberately a record of an action rather than a mutation of the target.
-- Editing daily_targets would lose the fact that the extra came from an
-- under-eaten Tuesday, make the change impossible to undo, and quietly corrupt
-- the adaptive TDEE estimate, which reads stored targets as the plan.
--
-- One row per source day, enforced by the unique constraint: a day's leftovers
-- can be pushed once. Without it, tapping twice would double the allowance.
-- ===========================================================================

create table if not exists public.calorie_rollovers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- The day the calories went unspent.
  from_date  date not null,
  -- The day they were carried into; always from_date + 1.
  to_date    date not null,
  -- Capped well below a day's worth on purpose: see ROLLOVER_CAP_KCAL in
  -- packages/core. A deficit banked all week and spent at once is not the
  -- behaviour this should encourage.
  amount_kcal int not null check (amount_kcal between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (user_id, from_date),
  check (to_date > from_date)
);

create index if not exists calorie_rollovers_user_to_idx
  on public.calorie_rollovers (user_id, to_date);

alter table public.calorie_rollovers enable row level security;
alter table public.calorie_rollovers force row level security;

drop policy if exists "calorie_rollovers_select_own" on public.calorie_rollovers;
create policy "calorie_rollovers_select_own" on public.calorie_rollovers
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "calorie_rollovers_insert_own" on public.calorie_rollovers;
create policy "calorie_rollovers_insert_own" on public.calorie_rollovers
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "calorie_rollovers_update_own" on public.calorie_rollovers;
create policy "calorie_rollovers_update_own" on public.calorie_rollovers
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "calorie_rollovers_delete_own" on public.calorie_rollovers;
create policy "calorie_rollovers_delete_own" on public.calorie_rollovers
  for delete to authenticated
  using (auth.uid() = user_id);
