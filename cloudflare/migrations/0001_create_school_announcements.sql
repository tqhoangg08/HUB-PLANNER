CREATE TABLE IF NOT EXISTS school_announcements (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  title_search TEXT NOT NULL,
  link TEXT NOT NULL UNIQUE,
  date TEXT,
  is_new INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0, 1)),
  created_at TEXT,
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1))
);

CREATE INDEX IF NOT EXISTS school_announcements_visible_date_created_idx
  ON school_announcements (is_hidden, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS school_announcements_title_search_idx
  ON school_announcements (title_search);

CREATE TABLE IF NOT EXISTS sync_metadata (
  resource TEXT PRIMARY KEY,
  source_row_count INTEGER NOT NULL,
  source_max_created_at TEXT,
  synced_at TEXT NOT NULL
);
