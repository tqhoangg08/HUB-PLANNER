-- Durable idempotency ledger for the Auth side of an admin-managed student
-- lifecycle. It intentionally has no foreign key to auth_user: a delete
-- operation must remain recoverable and auditable after the user row is gone.
CREATE TABLE IF NOT EXISTS auth_admin_student_lifecycle (
  operation_id TEXT PRIMARY KEY CHECK (length(operation_id) = 36),
  action TEXT NOT NULL CHECK (action IN ('create', 'delete')),
  actor_user_id TEXT NOT NULL CHECK (length(actor_user_id) = 36),
  target_user_id TEXT NOT NULL CHECK (length(target_user_id) = 36),
  student_code TEXT NOT NULL COLLATE NOCASE,
  email TEXT NOT NULL COLLATE NOCASE,
  state TEXT NOT NULL CHECK (state IN ('auth_created', 'invite_sent', 'auth_deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_admin_student_lifecycle_target_idx
  ON auth_admin_student_lifecycle (target_user_id, action, updated_at DESC);
