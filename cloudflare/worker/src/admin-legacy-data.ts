import {
  BetterAuthIdentityError,
  requireBetterAuthStaff,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import { hasEventCandidateCapability, type EventCandidateCapability } from './event-candidate-permissions.ts';
import {
  AdminEventMutationError,
  mutateAdminEvent,
  validateAdminEventMutationPayload,
} from './admin-event-mutations.ts';
import type { AdminEventsEnv } from './admin-events.ts';

/**
 * Narrow, server-only read/write bridges for admin modules that have not yet
 * moved their data store into D1.  These are deliberately feature endpoints,
 * not a browser-accessible PostgREST proxy: every table, field and operation
 * is fixed in this module and every request is authorized from Better Auth.
 */
export interface AdminLegacyDataEnv extends BetterAuthIdentityEnv, AdminEventsEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GROQ_API_KEY?: string;
  GROQ_API_KEY_2?: string;
  GROQ_API_KEY_3?: string;
  GROQ_API_KEY_4?: string;
  GROQ_API_KEY_5?: string;
  GROQ_MODEL?: string;
}

type AdminLegacyStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 502 | 503;

export class AdminLegacyDataError extends Error {
  readonly status: AdminLegacyStatus;

  constructor(status: AdminLegacyStatus, message: string) {
    super(message);
    this.name = 'AdminLegacyDataError';
    this.status = status;
  }
}

const MAX_BODY_BYTES = 64 * 1024;
const EVENT_CANDIDATE_ANALYSIS_TIMEOUT_MS = 20_000;
const GROQ_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_PAGE_SIZE = 100;
const ID_PATTERN = /^[a-zA-Z0-9-]{1,128}$/;
const REPORT_TABLES = new Set([
  'course_reports',
  'bug_reports',
  'ctv_requests',
  'event_reports',
  'feedback',
  'canva_pro_requests',
]);

const REPORT_COLUMNS: Record<string, string> = {
  course_reports: 'id,user_id,status,created_at,full_name,student_code,email,subject_name,course_code,error_description,suggested_correction',
  bug_reports: 'id,user_id,status,created_at,full_name,student_code,email,error_location,description',
  ctv_requests: 'id,user_id,status,created_at,full_name,student_code,email,student_batch,major,contact_info',
  event_reports: 'id,user_id,status,created_at,full_name,student_code,email,event_id,event_name,organizer,issue_description',
  feedback: 'id,user_id,status,created_at,full_name,student_code,email,type,content,contact',
  canva_pro_requests: 'id,user_id,status,created_at,email,full_name,student_batch,major,note,reviewed_at',
};

const ACTIVITY_COLUMNS = 'id,created_at,user_id,user_email,user_role,action,action_label,target_table,table_name,target_id,record_id,page_path,status,metadata,old_data,new_data,details,error_message,ip_address,device_info';
const LOST_FOUND_COLUMNS = 'id,created_at,type,title,description,location,contact_info,user_name,image_url,status,is_deleted,user_id';
const CANDIDATE_COLUMNS = 'id,source_name,post_url,raw_content,image_url,submitted_from,client_created_at,review_status,ai_is_event,ai_confidence,ai_reason,ai_result,approved_event_id,reviewed_at,created_at';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readConfig = (env: AdminLegacyDataEnv) => {
  const baseUrl = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!baseUrl || !serviceRoleKey) {
    throw new AdminLegacyDataError(503, 'Dịch vụ dữ liệu quản trị tạm thời chưa sẵn sàng.');
  }
  return { baseUrl, serviceRoleKey };
};

