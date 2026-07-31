CREATE TABLE IF NOT EXISTS public_lost_found_items (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('FOUND', 'LOST')),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  contact_info TEXT,
  user_name TEXT,
  image_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('approved', 'resolved')),
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  user_id TEXT,
  title_search TEXT NOT NULL,
  location_search TEXT NOT NULL,
  description_search TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS public_lost_found_visibility_type_created_idx
  ON public_lost_found_items (is_deleted, status, type, created_at DESC);

CREATE INDEX IF NOT EXISTS public_lost_found_visibility_created_idx
  ON public_lost_found_items (is_deleted, status, created_at DESC);
