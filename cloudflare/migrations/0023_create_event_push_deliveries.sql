CREATE TABLE IF NOT EXISTS event_push_deliveries (
  event_id INTEGER PRIMARY KEY,
  event_created_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('sending', 'sent', 'skipped', 'failed')),
  attempted_at TEXT NOT NULL,
  sent_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts = 1),
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS event_push_deliveries_state_idx
  ON event_push_deliveries(state, attempted_at);
