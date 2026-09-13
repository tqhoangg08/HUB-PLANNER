-- CTV and protected-form submissions are D1-authoritative.  The payload stays
-- private; only the fixed staff report projection exposes selected fields.
CREATE TABLE IF NOT EXISTS protected_submissions (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  kind TEXT NOT NULL CHECK (kind IN (
    'feedback','donation','canva_pro_requests','event_contribution',
    'bug_reports','course_reports','event_reports','ctv_requests'
  )),
  user_id TEXT CHECK (user_id IS NULL OR length(user_id) = 36),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (length(status) BETWEEN 1 AND 32),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  contact_key TEXT,
  source_table TEXT,
  source_id TEXT,
  source_fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_table, source_id),
  UNIQUE (source_fingerprint)
);

-- CTV contact uniqueness is retained without making a general submission
-- retry suppress a deliberate later report from the same person.
CREATE UNIQUE INDEX IF NOT EXISTS protected_submissions_ctv_contact_unique
  ON protected_submissions(kind, contact_key)
  WHERE kind = 'ctv_requests' AND contact_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS protected_submissions_owner_created_idx
  ON protected_submissions(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS protected_submissions_kind_status_created_idx
  ON protected_submissions(kind, status, created_at DESC);

-- Private moderator notices for protected submissions.  The uniqueness gate
-- makes repeated browser retries and unchanged moderation states no-ops.
CREATE TABLE IF NOT EXISTS protected_submission_moderator_notifications (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  receiver_id TEXT NOT NULL CHECK (length(receiver_id) = 36),
  actor_id TEXT CHECK (actor_id IS NULL OR length(actor_id) = 36),
  submission_kind TEXT NOT NULL,
  submission_id TEXT NOT NULL CHECK (length(submission_id) = 36),
  type TEXT NOT NULL DEFAULT 'system_alert',
  content TEXT NOT NULL,
  link TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(receiver_id, submission_kind, submission_id),
  FOREIGN KEY (submission_id) REFERENCES protected_submissions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS protected_submission_moderator_notifications_receiver_idx
  ON protected_submission_moderator_notifications(receiver_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS protected_submission_migrations (
  id TEXT PRIMARY KEY,
  source_rows INTEGER NOT NULL,
  canonical_rows INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
