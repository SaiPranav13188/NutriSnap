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
