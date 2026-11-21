-- Private singleton; no Facebook credential or raw post content is stored here.
-- The lease prevents concurrent manual/scheduled syncs and preserves receipts
-- across Worker restarts. Source posts remain in event_candidates.
CREATE TABLE IF NOT EXISTS facebook_event_collector_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state TEXT NOT NULL DEFAULT 'idle'
    CHECK (state IN ('idle', 'running', 'completed', 'partial', 'failed')),
  started_at TEXT,
  finished_at TEXT,
  last_run_id TEXT,
  last_completed_run_id TEXT,
  last_total INTEGER NOT NULL DEFAULT 0,
  last_imported INTEGER NOT NULL DEFAULT 0,
  last_duplicates INTEGER NOT NULL DEFAULT 0,
  last_skipped INTEGER NOT NULL DEFAULT 0,
  last_failed INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

INSERT OR IGNORE INTO facebook_event_collector_state(singleton)
VALUES (1);
