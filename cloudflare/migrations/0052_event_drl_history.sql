-- Private, complete labeled history. Observed codes are not assumed to be official rule IDs.
CREATE TABLE IF NOT EXISTS event_drl_corpus (
  source_version TEXT PRIMARY KEY,
  historical_rows INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('importing', 'ready')),
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_organizers (
  name TEXT PRIMARY KEY,
  name_normalized TEXT NOT NULL,
  source_version TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_organizers_normalized ON event_organizers(name_normalized);

CREATE TABLE IF NOT EXISTS drl_rules (
  rule_id TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  rule_group TEXT,
  content TEXT NOT NULL,
  condition_text TEXT,
  points INTEGER,
  unit TEXT,
  event_suitable INTEGER NOT NULL CHECK (event_suitable IN (0,1)),
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  source_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drl_rules_active ON drl_rules(active, section);

CREATE TABLE IF NOT EXISTS event_drl_history (
  id INTEGER PRIMARY KEY,
  source_row INTEGER NOT NULL,
  observed_code TEXT NOT NULL,
  title_original TEXT NOT NULL,
  title_clean TEXT NOT NULL,
  title_normalized TEXT NOT NULL,
  title_normalized_no_year TEXT NOT NULL,
  organizer TEXT,
  organizer_normalized TEXT,
  semester TEXT,
  mapped_rule_id TEXT REFERENCES drl_rules(rule_id),
  source_version TEXT NOT NULL,
  UNIQUE(source_version, source_row)
);
CREATE INDEX IF NOT EXISTS idx_event_drl_history_exact ON event_drl_history(title_normalized);
CREATE INDEX IF NOT EXISTS idx_event_drl_history_recurring ON event_drl_history(title_normalized_no_year);
CREATE INDEX IF NOT EXISTS idx_event_drl_history_code ON event_drl_history(observed_code);

CREATE TABLE IF NOT EXISTS event_drl_prediction_cache (
  fingerprint TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  rule_id TEXT REFERENCES drl_rules(rule_id),
  observed_code TEXT,
  confidence REAL NOT NULL,
  confidence_label TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  historical_support_count INTEGER NOT NULL,
  closest_matches_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_candidate_drl_predictions (
  candidate_id INTEGER PRIMARY KEY REFERENCES event_candidates(id) ON DELETE CASCADE,
  fingerprint TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'failed')),
  rule_id TEXT REFERENCES drl_rules(rule_id),
  confidence REAL,
  confidence_label TEXT,
  reason_code TEXT,
  historical_support_count INTEGER,
  closest_matches_json TEXT,
  updated_at TEXT NOT NULL
);

-- Keep the selected official rule distinct from legacy criteria/points display columns.
ALTER TABLE admin_events ADD COLUMN drl_rule_id TEXT;
ALTER TABLE admin_events ADD COLUMN recognition_type TEXT;
ALTER TABLE admin_events ADD COLUMN recognition_note TEXT;
ALTER TABLE public_events ADD COLUMN drl_rule_id TEXT;
ALTER TABLE public_events ADD COLUMN recognition_type TEXT;
ALTER TABLE public_events ADD COLUMN recognition_note TEXT;
