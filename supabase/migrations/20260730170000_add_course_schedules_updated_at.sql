alter table public.course_schedules
  add column if not exists updated_at timestamptz;

update public.course_schedules
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.course_schedules
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.set_course_schedules_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_course_schedules_updated_at
  on public.course_schedules;

create trigger trg_set_course_schedules_updated_at
before update on public.course_schedules
for each row
execute function public.set_course_schedules_updated_at();

create index if not exists course_schedules_updated_at_idx
  on public.course_schedules (updated_at, id);

revoke all on function public.set_course_schedules_updated_at() from public;
revoke all on function public.set_course_schedules_updated_at() from anon;
revoke all on function public.set_course_schedules_updated_at() from authenticated;
grant execute on function public.set_course_schedules_updated_at() to service_role;
