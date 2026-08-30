CREATE TABLE IF NOT EXISTS admin_export_otps (
  challenge_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose = 'admin_excel_export'),
  otp_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5),
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_export_otps_user_purpose_created
  ON admin_export_otps (user_id, purpose, created_at DESC);
