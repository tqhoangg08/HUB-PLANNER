-- Additive Stage 3C2 safety foundation. Existing rows intentionally remain
-- readable by the legacy Worker while their updated_at value is NULL.
ALTER TABLE user_schedules ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS user_schedule_revisions (
  user_id TEXT NOT NULL,
  semester TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, semester)
);

CREATE TABLE IF NOT EXISTS user_schedule_mutation_receipts (
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS user_schedule_mutation_receipts_created_idx
  ON user_schedule_mutation_receipts (created_at);
