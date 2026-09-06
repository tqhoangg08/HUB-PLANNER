drop policy if exists "ai_documents_storage_admin_delete" on storage.objects;
drop policy if exists "ai_documents_storage_admin_update" on storage.objects;
drop policy if exists "ai_documents_storage_admin_insert" on storage.objects;
drop policy if exists "ai_documents_storage_admin_select" on storage.objects;
delete from storage.buckets where id = 'ai-documents';
drop table if exists public.ai_documents cascade;
drop function if exists public.set_ai_documents_updated_at();
alter table public.ai_chat_logs
  drop column if exists notice_sources,
  drop column if exists document_sources,
  drop column if exists document_search_unavailable;


