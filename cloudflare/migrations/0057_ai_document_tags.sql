-- Routing hints only. Text-first tags belong to the logical root, not a revision.
CREATE TABLE ai_document_tags (
  file_document_id TEXT REFERENCES ai_documents(id),
  text_document_id TEXT REFERENCES ai_text_documents(id),
  tags_json TEXT NOT NULL CHECK(json_valid(tags_json) AND json_type(tags_json)='array' AND json_array_length(tags_json)<=12 AND length(tags_json)<=2048),
  updated_by TEXT NOT NULL CHECK(length(updated_by)=36),
  updated_at TEXT NOT NULL,
  CHECK((file_document_id IS NOT NULL AND text_document_id IS NULL) OR (file_document_id IS NULL AND text_document_id IS NOT NULL))
);
CREATE UNIQUE INDEX ai_document_tags_file ON ai_document_tags(file_document_id) WHERE file_document_id IS NOT NULL;
CREATE UNIQUE INDEX ai_document_tags_text ON ai_document_tags(text_document_id) WHERE text_document_id IS NOT NULL;
