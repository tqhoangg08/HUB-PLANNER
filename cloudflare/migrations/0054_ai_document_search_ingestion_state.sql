-- Gemini completion does not prove AI Search coverage. Track independently.
ALTER TABLE ai_documents ADD COLUMN ai_search_status TEXT NOT NULL DEFAULT 'not_prepared'
  CHECK (ai_search_status IN ('not_prepared','derived_ready','completed','failed'));
ALTER TABLE ai_documents ADD COLUMN ai_search_revision TEXT;
ALTER TABLE ai_documents ADD COLUMN ocr_uncertain_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_documents ADD COLUMN gemini_indexing_status TEXT;
