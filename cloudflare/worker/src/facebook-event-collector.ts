import { requireBetterAuthStaff } from './better-auth-identity.ts';
import { handleEventCandidateIngest, type EventCandidatesEnv } from './event-candidates.ts';

// Pulls the last completed Apify task run. Apify owns the scraping schedule and
// the list of sources. No Facebook credentials, cookies or scraping code live here.
export interface FacebookEventCollectorEnv extends EventCandidatesEnv {
  FACEBOOK_EVENT_COLLECTOR_ENABLED?: string;
  APIFY_TOKEN?: string;
  APIFY_TASK_ID?: string;
}

export class FacebookEventCollectorError extends Error {
  constructor(readonly status: 400 | 403 | 405 | 503, message: string) {
    super(message);
    this.name = 'FacebookEventCollectorError';
  }
}

interface CollectorState {
  last_completed_run_id: string | null;
  state: string;
  started_at: string | null;
  finished_at: string | null;
  last_run_id: string | null;
  last_total: number;
  last_imported: number;
  last_duplicates: number;
  last_skipped: number;
  last_failed: number;
  last_error: string | null;
}

interface PostDraft {
  source_name: string;
  post_url: string;
  raw_content: string;
  submitted_from: 'apify_facebook';
  client_created_at: string | null;
}

const APIFY_API = 'https://api.apify.com/v2';
const MAX_DATASET_ITEMS = 100;
const MAX_NEW_PER_SYNC = 8;
const MAX_POST_AGE_MS = 21 * 24 * 60 * 60 * 1000;
const CLAIM_EXPIRY_MS = 35 * 60 * 1000;
const DISCOVERY_KEYWORDS = /(?:điểm\s*rèn\s*luyện|đrl|rèn\s*luyện|đăng\s*ký|tham\s*gia|tình\s*nguyện|hội\s*thảo|tọa\s*đàm|tập\s*huấn|sự\s*kiện|chương\s*trình|cuộc\s*thi|workshop|talkshow|seminar|event|registration|volunteer)/iu;
const PICKED_QUERY = ['story_fbid', 'id', 'fbid', 'v'];

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

const pick = (row: Record<string, unknown>, keys: string[], max = 20_000): string => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, max);
  }
  return '';
};

export const normalizeFacebookPostUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  let url: URL;
  try { url = new URL(value); }
  catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(url.hostname.toLowerCase())) return null;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const validPost = /\/posts\/[^/]+$/i.test(path)
    || /^\/(?:reel|videos)\/[^/]+$/i.test(path)
    || /\/videos\/[^/]+$/i.test(path)
    || /^\/share\/p\/[^/]+$/i.test(path)
    || (['/story.php', '/permalink.php'].includes(path.toLowerCase()) && Boolean(url.searchParams.get('story_fbid')))
    || (['/photo.php', '/watch'].includes(path.toLowerCase()) && Boolean(url.searchParams.get('fbid') || url.searchParams.get('v')));
  if (!validPost) return null;
  const normalized = new URL('https://www.facebook.com' + path);
  for (const key of PICKED_QUERY) {
    const part = url.searchParams.get(key);
    if (part) normalized.searchParams.set(key, part.slice(0, 120));
  }
  return normalized.toString();
};

const publishedDate = (row: Record<string, unknown>): Date | null => {
  const input = row.timestamp ?? row.publishedAt ?? row.postedAt ?? row.time ?? row.createdAt ?? row.date;
  if (input === undefined || input === null || input === '') return null;
  const time = typeof input === 'number'
    ? new Date(input < 100000000000 ? input * 1000 : input)
    : new Date(String(input));
  return Number.isFinite(time.getTime()) ? time : null;
};

