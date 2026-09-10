import {
  parseUserScheduleCustomData,
  parseUserScheduleId,
  parseUserScheduleSemester,
  readUserScheduleBody,
  serializeCanonicalUserScheduleJson,
  UserScheduleError,
} from './user-schedules.ts';

interface D1UserScheduleMutationEnv { DB: D1Database; }
type D1ScheduleAction = 'add' | 'delete' | 'update_custom_data' | 'replace_all' | 'pdf_import';
type SnapshotKind = 'PRIVATE_IMPORTED' | 'HISTORICAL_PUBLIC';

export interface D1ScheduleMutationResponse {
  success: true;
  changed: boolean;
  revision: number;
  count?: number;
}

interface ReplacementItem {
  courseId: string;
  snapshotKind?: SnapshotKind;
  snapshotCourse?: Record<string, unknown>;
}

interface ParsedMutationRequest {
  action: D1ScheduleAction;
  semester: string;
  expectedRevision: number;
  idempotencyKey: string;
  requestHash: string;
  courseId?: string;
  scheduleId?: string;
  customData?: Record<string, unknown>;
  replacementItems?: ReplacementItem[];
}

interface ReceiptRow { request_hash: string; response_json: string; }
interface ScheduleRow { id: string; semester: string; custom_data: string | null; }

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const IF_MATCH_PATTERN = /^"(0|[1-9][0-9]{0,15})"$/;
const MAX_REVISION = Number.MAX_SAFE_INTEGER - 1;
const MAX_RECEIPT_RESPONSE_BYTES = 768;
const MAX_COURSES_PER_REPLACE = 100;
const RESPONSE_KEYS = new Set(['success', 'changed', 'revision', 'count']);
const IMPORT_COURSE_KEYS = new Set([
  'course_code', 'subject_name', 'credits', 'instructor', 'day_of_week',
  'shift', 'room', 'campus', 'weeks', 'phase',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertOnlyKeys = (value: Record<string, unknown>, accepted: ReadonlySet<string>) => {
  if (Object.keys(value).some((key) => !accepted.has(key))) {
    throw new UserScheduleError(400, 'Dữ liệu yêu cầu chứa trường không được hỗ trợ.');
  }
};

const parseIdempotencyKey = (request: Request) => {
  const value = request.headers.get('Idempotency-Key') || '';
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new UserScheduleError(400, 'Khóa chống lặp không hợp lệ.');
  }
  return value;
};

const parseExpectedRevision = (request: Request) => {
  const match = (request.headers.get('If-Match') || '').match(IF_MATCH_PATTERN);
  const revision = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > MAX_REVISION) {
    throw new UserScheduleError(400, 'Phiên bản lịch không hợp lệ.');
  }
  return revision;
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const buildRequestHash = (
  action: D1ScheduleAction,
  semester: string,
  expectedRevision: number,
  payload: unknown,
) => sha256Hex(serializeCanonicalUserScheduleJson([
  'hub-planner-d1-schedule-mutation-v2', action, semester, expectedRevision, payload,
]));

const parseImportedCourse = (value: unknown) => {
  if (!isRecord(value)) throw new UserScheduleError(400, 'Dữ liệu nhập lịch không hợp lệ.');
  assertOnlyKeys(value, IMPORT_COURSE_KEYS);
  const required = (key: 'course_code' | 'subject_name', maximum: number) => {
    const text = typeof value[key] === 'string' ? value[key].trim() : '';
    if (!text || text.length > maximum) throw new UserScheduleError(400, 'Dữ liệu nhập lịch không hợp lệ.');
    return text;
  };
  const optional = (key: string, maximum: number, fallback = '') => {
    const text = typeof value[key] === 'string' ? value[key].trim() : fallback;
    if (text.length > maximum) throw new UserScheduleError(400, 'Dữ liệu nhập lịch không hợp lệ.');
    return text;
  };
  const credits = Number(value.credits ?? 0);
  if (!Number.isInteger(credits) || credits < 0 || credits > 30) throw new UserScheduleError(400, 'Dữ liệu nhập lịch không hợp lệ.');
  return {
    course_code: required('course_code', 120),
    subject_name: required('subject_name', 200),
    credits,
    instructor: optional('instructor', 160),
    day_of_week: optional('day_of_week', 30),
    shift: optional('shift', 60),
    room: optional('room', 120),
    campus: optional('campus', 60, 'TD'),
    weeks: optional('weeks', 500),
    phase: optional('phase', 20, '1'),
  };
};

const deterministicImportCourseId = async (
  semester: string,
  index: number,
  course: Record<string, unknown>,
) => {
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serializeCanonicalUserScheduleJson([semester, index, course])),
  ));
  digest[6] = (digest[6] & 0x0f) | 0x40;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const parseReplacementItems = async (value: Record<string, unknown>, semester: string) => {
  const hasCourseIds = Array.isArray(value.courseIds);
  const hasRows = Array.isArray(value.rows);
  if (hasCourseIds === hasRows) throw new UserScheduleError(400, 'Dữ liệu thay lịch không hợp lệ.');
  assertOnlyKeys(value, new Set(hasCourseIds ? ['semester', 'courseIds'] : ['semester', 'rows']));
  const rawItems = hasCourseIds ? value.courseIds : value.rows;
  if (!Array.isArray(rawItems) || rawItems.length > MAX_COURSES_PER_REPLACE) throw new UserScheduleError(400, 'Danh sách môn học không hợp lệ.');
  if (hasCourseIds) {
    const ids = [...new Set(rawItems.map((item) => parseUserScheduleId(item, 'Mã môn học')))];
    return { action: 'replace_all' as const, items: ids.map((courseId) => ({ courseId })) };
  }
  const items: ReplacementItem[] = [];
  const knownSystemIds = new Set<string>();
  for (const [index, row] of rawItems.entries()) {
    if (!isRecord(row)) throw new UserScheduleError(400, 'Dữ liệu nhập lịch không hợp lệ.');
    assertOnlyKeys(row, new Set(['systemCourseId', 'course']));
    if (typeof row.systemCourseId === 'string' && !Object.hasOwn(row, 'course')) {
      const courseId = parseUserScheduleId(row.systemCourseId, 'Mã môn học');
      if (!knownSystemIds.has(courseId)) { knownSystemIds.add(courseId); items.push({ courseId }); }
      continue;
    }
    if (!Object.hasOwn(row, 'course') || Object.hasOwn(row, 'systemCourseId')) throw new UserScheduleError(400, 'Dữ liệu nhập lịch không hợp lệ.');
    const course = parseImportedCourse(row.course);
    const courseId = await deterministicImportCourseId(semester, index, course);
    items.push({ courseId, snapshotKind: 'PRIVATE_IMPORTED', snapshotCourse: { id: courseId, semester, is_user_added: true, ...course } });
  }
  return { action: 'pdf_import' as const, items };
};

