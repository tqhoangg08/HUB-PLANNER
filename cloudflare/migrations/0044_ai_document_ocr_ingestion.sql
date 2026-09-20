-- OCR metadata for client-side PDF OCR. Original files remain the canonical
-- downloadable object; extracted text is a private R2 derivative only.
ALTER TABLE ai_documents ADD COLUMN ocr_status TEXT NOT NULL DEFAULT 'not_checked'
  CHECK (ocr_status IN ('not_checked','not_applicable','processing','completed','failed'));
ALTER TABLE ai_documents ADD COLUMN ocr_text_path TEXT
  CHECK (ocr_text_path IS NULL OR ocr_text_path LIKE 'ai-documents/%');
ALTER TABLE ai_documents ADD COLUMN ocr_text_length INTEGER
  CHECK (ocr_text_length IS NULL OR ocr_text_length BETWEEN 1 AND 1048576);
ALTER TABLE ai_documents ADD COLUMN ocr_page_count INTEGER
  CHECK (ocr_page_count IS NULL OR ocr_page_count BETWEEN 1 AND 40);
ALTER TABLE ai_documents ADD COLUMN ocr_engine TEXT;
ALTER TABLE ai_documents ADD COLUMN ocr_used INTEGER NOT NULL DEFAULT 0
  CHECK (ocr_used IN (0,1));
ALTER TABLE ai_documents ADD COLUMN ocr_completed_at TEXT;
ALTER TABLE ai_documents ADD COLUMN index_source_kind TEXT NOT NULL DEFAULT 'original'
  CHECK (index_source_kind IN ('original','ocr_text'));

CREATE INDEX IF NOT EXISTS ai_documents_ocr_status_created_idx
  ON ai_documents(ocr_status, created_at DESC);
