-- Stage 2B completion: durable, idempotent receipts for D1-native scraper runs.
-- This is additive and does not modify any existing course row.
CREATE TABLE IF NOT EXISTS course_scraper_runs (
  run_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  attempted_count INTEGER NOT NULL DEFAULT 0 CHECK (attempted_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  skipped_admin_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_admin_count >= 0),
  conflict_count INTEGER NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS course_scraper_runs_status_created_idx
  ON course_scraper_runs (status, created_at);
