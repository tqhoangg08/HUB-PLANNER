import {
  BetterAuthIdentityError,
  requireBetterAuthStaff,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import { writeProfileD1Authority, type ProfileShadowEnv } from './profile-shadow.ts';

export interface AdminStudentsEnv extends BetterAuthIdentityEnv, ProfileShadowEnv {}

type AdminStudentsStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 422 | 503;
export class AdminStudentsError extends Error {
  readonly status: AdminStudentsStatus;
  constructor(status: AdminStudentsStatus, message: string) { super(message); this.status = status; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const STUDENT_CODE = /^[a-z0-9._-]{3,64}$/i;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_LIMIT = 50;
const text = (value: unknown, max = 160) => typeof value === 'string'
  ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max)
  : '';
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

const base64Url = (value: string) => btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const fromBase64Url = (value: string) => atob(value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
type Cursor = { updatedAt: string; userId: string };
const encodeCursor = (row: { updated_at: string; user_id: string }) => base64Url(JSON.stringify({ updatedAt: row.updated_at, userId: row.user_id }));
const parseCursor = (value: string | null): Cursor | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as unknown;
    if (!isRecord(parsed) || typeof parsed.updatedAt !== 'string' || !UUID.test(String(parsed.userId || ''))) throw new Error();
    if (!Number.isFinite(Date.parse(parsed.updatedAt))) throw new Error();
    return { updatedAt: parsed.updatedAt, userId: String(parsed.userId).toLowerCase() };
  } catch { throw new AdminStudentsError(400, 'Con trỏ phân trang không hợp lệ.'); }
};

export const parseAdminStudentQuery = (params: URLSearchParams) => {
  const limitRaw = Number(params.get('limit') || 20);
  const limit = Number.isInteger(limitRaw) ? Math.max(10, Math.min(MAX_LIMIT, limitRaw)) : 20;
  const query = text(params.get('q'), 80);
  if (query && query.length < 2) throw new AdminStudentsError(400, 'Từ khóa cần ít nhất 2 ký tự.');
  const className = text(params.get('class'), 120);
  const major = text(params.get('major'), 160);
  const status = text(params.get('status'), 32);
  if (status && !['onboarded', 'pending'].includes(status)) throw new AdminStudentsError(400, 'Trạng thái không hợp lệ.');
  const start = text(params.get('start'), 32);
  const end = text(params.get('end'), 32);
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new AdminStudentsError(400, 'Ngày bắt đầu không hợp lệ.');
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new AdminStudentsError(400, 'Ngày kết thúc không hợp lệ.');
  return { limit, query, className, major, status, start, end, cursor: parseCursor(params.get('cursor')) };
};

const requireAdmin = async (request: Request, env: AdminStudentsEnv) => {
  const identity = await requireBetterAuthStaff(request, env);
  if (identity.role !== 'admin') throw new AdminStudentsError(403, 'Không có quyền quản lý sinh viên.');
  return identity;
};

const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');
const audit = async (env: AdminStudentsEnv, actor: BetterAuthIdentity, action: string, target: string, requestId: string) => {
  const sourceKey = `admin-student:${actor.userId}:${action}:${requestId}`;
  // Keep the audit useful without persisting raw student identifiers or PII.
  await env.DB.prepare(`INSERT OR IGNORE INTO activity_logs
    (source_key,canonical_hash,created_at,user_id,user_role,action,action_label,target_table,target_id,status,metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    sourceKey, await hash(sourceKey), new Date().toISOString(), actor.userId, actor.role,
    action, action, 'user_profiles', await hash(target), 'success', JSON.stringify({ source: 'admin_students' }),
  ).run();
};

const maskEmail = (studentCode: string | null) => studentCode ? `${studentCode.slice(0, 2)}***@st.buh.edu.vn` : null;
const rowResponse = (row: Record<string, unknown>) => ({
  student_code: row.student_code ?? null,
  full_name: row.full_name ?? row.student_name ?? null,
  class_name: row.class_name ?? null,
  cohort: row.cohort ?? null,
  program_name: row.program_name ?? null,
  major_name: row.major_name ?? null,
  specialization_name: row.specialization_name ?? null,
  gender: null,
  birth_date: null,
  phone_masked: null,
  email_masked: maskEmail(typeof row.student_code === 'string' ? row.student_code : null),
  status: Number(row.has_onboarded || 0) === 1 ? 'onboarded' : 'pending',
  last_active_at: row.updated_at ?? null,
});

const readList = async (url: URL, env: AdminStudentsEnv) => {
  const query = parseAdminStudentQuery(url.searchParams);
  const where: string[] = [];
  const values: unknown[] = [];
  if (query.query) {
    const normalized = query.query.toLowerCase().replace(/@st\.buh\.edu\.vn$/i, '');
    if (/^[a-z0-9._-]+$/i.test(normalized)) {
      // Exact/prefix MSSV lookup uses the existing unique NOCASE index.
      where.push('p.student_code COLLATE NOCASE >= ? AND p.student_code COLLATE NOCASE < ?');
      values.push(normalized, `${normalized}\uffff`);
    } else {
      // Prefix-only name search avoids an unbounded contains scan.
      where.push("p.full_name LIKE ? ESCAPE '\\' COLLATE NOCASE");
      values.push(`${escapeLike(query.query)}%`);
    }
  }
  if (query.className) { where.push('p.class_name = ?'); values.push(query.className); }
  if (query.major) { where.push('q.major_name = ?'); values.push(query.major); }
  if (query.status) { where.push('COALESCE(q.has_onboarded, 0) = ?'); values.push(query.status === 'onboarded' ? 1 : 0); }
  if (query.start) { where.push('p.updated_at >= ?'); values.push(`${query.start}T00:00:00.000Z`); }
  if (query.end) { where.push('p.updated_at < ?'); values.push(`${query.end}T23:59:59.999Z`); }
  if (query.cursor) {
    where.push('(p.updated_at < ? OR (p.updated_at = ? AND p.user_id < ?))');
    values.push(query.cursor.updatedAt, query.cursor.updatedAt, query.cursor.userId);
  }
  const rows = await env.DB.prepare(`SELECT p.user_id,p.student_code,p.full_name,p.class_name,p.updated_at,
      q.student_name,q.cohort,q.program_name,q.major_name,q.specialization_name,q.has_onboarded
      FROM user_profiles p LEFT JOIN user_profile_private q ON q.user_id=p.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.updated_at DESC,p.user_id DESC LIMIT ?`).bind(...values, query.limit + 1).all<Record<string, unknown>>();
  const result = rows.results || [];
  const page = result.slice(0, query.limit);
  const finalRow = page[page.length - 1] as { updated_at: string; user_id: string } | undefined;
  return {
    success: true,
    data: page.map(rowResponse),
    next_cursor: result.length > query.limit && finalRow ? encodeCursor(finalRow) : null,
    has_more: result.length > query.limit,
  };
};

const readBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new AdminStudentsError(413, 'Dữ liệu quá lớn.');
  try { const value = JSON.parse(raw) as unknown; if (!isRecord(value)) throw new Error(); return value; }
  catch { throw new AdminStudentsError(400, 'Dữ liệu không hợp lệ.'); }
};
const requestId = (request: Request) => {
  const value = request.headers.get('Idempotency-Key') || '';
  if (!UUID.test(value)) throw new AdminStudentsError(400, 'Thiếu mã chống gửi lặp.');
  return value.toLowerCase();
};
const editableFields = new Set(['fullName', 'className', 'cohort', 'programName', 'majorName', 'specializationName']);
const patchInput = (body: Record<string, unknown>) => {
  if (Object.keys(body).some((key) => !editableFields.has(key))) throw new AdminStudentsError(400, 'Trường cập nhật không hợp lệ.');
  const result = Object.fromEntries(Object.entries(body).map(([key, value]) => [key, text(value)]));
  if (!Object.keys(result).length || Object.values(result).some((value) => typeof value !== 'string')) throw new AdminStudentsError(422, 'Dữ liệu cập nhật không hợp lệ.');
  return result as Record<string, string>;
};

const updateStudent = async (request: Request, studentCode: string, env: AdminStudentsEnv, actor: BetterAuthIdentity) => {
  const body = patchInput(await readBody(request));
  const idem = requestId(request);
  const row = await env.DB.prepare(`SELECT p.user_id,p.student_code,p.full_name,p.class_name,q.data_json,q.cohort,q.program_name,q.major_name,q.specialization_name
    FROM user_profiles p LEFT JOIN user_profile_private q ON q.user_id=p.user_id WHERE p.student_code=?`).bind(studentCode).first<Record<string, unknown>>();
  if (!row || typeof row.user_id !== 'string') throw new AdminStudentsError(404, 'Không tìm thấy sinh viên.');
  let data: Record<string, unknown> = {};
  try { const parsed = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : {}; if (isRecord(parsed)) data = parsed; } catch { throw new AdminStudentsError(503, 'Dữ liệu hồ sơ không hợp lệ.'); }
  const changed = body.fullName !== undefined && body.fullName !== String(row.full_name || '') ||
    body.className !== undefined && body.className !== String(row.class_name || '') ||
    body.cohort !== undefined && body.cohort !== String(row.cohort || '') ||
    body.programName !== undefined && body.programName !== String(row.program_name || '') ||
    body.majorName !== undefined && body.majorName !== String(row.major_name || '') ||
    body.specializationName !== undefined && body.specializationName !== String(row.specialization_name || '');
  if (!changed) return { success: true, unchanged: true };
  const nextData = { ...data,
    ...(body.fullName !== undefined ? { studentName: body.fullName } : {}),
    ...(body.cohort !== undefined ? { cohort: body.cohort } : {}),
    ...(body.programName !== undefined ? { programName: body.programName } : {}),
    ...(body.majorName !== undefined ? { majorName: body.majorName } : {}),
    ...(body.specializationName !== undefined ? { specializationName: body.specializationName } : {}),
  };
  await writeProfileD1Authority(env, { userId: row.user_id, publicProfile: {
    ...(body.fullName !== undefined ? { full_name: body.fullName } : {}),
    ...(body.className !== undefined ? { class_name: body.className } : {}),
  }, privateProfile: { data: nextData } });
  await audit(env, actor, 'admin_student_update', studentCode, idem);
  return { success: true };
};

export const handleAdminStudents = async (request: Request, url: URL, env: AdminStudentsEnv) => {
  const actor = await requireAdmin(request, env);
  if (url.pathname === '/api/admin/students') {
    if (request.method === 'GET') return readList(url, env);
    // A profile cannot safely create a Better Auth account. Account creation is
    // intentionally delegated to the authoritative signup flow.
    if (request.method === 'POST') throw new AdminStudentsError(409, 'Tạo tài khoản cần thực hiện qua luồng đăng ký được xác thực.');
    throw new AdminStudentsError(405, 'Phương thức không được hỗ trợ.');
  }
  const match = url.pathname.match(/^\/api\/admin\/students\/([^/]+)$/);
  if (!match) throw new AdminStudentsError(404, 'Không tìm thấy endpoint.');
  const studentCode = decodeURIComponent(match[1]);
  if (!STUDENT_CODE.test(studentCode)) throw new AdminStudentsError(400, 'MSSV không hợp lệ.');
  if (request.method === 'PATCH') return updateStudent(request, studentCode, env, actor);
  if (request.method === 'DELETE') {
    // Deleting a profile without deleting its Better Auth account would create
    // an orphaned identity. Keep the destructive operation in account-delete.
    throw new AdminStudentsError(409, 'Xóa tài khoản phải dùng quy trình xóa tài khoản có xác minh.');
  }
  throw new AdminStudentsError(405, 'Phương thức không được hỗ trợ.');
};

export const adminStudentsErrorStatus = (error: unknown) =>
  error instanceof AdminStudentsError || error instanceof BetterAuthIdentityError ? error.status : 500;
