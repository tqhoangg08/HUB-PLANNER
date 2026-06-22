create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  subject text not null,
  category text not null,
  priority text not null default 'normal',
  status text not null default 'open',
  initial_message text,
  attachment_urls jsonb not null default '[]'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_subject_length check (char_length(trim(subject)) between 3 and 160),
  constraint support_tickets_category_check check (category in ('login', 'grades', 'events', 'schedule', 'lost_found', 'feedback', 'other')),
  constraint support_tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint support_tickets_status_check check (status in ('open', 'pending', 'resolved', 'closed'))
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null,
  body text not null,
  attachment_urls jsonb not null default '[]'::jsonb,
  is_internal_note boolean not null default false,
  created_at timestamptz not null default now(),
  constraint support_ticket_messages_body_length check (char_length(trim(body)) between 1 and 4000),
  constraint support_ticket_messages_sender_role_check check (sender_role in ('user', 'admin', 'support'))
);

create index if not exists support_tickets_user_id_idx
  on public.support_tickets (user_id);

create index if not exists support_tickets_status_idx
  on public.support_tickets (status);

create index if not exists support_tickets_created_at_idx
  on public.support_tickets (created_at desc);

create index if not exists support_tickets_last_message_at_idx
  on public.support_tickets (last_message_at desc);

create index if not exists support_ticket_messages_ticket_id_idx
  on public.support_ticket_messages (ticket_id);

create index if not exists support_ticket_messages_created_at_idx
  on public.support_ticket_messages (created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

create or replace function public.is_support_staff(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where (ur.id = check_user_id or ur.user_id = check_user_id)
      and ur.role in ('admin', 'auditor', 'support')
  );
$$;

revoke all on function public.is_support_staff(uuid) from public;
grant execute on function public.is_support_staff(uuid) to authenticated;

create or replace function public.touch_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_support_tickets_touch on public.support_tickets;
create trigger trg_support_tickets_touch
before update on public.support_tickets
for each row
execute function public.touch_support_ticket();

create or replace function public.guard_support_ticket_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not distinct from old.user_id
    and new.assigned_to is not distinct from old.assigned_to
    and new.subject is not distinct from old.subject
    and new.category is not distinct from old.category
    and new.priority is not distinct from old.priority
    and new.initial_message is not distinct from old.initial_message
    and new.attachment_urls is not distinct from old.attachment_urls
    and new.created_at is not distinct from old.created_at
    and new.last_message_at is distinct from old.last_message_at
    and (
      new.status is not distinct from old.status
      or (old.status = 'resolved' and new.status = 'pending')
    ) then
    return new;
  end if;

  if not public.is_support_staff(auth.uid()) then
    raise exception 'Only support staff can update support tickets';
  end if;

  if new.user_id is distinct from old.user_id
    or new.subject is distinct from old.subject
    or new.category is distinct from old.category
    or new.initial_message is distinct from old.initial_message
    or new.attachment_urls is distinct from old.attachment_urls
    or new.created_at is distinct from old.created_at then
    raise exception 'Protected support ticket fields cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_support_tickets_guard_update on public.support_tickets;
create trigger trg_support_tickets_guard_update
before update on public.support_tickets
for each row
execute function public.guard_support_ticket_update();

create or replace function public.after_support_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_owner uuid;
  staff_user uuid;
begin
  update public.support_tickets
  set last_message_at = new.created_at,
      updated_at = now(),
      status = case
        when new.sender_role = 'user' and status = 'resolved' then 'pending'
        else status
      end
  where id = new.ticket_id
  returning user_id into ticket_owner;

  if new.is_internal_note then
    return new;
  end if;

  if new.sender_role in ('admin', 'support') and ticket_owner is not null and ticket_owner <> new.sender_id then
    insert into public.notifications (receiver_id, actor_id, type, content, link)
    values (
      ticket_owner,
      new.sender_id,
      'support_ticket_reply',
      'đã phản hồi ticket hỗ trợ của bạn.',
      '/support/' || new.ticket_id::text
    );
  elsif new.sender_role = 'user' then
    for staff_user in
      select distinct coalesce(ur.user_id, ur.id)
      from public.user_roles ur
      where ur.role in ('admin', 'auditor', 'support')
        and coalesce(ur.user_id, ur.id) is not null
        and coalesce(ur.user_id, ur.id) <> new.sender_id
    loop
      insert into public.notifications (receiver_id, actor_id, type, content, link)
      values (
        staff_user,
        new.sender_id,
        'support_ticket_user_reply',
        'đã gửi phản hồi mới trong ticket hỗ trợ.',
        '/admin/support/' || new.ticket_id::text
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_support_messages_after_insert on public.support_ticket_messages;
create trigger trg_support_messages_after_insert
after insert on public.support_ticket_messages
for each row
execute function public.after_support_message_insert();

create or replace function public.after_support_ticket_update_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.user_id <> auth.uid() then
    insert into public.notifications (receiver_id, actor_id, type, content, link)
    values (
      new.user_id,
      auth.uid(),
      'support_ticket_status',
      'đã cập nhật trạng thái ticket hỗ trợ của bạn.',
      '/support/' || new.id::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_support_tickets_after_update_notify on public.support_tickets;
create trigger trg_support_tickets_after_update_notify
after update on public.support_tickets
for each row
execute function public.after_support_ticket_update_notify();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_messages'
  ) then
    alter publication supabase_realtime add table public.support_ticket_messages;
  end if;
end $$;

drop policy if exists "support_tickets_select_own_or_staff" on public.support_tickets;
create policy "support_tickets_select_own_or_staff"
on public.support_tickets
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_support_staff((select auth.uid())));

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own"
on public.support_tickets
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "support_tickets_update_staff" on public.support_tickets;
create policy "support_tickets_update_staff"
on public.support_tickets
for update
to authenticated
using (public.is_support_staff((select auth.uid())))
with check (public.is_support_staff((select auth.uid())));

drop policy if exists "support_messages_select_visible" on public.support_ticket_messages;
create policy "support_messages_select_visible"
on public.support_ticket_messages
for select
to authenticated
using (
  public.is_support_staff((select auth.uid()))
  or (
    not is_internal_note
    and exists (
      select 1
      from public.support_tickets st
      where st.id = ticket_id
        and st.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "support_messages_insert_user_own" on public.support_ticket_messages;
create policy "support_messages_insert_user_own"
on public.support_ticket_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and sender_role = 'user'
  and is_internal_note = false
  and exists (
    select 1
    from public.support_tickets st
    where st.id = ticket_id
      and st.user_id = (select auth.uid())
  )
);

drop policy if exists "support_messages_insert_staff" on public.support_ticket_messages;
create policy "support_messages_insert_staff"
on public.support_ticket_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and sender_role in ('admin', 'support')
  and public.is_support_staff((select auth.uid()))
);

grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_ticket_messages to authenticated;
