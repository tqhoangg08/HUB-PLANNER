interface UserSchedulesEnv {
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface SupabaseUserScheduleRow {
  id: string;
  user_id: string;
  course_id: string;
  semester: string;
  custom_data: Record<string, unknown> | null;
  created_at: string;
}

interface D1UserScheduleCourseRow extends Record<string, unknown> {
  user_schedule_id: string;
  schedule_course_id: string;
  schedule_semester: string;
  schedule_custom_data: string | null;
  base_course_id: string | null;
  snapshot_course_json: string | null;
}

export interface UserScheduleMutationResult {
  success: true;
  mirrorSynced: boolean;
}

interface ScheduleImportResult {
  count: number;
  courseIds: string[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEMESTER_PATTERN = /^[A-Za-z0-9_()-]{1,64}$/;
const RESOURCE_NAME = 'user_schedules';
const SYNC_PAGE_SIZE = 1_000;
const WRITE_TIMEOUT_MS = 10_000;
const MAX_COURSES_PER_REPLACE = 200;
const MAX_CUSTOM_DATA_BYTES = 256 * 1024;
const MAX_CUSTOM_DATA_DEPTH = 16;
const MAX_REQUEST_BODY_BYTES = MAX_CUSTOM_DATA_BYTES + 16 * 1024;

const COURSE_COLUMNS = [
  'course_code',
  'subject_name',
  'prerequisite',
  'credits',
  'knowledge_block',
  'shift',
  'day_of_week',
  'weeks',
  'room',
  'campus',
  'managing_faculty',
  'exam_date',
  'exam_shift',
  'exam_campus',
  'exam_room',
  'cohort',
  'major',
  'group_name',
  'orientation',
  'orientation_note_3',
  'registration_type',
  'general_note',
  'academic_program',
  'student_count',
  'phase',
  'semester',
  'instructor',
  'is_user_added',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Keep JSON representation deterministic wherever private schedule state is
// persisted or compared. It is deliberately shared by the D1 mutation path
// and reconciliation tooling rather than relying on client key ordering.
export const canonicalizeUserScheduleJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizeUserScheduleJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalizeUserScheduleJson(value[key])])
  );
};

export const serializeCanonicalUserScheduleJson = (value: unknown) =>
  JSON.stringify(canonicalizeUserScheduleJson(value));

const jsonDepth = (value: unknown, current = 0): number => {
  if (value === null || typeof value !== 'object') return current;
  if (current > MAX_CUSTOM_DATA_DEPTH) return current;
  const values = Array.isArray(value) ? value : Object.values(value);
  return values.reduce(
    (maximum, child) => Math.max(maximum, jsonDepth(child, current + 1)),
    current
  );
};

export class UserScheduleError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 502 | 503;

  constructor(status: 400 | 403 | 404 | 409 | 502 | 503, message: string) {
    super(message);
    this.name = 'UserScheduleError';
    this.status = status;
  }
}

export const parseUserScheduleId = (value: unknown, label = 'Mã dữ liệu') => {
  const id = String(value || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) {
    throw new UserScheduleError(400, `${label} không hợp lệ.`);
  }
  return id;
};

export const assertOwnUserScheduleTarget = (
  identityUserIdValue: unknown,
  requestedUserIdValue: unknown
) => {
  const identityUserId = parseUserScheduleId(
    identityUserIdValue,
    'Mã người dùng'
  );
  if (
    requestedUserIdValue !== null &&
    requestedUserIdValue !== undefined &&
    String(requestedUserIdValue).trim() !== '' &&
    parseUserScheduleId(requestedUserIdValue, 'Mã người dùng') !==
      identityUserId
  ) {
    throw new UserScheduleError(
      403,
      'Không cho phép đọc lịch cá nhân của người dùng khác.'
    );
  }
  return identityUserId;
};

export const parseUserScheduleSemester = (value: unknown) => {
  const semester = String(value || '').trim();
  if (!SEMESTER_PATTERN.test(semester)) {
    throw new UserScheduleError(400, 'Học kỳ không hợp lệ.');
  }
  return semester;
};

export const parseUserScheduleCourseIds = (value: unknown) => {
  if (!Array.isArray(value) || value.length > MAX_COURSES_PER_REPLACE) {
    throw new UserScheduleError(400, 'Danh sách môn học không hợp lệ.');
  }
  return [...new Set(
    value.map((courseId) => parseUserScheduleId(courseId, 'Mã môn học'))
  )];
};

