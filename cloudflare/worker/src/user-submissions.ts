import {
  BetterAuthIdentityError,
  listBetterAuthStaffUserIds,
  requireBetterAuthSession,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import { LostFoundError, submitLostFound, type LostFoundEnv } from './lost-found.ts';
import { deliverPushBatch, type PushDeliveryEnv } from './push-delivery.ts';

interface UserSubmissionEnv extends BetterAuthIdentityEnv, LostFoundEnv, PushDeliveryEnv {}

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const PROTECTED_ACTIONS = new Set(['verify-only', 'feedback', 'donation', 'canva-pro-request', 'lost-found', 'event-contribution', 'bug-report', 'course-report', 'event-report']);
const MODERATOR_KINDS = new Set(['event_pending', 'lost_found_pending', 'course_report', 'event_report', 'bug_report', 'feedback', 'ctv_request', 'user_course_request']);
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export class UserSubmissionError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'UserSubmissionError'; this.status = status; }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
const nullable = (value: unknown, max: number) => text(value, max) || null;
const readJsonBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new UserSubmissionError(413, 'Dữ liệu gửi lên vượt giới hạn.');
  try { const value = JSON.parse(raw) as unknown; if (!isRecord(value)) throw new Error(); return value; }
  catch { throw new UserSubmissionError(400, 'Dữ liệu gửi lên không hợp lệ.'); }
};
const optionalBetterAuthIdentity = async (request: Request, env: BetterAuthIdentityEnv): Promise<BetterAuthIdentity | null> => {
  const hasSession = /(?:^|;\s*)(?:__Secure-)?hubplanner_auth(?:_integration_stage2)?\.session_token=/i.test(request.headers.get('Cookie') || '');
  return hasSession ? requireBetterAuthSession(request, env) : null;
};
const verifyTurnstile = async (request: Request, env: UserSubmissionEnv, token: unknown) => {
  const secret = String(env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) throw new UserSubmissionError(503, 'Hệ thống xác minh đang tạm thời không sẵn sàng.');
  if (typeof token !== 'string' || !token.trim()) throw new UserSubmissionError(400, 'Vui lòng xác minh bạn không phải robot.');
  const form = new FormData(); form.set('secret', secret); form.set('response', token.trim());
  const ip = String(request.headers.get('CF-Connecting-IP') || '').trim(); if (ip) form.set('remoteip', ip);
  const response = await fetch(TURNSTILE_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(8_000) });
  const result = await response.json().catch(() => null) as { success?: boolean } | null;
  if (!response.ok || result?.success !== true) throw new UserSubmissionError(400, 'Xác minh bảo mật không thành công. Vui lòng thử lại.');
};