const supabaseRequest = async (
  env: AdminLegacyDataEnv,
  path: string,
  init: RequestInit = {},
) => {
  const { baseUrl, serviceRoleKey } = readConfig(env);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      headers: {
        Accept: 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...init.headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AdminLegacyDataError(
        response.status >= 400 && response.status < 500 ? 400 : 502,
        'Không thể xử lý dữ liệu quản trị.',
      );
    }
    return response;
  } catch (error) {
    if (error instanceof AdminLegacyDataError) throw error;
    throw new AdminLegacyDataError(503, 'Dịch vụ dữ liệu quản trị tạm thời chưa sẵn sàng.');
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const readBody = async (request: Request) => {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new AdminLegacyDataError(413, 'Dữ liệu gửi lên quá lớn.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new AdminLegacyDataError(413, 'Dữ liệu gửi lên quá lớn.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdminLegacyDataError(400, 'Dữ liệu gửi lên không hợp lệ.');
  }
};

const page = (value: string | null, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const pageSize = (value: string | null, fallback = 30) =>
  Math.max(1, Math.min(MAX_PAGE_SIZE, page(value, fallback)));

const countFromRange = (value: string | null) => {
  const match = String(value || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) + 1 : 0;
};

const candidateApprovalMutationId = async (candidateId: string) => {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`event-candidate-approval:${candidateId}`),
  ));
  // This is a deterministic UUID-shaped idempotency key. It contains no
  // candidate/user value and makes concurrent approval attempts converge on
  // exactly one server-side event creation reservation.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].slice(0, 16).map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const eventCandidateRow = async (env: AdminLegacyDataEnv, id: string) => {
  const response = await supabaseRequest(
    env,
    `/rest/v1/event_candidates?select=${CANDIDATE_COLUMNS}&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  const rows = await response.json() as unknown[];
  return isRecord(rows[0]) ? rows[0] : null;
};

const eventCandidateGroqKeys = (env: AdminLegacyDataEnv) => [
  env.GROQ_API_KEY,
  env.GROQ_API_KEY_2,
  env.GROQ_API_KEY_3,
  env.GROQ_API_KEY_4,
  env.GROQ_API_KEY_5,
].map((value) => String(value || '').trim()).filter(Boolean);

const boundedCandidateAnalysis = (value: unknown) => {
  if (!isRecord(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.length > 80) continue;
    if (typeof entry === 'string') result[key] = entry.slice(0, 4_000);
    else if (typeof entry === 'boolean') result[key] = entry;
    else if (typeof entry === 'number' && Number.isFinite(entry)) result[key] = entry;
    else if (entry === null) result[key] = null;
  }
  return result;
};

const analyzeCandidate = async (env: AdminLegacyDataEnv, id: string) => {
  const candidate = await eventCandidateRow(env, id);
  if (!candidate) throw new AdminLegacyDataError(404, 'Không tìm thấy candidate.');
  const rawContent = typeof candidate.raw_content === 'string' ? candidate.raw_content.trim() : '';
  if (!rawContent) throw new AdminLegacyDataError(400, 'Candidate chưa có nội dung để phân tích.');
  const keys = eventCandidateGroqKeys(env);
  if (!keys.length) throw new AdminLegacyDataError(503, 'Dịch vụ phân tích candidate tạm thời chưa sẵn sàng.');

  const prompt = [
    'Phân tích bài đăng sự kiện sinh viên. Chỉ trả về JSON hợp lệ.',
    'Không suy đoán. Các trường thiếu phải là null.',
    'Bao gồm is_event (boolean), confidence (0..1), reason (string ngắn) và các trường sự kiện nếu có.',
    `Nguồn: ${String(candidate.source_name || '').slice(0, 300)}`,
    `Nội dung: ${rawContent.slice(0, 12_000)}`,
  ].join('\n');

  let response: Response | null = null;
  for (const key of keys.slice(0, 3)) {
    try {
      response = await fetch(GROQ_COMPLETIONS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: String(env.GROQ_MODEL || 'openai/gpt-oss-20b'),
          messages: [
            { role: 'system', content: 'Bạn là bộ phân loại sự kiện HUB Planner. Chỉ trả JSON.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_completion_tokens: 1_500,
        }),
        signal: AbortSignal.timeout(EVENT_CANDIDATE_ANALYSIS_TIMEOUT_MS),
      });
      if (response.ok) break;
    } catch {
      response = null;
    }
  }
  if (!response?.ok) throw new AdminLegacyDataError(502, 'Dịch vụ phân tích candidate tạm thời không phản hồi.');
  let payload: { choices?: Array<{ message?: { content?: unknown } }> };
  try { payload = await response.json() as typeof payload; }
  catch { throw new AdminLegacyDataError(502, 'Dịch vụ phân tích candidate trả về dữ liệu không hợp lệ.'); }
  const rawResult = payload.choices?.[0]?.message?.content;
  let parsed: unknown;
  try { parsed = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult; }
  catch { throw new AdminLegacyDataError(502, 'Dịch vụ phân tích candidate trả về dữ liệu không hợp lệ.'); }
  const aiResult = boundedCandidateAnalysis(parsed);
  const confidence = typeof aiResult.confidence === 'number'
    ? Math.max(0, Math.min(1, aiResult.confidence))
    : null;
  const updateResponse = await supabaseRequest(env, `/rest/v1/event_candidates?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      ai_is_event: typeof aiResult.is_event === 'boolean' ? aiResult.is_event : null,
      ai_confidence: confidence,
      ai_reason: typeof aiResult.reason === 'string' ? aiResult.reason.slice(0, 1_000) : null,
      ai_result: aiResult,
    }),
  });
  const rows = await updateResponse.json() as unknown[];
  return { success: true, candidate: rows[0] || null, ai_result: aiResult };
};

