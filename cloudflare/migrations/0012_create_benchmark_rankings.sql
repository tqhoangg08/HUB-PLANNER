CREATE TABLE IF NOT EXISTS benchmark_ranking_semesters (
  semester TEXT PRIMARY KEY,
  total_students INTEGER NOT NULL CHECK (total_students >= 0),
  comparable_students INTEGER NOT NULL CHECK (comparable_students >= 0),
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmark_ranking_buckets (
  semester TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('school', 'major')),
  scope_value TEXT NOT NULL DEFAULT '',
  gpa REAL NOT NULL,
  training_score INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  rank_value INTEGER NOT NULL CHECK (rank_value > 0),
  PRIMARY KEY (
    semester,
    scope_type,
    scope_value,
    gpa,
    training_score,
    credits
  )
  );

CREATE TABLE IF NOT EXISTS benchmark_ranking_scopes (
  semester TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('school', 'major')),
  scope_value TEXT NOT NULL DEFAULT '',
  total_students INTEGER NOT NULL CHECK (total_students >= 0),
  comparable_students INTEGER NOT NULL CHECK (comparable_students >= 0),
  PRIMARY KEY (semester, scope_type, scope_value)
);

CREATE INDEX IF NOT EXISTS benchmark_ranking_buckets_lookup_idx
  ON benchmark_ranking_buckets (
    semester,
    scope_type,
    scope_value,
    gpa DESC,
    training_score DESC,
    credits DESC
  );

CREATE TABLE IF NOT EXISTS benchmark_ranking_users (
  user_id TEXT NOT NULL,
  semester TEXT NOT NULL,
  student_rank INTEGER,
  total_students INTEGER NOT NULL CHECK (total_students >= 0),
  rank_in_class INTEGER,
  total_in_class INTEGER,
  class_code TEXT,
  rank_in_major INTEGER,
  total_in_major INTEGER,
  major TEXT,
  PRIMARY KEY (user_id, semester)
);

CREATE INDEX IF NOT EXISTS benchmark_ranking_users_semester_idx
  ON benchmark_ranking_users (semester);
