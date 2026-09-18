import type { BetterAuthIdentity, BetterAuthIdentityEnv } from './better-auth-identity.ts';
import { cleanupD1UserDataForAdminLifecycle, type AccountDeleteEnv } from './account-delete.ts';
import { writeProfileD1Authority, type ProfileShadowEnv } from './profile-shadow.ts';

export interface AdminStudentLifecycleEnv extends BetterAuthIdentityEnv, ProfileShadowEnv {
  SUPPORT_ATTACHMENTS_BUCKET?: R2Bucket;
}

export class AdminStudentLifecycleError extends Error {
  readonly status: 400 | 404 | 409 | 503;
  constructor(status: 400 | 404 | 409 | 503, message: string) { super(message); this.status = status; }
}

const INTERNAL_ORIGIN = 'https://auth-service.internal';
const TIMEOUT_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STUDENT_CODE = /^[A-Z0-9._-]{3,64}$/;
const CANONICAL_STUDENT_CODE = /^\d{12}$/;
const text = (value: unknown, max = 160) => typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

export type AdminStudentCreateInput = {
  studentCode: string;
  fullName: string;
  className: string;
  cohort: string;
  programName: string;
  majorName: string;
  specializationName: string;
};

type LifecycleRow = {
  operation_id: string; actor_user_id: string; idempotency_key: string; action: 'create' | 'delete'; student_code: string;
  target_user_id: string | null; request_hash: string; payload_json: string; state: 'pending' | 'auth_done' | 'profile_done' | 'completed';
};

const safeLifecyclePayload = (input: AdminStudentCreateInput) => ({
  fullName: input.fullName, className: input.className, cohort: input.cohort,
  programName: input.programName, majorName: input.majorName, specializationName: input.specializationName,
});

export const parseAdminStudentCreate = (body: Record<string, unknown>): AdminStudentCreateInput => {
  const allowedFields = new Set(['studentCode', 'fullName', 'className', 'cohort', 'programName', 'majorName', 'specializationName']);
  if (Object.keys(body).some(field => !allowedFields.has(field))) {
    throw new AdminStudentLifecycleError(400, 'Dữ liệu tạo sinh viên không hợp lệ.');
  }
  const studentCode = text(body.studentCode, 64).toUpperCase();
  const fullName = text(body.fullName, 160);
  if (!STUDENT_CODE.test(studentCode) || !CANONICAL_STUDENT_CODE.test(studentCode) || fullName.length < 2) {
    throw new AdminStudentLifecycleError(400, 'MSSV hoặc họ tên không hợp lệ.');
  }
  return {
    studentCode, fullName, className: text(body.className, 120), cohort: text(body.cohort, 80),
    programName: text(body.programName, 120), majorName: text(body.majorName, 160), specializationName: text(body.specializationName, 160),
  };
};

const readLifecycle = async (env: AdminStudentLifecycleEnv, actorId: string, key: string) => env.DB!.prepare(
  `SELECT operation_id,actor_user_id,idempotency_key,action,student_code,target_user_id,request_hash,payload_json,state
     FROM admin_student_lifecycle WHERE actor_user_id=?1 AND idempotency_key=?2 LIMIT 1`,
).bind(actorId, key).first<LifecycleRow>();

// A page reload loses the browser-held idempotency key.  The durable saga is
// therefore also recoverable by its immutable business key, but only by the
// administrator that started the exact same request.
const readRecoverableLifecycle = async (
  env: AdminStudentLifecycleEnv,
  actorId: string,
  action: LifecycleRow['action'],
  studentCode: string,
  requestHash: string,
) => env.DB!.prepare(
  `SELECT operation_id,actor_user_id,idempotency_key,action,student_code,target_user_id,request_hash,payload_json,state
     FROM admin_student_lifecycle
    WHERE actor_user_id=?1 AND action=?2 AND student_code=?3 AND request_hash=?4 AND state<>'completed'
    ORDER BY updated_at DESC LIMIT 1`,
).bind(actorId, action, studentCode, requestHash).first<LifecycleRow>();

const updateLifecycle = async (env: AdminStudentLifecycleEnv, operationId: string, state: LifecycleRow['state'], targetUserId?: string | null) => {
  const now = new Date().toISOString();
  if (targetUserId !== undefined) {
    await env.DB!.prepare(`UPDATE admin_student_lifecycle SET state=?1,target_user_id=?2,updated_at=?3
      WHERE operation_id=?4 AND state<>?1`).bind(state, targetUserId, now, operationId).run();
  } else {
    await env.DB!.prepare(`UPDATE admin_student_lifecycle SET state=?1,updated_at=?2
      WHERE operation_id=?3 AND state<>?1`).bind(state, now, operationId).run();
  }
};

