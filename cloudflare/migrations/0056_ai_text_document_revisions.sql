-- Text-first drafts are NOT ai_documents and are never selected by Advisor.
-- Source bytes and all older revisions remain private in R2.
CREATE TABLE ai_text_documents (
  id TEXT PRIMARY KEY CHECK(length(id)=36),
  sequence INTEGER NOT NULL DEFAULT 0 CHECK(sequence>=0),
  latest_revision_id TEXT,
  live_document_id TEXT REFERENCES ai_documents(id),
  created_by TEXT NOT NULL CHECK(length(created_by)=36),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE ai_text_revisions (
  id TEXT PRIMARY KEY CHECK(length(id)=36),
  document_id TEXT NOT NULL REFERENCES ai_text_documents(id),
  version INTEGER NOT NULL CHECK(version>0),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 240),
  category TEXT NOT NULL,
  academic_year TEXT,
  program_code TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('public','program','admin')),
  storage_path TEXT NOT NULL UNIQUE CHECK(storage_path LIKE 'ai-documents/text-first/%'),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  file_size INTEGER NOT NULL CHECK(file_size BETWEEN 1 AND 1048576),
  segment_count INTEGER NOT NULL CHECK(typeof(segment_count)='integer' AND segment_count BETWEEN 1 AND 128),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','indexing','working','awaiting_receipts','ready','failed','published')),
  cursor INTEGER NOT NULL DEFAULT 0 CHECK(cursor BETWEEN 0 AND 128),
  ai_search_revision TEXT,
  created_by TEXT NOT NULL CHECK(length(created_by)=36),
  created_at TEXT NOT NULL,
  published_by TEXT,
  published_at TEXT,
  UNIQUE(document_id,version)
);
CREATE INDEX ai_text_revisions_document ON ai_text_revisions(document_id,version DESC);

-- Abort the entire publish transaction if its source was deleted/changed.
CREATE TRIGGER ai_text_publication_source_guard BEFORE UPDATE OF state ON ai_text_revisions
WHEN NEW.state='published' AND OLD.state<>'published'
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM ai_documents a WHERE a.id=NEW.id AND a.deleted_at IS NULL
      AND a.indexing_status='processing' AND a.ai_search_revision=NEW.ai_search_revision
      AND a.content_hash=NEW.content_hash AND a.version=NEW.version
      AND a.visibility=NEW.visibility AND a.index_segment_count=NEW.segment_count
      AND a.extraction_pipeline_version='admin-text-structured-v1'
  ) THEN RAISE(ABORT,'TEXT_PUBLICATION_SOURCE_CHANGED') END;
END;