const parseHeaders = (request: Request) => ({ expectedRevision: parseExpectedRevision(request), idempotencyKey: parseIdempotencyKey(request) });

export const parseD1ScheduleMutationRequest = async (request: Request, action: 'add' | 'delete', courseIdValue: unknown): Promise<ParsedMutationRequest> => {
  const courseId = parseUserScheduleId(courseIdValue, 'Mã môn học');
  const url = new URL(request.url);
  let semester: string;
  if (action === 'add') {
    if ([...url.searchParams.keys()].length > 0) throw new UserScheduleError(400, 'Tham số yêu cầu không được hỗ trợ.');
    const body = await readUserScheduleBody(request);
    assertOnlyKeys(body, new Set(['semester']));
    semester = parseUserScheduleSemester(body.semester);
  } else {
    if ([...url.searchParams.keys()].some((key) => key !== 'semester') || request.body !== null) throw new UserScheduleError(400, 'Yêu cầu xóa không hợp lệ.');
    semester = parseUserScheduleSemester(url.searchParams.get('semester'));
  }
  const { expectedRevision, idempotencyKey } = parseHeaders(request);
  return { action, courseId, semester, expectedRevision, idempotencyKey, requestHash: await buildRequestHash(action, semester, expectedRevision, { courseId }) };
};

