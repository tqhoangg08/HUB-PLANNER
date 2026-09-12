import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import {
  answerWithGeminiFileSearch,
  geminiFileSearchConfigured,
  type GeminiFileSearchEnv,
} from './gemini-file-search.ts';

export interface AiAdvisorEnv extends BetterAuthIdentityEnv, GeminiFileSearchEnv {
  DB?: D1Database;
  GROQ_API_KEY?: string;
  GROQ_API_KEY_2?: string;
  GROQ_API_KEY_3?: string;
  GROQ_API_KEY_4?: string;
  GROQ_API_KEY_5?: string;
  GROQ_MODEL?: string;
}

export class AiAdvisorError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'AiAdvisorError'; this.status = status; }
}

const MAX_BODY_BYTES = 48 * 1024;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SAFE_TECH_REPLY = 'Mình không thể chia sẻ thông tin kỹ thuật hoặc bảo mật nội bộ của website. HUB Planner được xây dựng để hỗ trợ sinh viên quản lý học tập, theo dõi GPA, lịch học, thông báo, sự kiện và các tiện ích sinh viên thuận tiện hơn.';

const requireDb = (env: AiAdvisorEnv) => {
  if (!env.DB) throw new AiAdvisorError(503, 'Dịch vụ trợ lý tạm thời chưa sẵn sàng.');
  return env.DB;
};

const readBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new AiAdvisorError(413, 'Nội dung trợ lý quá lớn.');
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new AiAdvisorError(400, 'Yêu cầu trợ lý không hợp lệ.'); }
};

const keys = (env: AiAdvisorEnv) => [env.GROQ_API_KEY, env.GROQ_API_KEY_2, env.GROQ_API_KEY_3, env.GROQ_API_KEY_4, env.GROQ_API_KEY_5]
  .map((value) => String(value || '').trim()).filter(Boolean);

const safeHistory = (value: unknown) => Array.isArray(value) ? value.slice(-4).flatMap((entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
  const row = entry as Record<string, unknown>;
  const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null;
  const content = String(row.content || '').trim().slice(0, 1000);
  return role && content ? [{ role, content }] : [];
}) : [];

const d1Context = async (env: AiAdvisorEnv) => {
  if (!env.DB) return '';
  const [courses, events, lostFound, announcements] = await Promise.all([
    env.DB.prepare("SELECT subject_name, course_code, instructor, credits FROM course_schedules WHERE catalogue_visibility = 'published' AND retired_at IS NULL LIMIT 5").all<Record<string, unknown>>(),
    env.DB.prepare('SELECT title, status, deadline, format, points FROM public_events ORDER BY id DESC LIMIT 8').all<Record<string, unknown>>(),
    env.DB.prepare('SELECT title, description, location, contact_info FROM public_lost_found_items ORDER BY created_at DESC LIMIT 5').all<Record<string, unknown>>(),
    env.DB.prepare('SELECT title, date, link FROM school_announcements WHERE is_hidden = 0 ORDER BY date DESC LIMIT 12').all<Record<string, unknown>>(),
  ]);
  return JSON.stringify({ courses: courses.results || [], events: events.results || [], lostFound: lostFound.results || [], announcements: announcements.results || [] }).slice(0, 18_000);
};

