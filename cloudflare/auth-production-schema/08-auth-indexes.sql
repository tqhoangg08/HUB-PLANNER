CREATE INDEX IF NOT EXISTS "auth_account_user_id_idx"
ON "auth_account" ("user_id");

CREATE INDEX IF NOT EXISTS "auth_session_expires_at_idx"
ON "auth_session" ("expires_at");

CREATE INDEX IF NOT EXISTS "auth_session_user_id_idx"
ON "auth_session" ("user_id");

CREATE INDEX IF NOT EXISTS "auth_verification_identifier_idx"
ON "auth_verification" ("identifier");
