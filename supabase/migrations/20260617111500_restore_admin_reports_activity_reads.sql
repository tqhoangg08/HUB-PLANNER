-- Restore the admin report/activity screens after tightening security rules.
-- These pages read a few nullable snapshot/compatibility columns that older
-- schemas may not have yet. Adding nullable columns is non-destructive.

alter table if exists public.course_reports
  add column if not exists full_name text,
  add column if not exists student_code text,
  add column if not exists email text;

alter table if exists public.bug_reports
  add column if not exists full_name text,
  add column if not exists student_code text,
  add column if not exists email text;

alter table if exists public.event_reports
  add column if not exists full_name text,
  add column if not exists student_code text,
  add column if not exists email text;

alter table if exists public.ctv_requests
  add column if not exists student_code text,
  add column if not exists email text;

alter table if exists public.activity_logs
  add column if not exists table_name text,
  add column if not exists record_id text;

-- Replace broad/legacy SELECT policies for moderation tables with explicit
-- staff-only reads. Public submissions still go through the existing INSERT
-- policies and the protected-submit endpoint.
drop policy if exists "Allow read access for authenticated users" on public.bug_reports;
drop policy if exists "bug_reports_select_staff" on public.bug_reports;

drop policy if exists "Admin duoc xem course_reports" on public.course_reports;
drop policy if exists "Cho phép người đã đăng nhập xem báo cáo" on public.course_reports;
drop policy if exists "course_reports_select_staff" on public.course_reports;

drop policy if exists "Admin xem toan bo don" on public.ctv_requests;
drop policy if exists "ctv_requests_select_staff" on public.ctv_requests;

drop policy if exists "Cho phép người đã đăng nhập xem báo cáo" on public.event_reports;
drop policy if exists "event_reports_select_staff" on public.event_reports;

drop policy if exists "Enable select for service role only" on public.feedback;
drop policy if exists "Admin duoc xem feedback" on public.feedback;
drop policy if exists "feedback_select_authenticated" on public.feedback;
drop policy if exists "feedback_select_staff" on public.feedback;

drop policy if exists "Allow admin read all, user read own" on public.activity_logs;
drop policy if exists "Only Admin can view logs" on public.activity_logs;
drop policy if exists "Admins and auditors can read activity logs" on public.activity_logs;
drop policy if exists "Admins can read activity logs" on public.activity_logs;
drop policy if exists "activity_logs_select_staff" on public.activity_logs;

drop policy if exists "ctv_requests_update_staff" on public.ctv_requests;
drop policy if exists "ctv_requests_delete_staff" on public.ctv_requests;

create policy "bug_reports_select_staff"
on public.bug_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor', 'ctv')
  )
);

create policy "course_reports_select_staff"
on public.course_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor', 'ctv')
  )
);

create policy "event_reports_select_staff"
on public.event_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor', 'ctv')
  )
);

create policy "feedback_select_staff"
on public.feedback
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor', 'ctv')
  )
);

create policy "ctv_requests_select_staff"
on public.ctv_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor', 'ctv')
  )
);

create policy "ctv_requests_update_staff"
on public.ctv_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor', 'ctv')
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor', 'ctv')
  )
);

create policy "ctv_requests_delete_staff"
on public.ctv_requests
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor', 'ctv')
  )
);

create policy "activity_logs_select_staff"
on public.activity_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'auditor')
  )
);
