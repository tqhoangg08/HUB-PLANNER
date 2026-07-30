CREATE TABLE IF NOT EXISTS public_events (
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
  title_search TEXT NOT NULL,
  organizer_search TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS public_events_visibility_created_idx
  ON public_events (is_deleted, status, created_at DESC);

CREATE INDEX IF NOT EXISTS public_events_visibility_criteria_created_idx
  ON public_events (is_deleted, criteria, created_at DESC);

CREATE INDEX IF NOT EXISTS public_events_visibility_scope_created_idx
  ON public_events (is_deleted, location_type, created_at DESC);

CREATE INDEX IF NOT EXISTS public_events_visibility_deadline_idx
  ON public_events (is_deleted, deadline, created_at DESC);

CREATE INDEX IF NOT EXISTS public_events_title_search_idx
  ON public_events (title_search);

CREATE INDEX IF NOT EXISTS public_events_organizer_search_idx
  ON public_events (organizer_search);
