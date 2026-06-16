drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Bảo vệ dữ liệu điểm (Cá nhân & Admin)" on public.profiles;
drop policy if exists "Cho phép Auditor xem toàn bộ profiles" on public.profiles;
drop policy if exists "Chỉ sửa profile của chính mình" on public.profiles;
drop policy if exists "Chỉ tạo profile của chính mình" on public.profiles;
drop policy if exists "Chỉ xóa profile của chính mình" on public.profiles;
drop policy if exists "Enable delete for users based on id" on public.profiles;

create policy "profiles_select_own_or_staff"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.user_id = (select auth.uid()) or ur.id = (select auth.uid()))
      and ur.role in ('admin', 'auditor')
  )
);

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.user_id = (select auth.uid()) or ur.id = (select auth.uid()))
      and ur.role = 'admin'
  )
)
with check (
  id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.user_id = (select auth.uid()) or ur.id = (select auth.uid()))
      and ur.role = 'admin'
  )
);

create policy "profiles_delete_own"
on public.profiles
for delete
to authenticated
using (id = (select auth.uid()));
