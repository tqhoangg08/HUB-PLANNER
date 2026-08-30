import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  requireBetterAuthStaff,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface CourseAuthorityEnv extends BetterAuthIdentityEnv {
  DB: D1Database;
  COURSE_WRITE_AUTHORITY?: string;
}

export type CourseWriteAuthority = 'supabase' | 'd1';
type CourseOperation = 'course_create' | 'course_update' | 'course_retire' | 'request_create' | 'request_approve' | 'request_reject' | 'facet_rebuild';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY = /^[A-Za-z0-9._:-]{8,128}$/;
const IF_MATCH = /^"(0|[1-9][0-9]{0,15})"$/;
const MAX_BODY_BYTES = 32 * 1024;
const COURSE_FIELDS = new Set([
  'course_code', 'subject_name', 'prerequisite', 'credits', 'knowledge_block', 'shift', 'day_of_week',
  'weeks', 'room', 'campus', 'managing_faculty', 'exam_date', 'exam_shift', 'exam_campus', 'exam_room',
  'cohort', 'major', 'group_name', 'orientation', 'orientation_note_3', 'registration_type', 'general_note',
  'academic_program', 'student_count', 'phase', 'semester', 'instructor', 'is_user_added',
]);
const REQUEST_FIELDS = new Set(['courseCode', 'subjectName', 'semester', 'instructor', 'note']);

export class CourseAuthorityError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 503;
  constructor(status: 400 | 401 | 403 | 404 | 409 | 413 | 503, message: string) {
    super(message);
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number, required = false) => {
  if (value === undefined || value === null) return required ? '' : null;
  if (typeof value !== 'string') throw new CourseAuthorityError(400, 'Dữ liệu môn học không hợp lệ.');
  const result = value.trim();
  if ((required && !result) || result.length > max) throw new CourseAuthorityError(400, 'Dữ liệu môn học không hợp lệ.');
  return result || null;
};
const json = (value: unknown) => JSON.stringify(value);
const sha256 = async (value: unknown) => {
  const encoded = new TextEncoder().encode(json(value));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
};
const now = () => new Date().toISOString();

export const readCourseWriteAuthority = (env: Pick<CourseAuthorityEnv, 'COURSE_WRITE_AUTHORITY'>): CourseWriteAuthority =>
  env.COURSE_WRITE_AUTHORITY === 'd1' ? 'd1' : 'supabase';

const requireD1Authority = (env: CourseAuthorityEnv) => {
  if (readCourseWriteAuthority(env) !== 'd1') {
    throw new CourseAuthorityError(503, 'Course D1 authority is not enabled.');
  }
};
const assertAdmin = (identity: BetterAuthIdentity) => {
  if (identity.role !== 'admin') throw new CourseAuthorityError(403, 'Không có quyền thực hiện thao tác này.');
};
const parseId = (value: string) => {
  if (!UUID.test(value)) throw new CourseAuthorityError(404, 'Không tìm thấy dữ liệu.');
  return value.toLowerCase();
};
const parseHeaders = (request: Request, cas = true) => {
  const key = String(request.headers.get('Idempotency-Key') || '').trim();
  if (!IDEMPOTENCY.test(key)) throw new CourseAuthorityError(400, 'Khóa chống lặp không hợp lệ.');
  if (!cas) return { key, revision: undefined };
  const match = String(request.headers.get('If-Match') || '').match(IF_MATCH);
  if (!match) throw new CourseAuthorityError(400, 'Phiên bản môn học không hợp lệ.');
  return { key, revision: Number(match[1]) };
};
const readBody = async (request: Request) => {
  const size = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(size) && size > MAX_BODY_BYTES) throw new CourseAuthorityError(413, 'Payload too large.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new CourseAuthorityError(413, 'Payload too large.');
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) throw new Error('invalid');
    return parsed;
  } catch { throw new CourseAuthorityError(400, 'Dữ liệu yêu cầu không hợp lệ.'); }
};
const readOptionalBody = async (request: Request) => {
  const size = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(size) && size > MAX_BODY_BYTES) throw new CourseAuthorityError(413, 'Payload too large.');
  const raw = await request.text();
  if (!raw.trim()) return {};
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new CourseAuthorityError(413, 'Payload too large.');
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) throw new Error('invalid');
    return parsed;
  } catch { throw new CourseAuthorityError(400, 'Dữ liệu yêu cầu không hợp lệ.'); }
};
const assertKeys = (payload: Record<string, unknown>, keys: ReadonlySet<string>) => {
  if (Object.keys(payload).some((key) => !keys.has(key))) throw new CourseAuthorityError(400, 'Trường yêu cầu không được hỗ trợ.');
};
const normalizeCode = (value: string) => value.toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ').trim();
const courseColumns = [
  'course_code', 'subject_name', 'prerequisite', 'credits', 'knowledge_block', 'shift', 'day_of_week',
  'weeks', 'room', 'campus', 'managing_faculty', 'exam_date', 'exam_shift', 'exam_campus', 'exam_room',
  'cohort', 'major', 'group_name', 'orientation', 'orientation_note_3', 'registration_type', 'general_note',
  'academic_program', 'student_count', 'phase', 'semester', 'instructor', 'is_user_added',
] as const;

