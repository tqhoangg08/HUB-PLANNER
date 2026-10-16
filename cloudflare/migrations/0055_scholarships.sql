-- HUB Scholarship foundation (no data import, publication or runtime deployment).
-- Rows from student_directory and semester_exact_rankings are NOT used as award decisions.
CREATE TABLE IF NOT EXISTS scholarship_campaigns (
  slug TEXT PRIMARY KEY CHECK (length(slug) BETWEEN 1 AND 64),
  title TEXT NOT NULL,
  school_year TEXT NOT NULL,
  semester TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT,
  source_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'validated', 'approved', 'published', 'archived')
  ),
  public_data_approved INTEGER NOT NULL DEFAULT 0 CHECK (public_data_approved IN (0, 1)),
  public_scores_approved INTEGER NOT NULL DEFAULT 0 CHECK (public_scores_approved IN (0, 1)),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (status <> 'published' OR (public_data_approved = 1 AND published_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS scholarship_campaigns_public_idx
  ON scholarship_campaigns (status, public_data_approved, published_at DESC);

CREATE TABLE IF NOT EXISTS scholarship_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_slug TEXT NOT NULL REFERENCES scholarship_campaigns(slug) ON DELETE RESTRICT,
  source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
  student_code TEXT NOT NULL CHECK (length(student_code) = 12),
  full_name TEXT NOT NULL,
  full_name_search TEXT NOT NULL,
  class_name TEXT,
  major TEXT,
  award_type TEXT NOT NULL,
  gpa REAL CHECK (gpa IS NULL OR (gpa >= 0 AND gpa <= 4.5)),
  training_score REAL CHECK (training_score IS NULL OR (training_score >= 0 AND training_score <= 100)),
  selection_score REAL,
  source_row_sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_slug, source_row_number)
);

CREATE INDEX IF NOT EXISTS scholarship_recipients_code_idx
  ON scholarship_recipients (campaign_slug, student_code);
CREATE INDEX IF NOT EXISTS scholarship_recipients_name_idx
  ON scholarship_recipients (campaign_slug, full_name_search);
CREATE INDEX IF NOT EXISTS scholarship_recipients_award_idx
  ON scholarship_recipients (campaign_slug, award_type);
CREATE INDEX IF NOT EXISTS scholarship_recipients_major_idx
  ON scholarship_recipients (campaign_slug, major);

CREATE TABLE IF NOT EXISTS scholarship_import_batches (
  id TEXT PRIMARY KEY,
  campaign_slug TEXT NOT NULL REFERENCES scholarship_campaigns(slug) ON DELETE RESTRICT,
  source_sha256 TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  expected_rows INTEGER NOT NULL CHECK (expected_rows >= 0),
  accepted_rows INTEGER NOT NULL DEFAULT 0 CHECK (accepted_rows >= 0),
  rejected_rows INTEGER NOT NULL DEFAULT 0 CHECK (rejected_rows >= 0),
  status TEXT NOT NULL CHECK (status IN ('previewed', 'applied', 'rejected')),
  performed_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scholarship_publication_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_slug TEXT NOT NULL REFERENCES scholarship_campaigns(slug) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('approved', 'published', 'unpublished', 'archived')),
  performed_by_user_id TEXT NOT NULL,
  source_sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
