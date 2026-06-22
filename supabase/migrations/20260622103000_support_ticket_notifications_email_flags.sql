alter table public.support_tickets
  add column if not exists first_admin_reply_email_sent_at timestamptz,
  add column if not exists first_admin_reply_email_message_id uuid references public.support_ticket_messages(id) on delete set null;

create index if not exists support_tickets_first_admin_reply_email_idx
  on public.support_tickets (first_admin_reply_email_sent_at)
  where first_admin_reply_email_sent_at is not null;

create or replace function public.support_staff_recipient_ids(ticket_id uuid, actor_id uuid default null)
returns table (receiver_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with ticket as (
    select assigned_to
    from public.support_tickets
    where id = ticket_id
  ),
  assigned as (
    select assigned_to as id
    from ticket
    where assigned_to is not null
  ),
  all_staff as (
    select distinct coalesce(ur.user_id, ur.id) as id
    from public.user_roles ur
    where ur.role in ('admin', 'auditor', 'support')
      and coalesce(ur.user_id, ur.id) is not null
      and not exists (select 1 from assigned)
  )
  select id
  from (
    select id from assigned
    union
    select id from all_staff
  ) recipients
  where id is not null
    and (actor_id is null or id <> actor_id);
$$;

revoke all on function public.support_staff_recipient_ids(uuid, uuid) from public;
grant execute on function public.support_staff_recipient_ids(uuid, uuid) to authenticated, service_role;

create or replace function public.after_support_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_owner uuid;
  ticket_subject text;
  message_count integer;
  staff_user uuid;
  actor_name text;
begin
  update public.support_tickets
  set last_message_at = new.created_at,
      updated_at = now(),
      status = case
        when new.sender_role = 'user' and status = 'resolved' then 'pending'
        else status
      end
  where id = new.ticket_id
  returning user_id, subject into ticket_owner, ticket_subject;

  if new.is_internal_note then
    return new;
  end if;

  select coalesce(full_name, email, student_code, 'User')
  into actor_name
  from public.profiles
  where id = new.sender_id;

  if new.sender_role in ('admin', 'support') and ticket_owner is not null and ticket_owner <> new.sender_id then
    insert into public.notifications (receiver_id, actor_id, type, content, link, is_read)
    values (
      ticket_owner,
      new.sender_id,
      'support_ticket_reply',
      'HUB Planner vừa phản hồi ticket: ' || coalesce(ticket_subject, 'Hỗ trợ'),
      '/support/' || new.ticket_id::text,
      false
    );
  elsif new.sender_role = 'user' then
    select count(*) into message_count
    from public.support_ticket_messages stm
    where stm.ticket_id = new.ticket_id
      and stm.is_internal_note = false;

    for staff_user in
      select receiver_id from public.support_staff_recipient_ids(new.ticket_id, new.sender_id)
    loop
      insert into public.notifications (receiver_id, actor_id, type, content, link, is_read)
      values (
        staff_user,
        new.sender_id,
        case when message_count <= 1 then 'support_ticket_created' else 'support_ticket_user_reply' end,
        case
          when message_count <= 1 then coalesce(actor_name, 'User') || ' vừa tạo ticket: ' || coalesce(ticket_subject, 'Hỗ trợ')
          else coalesce(actor_name, 'User') || ' vừa phản hồi ticket: ' || coalesce(ticket_subject, 'Hỗ trợ')
        end,
        '/admin/support/' || new.ticket_id::text,
        false
      );
    end loop;
  end if;

  return new;
end;
$$;

create or replace function public.after_support_ticket_update_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_user uuid;
  actor uuid;
begin
  actor := coalesce(new.resolved_by, auth.uid());

  if new.status is distinct from old.status and new.status in ('resolved', 'closed') then
    if actor is null or actor <> new.user_id then
      insert into public.notifications (receiver_id, actor_id, type, content, link, is_read)
      values (
        new.user_id,
        actor,
        'support_ticket_resolved',
        'Ticket đã được xử lý xong: ' || coalesce(new.subject, 'Hỗ trợ'),
        '/support/' || new.id::text,
        false
      );
    else
      for staff_user in
        select receiver_id from public.support_staff_recipient_ids(new.id, actor)
      loop
        insert into public.notifications (receiver_id, actor_id, type, content, link, is_read)
        values (
          staff_user,
          actor,
          'support_ticket_resolved',
          'User đã đánh dấu ticket đã xử lý xong: ' || coalesce(new.subject, 'Hỗ trợ'),
          '/admin/support/' || new.id::text,
          false
        );
      end loop;
    end if;
  end if;

  return new;
end;
$$;
