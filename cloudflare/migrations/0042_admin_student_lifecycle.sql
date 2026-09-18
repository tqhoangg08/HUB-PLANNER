-- Public-D1 half of the cross-database Better Auth student lifecycle saga.
-- Payload is restricted to the profile fields an admin can already edit; it is
-- never used for public reads or analytics.
CREATE TABLE IF NOT EXISTS admin_student_lifecycle (
  operation_id TEXT PRIMARY KEY CHECK (length(operation_id) = 36),
  actor_user_id TEXT NOT NULL CHECK (length(actor_user_id) = 36),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) = 36),
  action TEXT NOT NULL CHECK (action IN ('create', 'delete')),
  student_code TEXT NOT NULL COLLATE NOCASE,
  target_user_id TEXT CHECK (target_user_id IS NULL OR length(target_user_id) = 36),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  state TEXT NOT NULL CHECK (state IN ('pending', 'auth_done', 'profile_done', 'completed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (actor_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS admin_student_lifecycle_student_state_idx
  ON admin_student_lifecycle (student_code, action, state, updated_at DESC);
