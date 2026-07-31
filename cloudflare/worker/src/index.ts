import { handleCourses, syncCourseSchedules } from './courses.ts';
import { handleEvents, syncPublicEvents } from './events.ts';
import { handleLostFound, syncPublicLostFound } from './lost-found.ts';

interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface AnnouncementRow {
  id: number;
  title: string;
  link: string;
  is_new: number;
  date: string | null;
  created_at: string | null;
}

interface SupabaseAnnouncementRow extends AnnouncementRow {
  is_hidden: boolean | number | null;
  is_new: boolean | number | null;
}

export interface AnnouncementQuery {
  limit: number;
  offset: number;
  search: string;
  startDate: string;
  endDate: string;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://hotrosinhvienhub.id.vn',
];
const ANNOUNCEMENT_SYNC_PAGE_SIZE = 500;
const ANNOUNCEMENT_RECENT_REFRESH_SIZE = 200;
const ANNOUNCEMENT_EDGE_TTL_SECONDS = 300;
const COURSE_EDGE_TTL_SECONDS = 1800;
const EVENT_EDGE_TTL_SECONDS = 300;
const LOST_FOUND_EDGE_TTL_SECONDS = 120;
const ANNOUNCEMENT_CACHE_PARAMS = new Set([
  'resource',
  'limit',
  'offset',
  'search',
  'startDate',
  'endDate',
]);
const COURSE_CACHE_PARAMS = new Set([
  'resource',
  'semester',
  'major',
  'cohort',
  'academicProgram',
  'subjectName',
  'phase',
  'isUserAdded',
  'search',
  'suggestions',
  'limit',
  'offset',
  'view',
  'groupName',
  'id',
]);
const EVENT_CACHE_PARAMS = new Set([
  'limit',
  'offset',
  'search',
  'criteria',
  'scope',
  'sort',
  'group',
  'ids',
]);
const LOST_FOUND_CACHE_PARAMS = new Set([
  'type',
  'limit',
  'offset',
  'search',
]);

const json = (payload: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });

const clamp = (value: string | null, fallback: number, max: number) =>
  Math.max(1, Math.min(Number(value) || fallback, max));

