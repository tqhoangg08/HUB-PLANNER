drop policy if exists "Admin được quyền xem tất cả tkb" on public.user_schedules;
drop policy if exists "Cho phép sinh viên sửa lịch cá nhân" on public.user_schedules;
drop policy if exists "Enable delete for users based on user_id" on public.user_schedules;
drop policy if exists "Thêm môn vào TKB" on public.user_schedules;
drop policy if exists "Xem TKB của mình" on public.user_schedules;
drop policy if exists "Xóa môn TKB" on public.user_schedules;

create policy "user_schedules_select_own_or_staff"
on public.user_schedules
for select
to authenticated
using (
  user_id = (select auth.uid())
  or ((select auth.jwt()) ->> 'email') = 'tqhoangg2@gmail.com'
  or exists (
    select 1
    from public.user_roles ur
    where (ur.user_id = (select auth.uid()) or ur.id = (select auth.uid()))
      and ur.role in ('admin', 'auditor')
  )
);

create policy "user_schedules_insert_own"
on public.user_schedules
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "user_schedules_update_own"
on public.user_schedules
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "user_schedules_delete_own"
on public.user_schedules
for delete
to authenticated
using (user_id = (select auth.uid()));
