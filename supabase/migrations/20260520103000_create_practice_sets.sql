drop table if exists public.practice_questions cascade;
drop table if exists public.practice_uploads cascade;

create table if not exists public.practice_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  source_type text not null default 'admin' check (source_type in ('admin', 'ai')),
  subject_name text not null,
  course_code text,
  chapter_title text,
  chapter_code text,
  title text not null,
  description text,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  visibility text not null default 'private' check (visibility in ('public', 'private', 'pro')),
  question_count integer not null default 0,
  estimated_minutes integer,
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'r2', 'external')),
  content_url text,
  content_key text not null,
  content_sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_sets_content_key_check check (content_key <> '')
);

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  set_id uuid not null references public.practice_sets(id) on delete cascade,
  score integer not null default 0,
  total_questions integer not null default 0,
  correct_count integer not null default 0,
  duration_seconds integer,
  weak_topics text[] not null default '{}',
  started_at timestamptz not null default now(),
  submitted_at timestamptz not null default now()
);

create table if not exists public.practice_pro_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practice_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.practice_attempts(id) on delete cascade,
  question_id text not null,
  selected_answer text,
  correct_answer text not null,
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.practice_sets
  add column if not exists chapter_title text,
  add column if not exists chapter_code text,
  add column if not exists estimated_minutes integer,
  add column if not exists content_key text,
  add column if not exists content_sha256 text;

alter table public.practice_sets
  alter column storage_provider set default 'supabase';

alter table public.practice_attempts
  add column if not exists total_questions integer not null default 0,
  add column if not exists correct_count integer not null default 0,
  add column if not exists weak_topics text[] not null default '{}',
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists submitted_at timestamptz not null default now();

alter table public.practice_sets enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.practice_pro_access enable row level security;
alter table public.practice_attempt_answers enable row level security;

drop policy if exists "practice_sets_public_select" on public.practice_sets;
create policy "practice_sets_public_select" on public.practice_sets
  for select using (visibility in ('public', 'pro') or auth.uid() = owner_id);

drop policy if exists "practice_sets_owner_insert" on public.practice_sets;
create policy "practice_sets_owner_insert" on public.practice_sets
  for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists "practice_sets_owner_update" on public.practice_sets;
create policy "practice_sets_owner_update" on public.practice_sets
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "practice_sets_owner_delete" on public.practice_sets;
create policy "practice_sets_owner_delete" on public.practice_sets
  for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists "practice_attempts_owner_select" on public.practice_attempts;
create policy "practice_attempts_owner_select" on public.practice_attempts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "practice_attempts_owner_insert" on public.practice_attempts;
create policy "practice_attempts_owner_insert" on public.practice_attempts
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "practice_pro_access_owner_select" on public.practice_pro_access;
create policy "practice_pro_access_owner_select" on public.practice_pro_access
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "practice_attempt_answers_owner_select" on public.practice_attempt_answers;
create policy "practice_attempt_answers_owner_select" on public.practice_attempt_answers
  for select to authenticated using (
    exists (
      select 1
      from public.practice_attempts a
      where a.id = practice_attempt_answers.attempt_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "practice_attempt_answers_owner_insert" on public.practice_attempt_answers;
create policy "practice_attempt_answers_owner_insert" on public.practice_attempt_answers
  for insert to authenticated with check (
    exists (
      select 1
      from public.practice_attempts a
      where a.id = practice_attempt_answers.attempt_id
        and a.user_id = auth.uid()
    )
  );

grant all on table public.practice_sets to anon, authenticated, service_role;
grant all on table public.practice_attempts to anon, authenticated, service_role;
grant all on table public.practice_pro_access to anon, authenticated, service_role;
grant all on table public.practice_attempt_answers to anon, authenticated, service_role;

create index if not exists practice_sets_visibility_created_idx
  on public.practice_sets (visibility, created_at desc);

create index if not exists practice_sets_subject_created_idx
  on public.practice_sets (subject_name, created_at desc);

create index if not exists practice_sets_content_key_idx
  on public.practice_sets (content_key);

create index if not exists practice_attempts_user_created_idx
  on public.practice_attempts (user_id, submitted_at desc);

create index if not exists practice_attempts_set_created_idx
  on public.practice_attempts (set_id, submitted_at desc);

create index if not exists practice_pro_access_expires_idx
  on public.practice_pro_access (expires_at);

create index if not exists practice_attempt_answers_attempt_idx
  on public.practice_attempt_answers (attempt_id);
