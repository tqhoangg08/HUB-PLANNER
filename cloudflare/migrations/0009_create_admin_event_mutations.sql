CREATE TABLE IF NOT EXISTS admin_event_mutations (
  mutation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  event_id INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS admin_event_mutations_created_idx
  ON admin_event_mutations (created_at);
