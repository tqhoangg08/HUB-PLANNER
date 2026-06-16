drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
drop policy if exists "notification_preferences_update_own" on public.notification_preferences;

create policy "notification_preferences_select_own"
on public.notification_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "notification_preferences_insert_own"
on public.notification_preferences
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "notification_preferences_update_own"
on public.notification_preferences
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