export const parseD1ScheduleUpdateRequest = async (request: Request, scheduleIdValue: unknown): Promise<ParsedMutationRequest> => {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length > 0) throw new UserScheduleError(400, 'Tham số yêu cầu không được hỗ trợ.');
  const body = await readUserScheduleBody(request);
  assertOnlyKeys(body, new Set(['customData']));
  const customData = parseUserScheduleCustomData(body.customData);
  const scheduleId = parseUserScheduleId(scheduleIdValue, 'Mã lịch cá nhân');
  const { expectedRevision, idempotencyKey } = parseHeaders(request);
  return { action: 'update_custom_data', scheduleId, semester: '', expectedRevision, idempotencyKey, customData, requestHash: await buildRequestHash('update_custom_data', '', expectedRevision, { scheduleId, customData }) };
};

export const parseD1ScheduleReplaceRequest = async (request: Request): Promise<ParsedMutationRequest> => {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length > 0) throw new UserScheduleError(400, 'Tham số yêu cầu không được hỗ trợ.');
  const body = await readUserScheduleBody(request);
  const semester = parseUserScheduleSemester(body.semester);
  const replacement = await parseReplacementItems(body, semester);
  const { expectedRevision, idempotencyKey } = parseHeaders(request);
  return { action: replacement.action, semester, expectedRevision, idempotencyKey, replacementItems: replacement.items, requestHash: await buildRequestHash(replacement.action, semester, expectedRevision, replacement.items) };
};

const readReceipt = (env: D1UserScheduleMutationEnv, userId: string, key: string) => env.DB.prepare(
  'SELECT request_hash, response_json FROM user_schedule_mutation_receipts WHERE user_id = ? AND idempotency_key = ?',
).bind(userId, key).first<ReceiptRow>();

const parseStoredResponse = (value: string): D1ScheduleMutationResponse => {
  if (new TextEncoder().encode(value).byteLength > MAX_RECEIPT_RESPONSE_BYTES) throw new UserScheduleError(503, 'Trạng thái chống lặp không hợp lệ.');
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || Object.keys(parsed).some((key) => !RESPONSE_KEYS.has(key)) || parsed.success !== true || typeof parsed.changed !== 'boolean' || !Number.isSafeInteger(parsed.revision) || (parsed.count !== undefined && (!Number.isSafeInteger(parsed.count) || Number(parsed.count) < 0))) throw new Error('invalid');
    return { success: true, changed: parsed.changed, revision: Number(parsed.revision), ...(parsed.count === undefined ? {} : { count: Number(parsed.count) }) };
  } catch { throw new UserScheduleError(503, 'Trạng thái chống lặp không hợp lệ.'); }
};

const resolveReceipt = (receipt: ReceiptRow, requestHash: string) => {
  if (receipt.request_hash !== requestHash) throw new UserScheduleError(409, 'Khóa chống lặp đã được dùng cho yêu cầu khác.');
  return parseStoredResponse(receipt.response_json);
};

const readRevision = async (env: D1UserScheduleMutationEnv, userId: string, semester: string) => {
  const row = await env.DB.prepare('SELECT revision FROM user_schedule_revisions WHERE user_id = ? AND semester = ?').bind(userId, semester).first<{ revision: number }>();
  return row ? Number(row.revision) : 0;
};
const readScheduleByCourse = (env: D1UserScheduleMutationEnv, userId: string, courseId: string) => env.DB.prepare('SELECT id, semester, custom_data FROM user_schedules WHERE user_id = ? AND course_id = ?').bind(userId, courseId).first<ScheduleRow>();
const readScheduleById = (env: D1UserScheduleMutationEnv, userId: string, scheduleId: string) => env.DB.prepare('SELECT id, semester, custom_data FROM user_schedules WHERE user_id = ? AND id = ?').bind(userId, scheduleId).first<ScheduleRow>();

