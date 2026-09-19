-- Internal/test identities remain entirely inside the Better Auth database.
-- They deliberately have no student identifier or Public-D1 profile row.
CREATE TABLE IF NOT EXISTS app_internal_accounts (
  user_id TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','admin','auditor')),
  purpose TEXT NOT NULL CHECK (purpose IN ('test','demo','qa','internal')),
  status TEXT NOT NULL CHECK (status IN ('active','disabled')) DEFAULT 'active',
  expires_at TEXT,
  exclude_from_student_stats INTEGER NOT NULL DEFAULT 1 CHECK (exclude_from_student_stats IN (1)),
  receive_broadcast INTEGER NOT NULL DEFAULT 0 CHECK (receive_broadcast IN (0,1)),
  -- Keep the historical actor UUID even if that administrator is later
  -- deleted.  Unlike user_id, this is audit provenance, not a live owner.
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS app_internal_accounts_list_idx
  ON app_internal_accounts(status, updated_at DESC, user_id DESC);

CREATE TABLE IF NOT EXISTS auth_internal_account_operations (
  operation_id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create','delete')),
  target_user_id TEXT,
  username TEXT NOT NULL COLLATE NOCASE,
  request_hash TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_internal_account_operation_idem_idx
  ON auth_internal_account_operations(actor_user_id, action, username, request_hash);

CREATE TABLE IF NOT EXISTS auth_internal_account_audit (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  target_user_id TEXT,
  target_username TEXT NOT NULL COLLATE NOCASE,
  action TEXT NOT NULL CHECK (action IN ('create','password_reset','role_change','disable','enable','delete','expiration_change')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_internal_account_audit_target_idx
  ON auth_internal_account_audit(target_username, created_at DESC);
