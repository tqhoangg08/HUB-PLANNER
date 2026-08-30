-- Additive transaction-abort primitive for future D1-authoritative schedule writes.
-- The operation marker distinguishes this transaction's CAS from a prior winner.
-- Future D1 batches insert a computed `passed` value and then delete the marker.
-- CHECK failure is intentional: it aborts the whole batch when CAS/postconditions fail.
ALTER TABLE user_schedule_revisions ADD COLUMN last_operation_id TEXT;

CREATE TABLE IF NOT EXISTS user_schedule_transaction_assertions (
  operation_id TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1),
  created_at TEXT NOT NULL
);
