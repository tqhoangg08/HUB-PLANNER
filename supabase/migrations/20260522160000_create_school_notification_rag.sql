create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.school_notifications (
  id uuid primary key default gen_random_uuid(),
  title text,
  department text,
  published_date date,
  detail_url text unique not null,
  pdf_url text,
  pdf_file_path text,
  extracted_text_file_path text,
  extracted_text text,
  extraction_method text check (extraction_method in ('pdf_text', 'ocr', 'html_text') or extraction_method is null),
  extraction_status text check (extraction_status in ('success', 'failed', 'need_review') or extraction_status is null),
  extraction_error text,
  content_hash text,
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_chunks (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.school_notifications(id) on delete cascade,
  chunk_text text not null,
  chunk_index int not null,
  embedding vector(768),
  title text,
  published_date date,
  detail_url text,
  pdf_url text,
  created_at timestamptz not null default now(),
  unique (notification_id, chunk_index)
);

create table if not exists public.school_notification_crawl_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  crawled_count int not null default 0,
  pdf_success_count int not null default 0,
  ocr_count int not null default 0,
  failed_count int not null default 0,
  new_items jsonb not null default '[]'::jsonb,
  error_message text
);

create table if not exists public.school_notification_backfill_progress (
  source_id text primary key,
  source_url text not null,
  department text,
  next_page int not null default 1,
  max_page int not null default 80,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_notifications_published_date_idx
  on public.school_notifications (published_date desc nulls last);

create index if not exists school_notifications_last_crawled_at_idx
  on public.school_notifications (last_crawled_at desc nulls last);

create index if not exists notification_chunks_notification_id_idx
  on public.notification_chunks (notification_id);

create index if not exists notification_chunks_published_date_idx
  on public.notification_chunks (published_date desc nulls last);

create index if not exists school_notification_backfill_progress_status_idx
  on public.school_notification_backfill_progress (status, next_page);

create index if not exists notification_chunks_embedding_idx
  on public.notification_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.set_school_notification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_school_notifications_updated_at on public.school_notifications;
create trigger trg_school_notifications_updated_at
before update on public.school_notifications
for each row
execute function public.set_school_notification_updated_at();

drop trigger if exists trg_school_notification_backfill_progress_updated_at on public.school_notification_backfill_progress;
create trigger trg_school_notification_backfill_progress_updated_at
before update on public.school_notification_backfill_progress
for each row
execute function public.set_school_notification_updated_at();

create or replace function public.match_notification_chunks(
  query_embedding vector(768),
  match_threshold double precision default 0.58,
  match_count integer default 8
)
returns table (
  id uuid,
  notification_id uuid,
  chunk_text text,
  chunk_index int,
  title text,
  published_date date,
  detail_url text,
  pdf_url text,
  similarity double precision,
  recency_score double precision,
  rank_score double precision
)
language sql
stable
as $$
  select
    nc.id,
    nc.notification_id,
    nc.chunk_text,
    nc.chunk_index,
    nc.title,
    nc.published_date,
    nc.detail_url,
    nc.pdf_url,
    1 - (nc.embedding <=> query_embedding) as similarity,
    case
      when nc.published_date is null then 0
      else least(1, greatest(0, 1 - ((current_date - nc.published_date) / 365.0)))
    end as recency_score,
    (1 - (nc.embedding <=> query_embedding))
      + (
        case
          when nc.published_date is null then 0
          else least(1, greatest(0, 1 - ((current_date - nc.published_date) / 365.0))) * 0.06
        end
      ) as rank_score
  from public.notification_chunks nc
  where nc.embedding is not null
    and 1 - (nc.embedding <=> query_embedding) >= match_threshold
  order by rank_score desc, nc.published_date desc nulls last
  limit match_count;
$$;

alter table public.school_notifications enable row level security;
alter table public.notification_chunks enable row level security;
alter table public.school_notification_crawl_runs enable row level security;
alter table public.school_notification_backfill_progress enable row level security;

drop policy if exists "Public can read school notifications" on public.school_notifications;
create policy "Public can read school notifications"
on public.school_notifications for select
using (true);

drop policy if exists "Public can read notification chunks metadata" on public.notification_chunks;
create policy "Public can read notification chunks metadata"
on public.notification_chunks for select
using (true);

grant select on public.school_notifications to anon, authenticated;
grant select on public.notification_chunks to anon, authenticated;
grant execute on function public.match_notification_chunks(vector, double precision, integer) to anon, authenticated, service_role;
