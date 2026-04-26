create or replace function public.queue_lost_found_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_scheduled_at timestamptz;
  push_title text;
  push_body text;
  poster_name text;
  item_name text;
  item_location text;
begin
  if new.status <> 'approved' or new.is_deleted is true then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;
  end if;

  poster_name := coalesce(nullif(trim(new.user_name), ''), 'Một bạn HUB');
  item_name := coalesce(nullif(trim(new.title), ''), 'một món đồ');
  item_location := coalesce(nullif(trim(new.location), ''), 'khu vực HUB');

  if new.type = 'FOUND' then
    push_title := 'Có đồ vừa được nhặt';
    push_body := poster_name || ' vừa nhặt được ' || item_name || ' ở ' || item_location || '.';
  else
    push_title := 'Có bạn vừa báo mất đồ';
    push_body := poster_name || ' vừa làm mất ' || item_name || ' ở ' || item_location || '.';
  end if;

  select coalesce(max(scheduled_at) + interval '10 minutes', now())
    into next_scheduled_at
  from public.lost_found_push_queue
  where sent_at is null and failed_at is null;

  insert into public.lost_found_push_queue (
    lost_found_item_id,
    title,
    body,
    url,
    scheduled_at
  )
  values (
    new.id,
    push_title,
    push_body,
    '/lost-found',
    next_scheduled_at
  )
  on conflict (lost_found_item_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_queue_lost_found_push on public.lost_found_items;

create trigger trg_queue_lost_found_push
after insert or update of status on public.lost_found_items
for each row
execute function public.queue_lost_found_push();