const assertSchedulableCourse = async (env: D1UserScheduleMutationEnv, courseId: string, semester: string) => {
  // `is_user_added` records provenance, not catalogue visibility. Approved
  // community contributions are published courses and must remain addable from
  // the same public catalogue as administrator-imported courses.
  const row = await env.DB.prepare(
    "SELECT id FROM course_schedules WHERE id = ? AND semester = ? AND catalogue_visibility = 'published'",
  ).bind(courseId, semester).first<{ id: string }>();
  if (!row) throw new UserScheduleError(404, 'Không tìm thấy môn học khả dụng.');
};

const responseJson = (value: D1ScheduleMutationResponse) => {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_RECEIPT_RESPONSE_BYTES) throw new UserScheduleError(503, 'Phản hồi lịch vượt giới hạn an toàn.');
  return json;
};

const assertionStatement = (env: D1UserScheduleMutationEnv, userId: string, semester: string, resultingRevision: number, operationId: string, postcondition: string, bindings: unknown[], now: string) => env.DB.prepare(`
  INSERT INTO user_schedule_transaction_assertions (operation_id, passed, created_at)
  VALUES (?, CASE WHEN EXISTS (SELECT 1 FROM user_schedule_revisions WHERE user_id = ? AND semester = ? AND revision = ? AND last_operation_id = ?) AND (${postcondition}) THEN 1 ELSE 0 END, ?)
`).bind(operationId, userId, semester, resultingRevision, operationId, ...bindings, now);

const revisionStatements = (env: D1UserScheduleMutationEnv, userId: string, semester: string, expectedRevision: number, changed: boolean, operationId: string, now: string) => [
  env.DB.prepare('INSERT OR IGNORE INTO user_schedule_revisions (user_id, semester, revision, updated_at, last_operation_id) VALUES (?, ?, 0, ?, NULL)').bind(userId, semester, now),
  changed
    ? env.DB.prepare('UPDATE user_schedule_revisions SET revision = revision + 1, updated_at = ?, last_operation_id = ? WHERE user_id = ? AND semester = ? AND revision = ?').bind(now, operationId, userId, semester, expectedRevision)
    : env.DB.prepare('UPDATE user_schedule_revisions SET last_operation_id = ? WHERE user_id = ? AND semester = ? AND revision = ?').bind(operationId, userId, semester, expectedRevision),
];

const outboxStatement = (env: D1UserScheduleMutationEnv, operationId: string, userId: string, input: ParsedMutationRequest, now: string) => env.DB.prepare(
  'INSERT INTO user_schedule_rollback_outbox (operation_id, user_id, semester, operation, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
).bind(operationId, userId, input.semester, input.action, serializeCanonicalUserScheduleJson({ courseId: input.courseId, scheduleId: input.scheduleId, customData: input.customData, replacementItems: input.replacementItems, requestHash: input.requestHash }), now);

const runBatch = async (env: D1UserScheduleMutationEnv, input: ParsedMutationRequest, userId: string, changed: boolean, statements: D1PreparedStatement[], postcondition: string, bindings: unknown[], response: D1ScheduleMutationResponse) => {
  const operationId = crypto.randomUUID();
  const now = new Date().toISOString();
  const resultingRevision = input.expectedRevision + (changed ? 1 : 0);
  await env.DB.batch([
    ...revisionStatements(env, userId, input.semester, input.expectedRevision, changed, operationId, now),
    ...statements,
    assertionStatement(env, userId, input.semester, resultingRevision, operationId, postcondition, bindings, now),
    outboxStatement(env, operationId, userId, input, now),
    env.DB.prepare('INSERT INTO user_schedule_mutation_receipts (user_id, idempotency_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?)').bind(userId, input.idempotencyKey, input.requestHash, responseJson(response), now),
    env.DB.prepare('DELETE FROM user_schedule_transaction_assertions WHERE operation_id = ?').bind(operationId),
  ]);
};

const classifyFailedMutation = async (env: D1UserScheduleMutationEnv, input: ParsedMutationRequest, userId: string) => {
  const receipt = await readReceipt(env, userId, input.idempotencyKey);
  if (receipt) return resolveReceipt(receipt, input.requestHash);
  const revision = await readRevision(env, userId, input.semester);
  if (revision !== input.expectedRevision) throw new UserScheduleError(409, 'Lịch đã thay đổi. Vui lòng tải lại.');
  throw new UserScheduleError(503, 'Không thể cập nhật lịch cá nhân lúc này.');
};

