CREATE TABLE IF NOT EXISTS user_event_participations (
  user_id TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS user_event_participations_event_idx
  ON user_event_participations (event_id);
