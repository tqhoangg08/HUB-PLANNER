import { BetterAuthIdentityError, requireBetterAuthStaff, type BetterAuthIdentityEnv } from './better-auth-identity.ts';

export interface AdminExportEnv extends BetterAuthIdentityEnv { DB?: D1Database; }
type ExportStatus = 400 | 401 | 403 | 405 | 409 | 429 | 503;
export class AdminExportError extends Error {
  readonly status: ExportStatus;
  constructor(status: ExportStatus, message: string) { super(message); this.status = status; this.name = 'AdminExportError'; }
}
const PURPOSE = 'admin_excel_export';
const OTP_TTL_MS = 10 * 60_000;
const REQUEST_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_EXPORT_ROWS = 20_000;
const textEncoder = new TextEncoder();
const bytesToHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const db = (env: AdminExportEnv) => { if (!env.DB) throw new AdminExportError(503, 'Dịch vụ xuất dữ liệu chưa sẵn sàng.'); return env.DB; };
const readBody = async (request: Request) => { const raw = await request.text(); if (textEncoder.encode(raw).byteLength > MAX_BODY_BYTES) throw new AdminExportError(400, 'Yêu cầu xuất dữ liệu không hợp lệ.'); try { const parsed = JSON.parse(raw); if (!isRecord(parsed)) throw new Error(); return parsed; } catch { throw new AdminExportError(400, 'Yêu cầu xuất dữ liệu không hợp lệ.'); } };
const otpHash = async (challengeId: string, userId: string, otp: string) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(`${challengeId}:${userId}:${PURPOSE}:${otp}`))));
const makeOtp = () => { const values = new Uint32Array(1); crypto.getRandomValues(values); return String(100000 + (values[0] % 900000)); };
const validOtp = (value: unknown) => typeof value === 'string' && /^\d{6}$/.test(value);
const authEmailRequest = async (env: AdminExportEnv, input: { email: string; otp: string }) => {
  if (!env.AUTH_SERVICE) throw new AdminExportError(503, 'Dịch vụ gửi mã OTP chưa sẵn sàng.');
  let response: Response;
  try {
    response = await env.AUTH_SERVICE.fetch(new Request('https://auth-service.internal/internal/admin-export/send-otp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(10_000) }));
  } catch { throw new AdminExportError(503, 'Dịch vụ gửi mã OTP chưa sẵn sàng.'); }
  if (!response.ok) throw new AdminExportError(503, 'Không thể gửi mã OTP lúc này.');
  await response.body?.cancel();
};
const requireExportStaff = async (request: Request, env: AdminExportEnv) => {
  const identity = await requireBetterAuthStaff(request, env);
  if (identity.role !== 'admin') throw new AdminExportError(403, 'Không có quyền xuất dữ liệu quản trị.');
  return identity;
};
const createChallenge = async (request: Request, env: AdminExportEnv) => {
  const identity = await requireExportStaff(request, env); const store = db(env); const now = Date.now();
  const latest = await store.prepare(`SELECT created_at FROM admin_export_otps WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(identity.userId, PURPOSE).first<{ created_at: string }>();
  if (latest && now - Date.parse(latest.created_at) < REQUEST_COOLDOWN_MS) return { success: true, expires_in_seconds: Math.ceil(OTP_TTL_MS / 1000), retry_after_seconds: Math.max(1, Math.ceil((REQUEST_COOLDOWN_MS - (now - Date.parse(latest.created_at))) / 1000)) };
  const challengeId = crypto.randomUUID(); const otp = makeOtp(); const createdAt = new Date(now).toISOString(); const expiresAt = new Date(now + OTP_TTL_MS).toISOString();
  await store.batch([
    store.prepare(`UPDATE admin_export_otps SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`).bind(createdAt, identity.userId, PURPOSE),
    store.prepare(`INSERT INTO admin_export_otps (challenge_id, user_id, purpose, otp_hash, created_at, expires_at, attempt_count, consumed_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`).bind(challengeId, identity.userId, PURPOSE, await otpHash(challengeId, identity.userId, otp), createdAt, expiresAt),
  ]);
  try { await authEmailRequest(env, { email: identity.email, otp }); } catch (error) { await store.prepare(`UPDATE admin_export_otps SET consumed_at = ? WHERE challenge_id = ? AND user_id = ?`).bind(new Date().toISOString(), challengeId, identity.userId).run(); throw error; }
  return { success: true, expires_in_seconds: Math.ceil(OTP_TTL_MS / 1000), retry_after_seconds: Math.ceil(REQUEST_COOLDOWN_MS / 1000) };
};
const verify = async (env: AdminExportEnv, userId: string, value: unknown) => {
  if (!validOtp(value)) throw new AdminExportError(400, 'Mã OTP không đúng hoặc đã hết hạn.');
  const otp = String(value);
  const store = db(env);
  const row = await store.prepare(`SELECT challenge_id, otp_hash, expires_at, attempt_count FROM admin_export_otps WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(userId, PURPOSE).first<{ challenge_id: string; otp_hash: string; expires_at: string; attempt_count: number }>();
  if (!row || Date.parse(row.expires_at) <= Date.now() || row.attempt_count >= MAX_ATTEMPTS) { if (row) await store.prepare(`UPDATE admin_export_otps SET consumed_at = ? WHERE challenge_id = ?`).bind(new Date().toISOString(), row.challenge_id).run(); throw new AdminExportError(400, 'Mã OTP không đúng hoặc đã hết hạn.'); }
  const candidate = await otpHash(row.challenge_id, userId, otp); if (candidate !== row.otp_hash) { await store.prepare(`UPDATE admin_export_otps SET attempt_count = attempt_count + 1, consumed_at = CASE WHEN attempt_count + 1 >= ? THEN ? ELSE consumed_at END WHERE challenge_id = ? AND consumed_at IS NULL`).bind(MAX_ATTEMPTS, new Date().toISOString(), row.challenge_id).run(); throw new AdminExportError(400, 'Mã OTP không đúng hoặc đã hết hạn.'); }
  const consumed = await store.prepare(`UPDATE admin_export_otps SET consumed_at = ? WHERE challenge_id = ? AND user_id = ? AND consumed_at IS NULL`).bind(new Date().toISOString(), row.challenge_id, userId).run(); if (Number(consumed.meta.changes || 0) !== 1) throw new AdminExportError(409, 'Mã OTP không còn hiệu lực.');
};
const exportRows = async (env: AdminExportEnv) => {
  const result = await db(env).prepare(`SELECT p.user_id, p.student_code, p.full_name, p.class_name, q.data_json, q.student_name, q.cohort, q.program_name, q.major_name, q.specialization_name, q.semesters_json, q.updated_at FROM user_profiles p INNER JOIN user_profile_private q ON q.user_id = p.user_id ORDER BY p.user_id LIMIT ?`).bind(MAX_EXPORT_ROWS).all<Record<string, unknown>>();
  return (result.results || []).map((row) => { let data: unknown = null; try { data = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : null; } catch { data = null; } return { ...row, email: null, data, semesters: isRecord(data) && Array.isArray(data.semesters) ? data.semesters : [], data_json: undefined, semesters_json: undefined }; });
};
export const handleAdminExport = async (request: Request, env: AdminExportEnv) => {
  if (request.method !== 'POST') throw new AdminExportError(405, 'Phương thức không được hỗ trợ.'); const payload = await readBody(request); const action = typeof payload.action === 'string' ? payload.action : '';
  if (action === 'request-otp') return createChallenge(request, env);
  const identity = await requireExportStaff(request, env);
  if (action === 'verify-otp') { await verify(env, identity.userId, payload.otp); return { success: true, verified: true }; }
  if (action === 'excel') { await verify(env, identity.userId, payload.otp); return { success: true, rows: await exportRows(env) }; }
  throw new AdminExportError(400, 'Yêu cầu xuất dữ liệu không hợp lệ.');
};
export const adminExportErrorStatus = (error: unknown) => error instanceof AdminExportError || error instanceof BetterAuthIdentityError ? error.status : 500;
