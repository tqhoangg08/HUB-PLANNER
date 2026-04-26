create table if not exists public.lost_found_push_queue (
  id uuid primary key default gen_random_uuid(),
  lost_found_item_id bigint not null references public.lost_found_items(id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/lost-found',
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  failed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  unique (lost_found_item_id)
);

create index if not exists idx_lost_found_push_queue_due
  on public.lost_found_push_queue (scheduled_at)
  where sent_at is null and failed_at is null;

alter table public.lost_found_push_queue enable row level security;

grant all on table public.lost_found_push_queue to service_role;