const createLog = async (env: AiAdvisorEnv, userId: string, question: string) => {
  const result = await requireDb(env).prepare(
    `INSERT INTO ai_chat_logs (created_at, user_id, user_message, bot_reply)
     VALUES (?, ?, ?, ?)`,
  ).bind(new Date().toISOString(), userId, question, 'Đang xử lý').run();
  const id = Number(result.meta.last_row_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const patchLog = async (env: AiAdvisorEnv, userId: string, id: number, patch: Record<string, unknown>) => {
  const columns = new Map<string, string>([
    ['bot_reply', 'bot_reply'],
    ['is_helpful', 'is_helpful'],
    ['title', 'title'],
    ['is_deleted', 'is_deleted'],
    ['is_pinned', 'is_pinned'],
    ['document_sources', 'document_sources_json'],
    ['document_search_unavailable', 'document_search_unavailable'],
  ]);
  const entries = Object.entries(patch).filter(([key]) => columns.has(key));
  if (!entries.length) return;
  const assignments = entries.map(([key], index) => `${columns.get(key)} = ?${index + 3}`).join(', ');
  const values = entries.map(([key, value]) => key === 'document_sources'
    ? JSON.stringify(Array.isArray(value) ? value : [])
    : typeof value === 'boolean' ? (value ? 1 : 0) : value);
  await requireDb(env).prepare(`UPDATE ai_chat_logs SET ${assignments} WHERE id = ?1 AND user_id = ?2`)
    .bind(id, userId, ...values).run();
};

const parseJsonArray = (value: unknown) => {
  try {
    const parsed = JSON.parse(String(value || '[]')) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const publicLog = (row: Record<string, unknown>) => ({
  id: row.id,
  ...(row.user_message === undefined ? {} : { user_message: row.user_message }),
  ...(row.bot_reply === undefined ? {} : { bot_reply: row.bot_reply }),
  created_at: row.created_at,
  is_helpful: row.is_helpful == null ? null : Number(row.is_helpful) === 1,
  title: row.title,
  is_deleted: Number(row.is_deleted || 0) === 1,
  is_pinned: Number(row.is_pinned || 0) === 1,
  ...(row.document_sources_json === undefined ? {} : { document_sources: parseJsonArray(row.document_sources_json) }),
  ...(row.document_search_unavailable === undefined ? {} : { document_search_unavailable: Number(row.document_search_unavailable || 0) === 1 }),
});

const resolveDocumentSources = async (env: AiAdvisorEnv, sources: Array<Record<string, unknown>>) => {
  const db = requireDb(env);
  return Promise.all(sources.map(async (source) => {
    const externalId = String(source.documentId || '');
    if (!externalId) return source;
    const row = await db.prepare(
      `SELECT id, title, original_file_name FROM ai_documents
        WHERE deleted_at IS NULL
          AND (id = ?1 OR gemini_document_name = ?2 OR gemini_document_name LIKE ?3)
        LIMIT 1`,
    ).bind(externalId, `documents/${externalId}`, `%/documents/${externalId}`).first<{ id: string; title: string; original_file_name: string }>();
    return row ? { ...source, documentId: row.id, title: row.title, fileName: row.original_file_name } : source;
  }));
};

const chat = async (env: AiAdvisorEnv, body: Record<string, unknown>, userId: string) => {
  const question = String(body.question || body.message || '').trim().slice(0, 2000);
  if (!question) throw new AiAdvisorError(400, 'Vui lòng nhập câu hỏi.');
  const logId = await createLog(env, userId, question);
  const sensitive = /api.?key|secret|password|token|source code|supabase|database|backend|prompt/i.test(question);
  if (sensitive) {
    if (logId) await patchLog(env, userId, logId, { bot_reply: SAFE_TECH_REPLY });
    return { reply: SAFE_TECH_REPLY, logId };
  }
  const system = [
    'Bạn là AI Cố vấn học tập HUB Planner. Trả lời bằng tiếng Việt, thân thiện, rõ ràng.',
    'Không tiết lộ thông tin kỹ thuật, bí mật, khóa, token hoặc kiến trúc nội bộ.',
    `Ngữ cảnh sinh viên do ứng dụng cung cấp: ${String(body.context || '').slice(0, 6000)}`,
    `Dữ liệu công khai do máy chủ đọc: ${await d1Context(env)}`,
  ].join('\n');
  let documentSearchUnavailable = false;
  if (geminiFileSearchConfigured(env)) {
    try {
      const result = await answerWithGeminiFileSearch(env, system, safeHistory(body.history), question);
      if (result) {
        const documentSources = await resolveDocumentSources(env, result.documentSources as unknown as Array<Record<string, unknown>>);
        if (logId) await patchLog(env, userId, logId, { bot_reply: result.reply, document_sources: documentSources, document_search_unavailable: false });
        return { reply: result.reply, logId, documentSources, documentSearchUnavailable: false };
      }
    } catch {
      documentSearchUnavailable = true;
    }
  }
  const availableKeys = keys(env);
  if (!availableKeys.length) throw new AiAdvisorError(503, 'Dịch vụ trợ lý tạm thời chưa sẵn sàng.');
  let lastStatus = 502;
  for (const key of availableKeys.slice(0, 3)) {
    try {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: String(env.GROQ_MODEL || 'openai/gpt-oss-20b'),
          messages: [{ role: 'system', content: system }, ...safeHistory(body.history), { role: 'user', content: question }],
          temperature: 0.2,
          max_completion_tokens: 2048,
        }),
        signal: AbortSignal.timeout(25_000),
      });
      lastStatus = response.status;
      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      if (!response.ok) continue;
      const reply = String(payload.choices?.[0]?.message?.content || '').trim();
      if (!reply) continue;
      if (logId) await patchLog(env, userId, logId, { bot_reply: reply, document_sources: [], document_search_unavailable: documentSearchUnavailable });
      return { reply, logId, documentSources: [], documentSearchUnavailable };
    } catch { lastStatus = 502; }
  }
  if (logId) await patchLog(env, userId, logId, { bot_reply: 'Hệ thống AI đang tạm thời không phản hồi.' });
  throw new AiAdvisorError(lastStatus === 429 ? 429 : 502, 'Hệ thống AI đang tạm thời không phản hồi.');
};

export const handleAiAdvisor = async (request: Request, url: URL, env: AiAdvisorEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  if (request.method === 'GET') {
    const id = Number(url.searchParams.get('id') || 0);
    const select = id > 0
      ? 'id,user_message,bot_reply,created_at,is_helpful,title,is_deleted,is_pinned,document_sources_json,document_search_unavailable'
      : 'id,created_at,is_helpful,title,is_deleted,is_pinned';
    if (id > 0) {
      const row = await requireDb(env).prepare(`SELECT ${select} FROM ai_chat_logs WHERE user_id = ? AND id = ? LIMIT 1`)
        .bind(identity.userId, id).first<Record<string, unknown>>();
      return { success: true, data: row ? publicLog(row) : null };
    }
    const rows = await requireDb(env).prepare(`SELECT ${select} FROM ai_chat_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
      .bind(identity.userId).all<Record<string, unknown>>();
    return { success: true, data: (rows.results || []).map(publicLog) };
  }
  const body = await readBody(request);
  if ('userId' in body || 'user_id' in body || 'role' in body) throw new AiAdvisorError(400, 'Không cho phép chỉ định chủ sở hữu.');
  if (request.method === 'POST') return chat(env, body, identity.userId);
  if (request.method === 'PATCH') {
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AiAdvisorError(400, 'Cuộc trò chuyện không hợp lệ.');
    const patch: Record<string, unknown> = {};
    if (typeof body.is_helpful === 'boolean') patch.is_helpful = body.is_helpful;
    if (typeof body.is_pinned === 'boolean') patch.is_pinned = body.is_pinned;
    if (body.is_deleted === true) patch.is_deleted = true;
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 160);
    if (!Object.keys(patch).length) throw new AiAdvisorError(400, 'Không có thay đổi hợp lệ.');
    await patchLog(env, identity.userId, id, patch);
    return { success: true };
  }
  throw new AiAdvisorError(405, 'Phương thức không được hỗ trợ.');
};

export const aiAdvisorErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof AiAdvisorError ? error.status : 500;
