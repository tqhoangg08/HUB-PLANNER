-- Canonical Lost & Found authority. public_lost_found_items remains the
-- read-optimized public projection; both tables are owned by D1.
CREATE TABLE IF NOT EXISTS lost_found_items (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('FOUND', 'LOST')),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  contact_info TEXT,
  user_name TEXT,
  image_url TEXT,
  image_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'resolved')),
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  user_id TEXT,
  title_search TEXT NOT NULL,
  location_search TEXT NOT NULL,
  description_search TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS lost_found_admin_type_created_idx
  ON lost_found_items (is_deleted, type, created_at DESC);

CREATE INDEX IF NOT EXISTS lost_found_owner_created_idx
  ON lost_found_items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lost_found_status_created_idx
  ON lost_found_items (status, is_deleted, created_at DESC);

-- Safe bootstrap for already-mirrored public rows. The bounded cutover tool
-- imports pending/rejected rows and R2 object metadata before authority flips.
INSERT OR IGNORE INTO lost_found_items (
  id, created_at, updated_at, type, title, description, location,
  contact_info, user_name, image_url, image_key, status, is_deleted, user_id,
  title_search, location_search, description_search
)
SELECT id, created_at, created_at, type, title, description, location,
       contact_info, user_name, image_url, NULL, status, is_deleted, user_id,
       title_search, location_search, description_search
  FROM public_lost_found_items;
