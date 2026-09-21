-- Public visibility controls are explicit per document. Existing rows retain
-- the default `none`, so this additive migration does not expose any R2 data.
ALTER TABLE ai_documents ADD COLUMN public_view_policy TEXT NOT NULL DEFAULT 'none'
  CHECK (public_view_policy IN ('none', 'local_rehost', 'official_link'));
ALTER TABLE ai_documents ADD COLUMN official_source_url TEXT;

CREATE INDEX IF NOT EXISTS ai_documents_public_view_lookup_idx
  ON ai_documents(id, visibility, indexing_status, public_view_policy)
  WHERE deleted_at IS NULL;
