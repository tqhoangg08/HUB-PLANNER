import { requireBetterAuthSession, type BetterAuthIdentityEnv } from './better-auth-identity.ts';
import { predictEventDrl, type EventDrlDraft, type EventDrlEnv, type EventDrlRule } from './event-drl-prediction.ts';

interface EventDrlApiEnv extends BetterAuthIdentityEnv, EventDrlEnv {}
export class EventDrlApiError extends Error {
  readonly status: 400 | 405 | 413 | 503;
  constructor(status: 400 | 405 | 413 | 503, message: string) { super(message); this.status = status; }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const handleEventDrlApi = async (request: Request, path: string, env: EventDrlApiEnv) => {
  // Both ordinary contributors and staff must have an authenticated session.
  await requireBetterAuthSession(request, env);
  if (path === '/api/private/v1/event-drl/catalog') {
    if (request.method !== 'GET') throw new EventDrlApiError(405, 'Phương thức không được hỗ trợ.');
    const [organizers, rules] = await Promise.all([
      env.DB.prepare('SELECT name FROM event_organizers ORDER BY name LIMIT 1000').all<{ name: string }>(),
      env.DB.prepare('SELECT rule_id,section,rule_group,content,condition_text,points,unit FROM drl_rules WHERE active=1 AND event_suitable=1 AND points IS NOT NULL ORDER BY section,rule_id')
        .all<EventDrlRule>(),
    ]);
    return { success: true, organizers: (organizers.results || []).map((item) => item.name), rules: rules.results || [] };
  }
  if (path !== '/api/private/v1/event-drl/predict') throw new EventDrlApiError(400, 'Đường dẫn không hợp lệ.');
  if (request.method !== 'POST') throw new EventDrlApiError(405, 'Phương thức không được hỗ trợ.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 12_000) throw new EventDrlApiError(413, 'Nội dung vượt giới hạn.');
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new EventDrlApiError(400, 'Dữ liệu không hợp lệ.'); }
  if (!isRecord(body) || typeof body.title !== 'string' || !body.title.trim() ||
      ['organizer', 'description', 'format'].some((key) => key in body && typeof body[key] !== 'string')) {
    throw new EventDrlApiError(400, 'Dữ liệu sự kiện không hợp lệ.');
  }
  if (Object.keys(body).some((key) => !['title', 'organizer', 'description', 'format'].includes(key))) {
    throw new EventDrlApiError(400, 'Chỉ nhận thông tin bản nháp sự kiện.');
  }
  const draft: EventDrlDraft = {
    title: body.title, organizer: String(body.organizer || ''),
    description: String(body.description || ''), format: String(body.format || ''),
  };
  try { return { success: true, prediction: await predictEventDrl(env, draft) }; }
  catch { throw new EventDrlApiError(503, 'Gợi ý ĐRL tạm thời chưa sẵn sàng.'); }
};
