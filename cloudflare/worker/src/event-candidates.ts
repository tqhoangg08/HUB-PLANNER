import {
  BetterAuthIdentityError,
  requireBetterAuthStaff,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import { hasEventCandidateCapability, type EventCandidateCapability } from './event-candidate-permissions.ts';
import {
  AdminEventMutationError,
  mutateAdminEvent,
  rollbackD1AdminEventCreate,
  validateAdminEventMutationPayload,
} from './admin-event-mutations.ts';
import type { AdminEventsEnv } from './admin-events.ts';
import {
  notifyEventCandidateModerators,
  type PrivateNotificationsEnv,
} from './private-notifications.ts';

export interface EventCandidatesEnv extends BetterAuthIdentityEnv, AdminEventsEnv {
  EVENT_CANDIDATE_INGEST_SECRET?: string;
  GROQ_API_KEY?: string;
  GROQ_API_KEY_2?: string;
  GROQ_API_KEY_3?: string;
  GROQ_API_KEY_4?: string;
  GROQ_API_KEY_5?: string;
  GROQ_MODEL?: string;
}

type CandidateStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 502 | 503;

export class EventCandidateError extends Error {
  readonly status: CandidateStatus;
  constructor(status: CandidateStatus, message: string) {
    super(message);
    this.name = 'EventCandidateError';
    this.status = status;
  }
}

interface StoredCandidate {
  id: number;
  created_at: string;
  source_name: string;
  post_url: string;
  raw_content: string;
  image_url: string | null;
  submitted_from: string | null;
  client_created_at: string | null;
  submitter_user_id: string | null;
  review_status: 'pending' | 'approved' | 'rejected';
  ai_is_event: number | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  ai_result_json: string | null;
  approved_event_id: number | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAGE_SIZE = 200;
const ANALYSIS_TIMEOUT_MS = 20_000;
const GROQ_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ID_PATTERN = /^\d{1,19}$/;
const CANDIDATE_COLUMNS = [
  'id', 'created_at', 'source_name', 'post_url', 'raw_content', 'image_url',
  'submitted_from', 'client_created_at', 'submitter_user_id', 'review_status',
  'ai_is_event', 'ai_confidence', 'ai_reason', 'ai_result_json',
  'approved_event_id', 'reviewed_at', 'reviewed_by_user_id',
].join(', ');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
const optionalText = (value: unknown, max: number) => {
  const text = cleanText(value, max);
  return text || null;
};
const asCandidateId = (value: unknown) => {
  const text = String(value || '').trim();
  if (!ID_PATTERN.test(text)) throw new EventCandidateError(400, 'Dữ liệu candidate không hợp lệ.');
  const id = Number(text);
  if (!Number.isSafeInteger(id) || id <= 0) throw new EventCandidateError(400, 'Dữ liệu candidate không hợp lệ.');
  return id;
};
const pageSize = (value: string | null) => {
  const parsed = Number(value || 200);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE_SIZE) : 200;
};

const readBody = async (request: Request) => {
  const contentType = String(request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new EventCandidateError(415, 'Yêu cầu phải sử dụng Content-Type application/json.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new EventCandidateError(413, 'Dữ liệu gửi lên quá lớn.');
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (!isRecord(value)) throw new Error();
    return value;
  } catch {
    throw new EventCandidateError(400, 'Dữ liệu gửi lên không hợp lệ.');
  }
};

const toApiCandidate = (row: StoredCandidate) => {
  let aiResult: unknown = null;
  try { aiResult = row.ai_result_json ? JSON.parse(row.ai_result_json) : null; }
  catch { aiResult = null; }
  return {
    id: row.id,
    created_at: row.created_at,
    source_name: row.source_name,
    post_url: row.post_url,
    raw_content: row.raw_content,
    image_url: row.image_url,
    submitted_from: row.submitted_from,
    client_created_at: row.client_created_at,
    review_status: row.review_status,
    ai_is_event: row.ai_is_event === null ? null : Boolean(row.ai_is_event),
    ai_confidence: row.ai_confidence,
    ai_reason: row.ai_reason,
    ai_result: aiResult,
    approved_event_id: row.approved_event_id,
    reviewed_at: row.reviewed_at,
  };
};

const candidateById = async (env: EventCandidatesEnv, id: number) => {
  const row = await env.DB.prepare(`SELECT ${CANDIDATE_COLUMNS} FROM event_candidates WHERE id = ?`)
    .bind(id).first<StoredCandidate>();
  return row || null;
};

const requireCapability = async (
  request: Request,
  env: EventCandidatesEnv,
  capability: EventCandidateCapability,
) => {
  const staff = await requireBetterAuthStaff(request, env);
  if (!hasEventCandidateCapability(staff.role, capability)) {
    throw new EventCandidateError(403, 'Không có quyền thực hiện thao tác này.');
  }
  return staff;
};

const boundedAnalysis = (value: unknown) => {
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

const groqKeys = (env: EventCandidatesEnv) => [
  env.GROQ_API_KEY, env.GROQ_API_KEY_2, env.GROQ_API_KEY_3,
  env.GROQ_API_KEY_4, env.GROQ_API_KEY_5,
].map((value) => String(value || '').trim()).filter(Boolean);

const analyzeCandidate = async (env: EventCandidatesEnv, id: number) => {
  const candidate = await candidateById(env, id);
  if (!candidate) throw new EventCandidateError(404, 'Không tìm thấy candidate.');
  const rawContent = cleanText(candidate.raw_content, 12_000);
  if (!rawContent) throw new EventCandidateError(400, 'Candidate chưa có nội dung để phân tích.');
  const keys = groqKeys(env);
  if (!keys.length) throw new EventCandidateError(503, 'Dịch vụ phân tích candidate tạm thời chưa sẵn sàng.');
  const prompt = [
    'Phân tích bài đăng sự kiện sinh viên. Chỉ trả về JSON hợp lệ.',
    'Không suy đoán. Các trường thiếu phải là null.',
    'Bao gồm is_event (boolean), confidence (0..1), reason (string ngắn) và các trường sự kiện nếu có.',
    `Nguồn: ${cleanText(candidate.source_name, 300)}`,
    `Nội dung: ${rawContent}`,
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
        signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
      });
      if (response.ok) break;
    } catch { response = null; }
  }
  if (!response?.ok) throw new EventCandidateError(502, 'Dịch vụ phân tích candidate tạm thời không phản hồi.');
  let responseBody: { choices?: Array<{ message?: { content?: unknown } }> };
  try { responseBody = await response.json() as typeof responseBody; }
  catch { throw new EventCandidateError(502, 'Dịch vụ phân tích candidate trả về dữ liệu không hợp lệ.'); }
  let parsed: unknown;
  try {
    const content = responseBody.choices?.[0]?.message?.content;
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch { throw new EventCandidateError(502, 'Dịch vụ phân tích candidate trả về dữ liệu không hợp lệ.'); }
  const aiResult = boundedAnalysis(parsed);
  const confidence = typeof aiResult.confidence === 'number'
    ? Math.max(0, Math.min(1, aiResult.confidence)) : null;
  const result = await env.DB.prepare(`UPDATE event_candidates SET
      ai_is_event = ?, ai_confidence = ?, ai_reason = ?, ai_result_json = ?
    WHERE id = ? RETURNING ${CANDIDATE_COLUMNS}`)
    .bind(
      typeof aiResult.is_event === 'boolean' ? (aiResult.is_event ? 1 : 0) : null,
      confidence,
      typeof aiResult.reason === 'string' ? aiResult.reason.slice(0, 1_000) : null,
      JSON.stringify(aiResult),
      id,
    ).first<StoredCandidate>();
  if (!result) throw new EventCandidateError(404, 'Không tìm thấy candidate.');
  return { success: true, candidate: toApiCandidate(result), ai_result: aiResult };
};

const approvalMutationId = async (candidateId: number) => {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(`event-candidate-approval:${candidateId}`),
  ));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].slice(0, 16).map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const approveCandidate = async (
  env: EventCandidatesEnv,
  staff: Awaited<ReturnType<typeof requireBetterAuthStaff>>,
  id: number,
  body: Record<string, unknown>,
) => {
  if (!isRecord(body.draft)) throw new EventCandidateError(400, 'Bản nháp sự kiện không hợp lệ.');
  let eventPayload;
  try { eventPayload = validateAdminEventMutationPayload(body.draft, 'create'); }
  catch (error) {
    if (error instanceof AdminEventMutationError) throw new EventCandidateError(error.status, error.message);
    throw error;
  }
  const candidate = await candidateById(env, id);
  if (!candidate) throw new EventCandidateError(404, 'Không tìm thấy candidate.');
  if (candidate.review_status === 'approved' && Number.isSafeInteger(Number(candidate.approved_event_id))) {
    return { success: true, candidate: toApiCandidate(candidate), eventId: Number(candidate.approved_event_id), replayed: true };
  }
  if (candidate.review_status !== 'pending') throw new EventCandidateError(409, 'Candidate này đã được xử lý.');

  const mutationId = await approvalMutationId(id);
  const event = await mutateAdminEvent(env, 'create', eventPayload, undefined, fetch, {
    mutationId, userId: staff.userId,
  });
  const eventId = Number(event.data[0]?.id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new EventCandidateError(502, 'Không thể tạo sự kiện chính thức.');
  const reviewedAt = new Date().toISOString();
  const updated = await env.DB.prepare(`UPDATE event_candidates SET
      review_status = 'approved', approved_event_id = ?, reviewed_at = ?, reviewed_by_user_id = ?
    WHERE id = ? AND review_status = 'pending'
    RETURNING ${CANDIDATE_COLUMNS}`)
    .bind(eventId, reviewedAt, staff.userId, id).first<StoredCandidate>();
  if (updated) {
    return { success: true, candidate: toApiCandidate(updated), event: event.data[0], replayed: Boolean(event.replayed) };
  }

  const concurrent = await candidateById(env, id);
  if (concurrent?.review_status === 'approved' && Number(concurrent.approved_event_id) === eventId) {
    return { success: true, candidate: toApiCandidate(concurrent), event: event.data[0], replayed: true };
  }
  if (!event.replayed) {
    try { await rollbackD1AdminEventCreate(env, eventId, mutationId, staff.userId); }
    catch {
      throw new EventCandidateError(502, 'Không thể hoàn tất duyệt candidate một cách an toàn.');
    }
  }
  throw new EventCandidateError(409, 'Candidate này vừa được xử lý bởi một thao tác khác.');
};

const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
const secureEqual = async (left: string, right: string) => {
  if (!left || !right) return false;
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  const av = new Uint8Array(a); const bv = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < av.length; index++) difference |= av[index] ^ bv[index];
  return difference === 0;
};

