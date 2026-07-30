interface CourseEnv {
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface CourseRow {
  id: string;
  course_code: string;
  subject_name: string;
  prerequisite: string | null;
  credits: number | null;
  knowledge_block: string | null;
  shift: string | null;
  day_of_week: string | null;
  weeks: string | null;
  room: string | null;
  campus: string | null;
  managing_faculty: string | null;
  exam_date: string | null;
  exam_shift: string | null;
  exam_campus: string | null;
  exam_room: string | null;
  cohort: string | null;
  major: string | null;
  group_name: string | null;
  orientation: string | null;
  orientation_note_3: string | null;
  registration_type: string | null;
  general_note: string | null;
  academic_program: string | null;
  student_count: number | null;
  phase: string | null;
  semester: string | null;
  instructor: string | null;
  is_user_added: boolean | number | null;
  created_at: string | null;
  updated_at: string;
}

interface CourseFacetRow {
  subject_name?: string;
  major?: string;
  cohort?: string;
  academic_program?: string;
  group_name?: string;
  first_source_position?: number;
}

const SYNC_PAGE_SIZE = 500;
const RECONCILE_PAGE_SIZE = 1000;
const SYNC_OVERLAP_MS = 5 * 60 * 1000;

const DETAIL_COLUMNS = [
  'id', 'course_code', 'subject_name', 'prerequisite', 'credits', 'knowledge_block',
  'shift', 'day_of_week', 'weeks', 'room', 'campus', 'managing_faculty', 'exam_date',
  'exam_shift', 'exam_campus', 'exam_room', 'cohort', 'major', 'group_name',
  'orientation', 'orientation_note_3', 'registration_type', 'general_note',
  'academic_program', 'student_count', 'phase', 'semester', 'instructor', 'is_user_added',
] as const;

const SUMMARY_COLUMNS = [
  'id', 'semester', 'course_code', 'subject_name', 'credits', 'phase', 'day_of_week',
  'shift', 'weeks', 'room', 'campus', 'instructor', 'group_name', 'cohort', 'major',
  'academic_program', 'is_user_added',
] as const;

const SYNC_COLUMNS = [...DETAIL_COLUMNS, 'created_at', 'updated_at'] as const;

const clean = (value: unknown) => String(value || '').trim();
const normalizeSearch = (value: unknown) =>
  clean(value).toLocaleLowerCase('vi-VN').replace(/[%,]/g, ' ').replace(/\s+/g, ' ').trim();

const uniqueSortedOptions = (values: unknown[]) =>
  [...new Set(values.map(clean).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'vi', { numeric: true, sensitivity: 'base' })
  );

export const parseCourseGroupTokens = (value: unknown) => {
  const parts = clean(value).split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  const prefix = parts[0].match(/^(.+_N)(\d+)$/i)?.[1];
  return [...new Set(parts.map((part, index) =>
    index > 0 && prefix && /^\d+$/.test(part) ? `${prefix}${part}` : part
  ))];
};

const publicRow = (row: Record<string, unknown>) => {
  const result = { ...row };
  for (const key of [
    'source_position', 'updated_at', 'created_at', 'course_code_search',
    'subject_name_search', 'instructor_search',
  ]) delete result[key];
  if ('is_user_added' in result) {
    result.is_user_added =
      result.is_user_added === null || result.is_user_added === undefined
        ? null
        : Boolean(result.is_user_added);
  }
  return result;
};

const buildWhere = (params: URLSearchParams) => {
  const where: string[] = [];
  const bindings: Array<string | number> = [];
  const exact = [
    ['semester', 'semester'], ['major', 'major'], ['cohort', 'cohort'],
    ['academicProgram', 'academic_program'], ['subjectName', 'subject_name'],
  ] as const;
  for (const [parameter, column] of exact) {
    const value = clean(params.get(parameter));
    if (value) {
      where.push(`${column} = ?`);
      bindings.push(value);
    }
  }
  const phase = clean(params.get('phase'));
  if (phase && phase !== 'all') {
    where.push('phase = ?');
    bindings.push(phase);
  }
  const isUserAdded = clean(params.get('isUserAdded'));
  if (isUserAdded === 'true') where.push('is_user_added = 1');
  if (isUserAdded === 'false') where.push('(is_user_added = 0 OR is_user_added IS NULL)');

  const search = normalizeSearch(params.get('search'));
  if (search) {
    where.push(
      '(subject_name_search LIKE ? OR course_code_search LIKE ? OR instructor_search LIKE ?)'
    );
    bindings.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', bindings };
};

type CourseFacetDimension = 'major' | 'cohort' | 'academicProgram' | 'subjectName';

const buildFacetWhere = (
  params: URLSearchParams,
  dimensions: CourseFacetDimension[] = [
    'major',
    'cohort',
    'academicProgram',
    'subjectName',
  ]
) => {
  const included = new Set<CourseFacetDimension>(dimensions);
  const where: string[] = [];
  const bindings: Array<string | number> = [];
  const exact = [
    ['semester', 'semester', true],
    ['major', 'major', included.has('major')],
    ['cohort', 'cohort', included.has('cohort')],
    ['academicProgram', 'academic_program', included.has('academicProgram')],
    ['subjectName', 'subject_name', included.has('subjectName')],
  ] as const;

  for (const [parameter, column, shouldInclude] of exact) {
    const value = clean(params.get(parameter));
    if (value && shouldInclude) {
      where.push(`${column} = ?`);
      bindings.push(value);
    }
  }

  const phase = clean(params.get('phase'));
  if (phase && phase !== 'all') {
    where.push('phase = ?');
    bindings.push(phase);
  }

  const isUserAdded = clean(params.get('isUserAdded'));
  if (isUserAdded === 'true') where.push('is_user_added = 1');
  if (isUserAdded === 'false') where.push('is_user_added IN (0, -1)');

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    bindings,
  };
};

export const canUseCourseMetadataCount = (params: URLSearchParams) => {
  const phase = clean(params.get('phase'));
  return ![
    'semester',
    'major',
    'cohort',
    'academicProgram',
    'subjectName',
    'search',
    'groupName',
  ].some((name) => clean(params.get(name))) &&
  !['true', 'false'].includes(clean(params.get('isUserAdded'))) &&
  (!phase || phase === 'all');
};

const countCourses = async (params: URLSearchParams, env: CourseEnv) => {
  if (canUseCourseMetadataCount(params)) {
    const metadata = await env.DB.prepare(
      'SELECT source_row_count FROM sync_metadata WHERE resource = ?'
    ).bind('course_schedules').first<{ source_row_count: number }>();
    if (metadata) return Number(metadata.source_row_count || 0);
  }

  if (!normalizeSearch(params.get('search')) && !clean(params.get('groupName'))) {
    const { whereSql, bindings } = buildFacetWhere(params);
    const facetCount = await env.DB.prepare(
      `SELECT COALESCE(SUM(course_count), 0) AS total
         FROM course_filter_facets ${whereSql}`
    ).bind(...bindings).first<{ total: number }>();
    return Number(facetCount?.total || 0);
  }

  const { whereSql, bindings } = buildWhere(params);
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM course_schedules ${whereSql}`
  ).bind(...bindings).first<{ total: number }>();
  return Number(count?.total || 0);
};

export const parseCourseListPaging = (params: URLSearchParams) => {
  const suggestions = params.get('suggestions') === 'true';
  const limit = suggestions
    ? Math.max(1, Math.min(Number(params.get('limit')) || 10, 10))
    : Math.max(1, Math.min(Number(params.get('limit')) || 50, 100));
  return {
    suggestions,
    limit,
    offset: suggestions ? 0 : Math.max(0, Number(params.get('offset')) || 0),
  };
};

const courseList = async (url: URL, env: CourseEnv) => {
  const { suggestions, limit, offset } = parseCourseListPaging(url.searchParams);
  const { whereSql, bindings } = buildWhere(url.searchParams);
  const columns = url.searchParams.get('view') === 'detail' ? DETAIL_COLUMNS : SUMMARY_COLUMNS;
  const groupName = clean(url.searchParams.get('groupName'));
  let rows: Record<string, unknown>[] = [];
  let total = 0;

  if (groupName && !suggestions) {
    const candidates = await env.DB.prepare(
      `SELECT ${SUMMARY_COLUMNS.join(', ')}, source_position
       FROM course_schedules ${whereSql} ORDER BY source_position`
    ).bind(...bindings).all<Record<string, unknown>>();
    const matching = (candidates.results || []).filter((row) =>
      parseCourseGroupTokens(row.group_name).includes(groupName)
    );
    total = matching.length;
    rows = matching.slice(offset, offset + limit);
  } else {
    if (!suggestions) {
      total = await countCourses(url.searchParams, env);
    }
    const result = await env.DB.prepare(
      `SELECT ${columns.join(', ')}, source_position
       FROM course_schedules ${whereSql}
       ORDER BY source_position LIMIT ? OFFSET ?`
    ).bind(...bindings, limit, offset).all<Record<string, unknown>>();
    rows = result.results || [];
    if (suggestions) total = rows.length;
  }

  const data = rows.map(publicRow);
  return {
    status: 200,
    payload: {
      success: true,
      data,
      hasMore: suggestions ? false : total > offset + data.length,
      total,
      limit,
      offset,
    },
  };
};

const filterOptions = async (url: URL, env: CourseEnv) => {
  const majorFilter = buildFacetWhere(url.searchParams, ['cohort', 'academicProgram']);
  const cohortFilter = buildFacetWhere(url.searchParams, ['major', 'academicProgram']);
  const optionFilter = buildFacetWhere(
    url.searchParams,
    ['major', 'cohort', 'academicProgram']
  );
  const programFilter = buildFacetWhere(url.searchParams, ['major', 'cohort']);

  const results = await env.DB.batch<CourseFacetRow>([
    env.DB.prepare(
      `SELECT major, MIN(first_source_position) AS first_source_position
         FROM course_filter_facets ${majorFilter.whereSql}
        GROUP BY major
        ORDER BY first_source_position`
    ).bind(...majorFilter.bindings),
    env.DB.prepare(
      `SELECT cohort, MIN(first_source_position) AS first_source_position
         FROM course_filter_facets ${cohortFilter.whereSql}
        GROUP BY cohort
        ORDER BY first_source_position`
    ).bind(...cohortFilter.bindings),
    env.DB.prepare(
      `SELECT subject_name, group_name,
              MIN(first_source_position) AS first_source_position
         FROM course_filter_facets ${optionFilter.whereSql}
        GROUP BY subject_name, group_name
        ORDER BY first_source_position`
    ).bind(...optionFilter.bindings),
    env.DB.prepare(
      `SELECT academic_program, MIN(first_source_position) AS first_source_position
         FROM course_filter_facets ${programFilter.whereSql}
        GROUP BY academic_program
        ORDER BY first_source_position`
    ).bind(...programFilter.bindings),
  ]);

  const majorRows = results[0]?.results || [];
  const cohortRows = results[1]?.results || [];
  const optionRows = results[2]?.results || [];
  const programRows = results[3]?.results || [];

  return {
    status: 200,
    payload: {
      success: true,
      majorOptions: uniqueSortedOptions(majorRows.map((row) => row.major)),
      cohortOptions: uniqueSortedOptions(cohortRows.map((row) => row.cohort)),
      subjectNameOptions: uniqueSortedOptions(optionRows.map((row) => row.subject_name)),
      groupNameOptions: uniqueSortedOptions(optionRows.flatMap((row) =>
        parseCourseGroupTokens(row.group_name)
      )),
      academicProgramOptions: uniqueSortedOptions(
        programRows.map((row) => row.academic_program)
      ),
    },
  };
};

const courseDetail = async (url: URL, env: CourseEnv) => {
  const id = clean(url.searchParams.get('id'));
  if (!id) return { status: 400, payload: { error: 'Missing course id' } };
  const row = await env.DB.prepare(
    `SELECT ${DETAIL_COLUMNS.join(', ')} FROM course_schedules WHERE id = ?`
  ).bind(id).first<Record<string, unknown>>();
  if (!row) return { status: 404, payload: { error: 'Course not found' } };
  return { status: 200, payload: { success: true, data: publicRow(row) } };
};

export const handleCourses = async (url: URL, env: CourseEnv) => {
  const resource = clean(url.searchParams.get('resource'));
  if (resource === 'filter-options') return filterOptions(url, env);
  if (resource === 'course-detail') return courseDetail(url, env);
  if (resource) {
    return { status: 400, payload: { error: 'Resource is not available on the public API.' } };
  }
  return courseList(url, env);
};

export const buildSupabaseCourseSyncUrl = (
  baseUrl: string,
  options: { since?: string; offset?: number; idsOnly?: boolean } = {}
) => {
  const url = new URL('/rest/v1/course_schedules', baseUrl.replace(/\/$/, ''));
  url.searchParams.set('select', options.idsOnly ? 'id' : SYNC_COLUMNS.join(','));
  url.searchParams.set('order', options.idsOnly ? 'id.asc' : 'updated_at.asc,id.asc');
  url.searchParams.set('limit', String(options.idsOnly ? RECONCILE_PAGE_SIZE : SYNC_PAGE_SIZE));
  url.searchParams.set('offset', String(Math.max(0, options.offset || 0)));
  if (options.since && !options.idsOnly) url.searchParams.set('updated_at', `gte.${options.since}`);
  return url;
};

const readSourcePage = async (
  env: CourseEnv,
  options: { since?: string; offset?: number; idsOnly?: boolean }
) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Course sync is missing its Supabase server credential.');
  }
  const response = await fetch(buildSupabaseCourseSyncUrl(env.SUPABASE_URL, options), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`Course sync source returned ${response.status}.`);
  return (await response.json()) as CourseRow[];
};

const WRITE_SQL = `
  INSERT INTO course_schedules (
    id, course_code, subject_name, prerequisite, credits, knowledge_block,
    shift, day_of_week, weeks, room, campus, managing_faculty, exam_date,
    exam_shift, exam_campus, exam_room, cohort, major, group_name, orientation,
    orientation_note_3, registration_type, general_note, academic_program,
    student_count, phase, semester, instructor, is_user_added, created_at,
    updated_at, course_code_search, subject_name_search, instructor_search,
    source_position
  )
  VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    COALESCE(
      (SELECT source_position FROM course_schedules WHERE id = ?),
      (SELECT COALESCE(MAX(source_position), 0) + 1 FROM course_schedules)
    )
  )
  ON CONFLICT(id) DO UPDATE SET
    course_code=excluded.course_code, subject_name=excluded.subject_name,
    prerequisite=excluded.prerequisite, credits=excluded.credits,
    knowledge_block=excluded.knowledge_block, shift=excluded.shift,
    day_of_week=excluded.day_of_week, weeks=excluded.weeks, room=excluded.room,
    campus=excluded.campus, managing_faculty=excluded.managing_faculty,
    exam_date=excluded.exam_date, exam_shift=excluded.exam_shift,
    exam_campus=excluded.exam_campus, exam_room=excluded.exam_room,
    cohort=excluded.cohort, major=excluded.major, group_name=excluded.group_name,
    orientation=excluded.orientation, orientation_note_3=excluded.orientation_note_3,
    registration_type=excluded.registration_type, general_note=excluded.general_note,
    academic_program=excluded.academic_program, student_count=excluded.student_count,
    phase=excluded.phase, semester=excluded.semester, instructor=excluded.instructor,
    is_user_added=excluded.is_user_added, created_at=excluded.created_at,
    updated_at=excluded.updated_at, course_code_search=excluded.course_code_search,
    subject_name_search=excluded.subject_name_search,
    instructor_search=excluded.instructor_search
  WHERE course_schedules.updated_at IS NOT excluded.updated_at
`;

const bindings = (row: CourseRow) => [
  row.id, row.course_code, row.subject_name, row.prerequisite, row.credits,
  row.knowledge_block, row.shift, row.day_of_week, row.weeks, row.room, row.campus,
  row.managing_faculty, row.exam_date, row.exam_shift, row.exam_campus, row.exam_room,
  row.cohort, row.major, row.group_name, row.orientation, row.orientation_note_3,
  row.registration_type, row.general_note, row.academic_program, row.student_count,
  row.phase, row.semester, row.instructor,
  row.is_user_added === null ? null : row.is_user_added ? 1 : 0,
  row.created_at, row.updated_at,
  String(row.course_code || '').toLocaleLowerCase('vi-VN'),
  String(row.subject_name || '').toLocaleLowerCase('vi-VN'),
  String(row.instructor || '').toLocaleLowerCase('vi-VN'),
  row.id,
];

const writeRows = async (env: CourseEnv, rows: CourseRow[]) => {
  for (let index = 0; index < rows.length; index += 50) {
    await env.DB.batch(rows.slice(index, index + 50).map((row) =>
      env.DB.prepare(WRITE_SQL).bind(...bindings(row))
    ));
  }
};

export const syncCourseSchedules = async (env: CourseEnv, reconcileDeletes = false) => {
  const metadata = await env.DB.prepare(
    'SELECT source_max_created_at FROM sync_metadata WHERE resource = ?'
  ).bind('course_schedules').first<{ source_max_created_at: string | null }>();
  const previousCursor = metadata?.source_max_created_at || '';
  const since = previousCursor
    ? new Date(new Date(previousCursor).getTime() - SYNC_OVERLAP_MS).toISOString()
    : undefined;

  let offset = 0;
  let syncedRows = 0;
  let latestRow: CourseRow | null = null;
  while (true) {
    const page = await readSourcePage(env, { since, offset });
    if (!page.length) break;
    await writeRows(env, page);
    syncedRows += page.length;
    latestRow = page[page.length - 1] || latestRow;
    if (page.length < SYNC_PAGE_SIZE) break;
    offset += page.length;
  }

  let deletedRows = 0;
  if (reconcileDeletes) {
    const sourceIds = new Set<string>();
    for (let idOffset = 0; ; idOffset += RECONCILE_PAGE_SIZE) {
      const page = await readSourcePage(env, { idsOnly: true, offset: idOffset });
      page.forEach((row) => sourceIds.add(row.id));
      if (page.length < RECONCILE_PAGE_SIZE) break;
    }
    const local = await env.DB.prepare('SELECT id FROM course_schedules').all<{ id: string }>();
    const missing = (local.results || []).map((row) => row.id).filter((id) => !sourceIds.has(id));
    for (let index = 0; index < missing.length; index += 100) {
      await env.DB.batch(missing.slice(index, index + 100).map((id) =>
        env.DB.prepare('DELETE FROM course_schedules WHERE id = ?').bind(id)
      ));
    }
    deletedRows = missing.length;
  }

  const summary = await env.DB.prepare(
    'SELECT COUNT(*) AS count, MAX(updated_at) AS max_updated_at FROM course_schedules'
  ).first<{ count: number; max_updated_at: string | null }>();
  const syncedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO sync_metadata (
       resource, source_row_count, source_max_created_at, synced_at, source_cursor,
       visible_row_count
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET
       source_row_count=excluded.source_row_count,
       source_max_created_at=excluded.source_max_created_at,
       synced_at=excluded.synced_at,
       source_cursor=excluded.source_cursor,
       visible_row_count=excluded.visible_row_count`
  ).bind(
    'course_schedules', Number(summary?.count || 0),
    summary?.max_updated_at || previousCursor || null, syncedAt, latestRow?.id || null,
    Number(summary?.count || 0)
  ).run();

  return {
    syncedRows,
    deletedRows,
    sourceRowCount: Number(summary?.count || 0),
    syncedAt,
  };
};