const authCall = async (
  request: Request,
  env: AdminStudentLifecycleEnv,
  path: '/internal/admin-students/create' | '/internal/admin-students/invite' | '/internal/admin-students/delete',
  payload: Record<string, unknown>,
) => {
  if (!env.AUTH_SERVICE) throw new AdminStudentLifecycleError(503, 'Dịch vụ xác thực chưa sẵn sàng.');
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie) throw new AdminStudentLifecycleError(503, 'Phiên quản trị không hợp lệ.');
  const overrides = request.headers.get('Cloudflare-Workers-Version-Overrides');
  const headers = new Headers({ Cookie: cookie, Accept: 'application/json', 'Content-Type': 'application/json' });
  if (overrides) headers.set('Cloudflare-Workers-Version-Overrides', overrides);
  let response: Response;
  try {
    response = await env.AUTH_SERVICE.fetch(new Request(new URL(path, INTERNAL_ORIGIN), {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS),
    }));
  } catch { throw new AdminStudentLifecycleError(503, 'Dịch vụ xác thực tạm thời chưa sẵn sàng.'); }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 409 ? 409 : 503;
    throw new AdminStudentLifecycleError(status, typeof data.error === 'string' ? data.error : 'Không thể hoàn tất vòng đời tài khoản.');
  }
  return data;
};

