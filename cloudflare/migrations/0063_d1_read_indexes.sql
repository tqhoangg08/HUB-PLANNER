-- Additive indexes outside the HK2 importer's pinned catalogue schema.
-- No data rewrite, cache, publication policy or security setting changes.
CREATE INDEX IF NOT EXISTS student_directory_class_label_idx
  ON student_directory(TRIM(general_class) COLLATE BINARY)
  WHERE general_class IS NOT NULL AND TRIM(general_class) <> '';

CREATE INDEX IF NOT EXISTS event_candidates_unreviewed_image_idx
  ON event_candidates(image_url)
  WHERE review_status != 'approved';

CREATE INDEX IF NOT EXISTS ai_chat_logs_live_conversation_owner_idx
  ON ai_chat_logs(conversation_id, user_id)
  WHERE is_deleted = 0;
