drop policy if exists "Authenticated users can insert own activity logs" on public.activity_logs;

create policy "Authenticated users can insert own activity logs"
on public.activity_logs
for insert
to authenticated
with check (
  user_id is null
  or user_id = (select auth.uid())
);

drop policy if exists "Admin xem toan bo don" on public.ctv_requests;
drop policy if exists "Admin duyet don" on public.ctv_requests;
drop policy if exists "Cho phep tat ca moi nguoi gui don" on public.ctv_requests;
drop policy if exists "Cho phep user gui don" on public.ctv_requests;

create policy "ctv_requests_insert_public"
on public.ctv_requests
for insert
with check (true);

create policy "ctv_requests_select_staff"
on public.ctv_requests
for select
to authenticated
using (
  (
    select ur.role
    from public.user_roles ur
    where ur.id = (select auth.uid())
       or ur.user_id = (select auth.uid())
    limit 1
  ) = any (array['admin'::text, 'ctv'::text])
);

create policy "ctv_requests_update_staff"
on public.ctv_requests
for update
to authenticated
using (
  (
    select ur.role
    from public.user_roles ur
    where ur.id = (select auth.uid())
       or ur.user_id = (select auth.uid())
    limit 1
  ) = any (array['admin'::text, 'ctv'::text])
)
with check (
  (
    select ur.role
    from public.user_roles ur
    where ur.id = (select auth.uid())
       or ur.user_id = (select auth.uid())
    limit 1
  ) = any (array['admin'::text, 'ctv'::text])
);

drop policy if exists "Enable select for service role only" on public.feedback;

drop policy if exists "Admin duoc xem feedback" on public.feedback;
drop policy if exists "Admin duoc sua feedback" on public.feedback;
drop policy if exists "Admin duoc xoa feedback" on public.feedback;

create policy "feedback_select_authenticated"
on public.feedback
for select
to authenticated
using (true);

create policy "feedback_update_authenticated"
on public.feedback
for update
to authenticated
using (true)
with check (true);

create policy "feedback_delete_authenticated"
on public.feedback
for delete
to authenticated
using (true);

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
  or ((select auth.jwt()) ->> 'email') = 'tqhoangg2@gmail.com'
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

do $drop_course_schedule_admin_write_policies$
declare
  policy_name text;
begin
  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'course_schedules'
      and p.cmd in ('UPDATE', 'DELETE')
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
