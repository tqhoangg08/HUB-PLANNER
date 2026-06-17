do $drop_course_schedule_admin_write_policies$
declare
  policy_name text;
begin
  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'course_schedules'
      and (
        p.cmd in ('UPDATE', 'DELETE', 'ALL')
        or p.policyname like '%tqhoangg2%'
      )
  loop
    execute format('drop policy if exists %I on public.course_schedules', policy_name);
  end loop;
end;
$drop_course_schedule_admin_write_policies$;

create policy "course_schedules_update_admin_email"
on public.course_schedules
for update
to authenticated
using (((select auth.jwt()) ->> 'email') = 'tqhoangg2@gmail.com')
with check (((select auth.jwt()) ->> 'email') = 'tqhoangg2@gmail.com');

create policy "course_schedules_delete_admin_email"
on public.course_schedules
for delete
to authenticated
using (((select auth.jwt()) ->> 'email') = 'tqhoangg2@gmail.com');
