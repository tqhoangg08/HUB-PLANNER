SELECT semester,catalogue_visibility,COUNT(*) AS count FROM course_schedules GROUP BY semester,catalogue_visibility ORDER BY semester,catalogue_visibility;
SELECT academic_program,COUNT(*) AS count FROM course_schedules WHERE semester='HK1_2026_2027' AND catalogue_visibility='published' GROUP BY academic_program ORDER BY academic_program;
SELECT semester,course_code_search,COUNT(*) AS count FROM course_schedules GROUP BY semester,course_code_search HAVING COUNT(*)>1;
SELECT * FROM course_schedules WHERE semester='HK2_2026_2027' ORDER BY id;
SELECT sql FROM sqlite_master WHERE (tbl_name='course_schedules' OR tbl_name='course_filter_facets') AND sql IS NOT NULL ORDER BY type,name;