type SubmissionKind = 'feedback' | 'donation' | 'canva_pro_requests' | 'bug_reports' | 'course_reports' | 'event_reports' | 'ctv_requests';
type NormalizedSubmission = { kind: SubmissionKind; payload: Record<string, unknown>; contactKey?: string };
const normalizePayload = (action: string, value: unknown): NormalizedSubmission => {
  const payload = isRecord(value) ? value : {};
  if (action === 'feedback') { const row = { type: text(payload.type || 'idea', 40), content: text(payload.content, 5_000), contact: text(payload.contact, 500), full_name: nullable(payload.full_name, 200), student_code: nullable(payload.student_code, 80), email: nullable(payload.email, 320) }; if (!row.content) throw new UserSubmissionError(400, 'Thiếu nội dung góp ý.'); return { kind: 'feedback', payload: row }; }
  if (action === 'donation') { const amount = Number.parseInt(String(payload.amount || '').replace(/\D/g, ''), 10) || 0; const row = { name: text(payload.name, 200), student_id: text(payload.student_id || payload.mssv, 80), message: text(payload.message, 1_000), amount }; if (!row.name || amount <= 0) throw new UserSubmissionError(400, 'Thiếu tên hoặc số tiền ủng hộ.'); return { kind: 'donation', payload: row }; }
  if (action === 'canva-pro-request') { const row = { email: text(payload.email, 320).toLowerCase(), full_name: text(payload.full_name || payload.fullName, 200), student_batch: text(payload.student_batch || payload.cohort, 80), major: text(payload.major, 200), note: nullable(payload.note, 2_000) }; if (!row.email.endsWith('@st.buh.edu.vn') || !row.full_name || !row.student_batch || !row.major) throw new UserSubmissionError(400, 'Thiếu thông tin đăng ký Canva Pro.'); return { kind: 'canva_pro_requests', payload: row }; }
  if (action === 'bug-report') { const row = { error_location: text(payload.error_location || payload.location, 500), description: text(payload.description, 5_000) }; if (!row.error_location || !row.description) throw new UserSubmissionError(400, 'Thiếu nội dung báo lỗi.'); return { kind: 'bug_reports', payload: row }; }
  if (action === 'course-report') { const row = { course_code: text(payload.course_code, 120), subject_name: text(payload.subject_name, 300), error_description: text(payload.error_description || payload.description, 3_000), suggested_correction: nullable(payload.suggested_correction, 3_000) }; if (!row.course_code || !row.subject_name || !row.error_description) throw new UserSubmissionError(400, 'Thiếu nội dung báo cáo môn học.'); return { kind: 'course_reports', payload: row }; }
  if (action === 'event-report') { const eventId = Number(payload.event_id); const row = { event_id: Number.isSafeInteger(eventId) && eventId > 0 ? eventId : null, event_name: text(payload.event_name, 300), organizer: text(payload.organizer, 300), issue_description: text(payload.issue_description || payload.issue, 3_000) }; if (!row.issue_description) throw new UserSubmissionError(400, 'Thiếu nội dung báo cáo sự kiện.'); return { kind: 'event_reports', payload: row }; }
  throw new UserSubmissionError(400, 'Hành động không hợp lệ.');
};
const insertSubmission = async (env: UserSubmissionEnv, normalized: NormalizedSubmission, identity: BetterAuthIdentity | null) => {
  const id = crypto.randomUUID(), now = new Date().toISOString();
  try { await env.DB.prepare(`INSERT INTO protected_submissions (id,kind,user_id,status,payload_json,contact_key,created_at,updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`)
    .bind(id, normalized.kind, identity?.userId || null, JSON.stringify(normalized.payload), normalized.contactKey || null, now, now).run(); }
  catch (error) {
    if (normalized.kind === 'ctv_requests' && /unique|constraint/i.test(String(error))) {
      throw new UserSubmissionError(409, 'Thông tin liên hệ này đã được gửi trước đó.');
    }
    throw error;
  }
  return { success: true, id };
};
const insertEventContribution = async (env: UserSubmissionEnv, value: unknown) => {
  const payload = isRecord(value) ? value : {}, title = text(payload.title, 300), link = text(payload.link, 1_000);
  if (!title || !link) throw new UserSubmissionError(400, 'Thiếu tên sự kiện hoặc link tham gia.');
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO admin_events (title,organizer,category,criteria,points,format,deadline,deadline_time,close_on_full,description,link,location_type,status,is_manually_closed,is_deleted,created_at,event_date,event_time,registration_start_date,registration_start_time,image_url,title_search,organizer_search) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending',0,0,?,?,?,?,?,?,?,?)`)
    .bind(title, nullable(payload.organizer, 300), nullable(payload.category, 200), nullable(payload.criteria, 40), nullable(payload.points, 40), nullable(payload.format, 80), nullable(payload.deadline, 20), nullable(payload.deadline_time, 20), Boolean(payload.close_on_full) ? 1 : 0, nullable(payload.description, 5_000), link, nullable(payload.location_type, 80), now, nullable(payload.event_date, 20), nullable(payload.event_time, 20), nullable(payload.registration_start_date, 20), nullable(payload.registration_start_time, 20), nullable(payload.image_url, 1_000), title.toLocaleLowerCase('vi-VN'), text(payload.organizer, 300).toLocaleLowerCase('vi-VN')).run();
  return { success: true, id: Number(result.meta?.last_row_id || 0) };
};

