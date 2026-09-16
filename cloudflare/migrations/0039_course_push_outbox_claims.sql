-- Queue delivery needs durable retry/lease state so duplicate Queue wake-ups
-- and the hourly recovery cannot concurrently send the same user notification.
-- Additive only: existing course authority semantics and historical outbox
-- rows remain intact until an operator deploys this migration.
ALTER TABLE course_mutation_outbox ADD COLUMN lease_expires_at TEXT;
ALTER TABLE course_mutation_outbox ADD COLUMN next_retry_at TEXT;
ALTER TABLE course_mutation_outbox ADD COLUMN last_error TEXT;

CREATE INDEX IF NOT EXISTS course_mutation_outbox_push_claim_idx
  ON course_mutation_outbox (status, event_type, next_retry_at, lease_expires_at, created_at);
