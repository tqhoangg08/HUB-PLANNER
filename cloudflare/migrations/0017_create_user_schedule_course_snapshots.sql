-- Private schedule course dependencies must not be added to the public catalogue.
-- Rows are populated only by the later controlled convergence/import paths.
CREATE TABLE IF NOT EXISTS user_schedule_course_snapshots (
  schedule_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (
    source_kind IN ('HISTORICAL_PUBLIC', 'PRIVATE_IMPORTED')
  ),
  course_json TEXT NOT NULL,
  source_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (schedule_id) REFERENCES user_schedules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_schedule_course_snapshots_owner_idx
  ON user_schedule_course_snapshots (user_id, schedule_id);

CREATE INDEX IF NOT EXISTS user_schedule_course_snapshots_owner_course_idx
  ON user_schedule_course_snapshots (user_id, course_id);

-- This is a private D1-only rollback record. It is never read by public APIs
-- and is intentionally not a Supabase compatibility mirror.
CREATE TABLE IF NOT EXISTS user_schedule_rollback_outbox (
  operation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  semester TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS user_schedule_rollback_outbox_owner_idx
  ON user_schedule_rollback_outbox (user_id, created_at);