// An adapter for common Apify Facebook actor outputs. Unknown shapes are
// skipped, never converted into made-up event details.
export const normalizeApifyFacebookPost = (value: unknown, now = Date.now()): PostDraft | null => {
  const item = record(value);
  if (!item) return null;
  if (typeof item.type === 'string' && !['post', 'facebook_post'].includes(item.type.toLowerCase())) return null;
  const post_url = normalizeFacebookPostUrl(pick(item, ['postUrl', 'post_url', 'url', 'permalink', 'postLink', 'link'], 2_048));
  if (!post_url) return null;
  const nested = record(item.post) || {};
  const raw_content = pick(item, ['text', 'message', 'postText', 'post_text', 'content', 'caption', 'description'])
    || pick(nested, ['text', 'message', 'content']);
  if (raw_content.length < 30 || !DISCOVERY_KEYWORDS.test(raw_content)) return null;
  const date = publishedDate(item);
  if (date && (now - date.getTime() > MAX_POST_AGE_MS || date.getTime() - now > 24 * 60 * 60 * 1000)) return null;
  const page = record(item.page) || record(item.author) || {};
  const source_name = pick(item, ['pageName', 'sourceName', 'authorName', 'profileName', 'source_name'], 300)
    || pick(page, ['name', 'title'], 300) || 'Fanpage Facebook';
  return {
    source_name,
    post_url,
    raw_content: raw_content.slice(0, 20_000),
    submitted_from: 'apify_facebook',
    client_created_at: date?.toISOString() || null,
  };
};

const configured = (env: FacebookEventCollectorEnv) =>
  Boolean(env.APIFY_TOKEN?.trim() && env.APIFY_TASK_ID?.trim());

const active = (env: FacebookEventCollectorEnv) =>
  env.FACEBOOK_EVENT_COLLECTOR_ENABLED === 'true';

const getState = async (env: FacebookEventCollectorEnv): Promise<CollectorState | null> =>
  env.DB.prepare('SELECT * FROM facebook_event_collector_state WHERE singleton = 1')
    .first<CollectorState>();

