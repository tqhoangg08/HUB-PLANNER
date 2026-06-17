drop policy if exists "Sinh viên tự quản lý thông báo của mình" on public.push_subscriptions;

create policy "push_subscriptions_manage_own"
on public.push_subscriptions
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Authenticated users can insert own policy consents" on public.policy_consents;

create policy "policy_consents_insert_own_or_anonymous"
on public.policy_consents
for insert
to authenticated
with check (user_id is null or user_id = (select auth.uid()));

create index if not exists user_roles_user_id_idx
  on public.user_roles (user_id);
