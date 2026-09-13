-- Keep delivery retry/claim state separate from terminal per-device outcomes.
-- All additions are nullable/additive so existing notifications remain valid.
ALTER TABLE push_delivery_attempts ADD COLUMN next_retry_at TEXT;

ALTER TABLE event_push_deliveries ADD COLUMN lease_expires_at TEXT;
ALTER TABLE event_push_deliveries ADD COLUMN next_retry_at TEXT;

ALTER TABLE school_announcement_push_queue ADD COLUMN lease_expires_at TEXT;
ALTER TABLE school_announcement_push_queue ADD COLUMN next_retry_at TEXT;

ALTER TABLE lost_found_push_queue ADD COLUMN lease_expires_at TEXT;
ALTER TABLE lost_found_push_queue ADD COLUMN next_retry_at TEXT;

CREATE INDEX IF NOT EXISTS push_delivery_attempts_retry_idx
  ON push_delivery_attempts(source_type, source_id, state, next_retry_at, attempts);
CREATE INDEX IF NOT EXISTS event_push_deliveries_claim_idx
  ON event_push_deliveries(state, next_retry_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS school_push_claim_idx
  ON school_announcement_push_queue(sent_at, failed_at, next_retry_at, lease_expires_at, scheduled_at);
CREATE INDEX IF NOT EXISTS lost_found_push_claim_idx
  ON lost_found_push_queue(sent_at, failed_at, next_retry_at, lease_expires_at, scheduled_at);
