-- Additive shadow-only profile schema.
-- Supabase remains the profile read/write authority until a later explicit cutover.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY CHECK (length(user_id) = 36),
  student_code TEXT COLLATE NOCASE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  class_name TEXT,
  class_name_overridden INTEGER NOT NULL DEFAULT 0
    CHECK (class_name_overridden IN (0, 1)),
  profile_tags_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(profile_tags_json) AND json_type(profile_tags_json) = 'array'),
  public_profile_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (public_profile_enabled IN (0, 1)),
  show_profile_stats INTEGER NOT NULL DEFAULT 0
    CHECK (show_profile_stats IN (0, 1)),
  public_gpa REAL CHECK (public_gpa IS NULL OR public_gpa >= 0),
  public_completed_semesters INTEGER
    CHECK (public_completed_semesters IS NULL OR public_completed_semesters >= 0),
  public_credits INTEGER
    CHECK (public_credits IS NULL OR public_credits >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  canonical_hash TEXT NOT NULL CHECK (length(canonical_hash) = 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_student_code_idx
  ON user_profiles (student_code)
  WHERE student_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_profiles_public_lookup_idx
  ON user_profiles (public_profile_enabled, updated_at);

CREATE TABLE IF NOT EXISTS user_profile_private (
  user_id TEXT PRIMARY KEY CHECK (length(user_id) = 36),
  data_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(data_json) AND json_type(data_json) = 'object'),
  student_name TEXT,
  cohort TEXT,
  major_name TEXT,
  specialization_name TEXT,
  program_name TEXT,
  semesters_json TEXT
    CHECK (semesters_json IS NULL OR (json_valid(semesters_json) AND json_type(semesters_json) = 'array')),
  target_gpa REAL CHECK (target_gpa IS NULL OR target_gpa >= 0),
  total_credits_required INTEGER
    CHECK (total_credits_required IS NULL OR total_credits_required >= 0),
  has_onboarded INTEGER CHECK (has_onboarded IS NULL OR has_onboarded IN (0, 1)),
  lookback_seen_json TEXT
    CHECK (lookback_seen_json IS NULL OR (json_valid(lookback_seen_json) AND json_type(lookback_seen_json) = 'object')),
  updated_at TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  canonical_hash TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_profile_private_admin_summary_idx
  ON user_profile_private (cohort, program_name, major_name, specialization_name);

CREATE INDEX IF NOT EXISTS user_profile_private_updated_at_idx
  ON user_profile_private (updated_at);
