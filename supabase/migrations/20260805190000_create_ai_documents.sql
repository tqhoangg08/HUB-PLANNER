create extension if not exists pgcrypto;

create table if not exists public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  original_file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  content_hash text not null,
  category text,
  academic_year text,
  program_code text,
  visibility text not null default 'public' check (visibility in ('public', 'program', 'admin')),
  version integer not null default 1 check (version > 0),
  gemini_store_name text,
  gemini_document_name text,
  gemini_operation_name text,
  indexing_status text not null default 'pending'
    check (indexing_status in ('pending','uploading','processing','completed','failed','deleting','deleted')),
  indexing_error text,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists ai_documents_active_hash_unique
  on public.ai_documents(content_hash) where deleted_at is null;
create index if not exists ai_documents_content_hash_idx on public.ai_documents(content_hash);
create index if not exists ai_documents_status_idx on public.ai_documents(indexing_status);
create index if not exists ai_documents_category_idx on public.ai_documents(category);
create index if not exists ai_documents_program_code_idx on public.ai_documents(program_code);
create index if not exists ai_documents_visibility_idx on public.ai_documents(visibility);
create index if not exists ai_documents_created_at_idx on public.ai_documents(created_at desc);

create or replace function public.set_ai_documents_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_documents_set_updated_at on public.ai_documents;
create trigger ai_documents_set_updated_at before update on public.ai_documents
for each row execute function public.set_ai_documents_updated_at();

alter table public.ai_documents enable row level security;

drop policy if exists "ai_documents_authenticated_read" on public.ai_documents;
create policy "ai_documents_authenticated_read" on public.ai_documents
for select to authenticated using (
  deleted_at is null and indexing_status = 'completed' and visibility = 'public'
);

drop policy if exists "ai_documents_admin_all" on public.ai_documents;
create policy "ai_documents_admin_all" on public.ai_documents
for all to authenticated using (
  exists (
    select 1 from public.user_roles ur
    where (ur.id = auth.uid() or ur.user_id = auth.uid()) and lower(ur.role) = 'admin'
  )
) with check (
  exists (
    select 1 from public.user_roles ur
    where (ur.id = auth.uid() or ur.user_id = auth.uid()) and lower(ur.role) = 'admin'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-documents', 'ai-documents', false, 20971520,
  array[
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ai_documents_storage_admin_select" on storage.objects;
create policy "ai_documents_storage_admin_select" on storage.objects
for select to authenticated using (
  bucket_id = 'ai-documents' and exists (
    select 1 from public.user_roles ur
    where (ur.id = auth.uid() or ur.user_id = auth.uid()) and lower(ur.role) = 'admin'
  )
);

drop policy if exists "ai_documents_storage_admin_insert" on storage.objects;
create policy "ai_documents_storage_admin_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'ai-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.user_roles ur
    where (ur.id = auth.uid() or ur.user_id = auth.uid()) and lower(ur.role) = 'admin'
  )
);

drop policy if exists "ai_documents_storage_admin_update" on storage.objects;
create policy "ai_documents_storage_admin_update" on storage.objects
for update to authenticated using (
  bucket_id = 'ai-documents' and exists (
    select 1 from public.user_roles ur
    where (ur.id = auth.uid() or ur.user_id = auth.uid()) and lower(ur.role) = 'admin'
  )
) with check (bucket_id = 'ai-documents');

drop policy if exists "ai_documents_storage_admin_delete" on storage.objects;
create policy "ai_documents_storage_admin_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'ai-documents' and exists (
    select 1 from public.user_roles ur
    where (ur.id = auth.uid() or ur.user_id = auth.uid()) and lower(ur.role) = 'admin'
  )
);

alter table public.ai_chat_logs
  add column if not exists notice_sources jsonb not null default '[]'::jsonb,
  add column if not exists document_sources jsonb not null default '[]'::jsonb,
  add column if not exists document_search_unavailable boolean not null default false;

comment on table public.ai_documents is 'Metadata for private Supabase files indexed in the dedicated Gemini File Search store.';

