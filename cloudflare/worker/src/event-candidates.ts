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
import { predictEventDrl, type EventDrlEnv, type EventDrlPrediction } from './event-drl-prediction.ts';
import {
  notifyEventCandidateModerators,
  type PrivateNotificationsEnv,
} from './private-notifications.ts';

export interface EventCandidatesEnv extends BetterAuthIdentityEnv, AdminEventsEnv, EventDrlEnv {
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

interface StoredDrlPrediction {
  candidate_id: number;
  state: 'pending' | 'completed' | 'failed';
  rule_id: string | null;
  confidence: number | null;
  confidence_label: string | null;
  reason_code: string | null;
  historical_support_count: number | null;
  closest_matches_json: string | null;
  section: string | null;
  content: string | null;
  condition_text: string | null;
  points: number | null;
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

const toApiCandidate = (row: StoredCandidate, drl: StoredDrlPrediction | null = null) => {
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
    drl_prediction: drl ? {
      state: drl.state, rule_id: drl.rule_id, confidence: drl.confidence,
      confidence_label: drl.confidence_label, reason_code: drl.reason_code,
      section: drl.section, content: drl.content, condition_text: drl.condition_text, points: drl.points,
      historical_support_count: drl.historical_support_count,
      closest_matches: (() => {
        try { return JSON.parse(drl.closest_matches_json || '[]') as string[]; }
        catch { return []; }
      })(),
    } : null,
    approved_event_id: row.approved_event_id,
    reviewed_at: row.reviewed_at,
  };
};

const candidateDrl = (env: EventCandidatesEnv, id: number) => env.DB.prepare(
  `SELECT p.candidate_id,p.state,p.rule_id,p.confidence,p.confidence_label,p.reason_code,
    p.historical_support_count,p.closest_matches_json,r.section,r.content,r.condition_text,r.points
    FROM event_candidate_drl_predictions p LEFT JOIN drl_rules r ON r.rule_id=p.rule_id AND r.active=1
    WHERE p.candidate_id=?`,
).bind(id).first<StoredDrlPrediction>();

type CandidatePredictionStatus = 'pending' | 'completed' | 'failed' | null;
interface CandidatePredictionState {
  state: Exclude<CandidatePredictionStatus, null>;
  fingerprint: string | null;
  rule_id: string | null;
  updated_at: string;
  cached_source_version: string | null;
  cached_rule_id: string | null;
  active_rule_id: string | null;
}

const PENDING_PREDICTION_STALE_MS = 2 * 60_000;
const candidatePredictionState = (env: EventCandidatesEnv, id: number) => env.DB.prepare(`
  SELECT p.state,p.fingerprint,p.rule_id,p.updated_at,
    cache.source_version AS cached_source_version,cache.rule_id AS cached_rule_id,
    r.rule_id AS active_rule_id
  FROM event_candidate_drl_predictions p
  LEFT JOIN event_drl_prediction_cache cache ON cache.fingerprint=p.fingerprint
  LEFT JOIN drl_rules r ON r.rule_id=p.rule_id AND r.active=1
  WHERE p.candidate_id=?`).bind(id).first<CandidatePredictionState>();

const ensureCandidateDrlPrediction = async (
  env: EventCandidatesEnv,
  id: number,
  defer: (task: Promise<unknown>) => void,
): Promise<CandidatePredictionStatus> => {
  const previous = await candidatePredictionState(env, id);
  if (previous?.state === 'completed') {
    const corpus = await env.DB.prepare("SELECT source_version FROM event_drl_corpus WHERE status='ready' ORDER BY imported_at DESC LIMIT 1")
      .first<{ source_version: string }>();
    if (previous.fingerprint && previous.cached_source_version === corpus?.source_version &&
        previous.cached_rule_id === previous.rule_id &&
        (!previous.rule_id || previous.active_rule_id === previous.rule_id)) return 'completed';
  }
  if (previous?.state === 'pending') {
    const lastUpdated = Date.parse(previous.updated_at);
    if (Number.isFinite(lastUpdated) && Date.now() - lastUpdated < PENDING_PREDICTION_STALE_MS) {
      return 'pending';
    }
  }

  const now = new Date().toISOString();
  const claimed = previous
    ? await env.DB.prepare(`UPDATE event_candidate_drl_predictions SET
        fingerprint=NULL,state='pending',rule_id=NULL,confidence=NULL,confidence_label=NULL,
        reason_code=NULL,historical_support_count=NULL,closest_matches_json=NULL,updated_at=?
        WHERE candidate_id=? AND state=? AND updated_at=? RETURNING candidate_id`)
      .bind(now, id, previous.state, previous.updated_at).first<{ candidate_id: number }>()
    : await env.DB.prepare(`INSERT OR IGNORE INTO event_candidate_drl_predictions(candidate_id,state,updated_at)
        VALUES (?,'pending',?) RETURNING candidate_id`)
      .bind(id, now).first<{ candidate_id: number }>();
  if (!claimed) return (await candidatePredictionState(env, id))?.state || null;
  defer(predictCandidateDrl(env, id, now).catch(() => {
    console.warn(JSON.stringify({ event: 'event_candidate_drl_prediction_failed' }));
  }));
  return 'pending';
};

const predictCandidateDrl = async (env: EventCandidatesEnv, id: number, claimedAt: string) => {
  const candidate = await candidateById(env, id);
  if (!candidate) return;
  let parsed: unknown;
  try { parsed = candidate.ai_result_json ? JSON.parse(candidate.ai_result_json) : null; }
  catch { parsed = null; }
  const classified = isRecord(parsed) ? parsed : {};
  const title = typeof classified.title === 'string' && classified.title.trim()
    ? classified.title.trim().slice(0, 300)
    : candidate.raw_content.split(/\r?\n/u).find((line) => line.trim())?.trim().slice(0, 300) || '';
  let prediction: EventDrlPrediction | null = null;
  try {
    prediction = await predictEventDrl(env, {
      title, organizer: typeof classified.organizer === 'string' ? classified.organizer : candidate.source_name,
      description: candidate.raw_content.slice(0, 5_000),
      format: typeof classified.format === 'string' ? classified.format : '',
    });
  } catch {
    await env.DB.prepare("UPDATE event_candidate_drl_predictions SET state='failed',updated_at=? WHERE candidate_id=? AND state='pending' AND updated_at=?")
      .bind(new Date().toISOString(), id, claimedAt).run();
    return;
  }
  await env.DB.prepare(`UPDATE event_candidate_drl_predictions SET
    fingerprint=?,state='completed',rule_id=?,confidence=?,confidence_label=?,reason_code=?,
    historical_support_count=?,closest_matches_json=?,updated_at=?
    WHERE candidate_id=? AND state='pending' AND updated_at=?`)
    .bind(prediction.fingerprint, prediction.rule_id, prediction.confidence,
      prediction.confidence_label, prediction.reason_code, prediction.historical_support_count,
      JSON.stringify(prediction.closest_matches), new Date().toISOString(), id, claimedAt).run();
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
  const candidate = await candidateById(env, id);
  if (!candidate) throw new EventCandidateError(404, 'Không tìm thấy candidate.');
  // Preserve a submitted banner when an older review client omits the field.
  // An explicit null/empty value is still the reviewer's decision to remove it.
  const draft = { ...body.draft };
  if (!Object.hasOwn(draft, 'image_url') && candidate.image_url) draft.image_url = candidate.image_url;
  let eventPayload;
  try { eventPayload = validateAdminEventMutationPayload(draft, 'create'); }
  catch (error) {
    if (error instanceof AdminEventMutationError) throw new EventCandidateError(error.status, error.message);
    throw error;
  }
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
  const duplicateResult = async (candidate: StoredCandidate) => {
    let predictionStatus: CandidatePredictionStatus = null;
    try { predictionStatus = await ensureCandidateDrlPrediction(env, candidate.id, defer); }
    catch { console.warn(JSON.stringify({ event: 'event_candidate_drl_prediction_unavailable' })); }
    console.info(JSON.stringify({ event: 'event_candidate_duplicate', prediction_status: predictionStatus }));
    return { httpStatus: 200, success: true, candidate: toApiCandidate(candidate),
      created: false, duplicate: true, prediction_status: predictionStatus,
      message: 'Candidate already exists' };
  };
  const existing = await env.DB.prepare(`SELECT ${CANDIDATE_COLUMNS} FROM event_candidates
    WHERE post_url = ? ORDER BY created_at DESC, id DESC LIMIT 1`)
    .bind(postUrl).first<StoredCandidate>();
  if (existing) return duplicateResult(existing);

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
    if (concurrent) return duplicateResult(concurrent);
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
  // The candidate is durable before inference. Inference failure never duplicates or rejects ingestion.
  let predictionStatus: CandidatePredictionStatus = null;
  try { predictionStatus = await ensureCandidateDrlPrediction(env, id, defer); }
  catch {
    console.warn(JSON.stringify({ event: 'event_candidate_drl_prediction_unavailable' }));
  }
  defer(notifyEventCandidateModerators(env as PrivateNotificationsEnv, sourceName).catch(() => {
    console.warn(JSON.stringify({ event: 'event_candidate_moderator_notification_failed', candidateId: id }));
  }));
  console.info(JSON.stringify({ event: 'event_candidate_submitted', candidateId: id }));
  return { httpStatus: 201, success: true, candidate, created: true, duplicate: false,
    prediction_status: predictionStatus, ai_result: aiResult, analyzed: Boolean(aiResult), analyze_error: analyzeError };
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
      return { success: true, candidates: candidate ? [toApiCandidate(candidate, await candidateDrl(env, candidate.id))] : [] };
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
    const ids = (rows.results || []).map((row) => row.id);
    if (!ids.length) return { success: true, candidates: [] };
    const byId = new Map<number, StoredDrlPrediction>();
    // D1 permits at most 100 bound parameters per statement. Staff pages can contain 200 candidates.
    for (let start = 0; start < ids.length; start += 90) {
      const batch = ids.slice(start, start + 90);
      const predictions = await env.DB.prepare(`SELECT p.candidate_id,p.state,p.rule_id,p.confidence,p.confidence_label,
        p.reason_code,p.historical_support_count,p.closest_matches_json,
        r.section,r.content,r.condition_text,r.points
        FROM event_candidate_drl_predictions p LEFT JOIN drl_rules r ON r.rule_id=p.rule_id AND r.active=1
        WHERE p.candidate_id IN (${batch.map(() => '?').join(',')})`)
        .bind(...batch).all<StoredDrlPrediction>();
      for (const item of predictions.results || []) byId.set(item.candidate_id, item);
    }
    return { success: true, candidates: (rows.results || []).map((row) => toApiCandidate(row, byId.get(row.id) || null)) };
  }
  if (request.method !== 'POST') throw new EventCandidateError(405, 'Phương thức không được hỗ trợ.');
  const body = await readBody(request);
  const id = asCandidateId(body.id);
  const action = String(body.action || '');
  if (action === 'analyze') {
    await requireCapability(request, env, 'analyze');
    return analyzeCandidate(env, id);
  }
  if (action === 'retry-drl-prediction') {
    await requireCapability(request, env, 'analyze');
    const candidate = await candidateById(env, id);
    if (!candidate) throw new EventCandidateError(404, 'Không tìm thấy candidate.');
    const claimedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO event_candidate_drl_predictions(candidate_id,state,updated_at)
      VALUES (?,'pending',?) ON CONFLICT(candidate_id) DO UPDATE SET state='pending',updated_at=excluded.updated_at`)
      .bind(id, claimedAt).run();
    await predictCandidateDrl(env, id, claimedAt);
    return { success: true, candidate: toApiCandidate(candidate, await candidateDrl(env, id)) };
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
