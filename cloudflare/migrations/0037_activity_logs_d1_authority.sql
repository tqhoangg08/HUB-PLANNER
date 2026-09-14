-- Activity logs are an append-only D1 audit record.  Legacy Supabase ids are
-- retained as a unique source key; D1 ids remain numeric for the existing
-- admin response contract.
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_source_id TEXT UNIQUE,
  client_event_id TEXT UNIQUE,
  source_key TEXT NOT NULL UNIQUE,
  canonical_hash TEXT NOT NULL UNIQUE CHECK (length(canonical_hash) = 64),
  created_at TEXT NOT NULL,
  user_id TEXT,
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL CHECK (action <> 'view_page'),
  action_label TEXT,
  target_table TEXT,
  table_name TEXT,
  target_id TEXT,
  record_id TEXT,
  page_path TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'warning')),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  old_data_json TEXT CHECK (old_data_json IS NULL OR json_valid(old_data_json)),
  new_data_json TEXT CHECK (new_data_json IS NULL OR json_valid(new_data_json)),
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  error_message TEXT,
  ip_address TEXT,
  device_info TEXT,
  location_guess TEXT
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON activity_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS activity_logs_user_created_at_idx
  ON activity_logs (user_id, created_at DESC, id DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activity_logs_action_created_at_idx
  ON activity_logs (action, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS activity_log_migrations (
  id TEXT PRIMARY KEY,
  source_rows INTEGER NOT NULL,
  canonical_rows INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint) = 64),
  completed_at TEXT NOT NULL
);