export const handleProtectedSubmission = async (request: Request, env: UserSubmissionEnv) => {
  if (request.method !== 'POST') throw new UserSubmissionError(405, 'Phương thức không được hỗ trợ.');
  const body = await readJsonBody(request), action = String(body.action || '');
  if (!PROTECTED_ACTIONS.has(action)) throw new UserSubmissionError(400, 'Hành động không hợp lệ.');
  const identity = await optionalBetterAuthIdentity(request, env);
  if (action === 'lost-found') return submitLostFound(request, env, body, identity);
  await verifyTurnstile(request, env, body.turnstileToken);
  if (action === 'verify-only') return { verified: true };
  if (action === 'event-contribution') return insertEventContribution(env, body.payload);
  return insertSubmission(env, normalizePayload(action, body.payload), identity);
};

const notifyLostFoundModerators = async (env: UserSubmissionEnv, recordId: number) => {
  const item = await env.DB.prepare('SELECT id, title, type, status FROM lost_found_items WHERE id = ? AND is_deleted = 0').bind(recordId).first<{ id: number; title: string; type: string; status: string }>();
  if (!item || item.status !== 'pending') throw new UserSubmissionError(404, 'Không tìm thấy nội dung chờ duyệt.');
  const receiverIds = await listBetterAuthStaffUserIds(env); if (!receiverIds.length) return { success: true, notified: 0 };
  const content = `Có tin ${item.type === 'FOUND' ? 'nhặt được đồ' : 'báo mất đồ'} cần duyệt: ${text(item.title, 96)}`, link = '/lost-found', at = new Date().toISOString();
  const results = await env.DB.batch(receiverIds.map((receiverId) => env.DB.prepare(`INSERT OR IGNORE INTO lost_found_moderator_notifications (id,receiver_id,lost_found_item_id,type,content,link,is_read,created_at) VALUES (?,?,?,'system_alert',?,?,0,?)`).bind(crypto.randomUUID(), receiverId, recordId, content, link, at)));
  return { success: true, notified: results.reduce((total, result) => total + Number(result.meta?.changes || 0), 0) };
};
const notificationSource = async (env: UserSubmissionEnv, kind: string, recordId: string) => {
  const config: Record<string, { submissionKind?: SubmissionKind; title: string; link: string }> = { course_report: { submissionKind: 'course_reports', title: 'Báo cáo môn học mới', link: '/admin-reports' }, event_report: { submissionKind: 'event_reports', title: 'Báo cáo sự kiện mới', link: '/admin-reports' }, bug_report: { submissionKind: 'bug_reports', title: 'Báo lỗi hệ thống mới', link: '/admin-reports' }, feedback: { submissionKind: 'feedback', title: 'Phản hồi mới', link: '/admin-reports' }, ctv_request: { submissionKind: 'ctv_requests', title: 'Đơn CTV mới', link: '/admin-reports' } };
  if (kind === 'user_course_request') { const row = await env.DB.prepare("SELECT id,user_id,course_code,subject_name FROM user_course_requests WHERE id=? AND status='pending'").bind(recordId).first<Record<string, unknown>>(); return row ? { id: String(row.id), actorId: typeof row.user_id === 'string' ? row.user_id : null, sourceKind: kind, content: `Có yêu cầu thêm môn mới: ${text(row.course_code || row.subject_name, 96)}`, title: 'Yêu cầu thêm môn mới', link: '/schedule' } : null; }
  if (kind === 'event_pending') { const row = await env.DB.prepare("SELECT id,title FROM admin_events WHERE id=? AND status='pending' AND is_deleted=0").bind(Number(recordId)).first<Record<string, unknown>>(); return row ? { id: String(row.id), actorId: null, sourceKind: kind, content: `Có sự kiện mới cần duyệt: ${text(row.title, 96)}`, title: 'Sự kiện chờ duyệt', link: `/events/edit/${row.id}` } : null; }
  const entry = config[kind]; if (!entry?.submissionKind) return null;
  const row = await env.DB.prepare("SELECT id,user_id,payload_json FROM protected_submissions WHERE id=? AND kind=? AND status='pending'").bind(recordId, entry.submissionKind).first<{ id: string; user_id: string | null; payload_json: string }>();
  if (!row) return null; const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  const label = entry.submissionKind === 'ctv_requests' ? payload.full_name : entry.submissionKind === 'course_reports' ? (payload.course_code || payload.subject_name) : entry.submissionKind === 'event_reports' ? payload.event_name : entry.submissionKind === 'bug_reports' ? payload.error_location : payload.content;
  return { id: row.id, actorId: row.user_id, sourceKind: kind, content: `${entry.title}: ${text(label, 96) || 'Nội dung mới'}`, title: entry.title, link: entry.link };
};
const notifyProtectedModerators = async (env: UserSubmissionEnv, kind: string, recordId: string, identity: BetterAuthIdentity | null) => {
  const source = await notificationSource(env, kind, recordId); if (!source) return { success: true, notified: 0, skipped: true };
  if (source.actorId && (!identity || identity.userId !== source.actorId)) throw new UserSubmissionError(403, 'Không có quyền thực hiện thao tác này.');
  if (!source.actorId && !identity) throw new UserSubmissionError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  const receivers = await listBetterAuthStaffUserIds(env); if (!receivers.length) return { success: true, notified: 0 };
  const at = new Date().toISOString();
  const results = await env.DB.batch(receivers.map((receiverId) => env.DB.prepare(`INSERT OR IGNORE INTO protected_submission_moderator_notifications (id,receiver_id,actor_id,submission_kind,submission_id,type,content,link,is_read,created_at) VALUES (?,?,?,?,?,'system_alert',?,?,0,?)`).bind(crypto.randomUUID(), receiverId, source.actorId, source.sourceKind, source.id, source.content, source.link, at)));
  const inserted = receivers.filter((_, index) => Number(results[index]?.meta?.changes || 0) === 1);
  await Promise.all(inserted.map((userId) => deliverPushBatch(env, { title: source.title, body: source.content, url: source.link, category: 'system' }, { userId, limit: 100, deliveryKey: { type: 'moderator', id: `${source.sourceKind}:${source.id}` } })));
  return { success: true, notified: inserted.length };
};

