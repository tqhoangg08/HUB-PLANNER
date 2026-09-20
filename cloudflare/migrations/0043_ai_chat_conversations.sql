-- Each ai_chat_logs row remains one user/assistant turn. Existing history is
-- deliberately preserved as one legacy conversation per turn: do not infer
-- relationships between old standalone messages.
ALTER TABLE ai_chat_logs ADD COLUMN conversation_id TEXT;

UPDATE ai_chat_logs
SET conversation_id = 'legacy-' || id
WHERE conversation_id IS NULL;

CREATE INDEX IF NOT EXISTS ai_chat_logs_owner_conversation_created_idx
  ON ai_chat_logs(user_id, conversation_id, created_at, id);