export const parseUserScheduleCustomData = (
  value: unknown
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new UserScheduleError(400, 'Dữ liệu lịch cá nhân không hợp lệ.');
  }
  const serialized = JSON.stringify(value);
  if (
    new TextEncoder().encode(serialized).byteLength > MAX_CUSTOM_DATA_BYTES ||
    jsonDepth(value) > MAX_CUSTOM_DATA_DEPTH
  ) {
    throw new UserScheduleError(400, 'Dữ liệu lịch cá nhân vượt giới hạn.');
  }
  return value;
};

export const readUserScheduleBody = async (
  request: Request
): Promise<Record<string, unknown>> => {
  if (
    !String(request.headers.get('Content-Type') || '')
      .toLowerCase()
      .includes('application/json')
  ) {
    throw new UserScheduleError(400, 'Yêu cầu phải dùng dữ liệu JSON.');
  }
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw new UserScheduleError(400, 'Dữ liệu lịch cá nhân vượt giới hạn.');
  }
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new UserScheduleError(400, 'Dữ liệu lịch cá nhân vượt giới hạn.');
  }
  try {
    const payload: unknown = JSON.parse(bodyText);
    if (!isRecord(payload)) throw new Error('not-an-object');
    return payload;
  } catch {
    throw new UserScheduleError(400, 'Dữ liệu yêu cầu không hợp lệ.');
  }
};