export const mutateD1UserScheduleCourse = async (env: D1UserScheduleMutationEnv, userIdValue: unknown, input: ParsedMutationRequest): Promise<D1ScheduleMutationResponse> => {
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  if ((input.action !== 'add' && input.action !== 'delete') || !input.courseId) throw new UserScheduleError(400, 'Thao tác lịch không hợp lệ.');
  const receipt = await readReceipt(env, userId, input.idempotencyKey);
  if (receipt) return resolveReceipt(receipt, input.requestHash);
  if (input.action === 'add') await assertSchedulableCourse(env, input.courseId, input.semester);
  const existing = await readScheduleByCourse(env, userId, input.courseId);
  if (existing && existing.semester !== input.semester) throw new UserScheduleError(409, 'Môn học thuộc phạm vi học kỳ khác.');
  const changed = input.action === 'add' ? !existing : Boolean(existing);
  const response = { success: true as const, changed, revision: input.expectedRevision + (changed ? 1 : 0) };
  const scheduleId = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = changed ? input.action === 'add'
    ? [env.DB.prepare('INSERT INTO user_schedules (id, user_id, course_id, semester, custom_data, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)').bind(scheduleId, userId, input.courseId, input.semester, now, now)]
    : [env.DB.prepare('DELETE FROM user_schedule_course_snapshots WHERE schedule_id = ? AND user_id = ?').bind(scheduleId, userId), env.DB.prepare('DELETE FROM user_schedules WHERE id = ? AND user_id = ? AND semester = ?').bind(scheduleId, userId, input.semester)] : [];
  const postcondition = input.action === 'add'
    ? 'EXISTS (SELECT 1 FROM user_schedules WHERE id = ? AND user_id = ? AND course_id = ? AND semester = ?)'
    : 'NOT EXISTS (SELECT 1 FROM user_schedules WHERE user_id = ? AND course_id = ? AND semester = ?)';
  const bindings = input.action === 'add' ? [scheduleId, userId, input.courseId, input.semester] : [userId, input.courseId, input.semester];
  try { await runBatch(env, input, userId, changed, statements, postcondition, bindings, response); return response; }
  catch { return classifyFailedMutation(env, input, userId); }
};

