CREATE TABLE IF NOT EXISTS semester_exact_rankings (
  semester TEXT NOT NULL,
  student_code TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank > 0),
  total_students INTEGER NOT NULL CHECK (total_students > 0),
  gpa REAL,
  training_score INTEGER,
  credits INTEGER,
  class_code TEXT,
  major TEXT,
  scholarship_status TEXT,
  rank_in_class INTEGER CHECK (rank_in_class > 0),
  total_in_class INTEGER CHECK (total_in_class > 0),
  rank_in_major INTEGER CHECK (rank_in_major > 0),
  total_in_major INTEGER CHECK (total_in_major > 0),
  PRIMARY KEY (semester, student_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS semester_exact_rankings_order_idx
  ON semester_exact_rankings (semester, rank);

CREATE TABLE IF NOT EXISTS semester_exact_ranking_datasets (
  semester TEXT PRIMARY KEY,
  total_students INTEGER NOT NULL CHECK (total_students > 0),
  source_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('importing', 'ready')),
  imported_at TEXT NOT NULL
);
