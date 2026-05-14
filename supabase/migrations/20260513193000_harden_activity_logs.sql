alter table if exists public.activity_logs
  add column if not exists user_role text,
  add column if not exists action_label text,
  add column if not exists page_path text,
  add column if not exists status text not null default 'success',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists error_message text;

create index if not exists idx_activity_logs_created_at
  on public.activity_logs (created_at desc);

create index if not exists idx_activity_logs_user_id_created_at
  on public.activity_logs (user_id, created_at desc);

create index if not exists idx_activity_logs_action_created_at
  on public.activity_logs (action, created_at desc);

create index if not exists idx_activity_logs_target_table_created_at
  on public.activity_logs (target_table, created_at desc);

create index if not exists idx_activity_logs_status_created_at
  on public.activity_logs (status, created_at desc);

create or replace function public.activity_actor_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select ur.role
      from public.user_roles ur
      where ur.user_id = auth.uid()
         or ur.id = auth.uid()
      limit 1
    ),
    (
      select ur.role
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.id
      where p.email = auth.email()
      limit 1
    ),
    'student'
  );
$$;

create or replace function public.is_activity_log_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where (ur.user_id = auth.uid() or ur.id = auth.uid())
      and ur.role = 'admin'
  ) or exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.email = auth.email()
      and ur.role = 'admin'
  );
$$;

drop policy if exists "Allow admin read all, user read own" on public.activity_logs;
drop policy if exists "Allow all users to insert logs" on public.activity_logs;
drop policy if exists "Allow insert for all" on public.activity_logs;
drop policy if exists "Only Admin can view logs" on public.activity_logs;
drop policy if exists "Admins and auditors can read activity logs" on public.activity_logs;
drop policy if exists "Admins can read activity logs" on public.activity_logs;
drop policy if exists "Authenticated users can insert own activity logs" on public.activity_logs;

alter table public.activity_logs enable row level security;

create policy "Admins can read activity logs"
on public.activity_logs
for select
to authenticated
using (public.is_activity_log_admin());

create policy "Authenticated users can insert own activity logs"
on public.activity_logs
for insert
to authenticated
with check (
  user_id is null
  or user_id = auth.uid()
);

create or replace function public.log_user_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  headers jsonb;
  client_ip text;
  client_device text;
  actor_email text;
  actor_role text;
  action_type text;
  target_id_text text;
  old_payload jsonb;
  new_payload jsonb;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
    client_ip := coalesce(
      headers ->> 'cf-connecting-ip',
      headers ->> 'x-forwarded-for',
      headers ->> 'x-real-ip'
    );
    client_device := headers ->> 'user-agent';
  exception when others then
    client_ip := null;
    client_device := null;
  end;

  actor_email := auth.email();
  actor_role := public.activity_actor_role();

  if actor_role not in ('admin', 'auditor') then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    action_type := 'create_' || TG_TABLE_NAME;
    target_id_text := coalesce((to_jsonb(NEW) ->> 'id'), null);
    old_payload := null;
    new_payload := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    if coalesce((to_jsonb(OLD) ->> 'status'), '') <> coalesce((to_jsonb(NEW) ->> 'status'), '')
       and (to_jsonb(NEW) ->> 'status') in ('approved', 'rejected') then
      action_type := case
        when (to_jsonb(NEW) ->> 'status') = 'approved' then 'approve_' || TG_TABLE_NAME
        else 'reject_' || TG_TABLE_NAME
      end;
    elsif coalesce((to_jsonb(OLD) ->> 'is_deleted'), 'false') = 'false'
       and coalesce((to_jsonb(NEW) ->> 'is_deleted'), 'false') = 'true' then
      action_type := 'delete_' || TG_TABLE_NAME;
    else
      action_type := 'update_' || TG_TABLE_NAME;
    end if;
    target_id_text := coalesce((to_jsonb(NEW) ->> 'id'), null);
    old_payload := to_jsonb(OLD);
    new_payload := to_jsonb(NEW);
  else
    action_type := 'delete_' || TG_TABLE_NAME;
    target_id_text := coalesce((to_jsonb(OLD) ->> 'id'), null);
    old_payload := to_jsonb(OLD);
    new_payload := null;
  end if;

  insert into public.activity_logs (
    user_id,
    user_email,
    user_role,
    action,
    target_table,
    target_id,
    old_data,
    new_data,
    details,
    metadata,
    status,
    ip_address,
    device_info,
    created_at
  )
  values (
    auth.uid(),
    actor_email,
    actor_role,
    action_type,
    TG_TABLE_NAME,
    target_id_text,
    old_payload,
    new_payload,
    jsonb_build_object('old', old_payload, 'new', new_payload),
    jsonb_build_object('source', 'db_trigger', 'operation', TG_OP),
    'success',
    client_ip,
    client_device,
    now()
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_event_change on public.events;
create trigger on_event_change
after insert or update or delete on public.events
for each row execute function public.log_user_activity();

drop trigger if exists on_lost_found_change on public.lost_found_items;
create trigger on_lost_found_change
after insert or update or delete on public.lost_found_items
for each row execute function public.log_user_activity();

drop trigger if exists on_course_schedule_change on public.course_schedules;
create trigger on_course_schedule_change
after insert or update or delete on public.course_schedules
for each row execute function public.log_user_activity();

drop trigger if exists on_user_course_request_change on public.user_course_requests;
create trigger on_user_course_request_change
after insert or update or delete on public.user_course_requests
for each row execute function public.log_user_activity();

drop trigger if exists on_course_report_change on public.course_reports;
create trigger on_course_report_change
after insert or update or delete on public.course_reports
for each row execute function public.log_user_activity();

drop trigger if exists on_school_announcement_change on public.school_announcements;
create trigger on_school_announcement_change
after insert or update or delete on public.school_announcements
for each row execute function public.log_user_activity();

drop trigger if exists on_ctv_request_change on public.ctv_requests;
create trigger on_ctv_request_change
after insert or update or delete on public.ctv_requests
for each row execute function public.log_user_activity();

drop trigger if exists on_event_candidate_change on public.event_candidates;
create trigger on_event_candidate_change
after insert or update or delete on public.event_candidates
for each row execute function public.log_user_activity();