export const normalizeSearch = (value: string) =>
  String(value || '')
    .toLocaleLowerCase('vi-VN')
    .trim()
    .replace(/[%,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const parseAnnouncementQuery = (params: URLSearchParams): AnnouncementQuery => ({
  limit: clamp(params.get('limit'), 10, 60),
  offset: Math.max(0, Number(params.get('offset')) || 0),
  search: normalizeSearch(params.get('search') || ''),
  startDate: String(params.get('startDate') || '').trim(),
  endDate: String(params.get('endDate') || '').trim(),
});

export const buildPublicCacheKey = (request: Request) => {
  const requestUrl = new URL(request.url);
  const resource = String(requestUrl.searchParams.get('resource') || '');
  const allowedParams = requestUrl.pathname.endsWith('/courses')
    ? COURSE_CACHE_PARAMS
    : requestUrl.pathname.endsWith('/lost-found') ||
        resource === 'lost-found'
      ? LOST_FOUND_CACHE_PARAMS
    : resource === 'announcements'
      ? ANNOUNCEMENT_CACHE_PARAMS
      : EVENT_CACHE_PARAMS;
  const sorted = [...requestUrl.searchParams.entries()]
    .filter(([name]) => allowedParams.has(name))
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName === rightName
        ? leftValue.localeCompare(rightValue)
        : leftName.localeCompare(rightName)
    );
  requestUrl.search = '';
  for (const [name, value] of sorted) requestUrl.searchParams.append(name, value);
  requestUrl.searchParams.set(
    '__hub_cache_origin',
    request.headers.get('Origin') || 'no-origin'
  );
  return new Request(requestUrl.toString(), { method: 'GET' });
};

export const formatPostgrestTimestamp = (value: string | null) => {
  if (!value) return value;
  return value
    .replace(/\.([0-9]*?[1-9])0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '.$1')
    .replace(/\.0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '');
};

export const buildSupabaseAnnouncementsUrl = (
  baseUrl: string,
  options: { afterId?: number; latestLimit?: number } = {}
) => {
  const url = new URL('/rest/v1/school_announcements', baseUrl.replace(/\/$/, ''));
  url.searchParams.set(
    'select',
    'id,title,link,date,is_new,created_at,is_hidden'
  );

  if (options.latestLimit) {
    url.searchParams.set('order', 'id.desc');
    url.searchParams.set('limit', String(options.latestLimit));
  } else {
    url.searchParams.set('id', `gt.${Math.max(0, options.afterId || 0)}`);
    url.searchParams.set('order', 'id.asc');
    url.searchParams.set('limit', String(ANNOUNCEMENT_SYNC_PAGE_SIZE));
  }

  return url;
};

const readSupabaseAnnouncements = async (
  env: Env,
  options: { afterId?: number; latestLimit?: number }
) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('Cloudflare sync is missing Supabase read configuration.');
  }

  const response = await fetch(buildSupabaseAnnouncementsUrl(env.SUPABASE_URL, options), {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase announcement sync failed with status ${response.status}.`);
  }

  return (await response.json()) as SupabaseAnnouncementRow[];
};

const writeAnnouncementRows = async (env: Env, rows: SupabaseAnnouncementRow[]) => {
  if (rows.length === 0) return;

  const statement = `
    INSERT INTO school_announcements
      (id, title, title_search, link, date, is_new, created_at, is_hidden)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      title_search = excluded.title_search,
      link = excluded.link,
      date = excluded.date,
      is_new = excluded.is_new,
      created_at = excluded.created_at,
      is_hidden = excluded.is_hidden
    WHERE school_announcements.title IS NOT excluded.title
       OR school_announcements.title_search IS NOT excluded.title_search
       OR school_announcements.link IS NOT excluded.link
       OR school_announcements.date IS NOT excluded.date
       OR school_announcements.is_new IS NOT excluded.is_new
       OR school_announcements.created_at IS NOT excluded.created_at
       OR school_announcements.is_hidden IS NOT excluded.is_hidden
  `;

  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100).map((row) =>
      env.DB.prepare(statement).bind(
        Number(row.id),
        String(row.title || ''),
        String(row.title || '').toLocaleLowerCase('vi-VN'),
        String(row.link || ''),
        row.date || null,
        row.is_new ? 1 : 0,
        row.created_at || null,
        row.is_hidden ? 1 : 0
      )
    );
    await env.DB.batch(batch);
  }
};

export const syncSchoolAnnouncements = async (env: Env) => {
  const maxIdRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(id), 0) AS max_id FROM school_announcements'
  ).first<{ max_id: number }>();
  let cursor = Number(maxIdRow?.max_id || 0);
  let insertedOrUpdated = 0;

  while (true) {
    const page = await readSupabaseAnnouncements(env, { afterId: cursor });
    if (page.length === 0) break;

    await writeAnnouncementRows(env, page);
    insertedOrUpdated += page.length;
    cursor = Math.max(cursor, ...page.map((row) => Number(row.id) || 0));
    if (page.length < ANNOUNCEMENT_SYNC_PAGE_SIZE) break;
  }

  // Refresh recent rows so is_new/is_hidden changes also reach D1 without a
  // full-table export on every scheduled run.
  const recentRows = await readSupabaseAnnouncements(env, {
    latestLimit: ANNOUNCEMENT_RECENT_REFRESH_SIZE,
  });
  await writeAnnouncementRows(env, recentRows);

  const summary = await env.DB.prepare(
    `SELECT
       COUNT(*) AS source_row_count,
       SUM(CASE WHEN is_hidden = 0 THEN 1 ELSE 0 END) AS visible_row_count,
       MAX(created_at) AS source_max_created_at
     FROM school_announcements`
  ).first<{
    source_row_count: number;
    visible_row_count: number;
    source_max_created_at: string | null;
  }>();
  const syncedAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO sync_metadata
       (resource, source_row_count, source_max_created_at, synced_at, visible_row_count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET
       source_row_count = excluded.source_row_count,
       source_max_created_at = excluded.source_max_created_at,
       synced_at = excluded.synced_at,
       visible_row_count = excluded.visible_row_count`
  )
    .bind(
      'school_announcements',
      Number(summary?.source_row_count || 0),
      summary?.source_max_created_at || null,
      syncedAt,
      Number(summary?.visible_row_count || 0)
    )
    .run();

  return {
    insertedOrUpdated,
    recentRowsRefreshed: recentRows.length,
    sourceRowCount: Number(summary?.source_row_count || 0),
    visibleRowCount: Number(summary?.visible_row_count || 0),
    syncedAt,
  };
};

const readAllowedOrigins = (env: Env) => {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS);
};

