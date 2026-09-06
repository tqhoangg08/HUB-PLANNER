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
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
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

const sourceConfig = (env: AiAdvisorEnv) => {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !key) throw new AiAdvisorError(503, 'Dịch vụ trợ lý tạm thời chưa sẵn sàng.');
  return { base, key };
};

const source = async (env: AiAdvisorEnv, path: string, init: RequestInit = {}) => {
  const { base, key } = sourceConfig(env);
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Accept: 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...init.headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new AiAdvisorError(502, 'Không thể xử lý lịch sử trợ lý.');
  return response;
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
  const response = await source(env, '/rest/v1/ai_chat_logs?select=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, user_message: question, bot_reply: 'Đang xử lý' }),
  });
  const rows = await response.json() as Array<{ id?: unknown }>;
  const id = Number(rows[0]?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const patchLog = async (env: AiAdvisorEnv, userId: string, id: number, patch: Record<string, unknown>) => {
  const response = await source(env, `/rest/v1/ai_chat_logs?id=eq.${id}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch),
  });
  await response.body?.cancel();
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
        if (logId) await patchLog(env, userId, logId, { bot_reply: result.reply, document_sources: result.documentSources, document_search_unavailable: false });
        return { reply: result.reply, logId, documentSources: result.documentSources, documentSearchUnavailable: false };
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
  const owner = encodeURIComponent(identity.userId);
  if (request.method === 'GET') {
    const id = Number(url.searchParams.get('id') || 0);
    const select = id > 0
      ? 'id,user_message,bot_reply,created_at,is_helpful,title,is_deleted,is_pinned,document_sources,document_search_unavailable'
      : 'id,created_at,is_helpful,title,is_deleted,is_pinned';
    const filter = id > 0 ? `&id=eq.${id}&limit=1` : '&order=created_at.desc&limit=50';
    const response = await source(env, `/rest/v1/ai_chat_logs?user_id=eq.${owner}&select=${select}${filter}`);
    const rows = await response.json();
    return { success: true, data: id > 0 ? (Array.isArray(rows) ? rows[0] || null : null) : rows };
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
