PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE auth_rate_limit_windows (rate_key TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL, request_count INTEGER NOT NULL, updated_at INTEGER NOT NULL);

