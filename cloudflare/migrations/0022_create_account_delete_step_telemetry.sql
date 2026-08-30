-- Sanitised, identity-free account-deletion execution telemetry.
-- attempt_id is a random operation id and is deliberately not a user identifier.
CREATE TABLE IF NOT EXISTS account_delete_step_telemetry (
  attempt_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  backend TEXT NOT NULL,
  resource TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('started', 'passed', 'failed')),
  status_code INTEGER,
  error_class TEXT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_account_delete_step_telemetry_recorded_at
  ON account_delete_step_telemetry (recorded_at DESC);