const corsHeaders = (request: Request, env: Env): HeadersInit | null => {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  if (!readAllowedOrigins(env).has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const handleAnnouncements = async (requestUrl: URL, env: Env) => {
  const query = parseAnnouncementQuery(requestUrl.searchParams);
  const where = ['COALESCE(is_hidden, 0) = 0'];
  const bindings: Array<string | number> = [];

  if (query.search) {
    where.push('title_search LIKE ?');
    bindings.push(`%${query.search}%`);
  }
  if (query.startDate) {
    where.push('date >= ?');
    bindings.push(query.startDate);
  }
  if (query.endDate) {
    where.push('date <= ?');
    bindings.push(query.endDate);
  }

  const whereSql = where.join(' AND ');
  const canUseMetadataCount = !query.search && !query.startDate && !query.endDate;
  const countRow = canUseMetadataCount
    ? await env.DB.prepare(
      'SELECT visible_row_count AS total FROM sync_metadata WHERE resource = ?'
    ).bind('school_announcements').first<{ total: number }>()
    : await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM school_announcements WHERE ${whereSql}`
    )
      .bind(...bindings)
      .first<{ total: number }>();

  const total = Number(countRow?.total || 0);
  const rows = await env.DB.prepare(
    `SELECT id, title, link, is_new, date, created_at
       FROM school_announcements
      WHERE ${whereSql}
      ORDER BY date DESC, created_at DESC
      LIMIT ? OFFSET ?`
  )
    .bind(...bindings, query.limit, query.offset)
    .all<AnnouncementRow>();

  const data = (rows.results || []).map((row) => ({
    id: row.id,
    title: row.title,
    link: row.link,
    is_new: Boolean(row.is_new),
    date: row.date,
    created_at: formatPostgrestTimestamp(row.created_at),
  }));

  return {
    success: true,
    data,
    total,
    hasMore: total > query.offset + data.length,
  };
};

const readCachedResponse = async (request: Request) => {
  try {
    const cached = await caches.default.match(buildPublicCacheKey(request));
    if (!cached) return null;
    const response = new Response(cached.body, cached);
    response.headers.set('X-Hub-Cache', 'HIT');
    return response;
  } catch (error) {
    console.warn('edge_cache_read_failed', error);
    return null;
  }
};

const storeCachedResponse = (
  request: Request,
  response: Response,
  ctx: ExecutionContext
) => {
  try {
    ctx.waitUntil(
      caches.default
        .put(buildPublicCacheKey(request), response.clone())
        .catch((error) => console.warn('edge_cache_write_failed', error))
    );
  } catch (error) {
    console.warn('edge_cache_write_failed', error);
  }
};

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (cors === null) return json({ error: 'Origin không được phép.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === '/health') {
      const rows = await env.DB.prepare(
        `SELECT resource, source_row_count, visible_row_count,
                source_max_created_at, synced_at
           FROM sync_metadata`
      ).all<Record<string, unknown>>();
      const resources = Object.fromEntries(
        (rows.results || []).map((row) => [String(row.resource), row])
      );
      return json({
        ok: true,
        resource: 'school_announcements',
        sync: resources.school_announcements || null,
        resources,
      }, 200, cors);
    }

    if (request.method !== 'GET') {
      return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, {
        ...cors,
        Allow: 'GET, OPTIONS',
      });
    }

    const isEventsPath =
      requestUrl.pathname === '/events' || requestUrl.pathname === '/api/events';
    const isCoursesPath =
      requestUrl.pathname === '/courses' || requestUrl.pathname === '/api/courses';
    const isLostFoundPath =
      requestUrl.pathname === '/lost-found' ||
      requestUrl.pathname === '/api/lost-found';

    if (!isEventsPath && !isCoursesPath && !isLostFoundPath) {
      return json({ error: 'Không tìm thấy endpoint.' }, 404, cors);
    }

    const bypassCache =
      requestUrl.searchParams.has('refresh') ||
      String(request.headers.get('Cache-Control') || '').includes('no-cache');
    const cached = bypassCache ? null : await readCachedResponse(request);
    if (cached) return cached;

    if (isCoursesPath) {
      try {
        const result = await handleCourses(requestUrl, env);
        const response = json(result.payload, result.status, {
          ...cors,
          'Cache-Control':
            result.status === 200
              ? `public, max-age=300, s-maxage=${COURSE_EDGE_TTL_SECONDS}, stale-while-revalidate=3600`
              : 'no-store',
          'X-Hub-Backend': 'cloudflare-d1',
          'X-Hub-Cache': 'MISS',
        });
        if (result.status === 200 && !bypassCache) {
          storeCachedResponse(request, response, ctx);
        }
        return response;
      } catch (error) {
        console.error('course_query_failed', error);
        return json({ error: 'Không tải được danh sách môn.' }, 500, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      }
    }

    const resource = String(requestUrl.searchParams.get('resource') || '');
    const isLostFoundRequest =
      isLostFoundPath || (isEventsPath && resource === 'lost-found');
    if (isLostFoundRequest) {
      try {
        const payload = await handleLostFound(requestUrl, env);
        const response = json(payload, 200, {
          ...cors,
          'Cache-Control': bypassCache
            ? 'no-store'
            : `public, max-age=60, s-maxage=${LOST_FOUND_EDGE_TTL_SECONDS}, stale-while-revalidate=300`,
          'X-Hub-Backend': 'cloudflare-d1',
          'X-Hub-Cache': bypassCache ? 'BYPASS' : 'MISS',
        });
        if (!bypassCache) storeCachedResponse(request, response, ctx);
        return response;
      } catch (error) {
        console.error('lost_found_query_failed', error);
        return json({ error: 'Không tải được danh sách tìm đồ.' }, 500, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      }
    }

    if (resource && resource !== 'announcements') {
      return json({ error: 'Resource không hợp lệ.' }, 400, cors);
    }

    if (!resource) {
      try {
        const payload = await handleEvents(requestUrl, env);
        const response = json(payload, 200, {
          ...cors,
          'Cache-Control': bypassCache
            ? 'no-store'
            : `public, max-age=60, s-maxage=${EVENT_EDGE_TTL_SECONDS}, stale-while-revalidate=900`,
          'X-Hub-Backend': 'cloudflare-d1',
          'X-Hub-Cache': bypassCache ? 'BYPASS' : 'MISS',
        });
        if (!bypassCache) storeCachedResponse(request, response, ctx);
        return response;
      } catch (error) {
        console.error('event_query_failed', error);
        return json({ error: 'Không tải được dữ liệu sự kiện.' }, 500, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      }
    }

    try {
      const payload = await handleAnnouncements(requestUrl, env);
      const response = json(payload, 200, {
        ...cors,
        'Cache-Control': bypassCache
          ? 'no-store'
          : `public, max-age=60, s-maxage=${ANNOUNCEMENT_EDGE_TTL_SECONDS}, stale-while-revalidate=900`,
        'X-Hub-Backend': 'cloudflare-d1',
        'X-Hub-Cache': bypassCache ? 'BYPASS' : 'MISS',
      });
      if (!bypassCache) storeCachedResponse(request, response, ctx);
      return response;
    } catch (error) {
      console.error('announcement_query_failed', error);
      return json({ error: 'Không tải được thông báo trường.' }, 500, {
        ...cors,
        'Cache-Control': 'no-store',
      });
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const hourlyCron = controller.cron === '17 * * * *';
    const eventCron = controller.cron === '*/10 * * * *';
    const lostFoundCron = controller.cron === '*/5 * * * *';
    const runAll = !hourlyCron && !eventCron && !lostFoundCron;
    const reconcileCourseDeletes =
      (hourlyCron || runAll) &&
      new Date(controller.scheduledTime).getUTCHours() === 20;
    const jobs: Array<{ failureEvent: string; promise: Promise<unknown> }> = [];

    if (hourlyCron || runAll) {
      jobs.push(
        {
          failureEvent: 'announcement_sync_failed',
          promise: syncSchoolAnnouncements(env).then((summary) =>
            console.log('announcement_sync_complete', summary)
          ),
        },
        {
          failureEvent: 'course_sync_failed',
          promise: syncCourseSchedules(env, reconcileCourseDeletes).then((summary) =>
            console.log('course_sync_complete', summary)
          ),
        }
      );
    }

    if (eventCron || runAll) {
      jobs.push({
        failureEvent: 'event_sync_failed',
        promise: syncPublicEvents(env).then((summary) =>
          console.log('event_sync_complete', summary)
        ),
      });
    }

    if (lostFoundCron || runAll) {
      jobs.push({
        failureEvent: 'lost_found_sync_failed',
        promise: syncPublicLostFound(env).then((summary) =>
          console.log('lost_found_sync_complete', summary)
        ),
      });
    }

    ctx.waitUntil(
      Promise.allSettled(jobs.map(({ promise }) => promise)).then((results) => {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(jobs[index].failureEvent, result.reason);
          }
        });
      })
    );
  },
};

export default worker;