const rollbackCandidateApprovalEvent = async (
  env: AdminLegacyDataEnv,
  eventId: number,
  mutationId: string,
  userId: string,
) => {
  // Approval is source-authoritative. If linking the candidate cannot commit,
  // remove the just-created source event and its D1 read mirrors/receipt so a
  // later retry cannot replay a now-rolled-back event.
  await supabaseRequest(env, `/rest/v1/events?id=eq.${eventId}`, { method: 'DELETE' });
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_events WHERE id = ?').bind(eventId),
    env.DB.prepare('DELETE FROM public_events WHERE id = ?').bind(eventId),
    env.DB.prepare('DELETE FROM admin_event_mutations WHERE mutation_id = ? AND user_id = ? AND event_id = ?')
      .bind(mutationId, userId, eventId),
  ]);
};

const approveCandidate = async (
  env: AdminLegacyDataEnv,
  staff: Awaited<ReturnType<typeof requireBetterAuthStaff>>,
  id: string,
  body: Record<string, unknown>,
) => {
  if (!isRecord(body.draft)) {
    throw new AdminLegacyDataError(400, 'Bản nháp sự kiện không hợp lệ.');
  }

  let eventPayload;
  try {
    eventPayload = validateAdminEventMutationPayload(body.draft, 'create');
  } catch (error) {
    if (error instanceof AdminEventMutationError) {
      console.warn(JSON.stringify({ event: 'event_candidate_approval_validation_rejected', rejection: error.message }));
      throw new AdminLegacyDataError(error.status, error.message);
    }
    throw error;
  }

  const candidate = await eventCandidateRow(env, id);
  if (!candidate) throw new AdminLegacyDataError(404, 'Không tìm thấy candidate.');
  if (String(candidate.review_status || '') === 'approved' && Number.isSafeInteger(Number(candidate.approved_event_id))) {
    return { success: true, candidate, eventId: Number(candidate.approved_event_id), replayed: true };
  }
  if (String(candidate.review_status || 'pending') !== 'pending') {
    throw new AdminLegacyDataError(409, 'Candidate này đã được xử lý.');
  }

  const mutationId = await candidateApprovalMutationId(id);
  const event = await mutateAdminEvent(env, 'create', eventPayload, undefined, fetch, {
    mutationId,
    userId: staff.userId,
  });
  const eventId = Number(event.data[0]?.id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    throw new AdminLegacyDataError(502, 'Không thể tạo sự kiện chính thức.');
  }

  const update = await supabaseRequest(env, `/rest/v1/event_candidates?id=eq.${encodeURIComponent(id)}&review_status=eq.pending`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ review_status: 'approved', approved_event_id: eventId, reviewed_at: new Date().toISOString() }),
  });
  const rows = await update.json() as unknown[];
  const updatedCandidate = isRecord(rows[0]) ? rows[0] : null;
  if (!updatedCandidate) {
    try {
      await rollbackCandidateApprovalEvent(env, eventId, mutationId, staff.userId);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'event_candidate_approval_compensation_failed',
        error: error instanceof Error ? error.message : String(error),
      }));
      throw new AdminLegacyDataError(502, 'Không thể hoàn tất duyệt candidate một cách an toàn.');
    }
    throw new AdminLegacyDataError(409, 'Candidate này vừa được xử lý bởi một thao tác khác.');
  }
  return { success: true, candidate: updatedCandidate, event: event.data[0], replayed: Boolean(event.replayed) };
};

