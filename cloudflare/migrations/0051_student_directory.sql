-- Private student directory. No public enumeration or MSSV lookup route.
CREATE TABLE IF NOT EXISTS student_directory (
  student_code TEXT NOT NULL PRIMARY KEY CHECK (length(student_code) = 12 AND student_code NOT GLOB '*[^0-9]*'),
  full_name TEXT,
  gender TEXT,
  general_class TEXT,
  major_class TEXT,
  major TEXT,
  specialization TEXT,
  training_program TEXT,
  cohort TEXT,
  source_version TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