export const updateD1UserScheduleCustomData = async (env: D1UserScheduleMutationEnv, userIdValue: unknown, input: ParsedMutationRequest): Promise<D1ScheduleMutationResponse> => {
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  if (input.action !== 'update_custom_data' || !input.scheduleId || !input.customData) throw new UserScheduleError(400, 'Dữ liệu lịch cá nhân không hợp lệ.');
  const existing = await readScheduleById(env, userId, input.scheduleId);
  if (!existing) throw new UserScheduleError(404, 'Không tìm thấy lịch cá nhân.');
  input.semester = existing.semester;
  input.requestHash = await buildRequestHash(input.action, input.semester, input.expectedRevision, { scheduleId: input.scheduleId, customData: input.customData });
  const receipt = await readReceipt(env, userId, input.idempotencyKey);
  if (receipt) return resolveReceipt(receipt, input.requestHash);
  const customJson = serializeCanonicalUserScheduleJson(input.customData);
  const changed = existing.custom_data !== customJson;
  const response = { success: true as const, changed, revision: input.expectedRevision + (changed ? 1 : 0) };
  const now = new Date().toISOString();
  const statements = changed ? [env.DB.prepare('UPDATE user_schedules SET custom_data = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(customJson, now, input.scheduleId, userId)] : [];
  try { await runBatch(env, input, userId, changed, statements, 'EXISTS (SELECT 1 FROM user_schedules WHERE id = ? AND user_id = ? AND custom_data = ?)', [input.scheduleId, userId, customJson], response); return response; }
  catch { return classifyFailedMutation(env, input, userId); }
};

// This is deliberately narrower than the ordinary user mutation API. Only a
// signed Courses Edge operation may clear/update a schedule row it has already
// role-checked, and the D1 row still verifies the supplied canonical owner.
export const updateD1UserScheduleCustomDataFromInternal = async (
  env: D1UserScheduleMutationEnv,
  input: { userId: unknown; scheduleId: unknown; customData: unknown; idempotencyKey: unknown },
): Promise<D1ScheduleMutationResponse> => {
  const userId = parseUserScheduleId(input.userId, 'Mã người dùng');
  const scheduleId = parseUserScheduleId(input.scheduleId, 'Mã lịch cá nhân');
  const customData = parseUserScheduleCustomData(input.customData);
  const idempotencyKey = String(input.idempotencyKey || '');
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new UserScheduleError(400, 'Khóa chống lặp không hợp lệ.');
  }
  const canonicalCustomData = serializeCanonicalUserScheduleJson(customData);
  const requestHash = await sha256Hex(serializeCanonicalUserScheduleJson([
    'hub-planner-d1-schedule-internal-v1', 'update_custom_data', userId, scheduleId, canonicalCustomData,
  ]));
  const receipt = await readReceipt(env, userId, idempotencyKey);
  if (receipt) return resolveReceipt(receipt, requestHash);
  const existing = await readScheduleById(env, userId, scheduleId);
  if (!existing) throw new UserScheduleError(404, 'Không tìm thấy lịch cá nhân.');
  const expectedRevision = await readRevision(env, userId, existing.semester);
  const changed = existing.custom_data !== canonicalCustomData;
  const request: ParsedMutationRequest = {
    action: 'update_custom_data',
    semester: existing.semester,
    expectedRevision,
    idempotencyKey,
    requestHash,
    scheduleId,
    customData,
  };
  const response = { success: true as const, changed, revision: expectedRevision + (changed ? 1 : 0) };
  const now = new Date().toISOString();
  const statements = changed
    ? [env.DB.prepare('UPDATE user_schedules SET custom_data = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(canonicalCustomData, now, scheduleId, userId)]
    : [];
  try {
    await runBatch(env, request, userId, changed, statements,
      'EXISTS (SELECT 1 FROM user_schedules WHERE id = ? AND user_id = ? AND custom_data = ?)',
      [scheduleId, userId, canonicalCustomData], response);
    return response;
  } catch {
    return classifyFailedMutation(env, request, userId);
  }
};

export const replaceD1UserScheduleSemester = async (env: D1UserScheduleMutationEnv, userIdValue: unknown, input: ParsedMutationRequest): Promise<D1ScheduleMutationResponse> => {
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  if ((input.action !== 'replace_all' && input.action !== 'pdf_import') || !input.replacementItems) throw new UserScheduleError(400, 'Dữ liệu thay lịch không hợp lệ.');
  const receipt = await readReceipt(env, userId, input.idempotencyKey);
  if (receipt) return resolveReceipt(receipt, input.requestHash);
  for (const item of input.replacementItems) if (!item.snapshotKind) await assertSchedulableCourse(env, item.courseId, input.semester);
  const existing = await env.DB.prepare('SELECT id, course_id, custom_data FROM user_schedules WHERE user_id = ? AND semester = ? ORDER BY id').bind(userId, input.semester).all<{ id: string; course_id: string; custom_data: string | null }>();
  const existingCanonical = serializeCanonicalUserScheduleJson((existing.results || []).map((row) => ({ courseId: row.course_id, customData: row.custom_data })));
  const desiredCanonical = serializeCanonicalUserScheduleJson(input.replacementItems.map((item) => ({ courseId: item.courseId, snapshotKind: item.snapshotKind, snapshotCourse: item.snapshotCourse })));
  const changed = existingCanonical !== desiredCanonical || input.action === 'pdf_import';
  const response = { success: true as const, changed, revision: input.expectedRevision + (changed ? 1 : 0), count: input.replacementItems.length };
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (changed) {
    statements.push(env.DB.prepare('DELETE FROM user_schedule_course_snapshots WHERE user_id = ? AND schedule_id IN (SELECT id FROM user_schedules WHERE user_id = ? AND semester = ?)').bind(userId, userId, input.semester), env.DB.prepare('DELETE FROM user_schedules WHERE user_id = ? AND semester = ?').bind(userId, input.semester));
    for (const item of input.replacementItems) {
      const scheduleId = crypto.randomUUID();
      statements.push(env.DB.prepare('INSERT INTO user_schedules (id, user_id, course_id, semester, custom_data, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)').bind(scheduleId, userId, item.courseId, input.semester, now, now));
      if (item.snapshotKind && item.snapshotCourse) statements.push(env.DB.prepare('INSERT INTO user_schedule_course_snapshots (schedule_id, user_id, course_id, source_kind, course_json, source_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)').bind(scheduleId, userId, item.courseId, item.snapshotKind, serializeCanonicalUserScheduleJson(item.snapshotCourse), now, now));
    }
  }
  const postcondition = '((SELECT COUNT(*) FROM user_schedules WHERE user_id = ? AND semester = ?) = ?) AND NOT EXISTS (SELECT 1 FROM user_schedule_course_snapshots snapshots LEFT JOIN user_schedules schedules ON schedules.id = snapshots.schedule_id WHERE snapshots.user_id = ? AND schedules.id IS NULL)';
  try { await runBatch(env, input, userId, changed, statements, postcondition, [userId, input.semester, input.replacementItems.length, userId], response); return response; }
  catch { return classifyFailedMutation(env, input, userId); }
};

// The controlled final convergence uses this D1-only primitive after the
// private-schedule writer freeze. It validates the existing owner-scoped
// schedule first, so a source snapshot can never be attached to another user.
export const upsertD1UserScheduleCourseSnapshot = async (
  env: D1UserScheduleMutationEnv,
  input: {
    scheduleId: unknown;
    userId: unknown;
    courseId: unknown;
    sourceKind: SnapshotKind;
    course: Record<string, unknown>;
    sourceUpdatedAt?: string | null;
  },
) => {
  const scheduleId = parseUserScheduleId(input.scheduleId, 'Mã lịch cá nhân');
  const userId = parseUserScheduleId(input.userId, 'Mã người dùng');
  const courseId = parseUserScheduleId(input.courseId, 'Mã môn học');
  if (input.sourceKind !== 'HISTORICAL_PUBLIC' && input.sourceKind !== 'PRIVATE_IMPORTED') {
    throw new UserScheduleError(400, 'Nguồn môn học không hợp lệ.');
  }
  if (!isRecord(input.course) || parseUserScheduleId(input.course.id, 'Mã môn học') !== courseId) {
    throw new UserScheduleError(400, 'Ảnh chụp môn học không hợp lệ.');
  }
  const schedule = await env.DB.prepare(
    'SELECT id FROM user_schedules WHERE id = ? AND user_id = ? AND course_id = ?',
  ).bind(scheduleId, userId, courseId).first<{ id: string }>();
  if (!schedule) throw new UserScheduleError(404, 'Không tìm thấy lịch cá nhân.');
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO user_schedule_course_snapshots
      (schedule_id, user_id, course_id, source_kind, course_json, source_updated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(schedule_id) DO UPDATE SET
      user_id = excluded.user_id,
      course_id = excluded.course_id,
      source_kind = excluded.source_kind,
      course_json = excluded.course_json,
      source_updated_at = excluded.source_updated_at,
      updated_at = excluded.updated_at
  `).bind(
    scheduleId,
    userId,
    courseId,
    input.sourceKind,
    serializeCanonicalUserScheduleJson(input.course),
    input.sourceUpdatedAt || null,
    now,
    now,
  ).run();
  return { success: true as const };
};

// This internal lifecycle primitive is owner-scoped and never touches shared public courses.
export const cleanupD1UserSchedulesForAccount = async (env: D1UserScheduleMutationEnv, userIdValue: unknown) => {
  const userId = parseUserScheduleId(userIdValue, 'Mã người dùng');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_schedule_course_snapshots WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_schedules WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_schedule_revisions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_schedule_mutation_receipts WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_schedule_rollback_outbox WHERE user_id = ?').bind(userId),
  ]);
  return { success: true as const };
};
