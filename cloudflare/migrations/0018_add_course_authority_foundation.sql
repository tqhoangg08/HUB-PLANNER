-- Stage 2B: additive foundation only.  Existing Supabase -> D1 course sync
-- remains the production authority until the later controlled cutover.

ALTER TABLE course_schedules ADD COLUMN catalogue_visibility TEXT NOT NULL DEFAULT 'published'
  CHECK (catalogue_visibility IN ('published', 'retired'));
ALTER TABLE course_schedules ADD COLUMN revision INTEGER NOT NULL DEFAULT 0
  CHECK (revision >= 0);
ALTER TABLE course_schedules ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'legacy_sync'
  CHECK (source_kind IN ('legacy_sync', 'admin', 'scraper', 'request_approval'));
ALTER TABLE course_schedules ADD COLUMN source_key TEXT;
ALTER TABLE course_schedules ADD COLUMN writer_provenance TEXT NOT NULL DEFAULT 'legacy_sync';
ALTER TABLE course_schedules ADD COLUMN content_hash TEXT;
ALTER TABLE course_schedules ADD COLUMN instructor_provenance TEXT NOT NULL DEFAULT 'legacy_sync';
ALTER TABLE course_schedules ADD COLUMN retired_at TEXT;

CREATE INDEX IF NOT EXISTS course_schedules_visibility_position_idx
  ON course_schedules (catalogue_visibility, source_position);
CREATE INDEX IF NOT EXISTS course_schedules_natural_key_idx
  ON course_schedules (semester, course_code_search);
CREATE UNIQUE INDEX IF NOT EXISTS course_schedules_source_key_unique
  ON course_schedules (source_kind, source_key)
  WHERE source_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS course_mutation_receipts (
  actor_scope TEXT NOT NULL CHECK (actor_scope IN ('user', 'staff', 'system')),
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  operation TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (actor_scope, actor_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS course_mutation_receipts_created_idx
  ON course_mutation_receipts (created_at);

CREATE TABLE IF NOT EXISTS course_mutation_outbox (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  course_id TEXT,
  request_id TEXT,
  user_id TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS course_mutation_outbox_pending_idx
  ON course_mutation_outbox (status, created_at);

CREATE TABLE IF NOT EXISTS user_course_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  semester TEXT,
  instructor TEXT,
  request_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  reviewer_id TEXT,
  reviewed_at TEXT,
  approved_course_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (approved_course_id) REFERENCES course_schedules(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS user_course_requests_owner_idx
  ON user_course_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_course_requests_review_idx
  ON user_course_requests (status, created_at DESC);

-- Facets represent only the public catalogue.  The existing insert/delete/
-- field-update triggers remain intact; this trigger accounts for retirement
-- without exposing retired rows through the public API.
CREATE TRIGGER IF NOT EXISTS course_filter_facets_after_visibility_update
AFTER UPDATE OF catalogue_visibility ON course_schedules
WHEN OLD.catalogue_visibility IS NOT NEW.catalogue_visibility
BEGIN
  DELETE FROM course_filter_facets
   WHERE OLD.catalogue_visibility = 'published'
     AND NEW.catalogue_visibility = 'retired'
     AND course_count = 1
     AND semester = COALESCE(OLD.semester, '')
     AND phase = COALESCE(OLD.phase, '')
     AND is_user_added = COALESCE(OLD.is_user_added, -1)
     AND subject_name = COALESCE(OLD.subject_name, '')
     AND major = COALESCE(OLD.major, '')
     AND cohort = COALESCE(OLD.cohort, '')
     AND academic_program = COALESCE(OLD.academic_program, '')
     AND group_name = COALESCE(OLD.group_name, '');

  UPDATE course_filter_facets
     SET course_count = course_count - 1
   WHERE OLD.catalogue_visibility = 'published'
     AND NEW.catalogue_visibility = 'retired'
     AND course_count > 1
     AND semester = COALESCE(OLD.semester, '')
     AND phase = COALESCE(OLD.phase, '')
     AND is_user_added = COALESCE(OLD.is_user_added, -1)
     AND subject_name = COALESCE(OLD.subject_name, '')
     AND major = COALESCE(OLD.major, '')
     AND cohort = COALESCE(OLD.cohort, '')
     AND academic_program = COALESCE(OLD.academic_program, '')
     AND group_name = COALESCE(OLD.group_name, '');

  INSERT INTO course_filter_facets (
    semester, phase, is_user_added, subject_name, major, cohort,
    academic_program, group_name, course_count, first_source_position
  )
  SELECT
    COALESCE(NEW.semester, ''), COALESCE(NEW.phase, ''),
    COALESCE(NEW.is_user_added, -1), COALESCE(NEW.subject_name, ''),
    COALESCE(NEW.major, ''), COALESCE(NEW.cohort, ''),
    COALESCE(NEW.academic_program, ''), COALESCE(NEW.group_name, ''),
    1, NEW.source_position
  WHERE OLD.catalogue_visibility = 'retired'
    AND NEW.catalogue_visibility = 'published'
  ON CONFLICT (semester, phase, is_user_added, subject_name, major, cohort,
               academic_program, group_name)
  DO UPDATE SET course_count = course_count + 1,
                first_source_position = MIN(first_source_position, excluded.first_source_position);
END;
