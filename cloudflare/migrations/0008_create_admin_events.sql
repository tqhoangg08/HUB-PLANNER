CREATE TABLE IF NOT EXISTS admin_events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  organizer TEXT,
  category TEXT,
  criteria TEXT,
  points TEXT,
  format TEXT,
  deadline TEXT,
  deadline_time TEXT,
  close_on_full INTEGER NOT NULL DEFAULT 0 CHECK (close_on_full IN (0, 1)),
  description TEXT,
  link TEXT,
  classification TEXT,
  location_type TEXT,
  status TEXT,
  is_manually_closed INTEGER NOT NULL DEFAULT 0 CHECK (is_manually_closed IN (0, 1)),
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  created_at TEXT NOT NULL,
  event_date TEXT,
  event_time TEXT,
  registration_start_date TEXT,
  registration_start_time TEXT,
  image_url TEXT,
  contribution_link TEXT,
  contributor_note TEXT,
  section TEXT,
  score TEXT,
  title_search TEXT NOT NULL,
  organizer_search TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_events_created_idx
  ON admin_events (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS admin_events_status_created_idx
  ON admin_events (status, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_events_deleted_created_idx
  ON admin_events (is_deleted, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_events_title_search_idx
  ON admin_events (title_search);

CREATE INDEX IF NOT EXISTS admin_events_organizer_search_idx
  ON admin_events (organizer_search);
