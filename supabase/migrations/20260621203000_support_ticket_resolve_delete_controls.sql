alter table public.support_tickets
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolved_by_role text;

alter table public.support_tickets
  drop constraint if exists support_tickets_resolved_by_role_check;

alter table public.support_tickets
  add constraint support_tickets_resolved_by_role_check
  check (resolved_by_role is null or resolved_by_role in ('user', 'admin', 'support', 'auditor'));

create or replace function public.guard_support_message_insert_open_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_status text;
begin
  select status into ticket_status
  from public.support_tickets
  where id = new.ticket_id;

  if ticket_status in ('resolved', 'closed') then
    raise exception 'Ticket đã đóng, không thể gửi thêm phản hồi.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_support_messages_guard_open_ticket on public.support_ticket_messages;
create trigger trg_support_messages_guard_open_ticket
before insert on public.support_ticket_messages
for each row
execute function public.guard_support_message_insert_open_ticket();

create or replace function public.guard_support_ticket_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.user_id is not distinct from old.user_id
    and new.assigned_to is not distinct from old.assigned_to
    and new.subject is not distinct from old.subject
    and new.category is not distinct from old.category
    and new.priority is not distinct from old.priority
    and new.initial_message is not distinct from old.initial_message
    and new.attachment_urls is not distinct from old.attachment_urls
    and new.created_at is not distinct from old.created_at
    and new.resolved_at is not distinct from old.resolved_at
    and new.resolved_by is not distinct from old.resolved_by
    and new.resolved_by_role is not distinct from old.resolved_by_role
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