const requireIngestSecret = async (request: Request, env: EventCandidatesEnv) => {
  const configured = String(env.EVENT_CANDIDATE_INGEST_SECRET || '');
  const authorization = String(request.headers.get('Authorization') || '');
  const provided = authorization.replace(/^Bearer\s+/i, '');
  if (!authorization.toLowerCase().startsWith('bearer ') || !(await secureEqual(configured, provided))) {
    throw new EventCandidateError(401, 'Unauthorized');
  }
};

const normalizeTimestamp = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const ingestCandidate = async (
  request: Request,
  env: EventCandidatesEnv,
  defer: (task: Promise<unknown>) => void,
) => {
  await requireIngestSecret(request, env);
  const body = await readBody(request);
  if ('user_id' in body || 'userId' in body || 'submitter_user_id' in body) {
    throw new EventCandidateError(400, 'Không cho phép chỉ định người gửi.');
  }
  const sourceName = cleanText(body.source_name, 300);
  const postUrl = cleanText(body.post_url, 2_048);
  const rawContent = cleanText(body.raw_content, 20_000);
  if (!sourceName || !postUrl || !rawContent) {
    throw new EventCandidateError(400, 'source_name, post_url, raw_content là bắt buộc.');
  }
  const existing = await env.DB.prepare(`SELECT ${CANDIDATE_COLUMNS} FROM event_candidates
    WHERE post_url = ? ORDER BY created_at DESC, id DESC LIMIT 1`)
    .bind(postUrl).first<StoredCandidate>();
  if (existing) return { httpStatus: 200, success: true, candidate: toApiCandidate(existing), message: 'Candidate already exists' };

  const allocated = await env.DB.prepare(`UPDATE event_candidate_id_sequence SET next_id = next_id + 1
    WHERE singleton = 1 RETURNING next_id - 1 AS id`).first<{ id: number }>();
  const id = Number(allocated?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new EventCandidateError(503, 'Dịch vụ lưu candidate D1 tạm thời không khả dụng.');
  const createdAt = new Date().toISOString();
  let inserted: StoredCandidate | null = null;
  try {
    inserted = await env.DB.prepare(`INSERT INTO event_candidates (
        id, created_at, source_name, post_url, raw_content, image_url,
        submitted_from, client_created_at, submitter_user_id, review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending')
      RETURNING ${CANDIDATE_COLUMNS}`)
      .bind(
        id, createdAt, sourceName, postUrl, rawContent,
        optionalText(body.image_url, 2_048),
        optionalText(body.submitted_from, 120) || 'chrome_extension',
        normalizeTimestamp(body.client_created_at),
      ).first<StoredCandidate>();
  } catch {
    const concurrent = await env.DB.prepare(`SELECT ${CANDIDATE_COLUMNS} FROM event_candidates
      WHERE post_url = ? ORDER BY created_at DESC, id DESC LIMIT 1`)
      .bind(postUrl).first<StoredCandidate>();
    if (concurrent) return { httpStatus: 200, success: true, candidate: toApiCandidate(concurrent), message: 'Candidate already exists' };
    throw new EventCandidateError(503, 'Dịch vụ lưu candidate D1 tạm thời không khả dụng.');
  }
  if (!inserted) throw new EventCandidateError(503, 'Dịch vụ lưu candidate D1 tạm thời không khả dụng.');

  let candidate = toApiCandidate(inserted);
  let aiResult: unknown = null;
  let analyzeError: string | null = null;
  try {
    const analyzed = await analyzeCandidate(env, id);
    candidate = analyzed.candidate;
    aiResult = analyzed.ai_result;
  } catch (error) {
    analyzeError = error instanceof Error ? error.message : 'Auto analyze failed';
    console.warn(JSON.stringify({ event: 'event_candidate_auto_analysis_failed', candidateId: id }));
  }
  defer(notifyEventCandidateModerators(env as PrivateNotificationsEnv, sourceName).catch(() => {
    console.warn(JSON.stringify({ event: 'event_candidate_moderator_notification_failed', candidateId: id }));
  }));
  console.info(JSON.stringify({ event: 'event_candidate_submitted', candidateId: id }));
  return { httpStatus: 201, success: true, candidate, ai_result: aiResult, analyzed: Boolean(aiResult), analyze_error: analyzeError };
};

export const handleEventCandidateIngest = async (
  request: Request,
  env: EventCandidatesEnv,
  defer: (task: Promise<unknown>) => void = (task) => { void task; },
) => {
  if (request.method !== 'POST') throw new EventCandidateError(405, 'Phương thức không được hỗ trợ.');
  return ingestCandidate(request, env, defer);
};

export const handleAdminEventCandidates = async (
  request: Request,
  url: URL,
  env: EventCandidatesEnv,
) => {
  if (request.method === 'GET') {
    await requireCapability(request, env, 'read');
    const idValue = url.searchParams.get('id');
    if (idValue) {
      const candidate = await candidateById(env, asCandidateId(idValue));
      return { success: true, candidates: candidate ? [toApiCandidate(candidate)] : [] };
    }
    const status = String(url.searchParams.get('review_status') || 'all').trim().toLowerCase();
    if (status !== 'all' && !['pending', 'approved', 'rejected'].includes(status)) {
      throw new EventCandidateError(400, 'Trạng thái candidate không hợp lệ.');
    }
    const query = status === 'all'
      ? `SELECT ${CANDIDATE_COLUMNS} FROM event_candidates ORDER BY created_at DESC, id DESC LIMIT ?`
      : `SELECT ${CANDIDATE_COLUMNS} FROM event_candidates WHERE review_status = ? ORDER BY created_at DESC, id DESC LIMIT ?`;
    const statement = status === 'all'
      ? env.DB.prepare(query).bind(pageSize(url.searchParams.get('limit')))
      : env.DB.prepare(query).bind(status, pageSize(url.searchParams.get('limit')));
    const rows = await statement.all<StoredCandidate>();
    return { success: true, candidates: (rows.results || []).map(toApiCandidate) };
  }
  if (request.method !== 'POST') throw new EventCandidateError(405, 'Phương thức không được hỗ trợ.');
  const body = await readBody(request);
  const id = asCandidateId(body.id);
  const action = String(body.action || '');
  if (action === 'analyze') {
    await requireCapability(request, env, 'analyze');
    return analyzeCandidate(env, id);
  }
  if (action === 'reject') {
    const staff = await requireCapability(request, env, 'reject');
    const row = await candidateById(env, id);
    if (!row) throw new EventCandidateError(404, 'Không tìm thấy candidate.');
    if (row.review_status === 'approved') throw new EventCandidateError(409, 'Candidate này đã được duyệt.');
    if (row.review_status === 'rejected') return { success: true, candidate: toApiCandidate(row), replayed: true };
    const updated = await env.DB.prepare(`UPDATE event_candidates SET
        review_status = 'rejected', reviewed_at = ?, reviewed_by_user_id = ?
      WHERE id = ? AND review_status = 'pending'
      RETURNING ${CANDIDATE_COLUMNS}`)
      .bind(new Date().toISOString(), staff.userId, id).first<StoredCandidate>();
    if (!updated) throw new EventCandidateError(409, 'Candidate này vừa được xử lý bởi một thao tác khác.');
    return { success: true, candidate: toApiCandidate(updated) };
  }
  if (action === 'approve') {
    const staff = await requireCapability(request, env, 'approve');
    return approveCandidate(env, staff, id, body);
  }
  throw new EventCandidateError(400, 'Thao tác candidate chưa được hỗ trợ bởi API quản trị.');
};

export const eventCandidateErrorStatus = (error: unknown) => {
  if (error instanceof EventCandidateError || error instanceof BetterAuthIdentityError) return error.status;
  return 500;
};
