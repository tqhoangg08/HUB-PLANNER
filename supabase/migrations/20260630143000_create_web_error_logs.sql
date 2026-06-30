create table if not exists public.web_error_logs (
  id uuid primary key default gen_random_uuid(),

  user_id uuid null,
  session_id text,

  level text not null default 'error',
  source text not null,
  action text,
  page_path text,

  error_name text,
  error_message text not null,
  error_code text,
  stack text,

  metadata jsonb not null default '{}'::jsonb,

  user_agent text,
  app_version text,

  created_at timestamptz not null default now()
);

create index if not exists idx_web_error_logs_created_at
on public.web_error_logs(created_at desc);

create index if not exists idx_web_error_logs_user_id
on public.web_error_logs(user_id);

create index if not exists idx_web_error_logs_error_code
on public.web_error_logs(error_code);

alter table public.web_error_logs enable row level security;

drop policy if exists "Authenticated users can insert own error logs"
on public.web_error_logs;

create policy "Authenticated users can insert own error logs"
on public.web_error_logs
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);
