-- Repair stale denormalized profile columns without inventing any required
-- public value. Existing private JSON remains intact; only compatibility and
-- query columns are re-derived from it.

UPDATE user_profiles AS p
SET full_name = (
  SELECT NULLIF(TRIM(json_extract(q.data_json, '$.studentName')), '')
  FROM user_profile_private AS q
  WHERE q.user_id = p.user_id
)
WHERE NULLIF(TRIM(p.full_name), '') IS NULL
  AND EXISTS (
    SELECT 1 FROM user_profile_private AS q
    WHERE q.user_id = p.user_id
      AND NULLIF(TRIM(json_extract(q.data_json, '$.studentName')), '') IS NOT NULL
  );

UPDATE user_profile_private AS q
SET
  data_json = json_set(
    q.data_json,
    '$.studentName', COALESCE(NULLIF(TRIM((SELECT p.full_name FROM user_profiles AS p WHERE p.user_id = q.user_id)), ''), NULLIF(TRIM(json_extract(q.data_json, '$.studentName')), '')),
    '$.hasOnboarded', CASE
      WHEN NULLIF(TRIM((SELECT p.full_name FROM user_profiles AS p WHERE p.user_id = q.user_id)), '') IS NOT NULL
       AND NULLIF(TRIM((SELECT p.class_name FROM user_profiles AS p WHERE p.user_id = q.user_id)), '') IS NOT NULL
       AND NULLIF(TRIM(json_extract(q.data_json, '$.programName')), '') IS NOT NULL
       AND NULLIF(TRIM(json_extract(q.data_json, '$.cohort')), '') IS NOT NULL
       AND NULLIF(TRIM(json_extract(q.data_json, '$.majorName')), '') IS NOT NULL
       AND NULLIF(TRIM(json_extract(q.data_json, '$.specializationName')), '') IS NOT NULL
      THEN 1 ELSE 0 END
  ),
  student_name = COALESCE(NULLIF(TRIM((SELECT p.full_name FROM user_profiles AS p WHERE p.user_id = q.user_id)), ''), NULLIF(TRIM(json_extract(q.data_json, '$.studentName')), '')),
  cohort = NULLIF(TRIM(json_extract(q.data_json, '$.cohort')), ''),
  program_name = NULLIF(TRIM(json_extract(q.data_json, '$.programName')), ''),
  major_name = NULLIF(TRIM(json_extract(q.data_json, '$.majorName')), ''),
  specialization_name = NULLIF(TRIM(json_extract(q.data_json, '$.specializationName')), ''),
  target_gpa = CASE WHEN typeof(json_extract(q.data_json, '$.targetGPA')) IN ('integer', 'real') THEN json_extract(q.data_json, '$.targetGPA') ELSE NULL END,
  total_credits_required = CASE WHEN typeof(json_extract(q.data_json, '$.totalCreditsRequired')) IN ('integer', 'real') THEN json_extract(q.data_json, '$.totalCreditsRequired') ELSE NULL END,
  has_onboarded = CASE
    WHEN NULLIF(TRIM((SELECT p.full_name FROM user_profiles AS p WHERE p.user_id = q.user_id)), '') IS NOT NULL
     AND NULLIF(TRIM((SELECT p.class_name FROM user_profiles AS p WHERE p.user_id = q.user_id)), '') IS NOT NULL
     AND NULLIF(TRIM(json_extract(q.data_json, '$.programName')), '') IS NOT NULL
     AND NULLIF(TRIM(json_extract(q.data_json, '$.cohort')), '') IS NOT NULL
     AND NULLIF(TRIM(json_extract(q.data_json, '$.majorName')), '') IS NOT NULL
     AND NULLIF(TRIM(json_extract(q.data_json, '$.specializationName')), '') IS NOT NULL
    THEN 1 ELSE 0 END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  row_version = row_version + 1;
