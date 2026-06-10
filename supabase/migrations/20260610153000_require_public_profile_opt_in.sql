alter table public.profiles
  add column if not exists public_profile_enabled boolean not null default false;

update public.profiles
set public_profile_enabled = false
where public_profile_enabled is distinct from false;

create or replace view public.public_profiles as
select
  id,
  full_name,
  student_code,
  avatar_url,
  created_at,
  bio,
  class_name,
  profile_tags,
  public_profile_enabled,
  coalesce(show_profile_stats, false) as show_profile_stats,
  case when coalesce(show_profile_stats, false) then public_gpa else null end as public_gpa,
  case when coalesce(show_profile_stats, false) then public_completed_semesters else null end as public_completed_semesters,
  case when coalesce(show_profile_stats, false) then public_credits else null end as public_credits
from public.profiles
where student_code is not null
  and public_profile_enabled is true;

grant select on public.public_profiles to anon;
grant select on public.public_profiles to authenticated;
