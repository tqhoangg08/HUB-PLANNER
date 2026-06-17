-- Tighten the remaining high-risk "always true" write/update/delete policies.
-- Public form submissions still work through protected-submit endpoints using
-- service role + Turnstile; direct REST writes get basic shape/ownership checks.

do $drop_permissive_security_policies$
declare
  policy_name text;
begin
  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'ai_chat_logs'
      and p.policyname in (
        'Public_Insert',
        'Public_Update',
        'Public_Select',
        'ai_chat_logs_select_own',
        'ai_chat_logs_update_own',
        'ai_chat_logs_insert_own'
      )
  loop
    execute format('drop policy if exists %I on public.ai_chat_logs', policy_name);
  end loop;

  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'bug_reports'
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on public.bug_reports', policy_name);
  end loop;

  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'course_reports'
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on public.course_reports', policy_name);
  end loop;

  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'event_reports'
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on public.event_reports', policy_name);
  end loop;

  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'feedback'
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on public.feedback', policy_name);
  end loop;

  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'ctv_requests'
      and p.cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.ctv_requests', policy_name);
  end loop;

  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'donations'
      and p.cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.donations', policy_name);
  end loop;

  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'user_course_requests'
      and p.cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.user_course_requests', policy_name);
  end loop;

  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'lost_found_items'
      and (
        p.policyname in (
          'lost_found_items_anon_insert',
          'lost_found_items_authenticated_all',
          'Public_Insert_Pending',
          'Admin_Full_Access',
          'Owner_Update_LostFound',
          'Admin_CTV_Edit_LostFound',
          'Only_Admin_Delete_LostFound',
          'lost_found_items_select_authenticated_visible'
        )
        or p.cmd in ('INSERT', 'UPDATE', 'DELETE')
      )
  loop
    execute format('drop policy if exists %I on public.lost_found_items', policy_name);
  end loop;
end;
$drop_permissive_security_policies$;

-- AI chat history: server writes the answer using service role; users can only
-- see and edit their own saved history rows from the UI.
create policy "ai_chat_logs_select_own"
on public.ai_chat_logs
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "ai_chat_logs_update_own"
on public.ai_chat_logs
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "ai_chat_logs_insert_own"
on public.ai_chat_logs
for insert
to authenticated
with check (user_id = (select auth.uid()));

-- Moderation/report tables: public can submit pending rows, staff can manage.
create policy "bug_reports_insert_public_pending"
on public.bug_reports
for insert
to anon, authenticated
with check (
  coalesce(status, 'pending'::text) = 'pending'::text
  and nullif(btrim(error_location), '') is not null
  and nullif(btrim(description), '') is not null
  and (user_id is null or user_id = (select auth.uid()))
);

create policy "bug_reports_update_staff"
on public.bug_reports
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

create policy "bug_reports_delete_staff"
on public.bug_reports
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

create policy "course_reports_insert_public_pending"
on public.course_reports
for insert
to anon, authenticated
with check (
  coalesce(status, 'pending'::text) = 'pending'::text
  and nullif(btrim(course_code), '') is not null
  and nullif(btrim(subject_name), '') is not null
  and nullif(btrim(error_description), '') is not null
  and (user_id is null or user_id = (select auth.uid()))
);

create policy "course_reports_update_staff"
on public.course_reports
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

create policy "course_reports_delete_staff"
on public.course_reports
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

create policy "event_reports_insert_public_pending"
on public.event_reports
for insert
to anon, authenticated
with check (
  coalesce(status, 'pending'::text) = 'pending'::text
  and nullif(btrim(event_name), '') is not null
  and nullif(btrim(issue_description), '') is not null
  and (user_id is null or user_id = (select auth.uid()))
);

create policy "event_reports_update_staff"
on public.event_reports
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

create policy "event_reports_delete_staff"
on public.event_reports
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

create policy "feedback_insert_public"
on public.feedback
for insert
to anon, authenticated
with check (
  nullif(btrim(type), '') is not null
  and nullif(btrim(content), '') is not null
  and (status is null or status in ('new', 'pending'))
  and (user_id is null or user_id = (select auth.uid()))
);

create policy "feedback_update_staff"
on public.feedback
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

create policy "feedback_delete_staff"
on public.feedback
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

create policy "ctv_requests_insert_public_pending"
on public.ctv_requests
for insert
to anon, authenticated
with check (
  coalesce(status, 'pending'::text) = 'pending'::text
  and nullif(btrim(full_name), '') is not null
  and nullif(btrim(student_batch), '') is not null
  and nullif(btrim(major), '') is not null
  and nullif(btrim(contact_info), '') is not null
  and (user_id is null or user_id = (select auth.uid()))
);

create policy "donations_insert_public"
on public.donations
for insert
to anon, authenticated
with check (
  nullif(btrim(name), '') is not null
  and amount > 0
);

create policy "user_course_requests_insert_own_pending"
on public.user_course_requests
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce(status, 'pending'::text) = 'pending'::text
  and nullif(btrim(subject_name), '') is not null
  and nullif(btrim(course_code), '') is not null
);

-- Lost & Found: public can submit pending items; signed-in users manage their
-- own items; staff can moderate all items.
create policy "lost_found_items_anon_insert_pending"
on public.lost_found_items
for insert
to anon
with check (
  coalesce(status, 'pending'::text) = 'pending'::text
  and coalesce(is_deleted, false) = false
  and user_id is null
  and nullif(btrim(title), '') is not null
  and nullif(btrim(location), '') is not null
  and nullif(btrim(contact_info), '') is not null
  and type in ('LOST', 'FOUND')
);

create policy "lost_found_items_insert_own_pending"
on public.lost_found_items
for insert
to authenticated
with check (
  coalesce(status, 'pending'::text) = 'pending'::text
  and coalesce(is_deleted, false) = false
  and (user_id is null or user_id = (select auth.uid()))
  and nullif(btrim(title), '') is not null
  and nullif(btrim(location), '') is not null
  and nullif(btrim(contact_info), '') is not null
  and type in ('LOST', 'FOUND')
);

create policy "lost_found_items_select_authenticated_visible"
on public.lost_found_items
for select
to authenticated
using (
  status in ('approved', 'resolved')
  or user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'ctv')
  )
);

create policy "lost_found_items_update_owner_or_staff"
on public.lost_found_items
for update
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'ctv')
  )
)
with check (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'ctv')
  )
);

create policy "lost_found_items_delete_admin"
on public.lost_found_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role = 'admin'
  )
);
