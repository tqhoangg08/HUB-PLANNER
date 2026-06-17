drop policy if exists "Admins can view private profiles" on public.profile_private_data;
drop policy if exists "Admins can update private profiles" on public.profile_private_data;
drop policy if exists "Users can view own private profile" on public.profile_private_data;
drop policy if exists "Users can insert own private profile" on public.profile_private_data;
drop policy if exists "Users can update own private profile" on public.profile_private_data;

create policy "profile_private_data_select_own_or_staff"
on public.profile_private_data
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.user_id = (select auth.uid()) or ur.id = (select auth.uid()))
      and ur.role in ('admin', 'auditor')
  )
);

create policy "profile_private_data_insert_own"
on public.profile_private_data
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "profile_private_data_update_own_or_admin"
on public.profile_private_data
for update
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.user_id = (select auth.uid()) or ur.id = (select auth.uid()))
      and ur.role = 'admin'
  )
)
with check (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.user_id = (select auth.uid()) or ur.id = (select auth.uid()))
      and ur.role = 'admin'
  )
);