const audit = async (env: AdminStudentLifecycleEnv, actor: BetterAuthIdentity, action: 'admin_student_create' | 'admin_student_delete', operationId: string, studentCode: string) => {
  const sourceKey = `admin-student-lifecycle:${operationId}`;
  await env.DB!.prepare(`INSERT OR IGNORE INTO activity_logs
    (source_key,canonical_hash,created_at,user_id,user_role,action,action_label,target_table,target_id,status,metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    sourceKey, await hash(sourceKey), new Date().toISOString(), actor.userId, actor.role,
    action, action, 'user_profiles', await hash(studentCode), 'success', JSON.stringify({ source: 'admin_student_lifecycle' }),
  ).run();
};

const responseStudent = (input: AdminStudentCreateInput) => ({
  student_code: input.studentCode, full_name: input.fullName, class_name: input.className || null, cohort: input.cohort || null,
  program_name: input.programName || null, major_name: input.majorName || null, specialization_name: input.specializationName || null,
  gender: null, birth_date: null, phone_masked: null, email_masked: `${input.studentCode.slice(0, 2)}***@st.buh.edu.vn`,
  status: 'pending' as const, last_active_at: new Date().toISOString(),
});

export const createAdminStudent = async (
  request: Request,
  env: AdminStudentLifecycleEnv,
  actor: BetterAuthIdentity,
  idempotencyKey: string,
  input: AdminStudentCreateInput,
) => {
  if (!env.DB || !UUID.test(idempotencyKey)) throw new AdminStudentLifecycleError(400, 'Thiếu mã chống gửi lặp.');
  const payload = safeLifecyclePayload(input);
  const requestHash = await hash(JSON.stringify({ action: 'create', studentCode: input.studentCode, payload }));
  let operation = await readLifecycle(env, actor.userId, idempotencyKey);
  if (!operation) {
    operation = await readRecoverableLifecycle(env, actor.userId, 'create', input.studentCode, requestHash);
    if (!operation) {
      const now = new Date().toISOString();
      const operationId = crypto.randomUUID();
      try {
        await env.DB.prepare(`INSERT INTO admin_student_lifecycle
          (operation_id,actor_user_id,idempotency_key,action,student_code,target_user_id,request_hash,payload_json,state,created_at,updated_at)
          VALUES (?,?,?,?,?,NULL,?,?, 'pending',?,?)`).bind(
          operationId, actor.userId, idempotencyKey, 'create', input.studentCode, requestHash, JSON.stringify(payload), now, now,
        ).run();
      } catch { throw new AdminStudentLifecycleError(409, 'Yêu cầu tạo tài khoản đang được xử lý hoặc đã thay đổi.'); }
      operation = await readLifecycle(env, actor.userId, idempotencyKey);
    }
  }
  if (!operation || operation.action !== 'create' || operation.student_code !== input.studentCode || operation.request_hash !== requestHash) {
    throw new AdminStudentLifecycleError(409, 'Mã chống gửi lặp đã được dùng cho yêu cầu khác.');
  }
  let userId = operation.target_user_id;
  if (operation.state === 'pending') {
    const created = await authCall(request, env, '/internal/admin-students/create', {
      operationId: operation.operation_id, studentCode: input.studentCode, email: `${input.studentCode}@st.buh.edu.vn`, fullName: input.fullName,
    });
    if (typeof created.userId !== 'string' || !UUID.test(created.userId)) throw new AdminStudentLifecycleError(503, 'Dịch vụ xác thực trả dữ liệu không hợp lệ.');
    userId = created.userId;
    await updateLifecycle(env, operation.operation_id, 'auth_done', userId);
    operation = { ...operation, target_user_id: userId, state: 'auth_done' };
  }
  if (!userId) throw new AdminStudentLifecycleError(503, 'Không thể khôi phục yêu cầu tạo tài khoản.');
  if (operation.state === 'auth_done') {
    const existing = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE user_id=?1 LIMIT 1').bind(userId).first<{ user_id: string }>();
    if (!existing) {
      await writeProfileD1Authority(env, {
        userId, email: `${input.studentCode}@st.buh.edu.vn`,
        publicProfile: { full_name: input.fullName, class_name: input.className || null },
        privateProfile: { data: { studentName: input.fullName, cohort: input.cohort, programName: input.programName, majorName: input.majorName, specializationName: input.specializationName }, has_onboarded: false },
      });
    }
    await updateLifecycle(env, operation.operation_id, 'profile_done');
    operation = { ...operation, state: 'profile_done' };
  }
  if (operation.state === 'profile_done') {
    await authCall(request, env, '/internal/admin-students/invite', {
      operationId: operation.operation_id, studentCode: input.studentCode, email: `${input.studentCode}@st.buh.edu.vn`,
    });
    await updateLifecycle(env, operation.operation_id, 'completed');
    await audit(env, actor, 'admin_student_create', operation.operation_id, input.studentCode);
  }
  return { success: true, student: responseStudent(input), invited: true };
};

export const deleteAdminStudentLifecycle = async (
  request: Request,
  env: AdminStudentLifecycleEnv,
  actor: BetterAuthIdentity,
  idempotencyKey: string,
  studentCode: string,
) => {
  if (!env.DB || !UUID.test(idempotencyKey)) throw new AdminStudentLifecycleError(400, 'Thiếu mã chống gửi lặp.');
  const requestHash = await hash(JSON.stringify({ action: 'delete', studentCode }));
  let operation = await readLifecycle(env, actor.userId, idempotencyKey);
  if (!operation) {
    operation = await readRecoverableLifecycle(env, actor.userId, 'delete', studentCode, requestHash);
    if (!operation) {
      const target = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE student_code=?1 LIMIT 1').bind(studentCode).first<{ user_id: string }>();
      if (!target || !UUID.test(target.user_id)) throw new AdminStudentLifecycleError(404, 'Không tìm thấy sinh viên.');
      const now = new Date().toISOString();
      const operationId = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO admin_student_lifecycle
        (operation_id,actor_user_id,idempotency_key,action,student_code,target_user_id,request_hash,payload_json,state,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?, 'pending',?,?)`).bind(
        operationId, actor.userId, idempotencyKey, 'delete', studentCode, target.user_id, requestHash, '{}', now, now,
      ).run();
      operation = await readLifecycle(env, actor.userId, idempotencyKey);
    }
  }
  if (!operation || operation.action !== 'delete' || operation.student_code !== studentCode || operation.request_hash !== requestHash || !operation.target_user_id) {
    throw new AdminStudentLifecycleError(409, 'Mã chống gửi lặp đã được dùng cho yêu cầu khác.');
  }
  if (operation.state === 'pending') {
    await cleanupD1UserDataForAdminLifecycle(env as AccountDeleteEnv, operation.target_user_id);
    await updateLifecycle(env, operation.operation_id, 'profile_done');
    operation = { ...operation, state: 'profile_done' };
  }
  if (operation.state === 'profile_done') {
    await authCall(request, env, '/internal/admin-students/delete', {
      operationId: operation.operation_id, targetUserId: operation.target_user_id, studentCode, email: `${studentCode}@st.buh.edu.vn`,
    });
    await updateLifecycle(env, operation.operation_id, 'completed');
    await audit(env, actor, 'admin_student_delete', operation.operation_id, studentCode);
  }
  return { success: true, deleted: true };
};
