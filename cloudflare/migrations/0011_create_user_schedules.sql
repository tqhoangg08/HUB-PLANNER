CREATE TABLE IF NOT EXISTS user_schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  semester TEXT NOT NULL DEFAULT '',
  custom_data TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS user_schedules_user_semester_idx
  ON user_schedules (user_id, semester);

CREATE INDEX IF NOT EXISTS user_schedules_course_idx
  ON user_schedules (course_id);
