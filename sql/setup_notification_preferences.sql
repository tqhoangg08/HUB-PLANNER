create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  system boolean not null default true,
  events boolean not null default true,
  lost_found boolean not null default true,
  schedule boolean not null default true,
  school boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
on public.notification_preferences
for select
using (auth.uid() = user_id);

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
on public.notification_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
on public.notification_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