const parseCourse = (payload: Record<string, unknown>, partial = false) => {
  assertKeys(payload, COURSE_FIELDS);
  const output: Record<string, string | number | null> = {};
  for (const name of COURSE_FIELDS) {
    if (!(name in payload)) continue;
    if (name === 'credits' || name === 'student_count') {
      const value = payload[name];
      if (value !== null && (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 100000)) throw new CourseAuthorityError(400, 'Dữ liệu môn học không hợp lệ.');
      output[name] = value === null ? null : Number(value);
    } else if (name === 'is_user_added') {
      if (typeof payload[name] !== 'boolean') throw new CourseAuthorityError(400, 'Dữ liệu môn học không hợp lệ.');
      output[name] = payload[name] ? 1 : 0;
    } else output[name] = text(payload[name], name === 'subject_name' ? 240 : 500, name === 'course_code' || name === 'subject_name' || name === 'semester');
  }
  if (!partial && (!output.course_code || !output.subject_name || !output.semester)) throw new CourseAuthorityError(400, 'Thiếu dữ liệu môn học bắt buộc.');
  return output;
};

const receipt = async (env: CourseAuthorityEnv, scope: string, actorId: string, key: string, hash: string) => {
  const row = await env.DB.prepare(
    'SELECT request_hash, response_json FROM course_mutation_receipts WHERE actor_scope=? AND actor_id=? AND idempotency_key=?',
  ).bind(scope, actorId, key).first<{ request_hash: string; response_json: string }>();
  if (!row) return null;
  if (row.request_hash !== hash) throw new CourseAuthorityError(409, 'Khóa chống lặp đã được dùng cho yêu cầu khác.');
  try { return JSON.parse(row.response_json) as Record<string, unknown>; } catch { throw new CourseAuthorityError(503, 'Trạng thái chống lặp không hợp lệ.'); }
};
const storeReceipt = (env: CourseAuthorityEnv, scope: string, actorId: string, key: string, hash: string, operation: CourseOperation, response: Record<string, unknown>, at: string) =>
  env.DB.prepare('INSERT INTO course_mutation_receipts (actor_scope,actor_id,idempotency_key,request_hash,operation,response_json,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(scope, actorId, key, hash, operation, json(response), at);
const outbox = (env: CourseAuthorityEnv, type: string, dedupeKey: string, at: string, details: Record<string, unknown>) =>
  env.DB.prepare('INSERT OR IGNORE INTO course_mutation_outbox (id,dedupe_key,event_type,course_id,request_id,user_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), dedupeKey, type, details.courseId || null, details.requestId || null, details.userId || null, json(details), at);

const courseResponse = (id: string, revision: number, changed = true) => ({ success: true, id, revision, changed });

const createCourse = async (env: CourseAuthorityEnv, actor: BetterAuthIdentity, request: Request) => {
  assertAdmin(actor); const payload = parseCourse(await readBody(request)); const { key } = parseHeaders(request, false);
  const hash = await sha256(['course_create', payload]); const old = await receipt(env, 'staff', actor.userId, key, hash); if (old) return old;
  const duplicate = await env.DB.prepare('SELECT id FROM course_schedules WHERE semester=? AND course_code_search=? AND catalogue_visibility=?').bind(payload.semester, normalizeCode(String(payload.course_code)), 'published').first();
  if (duplicate) throw new CourseAuthorityError(409, 'Môn học đã tồn tại trong học kỳ này.');
  const id = crypto.randomUUID(); const at = now(); const values = courseColumns.map((column) => payload[column] ?? null);
  const response = courseResponse(id, 0);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO course_schedules (id,${courseColumns.join(',')},created_at,updated_at,course_code_search,subject_name_search,instructor_search,source_position,catalogue_visibility,revision,source_kind,writer_provenance,content_hash,instructor_provenance) VALUES (${['?'].concat(courseColumns.map(() => '?'), ['?','?','?','?','?','(SELECT COALESCE(MAX(source_position),0)+1 FROM course_schedules)','?','0','?','?','?','?']).join(',')})`).bind(id, ...values, at, at, normalizeCode(String(payload.course_code)), normalizeCode(String(payload.subject_name)), normalizeCode(String(payload.instructor || '')), 'published', 'admin', 'admin', await sha256(payload), 'admin'),
    storeReceipt(env, 'staff', actor.userId, key, hash, 'course_create', response, at),
    outbox(env, 'course.created', `course.created:${id}`, at, { courseId: id, actorId: actor.userId }),
  ]);
  return response;
};

const updateCourse = async (env: CourseAuthorityEnv, actor: BetterAuthIdentity, request: Request, id: string, retire = false) => {
  assertAdmin(actor); const { key, revision } = parseHeaders(request); const payload = retire ? {} : parseCourse(await readBody(request), true);
  if (!retire && Object.keys(payload).length === 0) throw new CourseAuthorityError(400, 'Không có thay đổi hợp lệ.');
  const hash = await sha256([retire ? 'course_retire' : 'course_update', id, revision, payload]); const old = await receipt(env, 'staff', actor.userId, key, hash); if (old) return old;
  const row = await env.DB.prepare('SELECT revision FROM course_schedules WHERE id=?').bind(id).first<{ revision: number }>();
  if (!row) throw new CourseAuthorityError(404, 'Không tìm thấy môn học.');
  if (Number(row.revision) !== revision) throw new CourseAuthorityError(409, 'Môn học đã được cập nhật bởi thao tác khác.');
  const at = now(); const next = revision! + 1; const assignments = retire
    ? 'catalogue_visibility=?,retired_at=?,revision=?,updated_at=?,writer_provenance=?'
    : [...Object.keys(payload).map((field) => `${field}=?`), 'revision=?', 'updated_at=?', 'writer_provenance=?', 'content_hash=?'].join(',');
  const args = retire ? ['retired', at, next, at, 'admin', id, revision] : [...Object.values(payload), next, at, 'admin', await sha256(payload), id, revision];
  const update = env.DB.prepare(`UPDATE course_schedules SET ${assignments} WHERE id=? AND revision=?`).bind(...args);
  const response = courseResponse(id, next);
  await env.DB.batch([
    update,
    storeReceipt(env, 'staff', actor.userId, key, hash, retire ? 'course_retire' : 'course_update', response, at),
    outbox(env, retire ? 'course.retired' : 'course.updated', `${retire ? 'course.retired' : 'course.updated'}:${id}:${next}`, at, { courseId: id, actorId: actor.userId }),
  ]);
  return response;
};

const createRequest = async (env: CourseAuthorityEnv, actor: BetterAuthIdentity, request: Request) => {
  const payload = await readBody(request); assertKeys(payload, REQUEST_FIELDS); const { key } = parseHeaders(request, false);
  const normalized = { courseCode: text(payload.courseCode, 120, true), subjectName: text(payload.subjectName, 240, true), semester: text(payload.semester, 80), instructor: text(payload.instructor, 160), note: text(payload.note, 1000) };
  const hash = await sha256(['request_create', normalized]); const old = await receipt(env, 'user', actor.userId, key, hash); if (old) return old;
  const id = crypto.randomUUID(); const at = now(); const response = { success: true, id, revision: 0, changed: true };
  await env.DB.batch([
    env.DB.prepare('INSERT INTO user_course_requests (id,user_id,course_code,subject_name,semester,instructor,request_note,request_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, actor.userId, normalized.courseCode, normalized.subjectName, normalized.semester, normalized.instructor, normalized.note, hash, at, at),
    storeReceipt(env, 'user', actor.userId, key, hash, 'request_create', response, at),
    outbox(env, 'course_request.created', `course_request.created:${id}`, at, { requestId: id, userId: actor.userId }),
  ]);
  return response;
};

const reviewRequest = async (env: CourseAuthorityEnv, actor: BetterAuthIdentity, request: Request, id: string, approve: boolean) => {
  assertAdmin(actor); const { key, revision } = parseHeaders(request);
  // An approval may carry the staff-reviewed course fields. Rejection has no
  // payload, so keep its request body empty and deterministic.
  const override = approve
    ? parseCourse(await readOptionalBody(request), true)
    : {};
  const hash = await sha256([approve ? 'request_approve' : 'request_reject', id, revision, override]); const old = await receipt(env, 'staff', actor.userId, key, hash); if (old) return old;
  const row = await env.DB.prepare('SELECT user_id,course_code,subject_name,semester,instructor,revision,status FROM user_course_requests WHERE id=?').bind(id).first<Record<string, unknown>>();
  if (!row) throw new CourseAuthorityError(404, 'Không tìm thấy yêu cầu.');
  if (row.status !== 'pending' || Number(row.revision) !== revision) throw new CourseAuthorityError(409, 'Yêu cầu đã thay đổi.');
  const at = now(); const next = revision! + 1; let courseId: string | null = null; const statements: D1PreparedStatement[] = [];
  if (approve) {
    courseId = crypto.randomUUID();
    const course = {
      course_code: row.course_code,
      subject_name: row.subject_name,
      semester: row.semester,
      instructor: row.instructor,
      is_user_added: 1,
      ...override,
    } as Record<string, unknown>;
    const values = courseColumns.map((column) => course[column] ?? null);
    statements.push(env.DB.prepare(`INSERT INTO course_schedules (id,${courseColumns.join(',')},created_at,updated_at,course_code_search,subject_name_search,instructor_search,source_position,catalogue_visibility,revision,source_kind,source_key,writer_provenance,content_hash,instructor_provenance) VALUES (${['?'].concat(courseColumns.map(() => '?'), ['?','?','?','?','?','(SELECT COALESCE(MAX(source_position),0)+1 FROM course_schedules)','?','0','?','?','?','?','?']).join(',')})`).bind(courseId, ...values, at, at, normalizeCode(String(course.course_code)), normalizeCode(String(course.subject_name)), normalizeCode(String(course.instructor || '')), 'published', 'request_approval', `request:${id}`, 'request_approval', await sha256(course), 'request_approval'));
  }
  const response = { success: true, id, revision: next, changed: true, ...(courseId ? { courseId } : {}) };
  statements.push(
    env.DB.prepare('UPDATE user_course_requests SET status=?,reviewer_id=?,reviewed_at=?,approved_course_id=?,revision=?,updated_at=? WHERE id=? AND revision=? AND status=?').bind(approve ? 'approved' : 'rejected', actor.userId, at, courseId, next, at, id, revision, 'pending'),
    storeReceipt(env, 'staff', actor.userId, key, hash, approve ? 'request_approve' : 'request_reject', response, at),
    outbox(env, approve ? 'course_request.approved' : 'course_request.rejected', `${approve ? 'course_request.approved' : 'course_request.rejected'}:${id}:${next}`, at, { requestId: id, userId: row.user_id, courseId }),
  );
  await env.DB.batch(statements); return response;
};

export const rebuildD1CourseFacets = async (env: CourseAuthorityEnv) => {
  requireD1Authority(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM course_filter_facets'),
    env.DB.prepare(`INSERT INTO course_filter_facets (semester,phase,is_user_added,subject_name,major,cohort,academic_program,group_name,course_count,first_source_position) SELECT COALESCE(semester,''),COALESCE(phase,''),COALESCE(is_user_added,-1),COALESCE(subject_name,''),COALESCE(major,''),COALESCE(cohort,''),COALESCE(academic_program,''),COALESCE(group_name,''),COUNT(*),MIN(source_position) FROM course_schedules WHERE catalogue_visibility='published' GROUP BY COALESCE(semester,''),COALESCE(phase,''),COALESCE(is_user_added,-1),COALESCE(subject_name,''),COALESCE(major,''),COALESCE(cohort,''),COALESCE(academic_program,''),COALESCE(group_name,'')`),
  ]);
  return { success: true };
};

export const cleanupD1CourseRequestsForAccount = async (env: CourseAuthorityEnv, userId: string) => {
  if (!UUID.test(userId)) throw new CourseAuthorityError(400, 'Invalid user.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM course_mutation_receipts WHERE actor_scope=? AND actor_id=?').bind('user', userId),
    env.DB.prepare('DELETE FROM course_mutation_outbox WHERE user_id=?').bind(userId),
    env.DB.prepare('DELETE FROM user_course_requests WHERE user_id=?').bind(userId),
  ]);
  return { success: true };
};

export const handleCourseAuthority = async (request: Request, url: URL, env: CourseAuthorityEnv) => {
  requireD1Authority(env);
  const courseMatch = url.pathname.match(/^\/api\/private\/v1\/courses\/([0-9a-f-]+)$/i);
  const requestMatch = url.pathname.match(/^\/api\/private\/v1\/course-requests\/([0-9a-f-]+)\/(approve|reject)$/i);
  try {
    if (url.pathname === '/api/private/v1/courses' && request.method === 'POST') return { status: 200, payload: await createCourse(env, await requireBetterAuthStaff(request, env), request) };
    if (courseMatch && request.method === 'PATCH') return { status: 200, payload: await updateCourse(env, await requireBetterAuthStaff(request, env), request, parseId(courseMatch[1])) };
    if (courseMatch && request.method === 'DELETE') return { status: 200, payload: await updateCourse(env, await requireBetterAuthStaff(request, env), request, parseId(courseMatch[1]), true) };
    if (url.pathname === '/api/private/v1/course-requests' && request.method === 'POST') return { status: 200, payload: await createRequest(env, await requireBetterAuthSession(request, env), request) };
    if (url.pathname === '/api/private/v1/course-requests' && request.method === 'GET') {
      const identity = await requireBetterAuthSession(request, env);
      const result = await env.DB.prepare('SELECT id,course_code,subject_name,semester,instructor,request_note,status,revision,created_at,updated_at FROM user_course_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(identity.userId).all();
      return { status: 200, payload: { success: true, data: result.results || [] } };
    }
    if (url.pathname === '/api/private/v1/course-requests/review' && request.method === 'GET') {
      const staff = await requireBetterAuthStaff(request, env);
      const result = await env.DB.prepare('SELECT id,user_id,course_code,subject_name,semester,instructor,request_note,status,revision,reviewer_id,reviewed_at,approved_course_id,created_at,updated_at FROM user_course_requests ORDER BY created_at DESC LIMIT 200').all();
      // Auditors may inspect the review queue, but only admins may transition it.
      return { status: 200, payload: { success: true, role: staff.role, data: result.results || [] } };
    }
    if (requestMatch && request.method === 'PATCH') return { status: 200, payload: await reviewRequest(env, await requireBetterAuthStaff(request, env), request, parseId(requestMatch[1]), requestMatch[2] === 'approve') };
    return { status: 404, payload: { error: 'Không tìm thấy endpoint.' } };
  } catch (error) {
    if (error instanceof BetterAuthIdentityError) throw new CourseAuthorityError(error.status, error.code);
    throw error;
  }
};

export const courseAuthorityErrorStatus = (error: unknown) => error instanceof CourseAuthorityError ? error.status : 500;
