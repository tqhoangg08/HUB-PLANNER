CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  binding_started_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  system INTEGER NOT NULL DEFAULT 1 CHECK (system IN (0, 1)),
  events INTEGER NOT NULL DEFAULT 1 CHECK (events IN (0, 1)),
  lost_found INTEGER NOT NULL DEFAULT 1 CHECK (lost_found IN (0, 1)),
  schedule INTEGER NOT NULL DEFAULT 1 CHECK (schedule IN (0, 1)),
  school INTEGER NOT NULL DEFAULT 1 CHECK (school IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_announcement_push_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  link TEXT,
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  failed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  delivery_cursor TEXT,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS school_push_due_idx
  ON school_announcement_push_queue(sent_at, failed_at, scheduled_at);

CREATE TABLE IF NOT EXISTS lost_found_push_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lost_found_item_id INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '/lost-found',
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  failed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  delivery_cursor TEXT,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS lost_found_push_due_idx
  ON lost_found_push_queue(sent_at, failed_at, scheduled_at);

CREATE TABLE IF NOT EXISTS push_runtime_migrations (
  id TEXT PRIMARY KEY,
  source_subscriptions INTEGER NOT NULL,
  migrated_subscriptions INTEGER NOT NULL,
  source_preferences INTEGER NOT NULL,
  migrated_preferences INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

ALTER TABLE event_push_deliveries ADD COLUMN last_subscription_id TEXT;
ALTER TABLE event_push_deliveries ADD COLUMN sent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_push_deliveries ADD COLUMN failed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_push_deliveries ADD COLUMN skipped_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS push_delivery_attempts (
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('sent', 'skipped', 'failed', 'stale')),
  attempts INTEGER NOT NULL DEFAULT 1,
  last_status INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_type, source_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS push_delivery_attempts_pending_idx
  ON push_delivery_attempts(source_type, source_id, state, attempts);
