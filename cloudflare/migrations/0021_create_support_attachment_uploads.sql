CREATE TABLE IF NOT EXISTS support_attachment_uploads (
  upload_id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  file_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  uploaded_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_attachment_uploads_user_expiry
  ON support_attachment_uploads (user_id, expires_at);