const parseStoredCustomData = (
  value: unknown
): Record<string, unknown> | null => {
  if (value === null || value === undefined || value === '') return null;
  if (isRecord(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const parseSourceRows = (value: unknown): SupabaseUserScheduleRow[] => {
  if (!Array.isArray(value)) {
    throw new UserScheduleError(
      502,
      'Nguồn tạm thời trả về lịch cá nhân không hợp lệ.'
    );
  }

  return value.map((row) => {
    if (!isRecord(row)) {
      throw new UserScheduleError(
        502,
        'Nguồn tạm thời trả về lịch cá nhân không hợp lệ.'
      );
    }
    try {
      return {
        id: parseUserScheduleId(row.id, 'Mã lịch cá nhân'),
        user_id: parseUserScheduleId(row.user_id, 'Mã người dùng'),
        course_id: parseUserScheduleId(row.course_id, 'Mã môn học'),
        semester:
          typeof row.semester === 'string' ? row.semester.trim() : '',
        custom_data: parseStoredCustomData(row.custom_data),
        created_at:
          typeof row.created_at === 'string' && row.created_at
            ? row.created_at
            : new Date().toISOString(),
      };
    } catch {
      throw new UserScheduleError(
        502,
        'Nguồn tạm thời trả về lịch cá nhân không hợp lệ.'
      );
    }
  });
};

const readSyncConfig = (env: UserSchedulesEnv) => {
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new UserScheduleError(
      503,
      'Cấu hình đồng bộ lịch cá nhân chưa đầy đủ.'
    );
  }
  return { supabaseUrl, serviceRoleKey };
};

const readWriteConfig = (env: UserSchedulesEnv) => {
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !anonKey) {
    throw new UserScheduleError(
      503,
      'Cấu hình lưu lịch cá nhân chưa đầy đủ.'
    );
  }
  return { supabaseUrl, anonKey };
};

export const buildSupabaseUserSchedulesUrl = (
  baseUrl: string,
  options: {
    offset?: number;
    userId?: string;
    courseId?: string;
    scheduleId?: string;
    semester?: string;
    select?: boolean;
    upsert?: boolean;
    scheduleIds?: string[];
  } = {}
) => {
  const url = new URL('/rest/v1/user_schedules', baseUrl.replace(/\/$/, ''));
  if (options.select !== false) {
    url.searchParams.set(
      'select',
      'id,user_id,course_id,semester,custom_data,created_at'
    );
  }
  if (options.userId) {
    url.searchParams.set(
      'user_id',
      `eq.${parseUserScheduleId(options.userId, 'Mã người dùng')}`
    );
  }
  if (options.courseId) {
    url.searchParams.set(
      'course_id',
      `eq.${parseUserScheduleId(options.courseId, 'Mã môn học')}`
    );
  }
  if (options.scheduleId) {
    url.searchParams.set(
      'id',
      `eq.${parseUserScheduleId(options.scheduleId, 'Mã lịch cá nhân')}`
    );
  }
  if (options.semester) {
    url.searchParams.set(
      'semester',
      `eq.${parseUserScheduleSemester(options.semester)}`
    );
  }
  if (options.scheduleIds?.length) {
    const ids = options.scheduleIds.map((id) =>
      parseUserScheduleId(id, 'Mã lịch cá nhân')
    );
    url.searchParams.set('id', `in.(${ids.join(',')})`);
  }
  if (options.upsert) {
    url.searchParams.set('on_conflict', 'user_id,course_id');
  }
  if (options.offset !== undefined) {
    url.searchParams.set('order', 'id.asc');
    url.searchParams.set('limit', String(SYNC_PAGE_SIZE));
    url.searchParams.set(
      'offset',
      String(Math.max(0, Math.trunc(options.offset)))
    );
  }
  return url;
};

const fetchSourceRows = async (
  env: UserSchedulesEnv,
  accessToken: string,
  url: URL,
  init: RequestInit,
  fetcher: typeof fetch
) => {
  const { anonKey } = readWriteConfig(env);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('user-schedule-write-timeout'),
    WRITE_TIMEOUT_MS
  );
  try {
    const response = await fetcher(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let sourceCode = '';
      let sourceMessage = '';
      try {
        const payload = JSON.parse(errorText) as Record<string, unknown>;
        sourceCode = String(payload.code || '');
        sourceMessage = String(payload.message || '');
      } catch {
        // Non-JSON upstream failures use the generic safe mapping below.
      }
      if (
        sourceCode === '55000'
        && sourceMessage.includes('HUB_SCHEDULE_SOURCE_WRITES_DISABLED')
      ) {
        throw new UserScheduleError(
          503,
          'Tính năng lưu lịch cá nhân tạm thời chưa khả dụng.'
        );
      }
      throw new UserScheduleError(
        response.status === 404 ? 404 : response.status === 409 ? 409 : 502,
        response.status === 404
          ? 'Không tìm thấy lịch cá nhân.'
          : 'Không thể lưu lịch cá nhân.'
      );
    }
    if (response.status === 204) return [];
    const responseText = await response.text();
    if (!responseText.trim()) return [];
    try {
      return parseSourceRows(JSON.parse(responseText));
    } catch (error) {
      if (error instanceof UserScheduleError) throw error;
      throw new UserScheduleError(
        502,
        'Nguồn tạm thời trả về lịch cá nhân không hợp lệ.'
      );
    }
  } catch (error) {
    if (error instanceof UserScheduleError) throw error;
    throw new UserScheduleError(
      503,
      'Dịch vụ lưu lịch cá nhân tạm thời không khả dụng.'
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

export const parseStoredUserScheduleCourseSnapshot = (
  value: unknown
): Record<string, unknown> | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const readServerWriteToken = (env: UserSchedulesEnv) =>
  readSyncConfig(env).serviceRoleKey;

export const addUserScheduleForBetterAuth = async (
  env: UserSchedulesEnv,
  userId: unknown,
  courseId: unknown,
  semester: unknown,
  fetcher: typeof fetch = fetch
) => addUserSchedule(
  env,
  readServerWriteToken(env),
  userId,
  courseId,
  semester,
  fetcher
);

export const deleteUserScheduleForBetterAuth = async (
  env: UserSchedulesEnv,
  userId: unknown,
  courseId: unknown,
  fetcher: typeof fetch = fetch
) => deleteUserSchedule(
  env,
  readServerWriteToken(env),
  userId,
  courseId,
  fetcher
);

export const updateUserScheduleForBetterAuth = async (
  env: UserSchedulesEnv,
  userId: unknown,
  scheduleId: unknown,
  customData: unknown,
  fetcher: typeof fetch = fetch
) => updateUserScheduleCustomData(
  env,
  readServerWriteToken(env),
  userId,
  scheduleId,
  customData,
  fetcher
);

export const replaceUserScheduleSemesterForBetterAuth = async (
  env: UserSchedulesEnv,
  userId: unknown,
  semester: unknown,
  courseIds: unknown,
  fetcher: typeof fetch = fetch
) => replaceUserScheduleSemester(
  env,
  readServerWriteToken(env),
  userId,
  semester,
  courseIds,
  fetcher
);

const parseScheduleImportResult = (value: unknown): ScheduleImportResult => {
  if (!isRecord(value) || !Array.isArray(value.courseIds)) {
    throw new UserScheduleError(502, 'Nguồn tạm thời trả về kết quả nhập lịch không hợp lệ.');
  }
  const courseIds = parseUserScheduleCourseIds(value.courseIds);
  const count = Number(value.count);
  if (!Number.isSafeInteger(count) || count !== courseIds.length) {
    throw new UserScheduleError(502, 'Nguồn tạm thời trả về kết quả nhập lịch không hợp lệ.');
  }
  return { count, courseIds };
};

export const replaceUserScheduleImportForBetterAuth = async (
  env: UserSchedulesEnv,
  userIdValue: unknown,
  semesterValue: unknown,
  rowsValue: unknown,
  fetcher: typeof fetch = fetch
): Promise<UserScheduleMutationResult & { count: number }> => {
  const { supabaseUrl, serviceRoleKey } = readSyncConfig(env);
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  const semester = parseUserScheduleSemester(semesterValue);
  if (!Array.isArray(rowsValue) || rowsValue.length > 100) {
    throw new UserScheduleError(400, 'Danh sách nhập lịch không hợp lệ.');
  }
  const rpcUrl = new URL(
    '/rest/v1/rpc/replace_user_schedule_import_source_server',
    supabaseUrl.replace(/\/$/, '')
  );
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('user-schedule-import-timeout'),
    WRITE_TIMEOUT_MS
  );
  let rpcValue: unknown;
  try {
    const response = await fetcher(rpcUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_semester: semester,
        p_rows: rowsValue,
      }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      let code = '';
      let message = '';
      try {
        const payload = JSON.parse(responseText) as Record<string, unknown>;
        code = String(payload.code || '');
        message = String(payload.message || '');
      } catch {
        // Use the fixed generic upstream error below.
      }
      if (code === '55000' && message.includes('HUB_SCHEDULE_SOURCE_WRITES_DISABLED')) {
        throw new UserScheduleError(503, 'Tính năng lưu lịch cá nhân tạm thời chưa khả dụng.');
      }
      throw new UserScheduleError(
        code === '22023' ? 400 : code === '42501' ? 403 : 502,
        code === '22023'
          ? 'Dữ liệu nhập lịch không hợp lệ.'
          : 'Không thể lưu lịch cá nhân.'
      );
    }
    rpcValue = JSON.parse(responseText) as unknown;
  } catch (error) {
    if (error instanceof UserScheduleError) throw error;
    throw new UserScheduleError(503, 'Dịch vụ lưu lịch cá nhân tạm thời không khả dụng.');
  } finally {
    globalThis.clearTimeout(timeout);
  }

  const result = parseScheduleImportResult(rpcValue);
  const finalRows = await fetchSourceRows(
    env,
    serviceRoleKey,
    buildSupabaseUserSchedulesUrl(supabaseUrl, { userId, semester }),
    { method: 'GET' },
    fetcher
  );
  let mirrorSynced = true;
  try {
    await env.DB.prepare(
      'DELETE FROM user_schedules WHERE user_id = ? AND semester = ?'
    ).bind(userId, semester).run();
    await writeRowsToD1(env, finalRows);
  } catch (error) {
    mirrorSynced = false;
    console.error(JSON.stringify({
      event: 'user_schedule_targeted_mirror_failed',
      operation: 'atomic-import',
      semester,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  return { success: true, count: result.count, mirrorSynced };
};

const writeRowsToD1 = async (
  env: UserSchedulesEnv,
  rows: SupabaseUserScheduleRow[]
) => {
  if (rows.length === 0) return;
  const sql = `
    INSERT INTO user_schedules
      (id, user_id, course_id, semester, custom_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      course_id = excluded.course_id,
      semester = excluded.semester,
      custom_data = excluded.custom_data,
      created_at = excluded.created_at
    WHERE user_schedules.user_id IS NOT excluded.user_id
       OR user_schedules.course_id IS NOT excluded.course_id
       OR user_schedules.semester IS NOT excluded.semester
       OR user_schedules.custom_data IS NOT excluded.custom_data
       OR user_schedules.created_at IS NOT excluded.created_at
  `;

  for (let index = 0; index < rows.length; index += 100) {
    await env.DB.batch(
      rows.slice(index, index + 100).map((row) =>
        env.DB.prepare(sql).bind(
          row.id,
          row.user_id,
          row.course_id,
          row.semester,
          row.custom_data === null ? null : JSON.stringify(row.custom_data),
          row.created_at
        )
      )
    );
  }
};

const deleteMissingRows = async (
  env: UserSchedulesEnv,
  sourceRows: SupabaseUserScheduleRow[]
) => {
  const sourceIds = new Set(sourceRows.map((row) => row.id));
  const existing = await env.DB.prepare(
    'SELECT id FROM user_schedules'
  ).all<{ id: string }>();
  const stale = (existing.results || []).filter(
    (row) => !sourceIds.has(String(row.id))
  );
  for (let index = 0; index < stale.length; index += 100) {
    await env.DB.batch(
      stale.slice(index, index + 100).map((row) =>
        env.DB.prepare('DELETE FROM user_schedules WHERE id = ?').bind(row.id)
      )
    );
  }
  return stale.length;
};

export const syncUserSchedules = async (
  env: UserSchedulesEnv,
  fetcher: typeof fetch = fetch
) => {
  const { supabaseUrl, serviceRoleKey } = readSyncConfig(env);
  const rows: SupabaseUserScheduleRow[] = [];

  for (let offset = 0; ; offset += SYNC_PAGE_SIZE) {
    const response = await fetcher(
      buildSupabaseUserSchedulesUrl(supabaseUrl, { offset }),
      {
        headers: {
          Accept: 'application/json',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    if (!response.ok) {
      throw new UserScheduleError(
        502,
        'Không thể đồng bộ lịch cá nhân từ nguồn tạm thời.'
      );
    }
    const page = parseSourceRows(await response.json());
    rows.push(...page);
    if (page.length < SYNC_PAGE_SIZE) break;
  }

  await writeRowsToD1(env, rows);
  const deleted = await deleteMissingRows(env, rows);
  const syncedAt = new Date().toISOString();
  const sourceMaxCreatedAt = rows.reduce<string | null>(
    (current, row) =>
      !current || row.created_at > current ? row.created_at : current,
    null
  );
  await env.DB.prepare(
    `INSERT INTO sync_metadata (
       resource, source_row_count, source_max_created_at, synced_at,
       visible_row_count
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET
       source_row_count = excluded.source_row_count,
       source_max_created_at = excluded.source_max_created_at,
       synced_at = excluded.synced_at,
       visible_row_count = excluded.visible_row_count`
  )
    .bind(
      RESOURCE_NAME,
      rows.length,
      sourceMaxCreatedAt,
      syncedAt,
      rows.length
    )
    .run();

  return { sourceRowCount: rows.length, deleted, syncedAt };
};

export const listUserSchedules = async (
  env: UserSchedulesEnv,
  userIdValue: unknown
) => {
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  const metadata = await env.DB.prepare(
    'SELECT synced_at FROM sync_metadata WHERE resource = ?'
  )
    .bind(RESOURCE_NAME)
    .first<{ synced_at: string }>();
  if (!metadata?.synced_at) {
    throw new UserScheduleError(
      503,
      'Lịch cá nhân trên Cloudflare chưa được khởi tạo.'
    );
  }

  const courseSelect = COURSE_COLUMNS.map(
    (column) => `cs.${column} AS ${column}`
  ).join(', ');
  const result = await env.DB.prepare(
    `SELECT
       us.id AS user_schedule_id,
       us.course_id AS schedule_course_id,
       us.semester AS schedule_semester,
       us.custom_data AS schedule_custom_data,
       cs.id AS base_course_id,
       snapshots.course_json AS snapshot_course_json,
       ${courseSelect}
     FROM user_schedules us
     LEFT JOIN course_schedules cs ON cs.id = us.course_id
     LEFT JOIN user_schedule_course_snapshots snapshots
       ON snapshots.schedule_id = us.id
      AND snapshots.user_id = us.user_id
      AND snapshots.course_id = us.course_id
     WHERE us.user_id = ?
     ORDER BY us.created_at ASC, us.id ASC`
  )
    .bind(userId)
    .all<D1UserScheduleCourseRow>();

  const rows = result.results || [];
  if (rows.some((row) => !row.base_course_id && !row.snapshot_course_json)) {
    throw new UserScheduleError(
      503,
      'Lịch cá nhân đang chờ đồng bộ đủ thông tin môn học.'
    );
  }

  // `user_schedule_revisions` is the sole CAS token source. A revision is
  // scoped to one owner and semester, rather than to the entire schedule
  // collection, so an aggregate schedule response deliberately exposes a
  // semester -> revision map instead of a misleading collection ETag.
  const revisionResult = await env.DB.prepare(
    'SELECT semester, revision FROM user_schedule_revisions WHERE user_id = ?'
  )
    .bind(userId)
    .all<{ semester: string; revision: number }>();
  const revisionsBySemester = new Map<string, number>();
  for (const revisionRow of revisionResult.results || []) {
    const semester = typeof revisionRow.semester === 'string'
      ? revisionRow.semester.trim()
      : '';
    const revision = Number(revisionRow.revision);
    if (
      SEMESTER_PATTERN.test(semester) &&
      Number.isSafeInteger(revision) &&
      revision >= 0 &&
      revision <= Number.MAX_SAFE_INTEGER - 1
    ) {
      revisionsBySemester.set(semester, revision);
    }
  }
  for (const row of rows) {
    if (!revisionsBySemester.has(row.schedule_semester)) {
      revisionsBySemester.set(row.schedule_semester, 0);
    }
  }

  const data = rows.map((row) => {
    const publicCourse = Object.fromEntries(
      COURSE_COLUMNS.map((column) => [column, row[column]])
    ) as Record<string, unknown>;
    publicCourse.id = row.base_course_id;
    const snapshotCourse = parseStoredUserScheduleCourseSnapshot(row.snapshot_course_json);
    const baseCourse = snapshotCourse || publicCourse;
    if (!baseCourse.id) baseCourse.id = row.schedule_course_id;
    if ('is_user_added' in baseCourse) {
      baseCourse.is_user_added =
        baseCourse.is_user_added === null ||
        baseCourse.is_user_added === undefined
          ? null
          : Boolean(baseCourse.is_user_added);
    }
    const customData = parseStoredCustomData(row.schedule_custom_data) || {};
    return {
      ...baseCourse,
      ...customData,
      id: row.base_course_id || row.schedule_course_id,
      user_schedule_id: row.user_schedule_id,
      semester: row.schedule_semester,
      original_course: baseCourse,
      custom_data: customData,
    };
  });

  return {
    success: true,
    data,
    revisions: Object.fromEntries(
      [...revisionsBySemester.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
  };
};

const readOneSourceRow = async (
  env: UserSchedulesEnv,
  accessToken: string,
  userId: string,
  courseId: string,
  fetcher: typeof fetch
) => {
  const { supabaseUrl } = readWriteConfig(env);
  const rows = await fetchSourceRows(
    env,
    accessToken,
    buildSupabaseUserSchedulesUrl(supabaseUrl, { userId, courseId }),
    { method: 'GET' },
    fetcher
  );
  if (!rows[0]) {
    throw new UserScheduleError(404, 'Không tìm thấy lịch cá nhân.');
  }
  return rows[0];
};

export const addUserSchedule = async (
  env: UserSchedulesEnv,
  accessToken: string,
  userIdValue: unknown,
  courseIdValue: unknown,
  semesterValue: unknown,
  fetcher: typeof fetch = fetch
): Promise<UserScheduleMutationResult> => {
  const { supabaseUrl } = readWriteConfig(env);
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  const courseId = parseUserScheduleId(courseIdValue, 'Mã môn học');
  const semester = parseUserScheduleSemester(semesterValue);

  await fetchSourceRows(
    env,
    accessToken,
    buildSupabaseUserSchedulesUrl(supabaseUrl, {
      upsert: true,
      select: false,
    }),
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: userId, course_id: courseId, semester }),
    },
    fetcher
  );
  const row = await readOneSourceRow(
    env,
    accessToken,
    userId,
    courseId,
    fetcher
  );

  let mirrorSynced = true;
  try {
    await writeRowsToD1(env, [row]);
  } catch (error) {
    mirrorSynced = false;
    console.error(JSON.stringify({
      event: 'user_schedule_targeted_mirror_failed',
      operation: 'add',
      courseId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  return { success: true, mirrorSynced };
};

export const deleteUserSchedule = async (
  env: UserSchedulesEnv,
  accessToken: string,
  userIdValue: unknown,
  courseIdValue: unknown,
  fetcher: typeof fetch = fetch
): Promise<UserScheduleMutationResult> => {
  const { supabaseUrl } = readWriteConfig(env);
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  const courseId = parseUserScheduleId(courseIdValue, 'Mã môn học');

  await fetchSourceRows(
    env,
    accessToken,
    buildSupabaseUserSchedulesUrl(supabaseUrl, {
      userId,
      courseId,
      select: false,
    }),
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    },
    fetcher
  );

  let mirrorSynced = true;
  try {
    await env.DB.prepare(
      'DELETE FROM user_schedules WHERE user_id = ? AND course_id = ?'
    )
      .bind(userId, courseId)
      .run();
  } catch (error) {
    mirrorSynced = false;
    console.error(JSON.stringify({
      event: 'user_schedule_targeted_mirror_failed',
      operation: 'delete',
      courseId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  return { success: true, mirrorSynced };
};

export const updateUserScheduleCustomData = async (
  env: UserSchedulesEnv,
  accessToken: string,
  userIdValue: unknown,
  scheduleIdValue: unknown,
  customDataValue: unknown,
  fetcher: typeof fetch = fetch
): Promise<UserScheduleMutationResult> => {
  const { supabaseUrl } = readWriteConfig(env);
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  const scheduleId = parseUserScheduleId(
    scheduleIdValue,
    'Mã lịch cá nhân'
  );
  const customData = parseUserScheduleCustomData(customDataValue);
  const rows = await fetchSourceRows(
    env,
    accessToken,
    buildSupabaseUserSchedulesUrl(supabaseUrl, {
      userId,
      scheduleId,
    }),
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ custom_data: customData }),
    },
    fetcher
  );
  if (!rows[0]) {
    throw new UserScheduleError(404, 'Không tìm thấy lịch cá nhân.');
  }

  let mirrorSynced = true;
  try {
    await writeRowsToD1(env, [rows[0]]);
  } catch (error) {
    mirrorSynced = false;
    console.error(JSON.stringify({
      event: 'user_schedule_targeted_mirror_failed',
      operation: 'update',
      scheduleId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  return { success: true, mirrorSynced };
};

export const replaceUserScheduleSemester = async (
  env: UserSchedulesEnv,
  accessToken: string,
  userIdValue: unknown,
  semesterValue: unknown,
  courseIdsValue: unknown,
  fetcher: typeof fetch = fetch
): Promise<UserScheduleMutationResult & { count: number }> => {
  const { supabaseUrl } = readWriteConfig(env);
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  const semester = parseUserScheduleSemester(semesterValue);
  const courseIds = parseUserScheduleCourseIds(courseIdsValue);

  if (courseIds.length > 0) {
    await fetchSourceRows(
      env,
      accessToken,
      buildSupabaseUserSchedulesUrl(supabaseUrl, {
        upsert: true,
        select: false,
      }),
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(
          courseIds.map((courseId) => ({
            user_id: userId,
            course_id: courseId,
            semester,
          }))
        ),
      },
      fetcher
    );
  }

  const currentRows = await fetchSourceRows(
    env,
    accessToken,
    buildSupabaseUserSchedulesUrl(supabaseUrl, { userId, semester }),
    { method: 'GET' },
    fetcher
  );
  const desiredIds = new Set(courseIds);
  const obsoleteScheduleIds = currentRows
    .filter((row) => !desiredIds.has(row.course_id))
    .map((row) => row.id);

  if (obsoleteScheduleIds.length > 0) {
    await fetchSourceRows(
      env,
      accessToken,
      buildSupabaseUserSchedulesUrl(supabaseUrl, {
        scheduleIds: obsoleteScheduleIds,
        select: false,
      }),
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
      fetcher
    );
  }

  const finalRows = currentRows.filter((row) =>
    desiredIds.has(row.course_id)
  );
  let mirrorSynced = true;
  try {
    await env.DB.prepare(
      'DELETE FROM user_schedules WHERE user_id = ? AND semester = ?'
    )
      .bind(userId, semester)
      .run();
    await writeRowsToD1(env, finalRows);
  } catch (error) {
    mirrorSynced = false;
    console.error(JSON.stringify({
      event: 'user_schedule_targeted_mirror_failed',
      operation: 'replace',
      semester,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return {
    success: true,
    count: courseIds.length,
    mirrorSynced,
  };
};
