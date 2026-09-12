-- AI document metadata and AI chat logs become D1-authoritative. Document
-- objects live in the existing private R2 bucket under ai-documents/.
CREATE TABLE IF NOT EXISTS ai_documents (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  original_file_name TEXT NOT NULL CHECK (length(original_file_name) BETWEEN 1 AND 180),
  storage_path TEXT NOT NULL UNIQUE CHECK (storage_path LIKE 'ai-documents/%'),
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  )),
  file_size INTEGER NOT NULL CHECK (file_size BETWEEN 1 AND 20971520),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  category TEXT,
  academic_year TEXT,
  program_code TEXT NOT NULL DEFAULT 'all',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','program','admin')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  gemini_store_name TEXT,
  gemini_document_name TEXT,
  gemini_operation_name TEXT,
  indexing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (indexing_status IN ('pending','uploading','processing','completed','failed','deleting','deleted')),
  indexing_error TEXT,
  uploaded_by TEXT NOT NULL CHECK (length(uploaded_by) = 36),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  canonical_hash TEXT CHECK (canonical_hash IS NULL OR length(canonical_hash) = 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_documents_active_hash_unique
  ON ai_documents(content_hash) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ai_documents_status_created_idx
  ON ai_documents(indexing_status, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_documents_category_created_idx
  ON ai_documents(category, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_documents_program_created_idx
  ON ai_documents(program_code, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_documents_visibility_created_idx
  ON ai_documents(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_documents_gemini_document_idx
  ON ai_documents(gemini_document_name);
CREATE INDEX IF NOT EXISTS ai_documents_uploader_idx
  ON ai_documents(uploaded_by, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  user_id TEXT CHECK (user_id IS NULL OR length(user_id) = 36),
  user_message TEXT NOT NULL,
  bot_reply TEXT NOT NULL,
  is_helpful INTEGER CHECK (is_helpful IS NULL OR is_helpful IN (0,1)),
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  title TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
  notice_sources_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(notice_sources_json) AND json_type(notice_sources_json) = 'array'),
  document_sources_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(document_sources_json) AND json_type(document_sources_json) = 'array'),
  document_search_unavailable INTEGER NOT NULL DEFAULT 0 CHECK (document_search_unavailable IN (0,1)),
  canonical_hash TEXT CHECK (canonical_hash IS NULL OR length(canonical_hash) = 64)
);

CREATE INDEX IF NOT EXISTS ai_chat_logs_owner_created_idx
  ON ai_chat_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_chat_logs_owner_id_idx
  ON ai_chat_logs(user_id, id);