const requireAdmin = async (request: Request, env: AdminLegacyDataEnv) => {
  const staff = await requireBetterAuthStaff(request, env);
  if (staff.role !== 'admin') {
    throw new AdminLegacyDataError(403, 'Không có quyền thực hiện thao tác này.');
  }
  return staff;
};

const requireEventCandidateCapability = async (
  request: Request,
  env: AdminLegacyDataEnv,
  capability: EventCandidateCapability,
) => {
  const staff = await requireBetterAuthStaff(request, env);
  if (!hasEventCandidateCapability(staff.role, capability)) {
    throw new AdminLegacyDataError(403, 'Không có quyền thực hiện thao tác này.');
  }
  return staff;
};

const reportTable = (value: string | null) => {
  const table = String(value || '').trim();
  if (!REPORT_TABLES.has(table)) throw new AdminLegacyDataError(404, 'Không tìm thấy loại báo cáo.');
  return table;
};

export const handleAdminLegacyData = async (
  request: Request,
  url: URL,
  env: AdminLegacyDataEnv,
) => {
  const pathname = url.pathname;

  if (pathname === '/api/admin/v1/reports') {
    const staff = await requireBetterAuthStaff(request, env);
    const table = reportTable(url.searchParams.get('kind'));
    if (request.method === 'GET') {
      const size = pageSize(url.searchParams.get('limit'));
      const offset = page(url.searchParams.get('offset'));
      const query = new URL(`/rest/v1/${table}`, 'https://supabase.invalid');
      query.searchParams.set('select', REPORT_COLUMNS[table]);
      query.searchParams.set('order', 'created_at.desc');
      query.searchParams.set('limit', String(size));
      query.searchParams.set('offset', String(offset));
      const response = await supabaseRequest(env, `${query.pathname}${query.search}`, {
        headers: { Prefer: 'count=exact' },
      });
      return { success: true, data: await response.json(), total: countFromRange(response.headers.get('content-range')), role: staff.role };
    }

    await requireAdmin(request, env);
    const body = await readBody(request);
    if (!isRecord(body)) {
      throw new AdminLegacyDataError(400, 'Dữ liệu báo cáo không hợp lệ.');
    }
    if (request.method === 'POST') {
      if (body.operation !== 'resolve-all') throw new AdminLegacyDataError(400, 'Thao tác báo cáo không hợp lệ.');
      const status = typeof body.status === 'string' ? body.status.trim().slice(0, 32) : '';
      if (!status) throw new AdminLegacyDataError(400, 'Trạng thái báo cáo không hợp lệ.');
      const query = new URL(`/rest/v1/${table}`, 'https://supabase.invalid');
      query.searchParams.set('status', 'not.in.(ok,resolved,contacted,approved,rejected)');
      const response = await supabaseRequest(env, `${query.pathname}${query.search}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ status }),
      });
      const rows = await response.json() as unknown[];
      return { success: true, updated: rows.length };
    }
    const id = typeof body.id === 'string' || typeof body.id === 'number' ? String(body.id) : '';
    if (!ID_PATTERN.test(id)) throw new AdminLegacyDataError(400, 'Dữ liệu báo cáo không hợp lệ.');
    if (request.method === 'PATCH') {
      const status = typeof body.status === 'string' ? body.status.trim().slice(0, 32) : '';
      if (!status) throw new AdminLegacyDataError(400, 'Trạng thái báo cáo không hợp lệ.');
      const response = await supabaseRequest(env, `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ status }),
      });
      const rows = await response.json() as unknown[];
      return { success: true, data: rows[0] || null };
    }
    if (request.method === 'DELETE') {
      const response = await supabaseRequest(env, `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      await response.body?.cancel();
      return { success: true };
    }
    throw new AdminLegacyDataError(405, 'Phương thức không được hỗ trợ.');
  }

  if (pathname === '/api/admin/v1/activity') {
    await requireAdmin(request, env);
    if (request.method !== 'GET') throw new AdminLegacyDataError(405, 'Phương thức không được hỗ trợ.');
    const size = pageSize(url.searchParams.get('limit'), 25);
    const offset = page(url.searchParams.get('offset'));
    const query = new URL('/rest/v1/activity_logs', 'https://supabase.invalid');
    query.searchParams.set('select', ACTIVITY_COLUMNS);
    query.searchParams.set('action', 'neq.view_page');
    query.searchParams.set('order', 'created_at.desc');
    query.searchParams.set('limit', String(size));
    query.searchParams.set('offset', String(offset));
    const response = await supabaseRequest(env, `${query.pathname}${query.search}`, {
      headers: { Prefer: 'count=exact' },
    });
    return { success: true, data: await response.json(), total: countFromRange(response.headers.get('content-range')) };
  }

  if (pathname === '/api/admin/v1/lost-found') {
    const staff = await requireBetterAuthStaff(request, env);
    if (request.method === 'GET') {
      const size = pageSize(url.searchParams.get('limit'), 24);
      const offset = page(url.searchParams.get('offset'));
      const type = String(url.searchParams.get('type') || '').toUpperCase();
      const id = Number(url.searchParams.get('id') || 0);
      const query = new URL('/rest/v1/lost_found_items', 'https://supabase.invalid');
      query.searchParams.set('select', LOST_FOUND_COLUMNS);
      query.searchParams.set('is_deleted', 'eq.false');
      if (type === 'FOUND' || type === 'LOST') query.searchParams.set('type', `eq.${type}`);
      if (Number.isSafeInteger(id) && id > 0) query.searchParams.set('id', `eq.${id}`);
      query.searchParams.set('order', 'created_at.desc');
      query.searchParams.set('limit', String(size));
      query.searchParams.set('offset', String(offset));
      const response = await supabaseRequest(env, `${query.pathname}${query.search}`, { headers: { Prefer: 'count=exact' } });
      return { success: true, data: await response.json(), total: countFromRange(response.headers.get('content-range')), role: staff.role };
    }
    await requireAdmin(request, env);
    if (request.method === 'POST') {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 4_300_000) {
        throw new AdminLegacyDataError(413, 'Ảnh tìm đồ quá lớn.');
      }
      let upload: Record<string, unknown>;
      try { upload = JSON.parse(raw) as Record<string, unknown>; }
      catch { throw new AdminLegacyDataError(400, 'Dữ liệu ảnh không hợp lệ.'); }
      if (upload.operation !== 'upload-image') throw new AdminLegacyDataError(400, 'Thao tác tìm đồ không hợp lệ.');
      const contentType = String(upload.contentType || '').toLowerCase();
      const base64 = String(upload.base64 || '');
      if (!/^image\/(jpeg|png|webp|gif)$/.test(contentType) || !base64 || base64.length > 4_200_000) {
        throw new AdminLegacyDataError(400, 'Dữ liệu ảnh không hợp lệ.');
      }
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0)); }
      catch { throw new AdminLegacyDataError(400, 'Dữ liệu ảnh không hợp lệ.'); }
      if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new AdminLegacyDataError(413, 'Ảnh tìm đồ quá lớn.');
      const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
      const objectName = `admin-${crypto.randomUUID()}.${extension}`;
      const response = await supabaseRequest(env, `/storage/v1/object/lost_found_images/${objectName}`, {
        method: 'POST', headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, body: bytes,
      });
      await response.body?.cancel();
      const { baseUrl } = readConfig(env);
      return { success: true, publicUrl: `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/lost_found_images/${objectName}` };
    }
    const body = await readBody(request);
    if (!isRecord(body) || !Number.isSafeInteger(Number(body.id)) || Number(body.id) <= 0) {
      throw new AdminLegacyDataError(400, 'Dữ liệu tìm đồ không hợp lệ.');
    }
    const id = Number(body.id);
    const patch: Record<string, unknown> = {};
    if (request.method === 'PATCH') {
      if (typeof body.status === 'string') patch.status = body.status.trim().slice(0, 32);
      if (body.is_deleted === true) patch.is_deleted = true;
      for (const field of ['title', 'description', 'location', 'contact_info', 'user_name', 'image_url']) {
        if (typeof body[field] === 'string' || body[field] === null) patch[field] = body[field];
      }
      if (Object.keys(patch).length === 0) throw new AdminLegacyDataError(400, 'Dữ liệu cập nhật không hợp lệ.');
      await supabaseRequest(env, `/rest/v1/lost_found_items?id=eq.${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      return { success: true };
    }
    throw new AdminLegacyDataError(405, 'Phương thức không được hỗ trợ.');
  }

  if (pathname === '/api/admin/v1/event-candidates') {
    if (request.method === 'POST') {
      const body = await readBody(request);
      if (!isRecord(body)) throw new AdminLegacyDataError(400, 'Dữ liệu candidate không hợp lệ.');
      const action = typeof body.action === 'string' ? body.action : '';
      const id = typeof body.id === 'string' || typeof body.id === 'number' ? String(body.id) : '';
      if (!id || !ID_PATTERN.test(id)) throw new AdminLegacyDataError(400, 'Dữ liệu candidate không hợp lệ.');
      if (action === 'reject') {
        await requireEventCandidateCapability(request, env, 'reject');
        const response = await supabaseRequest(env, `/rest/v1/event_candidates?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ review_status: 'rejected', reviewed_at: new Date().toISOString() }),
        });
        const rows = await response.json() as unknown[];
        return { success: true, candidate: rows[0] || null };
      }
      if (action === 'approve') {
        const staff = await requireEventCandidateCapability(request, env, 'approve');
        return approveCandidate(env, staff, id, body);
      }
      if (action === 'analyze') {
        await requireEventCandidateCapability(request, env, 'analyze');
        return analyzeCandidate(env, id);
      }
      throw new AdminLegacyDataError(400, 'Thao tác candidate chưa được hỗ trợ bởi API quản trị.');
    }
    if (request.method !== 'GET') throw new AdminLegacyDataError(405, 'Phương thức không được hỗ trợ.');
    await requireEventCandidateCapability(request, env, 'read');
    const query = new URL('/rest/v1/event_candidates', 'https://supabase.invalid');
    query.searchParams.set('select', CANDIDATE_COLUMNS);
    query.searchParams.set('order', 'created_at.desc');
    query.searchParams.set('limit', String(pageSize(url.searchParams.get('limit'), 200)));
    const status = String(url.searchParams.get('review_status') || 'all').trim();
    if (status && status !== 'all') query.searchParams.set('review_status', `eq.${encodeURIComponent(status)}`);
    const response = await supabaseRequest(env, `${query.pathname}${query.search}`);
    return { success: true, candidates: await response.json() };
  }

  throw new AdminLegacyDataError(404, 'Không tìm thấy endpoint quản trị.');
};

export const adminLegacyDataErrorStatus = (error: unknown) => {
  if (error instanceof AdminLegacyDataError || error instanceof BetterAuthIdentityError) return error.status;
  return 500;
};
