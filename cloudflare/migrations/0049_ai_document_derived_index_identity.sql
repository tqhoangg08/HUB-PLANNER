-- The original PDF hash is not sufficient for retrieval-cache invalidation:
-- a deterministic extraction/OCR pipeline can change indexed text without
-- changing original bytes. This migration is local-ready only in Stage 4F.
ALTER TABLE ai_documents ADD COLUMN derived_source_kind TEXT NOT NULL DEFAULT 'legacy'
  CHECK (derived_source_kind IN ('legacy','native_text','ocr'));
ALTER TABLE ai_documents ADD COLUMN extraction_pipeline_version TEXT;
ALTER TABLE ai_documents ADD COLUMN derived_content_hash TEXT
  CHECK (derived_content_hash IS NULL OR length(derived_content_hash) = 64);

CREATE INDEX IF NOT EXISTS ai_documents_derived_identity_idx
  ON ai_documents(id, derived_source_kind, extraction_pipeline_version, derived_content_hash, indexing_status);
