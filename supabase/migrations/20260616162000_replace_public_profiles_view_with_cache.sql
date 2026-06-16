do $drop_public_profiles_view$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'public_profiles'
      and c.relkind = 'v'
  ) then
    execute 'drop view public.public_profiles';
  end if;
end;
$drop_public_profiles_view$;

create table if not exists public.public_profiles (
  id uuid primary key,
  full_name text,
  student_code text,
  avatar_url text,
  created_at timestamptz,
  bio text,
  class_name text,
  profile_tags text[] default '{}'::text[],
  public_profile_enabled boolean not null default true,
  show_profile_stats boolean not null default false,
  public_gpa numeric,
  public_completed_semesters integer,
  public_credits integer
);

alter table public.public_profiles enable row level security;

drop policy if exists "public_profiles_read" on public.public_profiles;
create policy "public_profiles_read"
on public.public_profiles
for select
to anon, authenticated
using (true);

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;
grant all on public.public_profiles to service_role;

create or replace function public.sync_public_profile_cache()
returns trigger
language plpgsql
security definer
set search_path = public
as $sync_public_profile_cache$
begin
  if tg_op = 'DELETE' then
    delete from public.public_profiles where id = old.id;
    return old;
  end if;

  if new.student_code is not null and coalesce(new.public_profile_enabled, false) is true then
    insert into public.public_profiles (
      id,
      full_name,
      student_code,
      avatar_url,
      created_at,
      bio,
      class_name,
      profile_tags,
      public_profile_enabled,
      show_profile_stats,
      public_gpa,
      public_completed_semesters,
      public_credits
    )
    values (
      new.id,
      new.full_name,
      new.student_code,
      new.avatar_url,
      new.created_at,
      new.bio,
      new.class_name,
      coalesce(new.profile_tags, '{}'::text[]),
      true,
      coalesce(new.show_profile_stats, false),
      case when coalesce(new.show_profile_stats, false) then new.public_gpa else null end,
      case when coalesce(new.show_profile_stats, false) then new.public_completed_semesters else null end,
      case when coalesce(new.show_profile_stats, false) then new.public_credits else null end
    )
    on conflict (id) do update set
      full_name = excluded.full_name,
      student_code = excluded.student_code,
      avatar_url = excluded.avatar_url,
      created_at = excluded.created_at,
      bio = excluded.bio,
      class_name = excluded.class_name,
      profile_tags = excluded.profile_tags,
      public_profile_enabled = excluded.public_profile_enabled,
      show_profile_stats = excluded.show_profile_stats,
      public_gpa = excluded.public_gpa,
      public_completed_semesters = excluded.public_completed_semesters,
      public_credits = excluded.public_credits;
  else
    delete from public.public_profiles where id = new.id;
  end if;

  return new;
end;
$sync_public_profile_cache$;

revoke all on function public.sync_public_profile_cache() from public, anon, authenticated;

drop trigger if exists trg_sync_public_profile_cache on public.profiles;
create trigger trg_sync_public_profile_cache
after insert or update or delete on public.profiles
for each row
execute function public.sync_public_profile_cache();

truncate table public.public_profiles;

insert into public.public_profiles (
  id,
  full_name,
  student_code,
  avatar_url,
  created_at,
  bio,
  class_name,
  profile_tags,
  public_profile_enabled,
  show_profile_stats,
  public_gpa,
  public_completed_semesters,
  public_credits
)
select
  id,
  full_name,
  student_code,
  avatar_url,
  created_at,
  bio,
  class_name,
  coalesce(profile_tags, '{}'::text[]),
  true,
  coalesce(show_profile_stats, false),
  case when coalesce(show_profile_stats, false) then public_gpa else null end,
  case when coalesce(show_profile_stats, false) then public_completed_semesters else null end,
  case when coalesce(show_profile_stats, false) then public_credits else null end
from public.profiles
where student_code is not null
  and coalesce(public_profile_enabled, false) is true;

notify pgrst, 'reload schema';