const apifyGet = async (env: FacebookEventCollectorEnv, path: string): Promise<unknown> => {
  const response = await fetch(APIFY_API + path, {
    headers: { Authorization: 'Bearer ' + env.APIFY_TOKEN, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Apify HTTP ' + response.status);
  return response.json();
};

const finish = async (
  env: FacebookEventCollectorEnv,
  claimAt: string,
  state: 'idle' | 'completed' | 'partial' | 'failed',
  runId: string | null,
  totals: { total: number; imported: number; duplicates: number; skipped: number; failed: number },
  error: string | null = null,
) => {
  await env.DB.prepare(
    'UPDATE facebook_event_collector_state SET state=?, finished_at=?, last_run_id=?, last_total=?, last_imported=?, last_duplicates=?, last_skipped=?, last_failed=?, last_error=?, last_completed_run_id=CASE WHEN ? = \'completed\' THEN ? ELSE last_completed_run_id END WHERE singleton=1 AND state=\'running\' AND started_at=?'
  ).bind(
    state, new Date().toISOString(), runId, totals.total, totals.imported, totals.duplicates,
    totals.skipped, totals.failed, error?.slice(0, 200) || null, state, runId, claimAt,
  ).run();
};

const processClaimedRun = async (
  env: FacebookEventCollectorEnv, claimAt: string, completedRunId: string | null,
  defer: (task: Promise<unknown>) => void,
) => {
  let runId: string | null = null;
  const totals = { total: 0, imported: 0, duplicates: 0, skipped: 0, failed: 0 };
  try {
    const last = record(await apifyGet(env, '/actor-tasks/' + encodeURIComponent(env.APIFY_TASK_ID!) + '/runs/last?status=SUCCEEDED'));
    const run = record(last?.data);
    runId = typeof run?.id === 'string' ? run.id : null;
    const datasetId = typeof run?.defaultDatasetId === 'string' ? run.defaultDatasetId : null;
    if (!runId || !datasetId) {
      await finish(env, claimAt, 'idle', null, totals);
      return;
    }
    if (runId === completedRunId) {
      await finish(env, claimAt, 'completed', runId, totals);
      return;
    }
    const items = await apifyGet(env, '/datasets/' + encodeURIComponent(datasetId) + '/items?clean=true&format=json&limit=' + MAX_DATASET_ITEMS);
    if (!Array.isArray(items)) throw new Error('Apify returned an unexpected dataset');
    totals.total = items.length;
    let remaining = false;
    const seen = new Set<string>();
    for (const item of items) {
      const post = normalizeApifyFacebookPost(item);
      if (!post || seen.has(post.post_url)) {
        totals.skipped++;
        continue;
      }
      seen.add(post.post_url);
      const existing = await env.DB.prepare('SELECT id FROM event_candidates WHERE post_url=? LIMIT 1')
        .bind(post.post_url).first<{ id: number }>();
      if (existing) {
        totals.duplicates++;
        continue;
      }
      if (totals.imported >= MAX_NEW_PER_SYNC) {
        remaining = true;
        continue;
      }
      try {
        // Existing ingest path handles unique-post dedupe, AI classification,
        // official DRL inference, notifications, and the moderation queue.
        // Never request or automatically republish third-party images.
        const request = new Request('https://hub-planner.internal/api/event-candidates', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + env.EVENT_CANDIDATE_INGEST_SECRET,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(post),
        });
        const result = await handleEventCandidateIngest(request, env, defer);
        if (result.created) totals.imported++;
        else totals.duplicates++;
      } catch {
        totals.failed++;
        console.warn(JSON.stringify({ event: 'facebook_candidate_ingest_failed' }));
      }
    }
    await finish(env, claimAt, remaining || totals.failed > 0 || items.length === MAX_DATASET_ITEMS ? 'partial' : 'completed', runId, totals);
    console.info(JSON.stringify({ event: 'facebook_collector_finished', runId, ...totals, partial: remaining }));
  } catch (error) {
    const safeError = error instanceof Error ? error.message : 'Collector unavailable';
    await finish(env, claimAt, 'failed', runId, totals, safeError);
    console.warn(JSON.stringify({ event: 'facebook_collector_failed', runId }));
  }
};

export const queueFacebookEventCollection = async (
  env: FacebookEventCollectorEnv,
  defer: (task: Promise<unknown>) => void,
): Promise<{ accepted: boolean; reason?: string }> => {
  if (!active(env)) return { accepted: false, reason: 'disabled' };
  if (!configured(env) || !env.EVENT_CANDIDATE_INGEST_SECRET?.trim()) {
    return { accepted: false, reason: 'not_configured' };
  }
  const claimAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - CLAIM_EXPIRY_MS).toISOString();
  const claim = await env.DB.prepare(
    'UPDATE facebook_event_collector_state SET state=\'running\', started_at=?, finished_at=NULL, last_error=NULL WHERE singleton=1 AND (state!=\'running\' OR started_at<?) RETURNING last_completed_run_id'
  ).bind(claimAt, staleBefore).first<{ last_completed_run_id: string | null }>();
  if (!claim) return { accepted: false, reason: 'already_running' };
  defer(processClaimedRun(env, claimAt, claim.last_completed_run_id, defer));
  return { accepted: true };
};

export const handleAdminFacebookEventCollector = async (
  request: Request, env: FacebookEventCollectorEnv, defer: (task: Promise<unknown>) => void,
) => {
  const staff = await requireBetterAuthStaff(request, env);
  if (staff.role !== 'admin') throw new FacebookEventCollectorError(403, 'Chỉ quản trị viên được truy cập bộ thu thập Facebook.');
  if (request.method === 'GET') return {
    success: true,
    enabled: active(env),
    configured: configured(env) && Boolean(env.EVENT_CANDIDATE_INGEST_SECRET?.trim()),
    state: await getState(env),
  };
  if (request.method !== 'POST') throw new FacebookEventCollectorError(405, 'Phương thức không được hỗ trợ.');
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new FacebookEventCollectorError(403, 'Nguồn yêu cầu không hợp lệ.');
  }
  const result = await queueFacebookEventCollection(env, defer);
  return { success: true, ...result };
};
