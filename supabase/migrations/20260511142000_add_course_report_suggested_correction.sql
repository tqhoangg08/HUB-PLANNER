alter table public.course_reports
  add column if not exists suggested_correction text;
