CREATE TABLE IF NOT EXISTS course_schedules (
  id TEXT PRIMARY KEY,
  course_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  prerequisite TEXT,
  credits INTEGER,
  knowledge_block TEXT,
  shift TEXT,
  day_of_week TEXT,
  weeks TEXT,
  room TEXT,
  campus TEXT,
  managing_faculty TEXT,
  exam_date TEXT,
  exam_shift TEXT,
  exam_campus TEXT,
  exam_room TEXT,
  cohort TEXT,
  major TEXT,
  group_name TEXT,
  orientation TEXT,
  orientation_note_3 TEXT,
  registration_type TEXT,
  general_note TEXT,
  academic_program TEXT,
  student_count INTEGER,
  phase TEXT,
  semester TEXT,
  instructor TEXT,
  is_user_added INTEGER CHECK (is_user_added IN (0, 1)),
  created_at TEXT,
  updated_at TEXT NOT NULL,
  course_code_search TEXT NOT NULL,
  subject_name_search TEXT NOT NULL,
  instructor_search TEXT NOT NULL,
  source_position INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS course_schedules_semester_phase_idx
  ON course_schedules (semester, phase);

CREATE INDEX IF NOT EXISTS course_schedules_semester_user_added_idx
  ON course_schedules (semester, is_user_added);

CREATE INDEX IF NOT EXISTS course_schedules_updated_at_idx
  ON course_schedules (updated_at, id);

ALTER TABLE sync_metadata ADD COLUMN source_cursor TEXT;
