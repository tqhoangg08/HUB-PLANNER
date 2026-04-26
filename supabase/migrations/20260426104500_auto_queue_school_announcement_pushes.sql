create or replace function public.queue_school_announcement_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_scheduled_at timestamptz;
begin
  if new.is_new is not true or new.is_hidden is true then
    return new;
  end if;

  select coalesce(max(scheduled_at) + interval '10 minutes', now())
    into next_scheduled_at
  from public.school_announcement_push_queue
  where sent_at is null and failed_at is null;

  insert into public.school_announcement_push_queue (
    announcement_id,
    title,
    link,
    scheduled_at
  )
  values (
    new.id,
    new.title,
    new.link,
    next_scheduled_at
  )
  on conflict (announcement_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_queue_school_announcement_push on public.school_announcements;

create trigger trg_queue_school_announcement_push
after insert on public.school_announcements
for each row
execute function public.queue_school_announcement_push();
