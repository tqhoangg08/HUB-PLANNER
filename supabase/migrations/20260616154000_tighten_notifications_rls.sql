drop policy if exists "Enable delete for users based on user_id" on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;
drop policy if exists "Users can view own notifications" on public.notifications;
drop policy if exists "Users can view their own notifications" on public.notifications;

create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (receiver_id = (select auth.uid()));

create policy "notifications_update_own"
on public.notifications
for update
to authenticated
using (receiver_id = (select auth.uid()))
with check (receiver_id = (select auth.uid()));

create policy "notifications_delete_own"
on public.notifications
for delete
to authenticated
using (receiver_id = (select auth.uid()));
