create table if not exists public.school_announcement_push_queue (
  id uuid primary key default gen_random_uuid(),
  announcement_id bigint not null references public.school_announcements(id) on delete cascade,
  title text not null,
  link text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  failed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  unique (announcement_id)
);

create index if not exists idx_school_announcement_push_queue_due
  on public.school_announcement_push_queue (scheduled_at)
  where sent_at is null and failed_at is null;

alter table public.school_announcement_push_queue enable row level security;

grant all on table public.school_announcement_push_queue to service_role;
