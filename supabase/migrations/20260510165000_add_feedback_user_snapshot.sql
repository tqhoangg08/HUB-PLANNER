alter table public.feedback
  add column if not exists full_name text,
  add column if not exists student_code text,
  add column if not exists email text;

update public.feedback f
set
  full_name = coalesce(f.full_name, p.full_name),
  student_code = coalesce(f.student_code, p.student_code),
  email = coalesce(f.email, p.email)
from public.profiles p
where f.user_id = p.id
  and (
    f.full_name is null
    or f.student_code is null
    or f.email is null
  );
