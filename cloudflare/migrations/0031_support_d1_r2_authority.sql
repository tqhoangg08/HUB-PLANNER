-- Support tickets and messages become D1-authoritative. Existing attachment
-- objects already live in R2; this migration moves their metadata authority.
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  user_id TEXT NOT NULL CHECK (length(user_id) = 36),
  assigned_to TEXT CHECK (assigned_to IS NULL OR length(assigned_to) = 36),
  subject TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 3 AND 160),
  category TEXT NOT NULL CHECK (category IN ('login','grades','events','schedule','lost_found','feedback','other')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  initial_message TEXT,
  attachment_urls_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(attachment_urls_json) AND json_type(attachment_urls_json) = 'array'),
  last_message_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT CHECK (resolved_by IS NULL OR length(resolved_by) = 36),
  resolved_by_role TEXT CHECK (resolved_by_role IS NULL OR resolved_by_role IN ('user','admin','support','auditor')),
  first_admin_reply_email_sent_at TEXT,
  first_admin_reply_email_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  canonical_hash TEXT NOT NULL CHECK (length(canonical_hash) = 64)
);

CREATE INDEX IF NOT EXISTS support_tickets_user_last_message_idx
  ON support_tickets (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_last_message_idx
  ON support_tickets (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_filters_idx
  ON support_tickets (category, priority, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_to_idx
  ON support_tickets (assigned_to);

CREATE TRIGGER IF NOT EXISTS support_tickets_active_limit
BEFORE INSERT ON support_tickets
WHEN (SELECT COUNT(*) FROM support_tickets
       WHERE user_id = NEW.user_id AND status IN ('open','pending')) >= 3
BEGIN
  SELECT RAISE(ABORT, 'SUPPORT_ACTIVE_TICKET_LIMIT');
END;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  ticket_id TEXT NOT NULL CHECK (length(ticket_id) = 36),
  sender_id TEXT NOT NULL CHECK (length(sender_id) = 36),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user','admin','support')),
  body TEXT NOT NULL CHECK (length(body) <= 4000),
  attachment_urls_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(attachment_urls_json) AND json_type(attachment_urls_json) = 'array'),
  is_internal_note INTEGER NOT NULL DEFAULT 0 CHECK (is_internal_note IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  created_at TEXT NOT NULL,
  canonical_hash TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_created_idx
  ON support_ticket_messages (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_messages_sender_idx
  ON support_ticket_messages (sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_attachments (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  ticket_id TEXT NOT NULL CHECK (length(ticket_id) = 36),
  message_id TEXT CHECK (message_id IS NULL OR length(message_id) = 36),
  uploaded_by TEXT NOT NULL CHECK (length(uploaded_by) = 36),
  file_key TEXT NOT NULL UNIQUE CHECK (file_key LIKE 'support-tickets/%'),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes INTEGER NOT NULL CHECK (
    (mime_type LIKE 'image/%' AND size_bytes BETWEEN 1 AND 5242880)
    OR (mime_type = 'application/pdf' AND size_bytes BETWEEN 1 AND 10485760)
  ),
  storage_provider TEXT NOT NULL DEFAULT 'cloudflare_r2' CHECK (storage_provider = 'cloudflare_r2'),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('pending','uploaded','linked','deleted')),
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  created_at TEXT NOT NULL,
  canonical_hash TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES support_ticket_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS support_ticket_attachments_ticket_idx
  ON support_ticket_attachments (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_attachments_message_idx
  ON support_ticket_attachments (message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_attachments_owner_idx
  ON support_ticket_attachments (uploaded_by, created_at DESC);

-- Support notices are kept alongside the support authority. They are merged
-- into the existing notification feed without changing other domains.
CREATE TABLE IF NOT EXISTS support_notifications (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  receiver_id TEXT NOT NULL CHECK (length(receiver_id) = 36),
  actor_id TEXT CHECK (actor_id IS NULL OR length(actor_id) = 36),
  ticket_id TEXT NOT NULL CHECK (length(ticket_id) = 36),
  message_id TEXT CHECK (message_id IS NULL OR length(message_id) = 36),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  link TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS support_notifications_receiver_idx
  ON support_notifications (receiver_id, is_read, created_at DESC);
