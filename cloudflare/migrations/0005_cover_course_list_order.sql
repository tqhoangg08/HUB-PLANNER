DROP INDEX IF EXISTS course_schedules_semester_phase_idx;
CREATE INDEX course_schedules_semester_phase_idx
  ON course_schedules (semester, phase, source_position);

DROP INDEX IF EXISTS course_schedules_semester_user_added_idx;
CREATE INDEX course_schedules_semester_user_added_idx
  ON course_schedules (semester, is_user_added, source_position);
