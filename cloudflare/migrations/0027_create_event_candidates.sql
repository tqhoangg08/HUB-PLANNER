CREATE TABLE IF NOT EXISTS event_candidates (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  source_name TEXT NOT NULL,
  post_url TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  image_url TEXT,
  submitted_from TEXT,
  client_created_at TEXT,
  submitter_user_id TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  ai_is_event INTEGER CHECK (ai_is_event IS NULL OR ai_is_event IN (0, 1)),
  ai_confidence REAL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ai_reason TEXT,
  ai_result_json TEXT CHECK (ai_result_json IS NULL OR json_valid(ai_result_json)),
  approved_event_id INTEGER,
  reviewed_at TEXT,
  reviewed_by_user_id TEXT,
  FOREIGN KEY (approved_event_id) REFERENCES admin_events(id)
);

CREATE INDEX IF NOT EXISTS event_candidates_created_idx
  ON event_candidates(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS event_candidates_status_created_idx
  ON event_candidates(review_status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS event_candidates_post_url_idx
  ON event_candidates(post_url, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS event_candidates_submitter_idx
  ON event_candidates(submitter_user_id, created_at DESC, id DESC)
  WHERE submitter_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_candidates_approved_event_idx
  ON event_candidates(approved_event_id)
  WHERE approved_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_candidate_id_sequence (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  next_id INTEGER NOT NULL CHECK (next_id > 0)
);

INSERT OR IGNORE INTO event_candidate_id_sequence(singleton, next_id)
VALUES (1, 1);

CREATE TRIGGER IF NOT EXISTS event_candidates_advance_id_sequence
AFTER INSERT ON event_candidates
WHEN NEW.id >= (SELECT next_id FROM event_candidate_id_sequence WHERE singleton = 1)
BEGIN
  UPDATE event_candidate_id_sequence
     SET next_id = NEW.id + 1
   WHERE singleton = 1;
END;
