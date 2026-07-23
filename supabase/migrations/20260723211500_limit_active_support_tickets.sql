create or replace function public.enforce_support_ticket_active_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_ticket_count integer;
begin
  if new.status not in ('open', 'pending') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status in ('open', 'pending') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select count(*)
  into active_ticket_count
  from public.support_tickets
  where user_id = new.user_id
    and status in ('open', 'pending')
    and (tg_op = 'INSERT' or id <> new.id);

  if active_ticket_count >= 3 then
    raise exception using
      errcode = 'P0001',
      message = 'support_ticket_active_limit: Bạn đang có 3 phiếu hỗ trợ chưa xử lý.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_support_tickets_active_limit on public.support_tickets;
create trigger trg_support_tickets_active_limit
before insert or update of status on public.support_tickets
for each row
execute function public.enforce_support_ticket_active_limit();

revoke all on function public.enforce_support_ticket_active_limit() from public;
grant execute on function public.enforce_support_ticket_active_limit() to service_role;
