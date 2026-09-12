-- Lost & Found moderation notices follow the migrated record into D1. Other
-- notification domains remain on their existing authority until their own
-- bounded cutover.
CREATE TABLE IF NOT EXISTS lost_found_moderator_notifications (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  receiver_id TEXT NOT NULL CHECK (length(receiver_id) = 36),
  lost_found_item_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'system_alert',
  content TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '/lost-found',
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (receiver_id, lost_found_item_id),
  FOREIGN KEY (lost_found_item_id) REFERENCES lost_found_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lost_found_moderator_notifications_receiver_idx
  ON lost_found_moderator_notifications (receiver_id, is_read, created_at DESC);
