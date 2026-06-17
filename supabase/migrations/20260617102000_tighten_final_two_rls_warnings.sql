-- Clear the last two RLS "always true" warnings without changing the main UX:
-- - user_participations: explicitly recreate owner-only policies.
-- - course_schedules: keep student-added courses possible, but prevent arbitrary
--   authenticated users from inserting official-looking system courses.

do $drop_user_participation_policies$
declare
  policy_name text;
begin
  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'user_participations'
  loop
    execute format('drop policy if exists %I on public.user_participations', policy_name);
  end loop;
end;
$drop_user_participation_policies$;

create policy "user_participations_select_own_or_admin"
on public.user_participations
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor')
  )
);

create policy "user_participations_insert_own"
on public.user_participations
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "user_participations_delete_own"
on public.user_participations
for delete
to authenticated
using (user_id = (select auth.uid()));

do $drop_course_schedules_insert_policies$
declare
  policy_name text;
begin
  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'course_schedules'
      and p.cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.course_schedules', policy_name);
  end loop;
end;
$drop_course_schedules_insert_policies$;

create policy "course_schedules_insert_user_added_or_admin"
on public.course_schedules
for insert
to authenticated
with check (
  nullif(btrim(course_code), '') is not null
  and nullif(btrim(subject_name), '') is not null
  and nullif(btrim(coalesce(semester, '')), '') is not null
  and (
    coalesce(is_user_added, false) = true
    or exists (
      select 1
      from public.user_roles ur
      where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
        and ur.role = 'admin'
    )
  )
);
