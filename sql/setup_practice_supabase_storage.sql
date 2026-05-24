-- Run this in Supabase Dashboard > SQL Editor if `supabase db push` is blocked
-- by older migrations.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'practice-sets',
  'practice-sets',
  false,
  5242880,
  array['application/json']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.practice_sets
  drop constraint if exists practice_sets_public_url_check;

alter table public.practice_sets
  drop constraint if exists practice_sets_storage_provider_check;

alter table public.practice_sets
  add constraint practice_sets_storage_provider_check
  check (storage_provider in ('supabase', 'r2', 'external'));

alter table public.practice_sets
  alter column storage_provider set default 'supabase';
