-- Practice core metadata and access records are D1-authoritative. Content
-- objects intentionally remain out of scope: content_key/content_url preserve
-- the existing storage compatibility contract for a later R2 cutover.
CREATE TABLE IF NOT EXISTS practice_sets (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  owner_id TEXT CHECK (owner_id IS NULL OR length(owner_id) = 36),
  source_type TEXT NOT NULL DEFAULT 'admin' CHECK (source_type IN ('admin', 'ai')),
  subject_name TEXT NOT NULL,
  course_code TEXT,
  chapter_title TEXT,
  chapter_code TEXT,
  title TEXT NOT NULL,
  description TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'pro')),
  question_count INTEGER NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  storage_provider TEXT NOT NULL DEFAULT 'supabase' CHECK (storage_provider IN ('supabase', 'r2', 'external')),
  content_url TEXT,
  content_key TEXT NOT NULL CHECK (length(content_key) > 0),
  content_sha256 TEXT,
  canonical_hash TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS practice_sets_visibility_created_idx
  ON practice_sets (visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS practice_sets_owner_updated_idx
  ON practice_sets (owner_id, updated_at DESC)
  WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS practice_sets_subject_created_idx
  ON practice_sets (subject_name, created_at DESC);
CREATE INDEX IF NOT EXISTS practice_sets_content_key_idx
  ON practice_sets (content_key);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  user_id TEXT NOT NULL CHECK (length(user_id) = 36),
  set_id TEXT NOT NULL CHECK (length(set_id) = 36),
  score INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  weak_topics_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(weak_topics_json) AND json_type(weak_topics_json) = 'array'),
  canonical_hash TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  started_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS practice_attempts_user_submitted_idx
  ON practice_attempts (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS practice_attempts_set_submitted_idx
  ON practice_attempts (set_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS practice_pro_access (
  user_id TEXT PRIMARY KEY CHECK (length(user_id) = 36),
  expires_at TEXT,
  note TEXT,
  canonical_hash TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS practice_pro_access_expires_idx
  ON practice_pro_access (expires_at);

CREATE TABLE IF NOT EXISTS practice_core_migrations (
  id TEXT PRIMARY KEY,
  source_rows INTEGER NOT NULL,
  canonical_rows INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint) = 64),
  completed_at TEXT NOT NULL
);
