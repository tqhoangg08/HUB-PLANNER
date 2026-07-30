ALTER TABLE sync_metadata ADD COLUMN visible_row_count INTEGER;

CREATE INDEX IF NOT EXISTS course_schedules_source_position_idx
  ON course_schedules (source_position);

CREATE INDEX IF NOT EXISTS course_schedules_semester_phase_user_position_idx
  ON course_schedules (semester, phase, is_user_added, source_position);

CREATE TABLE IF NOT EXISTS course_filter_facets (
  semester TEXT NOT NULL,
  phase TEXT NOT NULL,
  is_user_added INTEGER NOT NULL,
  subject_name TEXT NOT NULL,
  major TEXT NOT NULL,
  cohort TEXT NOT NULL,
  academic_program TEXT NOT NULL,
  group_name TEXT NOT NULL,
  course_count INTEGER NOT NULL CHECK (course_count > 0),
  first_source_position INTEGER NOT NULL,
  PRIMARY KEY (
    semester,
    phase,
    is_user_added,
    subject_name,
    major,
    cohort,
    academic_program,
    group_name
  )
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS course_filter_facets_base_idx
  ON course_filter_facets (semester, phase, is_user_added);

CREATE INDEX IF NOT EXISTS course_filter_facets_major_idx
  ON course_filter_facets (
    semester,
    phase,
    is_user_added,
    cohort,
    academic_program,
    major
  );

CREATE INDEX IF NOT EXISTS course_filter_facets_cohort_idx
  ON course_filter_facets (
    semester,
    phase,
    is_user_added,
    major,
    academic_program,
    cohort
  );

CREATE INDEX IF NOT EXISTS course_filter_facets_program_idx
  ON course_filter_facets (
    semester,
    phase,
    is_user_added,
    major,
    cohort,
    academic_program
  );

INSERT INTO course_filter_facets (
  semester,
  phase,
  is_user_added,
  subject_name,
  major,
  cohort,
  academic_program,
  group_name,
  course_count,
  first_source_position
)
SELECT
  COALESCE(semester, ''),
  COALESCE(phase, ''),
  COALESCE(is_user_added, -1),
  COALESCE(subject_name, ''),
  COALESCE(major, ''),
  COALESCE(cohort, ''),
  COALESCE(academic_program, ''),
  COALESCE(group_name, ''),
  COUNT(*),
  MIN(source_position)
FROM course_schedules
GROUP BY
  COALESCE(semester, ''),
  COALESCE(phase, ''),
  COALESCE(is_user_added, -1),
  COALESCE(subject_name, ''),
  COALESCE(major, ''),
  COALESCE(cohort, ''),
  COALESCE(academic_program, ''),
  COALESCE(group_name, '');

CREATE TRIGGER IF NOT EXISTS course_filter_facets_after_insert
AFTER INSERT ON course_schedules
BEGIN
  INSERT INTO course_filter_facets (
    semester,
    phase,
    is_user_added,
    subject_name,
    major,
    cohort,
    academic_program,
    group_name,
    course_count,
    first_source_position
  ) VALUES (
    COALESCE(NEW.semester, ''),
    COALESCE(NEW.phase, ''),
    COALESCE(NEW.is_user_added, -1),
    COALESCE(NEW.subject_name, ''),
    COALESCE(NEW.major, ''),
    COALESCE(NEW.cohort, ''),
    COALESCE(NEW.academic_program, ''),
    COALESCE(NEW.group_name, ''),
    1,
    NEW.source_position
  )
  ON CONFLICT (
    semester,
    phase,
    is_user_added,
    subject_name,
    major,
    cohort,
    academic_program,
    group_name
  ) DO UPDATE SET
    course_count = course_count + 1,
    first_source_position = MIN(first_source_position, excluded.first_source_position);
END;

CREATE TRIGGER IF NOT EXISTS course_filter_facets_after_delete
AFTER DELETE ON course_schedules
BEGIN
  DELETE FROM course_filter_facets
   WHERE course_count = 1
     AND semester = COALESCE(OLD.semester, '')
     AND phase = COALESCE(OLD.phase, '')
     AND is_user_added = COALESCE(OLD.is_user_added, -1)
     AND subject_name = COALESCE(OLD.subject_name, '')
     AND major = COALESCE(OLD.major, '')
     AND cohort = COALESCE(OLD.cohort, '')
     AND academic_program = COALESCE(OLD.academic_program, '')
     AND group_name = COALESCE(OLD.group_name, '');

  UPDATE course_filter_facets
     SET course_count = course_count - 1,
         first_source_position = (
           SELECT MIN(course_schedules.source_position)
             FROM course_schedules
            WHERE COALESCE(course_schedules.semester, '') =
                  COALESCE(OLD.semester, '')
              AND COALESCE(course_schedules.phase, '') = COALESCE(OLD.phase, '')
              AND COALESCE(course_schedules.is_user_added, -1) =
                  COALESCE(OLD.is_user_added, -1)
              AND COALESCE(course_schedules.subject_name, '') =
                  COALESCE(OLD.subject_name, '')
              AND COALESCE(course_schedules.major, '') = COALESCE(OLD.major, '')
              AND COALESCE(course_schedules.cohort, '') = COALESCE(OLD.cohort, '')
              AND COALESCE(course_schedules.academic_program, '') =
                  COALESCE(OLD.academic_program, '')
              AND COALESCE(course_schedules.group_name, '') =
                  COALESCE(OLD.group_name, '')
         )
   WHERE course_count > 1
     AND semester = COALESCE(OLD.semester, '')
     AND phase = COALESCE(OLD.phase, '')
     AND is_user_added = COALESCE(OLD.is_user_added, -1)
     AND subject_name = COALESCE(OLD.subject_name, '')
     AND major = COALESCE(OLD.major, '')
     AND cohort = COALESCE(OLD.cohort, '')
     AND academic_program = COALESCE(OLD.academic_program, '')
     AND group_name = COALESCE(OLD.group_name, '');
END;

CREATE TRIGGER IF NOT EXISTS course_filter_facets_after_update
AFTER UPDATE OF
  semester,
  phase,
  is_user_added,
  subject_name,
  major,
  cohort,
  academic_program,
  group_name
ON course_schedules
WHEN
  OLD.semester IS NOT NEW.semester OR
  OLD.phase IS NOT NEW.phase OR
  OLD.is_user_added IS NOT NEW.is_user_added OR
  OLD.subject_name IS NOT NEW.subject_name OR
  OLD.major IS NOT NEW.major OR
  OLD.cohort IS NOT NEW.cohort OR
  OLD.academic_program IS NOT NEW.academic_program OR
  OLD.group_name IS NOT NEW.group_name
BEGIN
  DELETE FROM course_filter_facets
   WHERE course_count = 1
     AND semester = COALESCE(OLD.semester, '')
     AND phase = COALESCE(OLD.phase, '')
     AND is_user_added = COALESCE(OLD.is_user_added, -1)
     AND subject_name = COALESCE(OLD.subject_name, '')
     AND major = COALESCE(OLD.major, '')
     AND cohort = COALESCE(OLD.cohort, '')
     AND academic_program = COALESCE(OLD.academic_program, '')
     AND group_name = COALESCE(OLD.group_name, '');

  UPDATE course_filter_facets
     SET course_count = course_count - 1,
         first_source_position = (
           SELECT MIN(course_schedules.source_position)
             FROM course_schedules
            WHERE COALESCE(course_schedules.semester, '') =
                  COALESCE(OLD.semester, '')
              AND COALESCE(course_schedules.phase, '') = COALESCE(OLD.phase, '')
              AND COALESCE(course_schedules.is_user_added, -1) =
                  COALESCE(OLD.is_user_added, -1)
              AND COALESCE(course_schedules.subject_name, '') =
                  COALESCE(OLD.subject_name, '')
              AND COALESCE(course_schedules.major, '') = COALESCE(OLD.major, '')
              AND COALESCE(course_schedules.cohort, '') = COALESCE(OLD.cohort, '')
              AND COALESCE(course_schedules.academic_program, '') =
                  COALESCE(OLD.academic_program, '')
              AND COALESCE(course_schedules.group_name, '') =
                  COALESCE(OLD.group_name, '')
         )
   WHERE course_count > 1
     AND semester = COALESCE(OLD.semester, '')
     AND phase = COALESCE(OLD.phase, '')
     AND is_user_added = COALESCE(OLD.is_user_added, -1)
     AND subject_name = COALESCE(OLD.subject_name, '')
     AND major = COALESCE(OLD.major, '')
     AND cohort = COALESCE(OLD.cohort, '')
     AND academic_program = COALESCE(OLD.academic_program, '')
     AND group_name = COALESCE(OLD.group_name, '');

  INSERT INTO course_filter_facets (
    semester,
    phase,
    is_user_added,
    subject_name,
    major,
    cohort,
    academic_program,
    group_name,
    course_count,
    first_source_position
  ) VALUES (
    COALESCE(NEW.semester, ''),
    COALESCE(NEW.phase, ''),
    COALESCE(NEW.is_user_added, -1),
    COALESCE(NEW.subject_name, ''),
    COALESCE(NEW.major, ''),
    COALESCE(NEW.cohort, ''),
    COALESCE(NEW.academic_program, ''),
    COALESCE(NEW.group_name, ''),
    1,
    NEW.source_position
  )
  ON CONFLICT (
    semester,
    phase,
    is_user_added,
    subject_name,
    major,
    cohort,
    academic_program,
    group_name
  ) DO UPDATE SET
    course_count = course_count + 1,
    first_source_position = MIN(first_source_position, excluded.first_source_position);
END;

UPDATE sync_metadata
   SET visible_row_count = (
     SELECT COUNT(*)
       FROM school_announcements
      WHERE is_hidden = 0
   )
 WHERE resource = 'school_announcements';

UPDATE sync_metadata
   SET visible_row_count = source_row_count
 WHERE resource = 'course_schedules';