export const handleCtvRegistration = async (request: Request, env: UserSubmissionEnv) => {
  if (request.method === 'GET') { const identity = await requireBetterAuthSession(request, env); const rows = await env.DB.prepare("SELECT id,status,created_at,updated_at FROM protected_submissions WHERE kind='ctv_requests' AND user_id=? ORDER BY created_at DESC LIMIT 100").bind(identity.userId).all(); return { success: true, data: rows.results || [] }; }
  if (request.method !== 'POST') throw new UserSubmissionError(405, 'Phương thức không được hỗ trợ.');
  const body = await readJsonBody(request); if (['userId', 'user_id', 'ownerId', 'owner_id'].some((key) => key in body)) throw new UserSubmissionError(400, 'Không cho phép chỉ định người gửi.');
  const identity = await requireBetterAuthSession(request, env); const row = { full_name: text(body.full_name, 200), student_batch: text(body.student_batch, 80), major: text(body.major, 200), contact_info: text(body.contact_info, 300) };
  if (!row.full_name || !row.student_batch || !row.major || !row.contact_info) throw new UserSubmissionError(400, 'Vui lòng nhập đầy đủ thông tin đăng ký.');
  return insertSubmission(env, { kind: 'ctv_requests', payload: row, contactKey: row.contact_info.toLocaleLowerCase('vi-VN') }, identity);
};
export const handleModeratorNotification = async (request: Request, env: UserSubmissionEnv) => {
  if (request.method !== 'POST') throw new UserSubmissionError(405, 'Phương thức không được hỗ trợ.');
  const body = await readJsonBody(request), kind = String(body.kind || ''), recordId = String(body.recordId || '');
  if (!MODERATOR_KINDS.has(kind) || !recordId || recordId.length > 128) throw new UserSubmissionError(400, 'Thông tin thông báo không hợp lệ.');
  if (kind === 'lost_found_pending') { const id = Number(recordId); if (!Number.isSafeInteger(id) || id <= 0) throw new UserSubmissionError(400, 'Thông tin thông báo không hợp lệ.'); return notifyLostFoundModerators(env, id); }
  return notifyProtectedModerators(env, kind, recordId, await optionalBetterAuthIdentity(request, env));
};
export const userSubmissionErrorStatus = (error: unknown) => error instanceof BetterAuthIdentityError || error instanceof UserSubmissionError || error instanceof LostFoundError ? error.status : 500;
