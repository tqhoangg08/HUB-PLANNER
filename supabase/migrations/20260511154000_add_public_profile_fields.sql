alter table public.profiles
  add column if not exists profile_tags text[] default '{}'::text[],
  add column if not exists show_profile_stats boolean default false,
  add column if not exists public_gpa numeric,
  add column if not exists public_completed_semesters integer,
  add column if not exists public_credits integer;
