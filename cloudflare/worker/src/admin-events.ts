import { normalizeEventSearch, parseEventIds } from './events.ts';

export interface AdminEventsEnv {
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface SupabaseAdminEventRow {
  id: number;
  title: string;
  organizer: string | null;
  category: string | null;
  criteria: string | null;
  points: string | null;
  format: string | null;
  deadline: string | null;
  deadline_time: string | null;
  close_on_full: boolean | number | null;
  description: string | null;
  link: string | null;
  classification: string | null;
  location_type: string | null;
  status: string | null;
  is_manually_closed: boolean | number | null;
  is_deleted: boolean | number | null;
  created_at: string;
  event_date: string | null;
  event_time: string | null;
  registration_start_date: string | null;
  registration_start_time: string | null;
  image_url: string | null;
  contribution_link: string | null;
  contributor_note: string | null;
  section: string | null;
  score: string | number | null;
}

interface D1AdminEventRow extends Omit<
  SupabaseAdminEventRow,
  'close_on_full' | 'is_manually_closed' | 'is_deleted'
> {
  close_on_full: number;
  is_manually_closed: number;
  is_deleted: number;
}

export type AdminEventState = 'all' | 'published' | 'pending' | 'deleted';

export interface AdminEventQuery {
  limit: number;
  offset: number;
  search: string;
  state: AdminEventState;
  criteria: string;
  scope: string;
  group: 'all' | 'open' | 'closed';
  ids: number[] | null;
  sort: 'newest' | 'oldest' | 'expiring_soon';
}

export const ADMIN_EVENT_SOURCE_COLUMNS = [
  'id',
  'title',
  'organizer',
  'category',
  'criteria',
  'points',
  'format',
  'deadline',
  'deadline_time',
  'close_on_full',
  'description',
  'link',
  'classification',
  'location_type',
  'status',
  'is_manually_closed',
  'is_deleted',
  'created_at',
  'event_date',
  'event_time',
  'registration_start_date',
  'registration_start_time',
  'image_url',
  'contribution_link',
  'contributor_note',
  'section',
  'score',
] as const;

const ADMIN_EVENT_RESPONSE_COLUMNS = [
  'id',
  'title',
  'organizer',
  'category',
  'criteria',
  'points',
  'format',
  'deadline',
  'deadline_time',
  'close_on_full',
  'description',
  'link',
  'classification',
  'location_type',
  'status',
  'is_manually_closed',
  'is_deleted',
  'created_at',
  'event_date',
  'event_time',
  'registration_start_date',
  'registration_start_time',
  'image_url',
] as const;

const SYNC_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;
const MAX_SEARCH_LENGTH = 120;

const clean = (value: unknown) => String(value || '').trim();

const readInteger = (value: string | null, fallback: number) => {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const clampLimit = (value: string | null) =>
  Math.max(
    1,
    Math.min(readInteger(value, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  );

export const parseAdminEventQuery = (
  params: URLSearchParams
): AdminEventQuery => {
  const rawState = clean(params.get('state')).toLowerCase();
  const state: AdminEventState =
    rawState === 'published' || rawState === 'pending' || rawState === 'deleted'
      ? rawState
      : 'all';
  const rawSort = clean(params.get('sort')).toLowerCase();
  const sort =
    rawSort === 'oldest' || rawSort === 'expiring_soon'
      ? rawSort
      : 'newest';
  const rawGroup = clean(params.get('group')).toLowerCase();
  const group =
    rawGroup === 'open' || rawGroup === 'closed' ? rawGroup : 'all';

  return {
    limit: clampLimit(params.get('limit')),
    offset: Math.max(0, readInteger(params.get('offset'), 0)),
    search: normalizeEventSearch(params.get('search')).slice(
      0,
      MAX_SEARCH_LENGTH
    ),
    state,
    criteria: clean(params.get('criteria') || 'all'),
    scope: clean(params.get('scope') || 'all'),
    group,
    ids: parseEventIds(params.get('ids')),
    sort,
  };
};

export const buildSupabaseAdminEventsUrl = (
  baseUrl: string,
  offset = 0
) => {
  const url = new URL('/rest/v1/events', baseUrl.replace(/\/$/, ''));
  url.searchParams.set('select', ADMIN_EVENT_SOURCE_COLUMNS.join(','));
  url.searchParams.set('order', 'id.asc');
  url.searchParams.set('limit', String(SYNC_PAGE_SIZE));
  url.searchParams.set('offset', String(Math.max(0, offset)));
  return url;
};

const readSupabaseAdminEvents = async (env: AdminEventsEnv) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Cloudflare admin event sync is missing Supabase service configuration.'
    );
  }

  const rows: SupabaseAdminEventRow[] = [];
  for (let offset = 0; ; offset += SYNC_PAGE_SIZE) {
    const response = await fetch(
      buildSupabaseAdminEventsUrl(env.SUPABASE_URL, offset),
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(
        `Supabase admin event sync failed with status ${response.status}.`
      );
    }
    const page = (await response.json()) as SupabaseAdminEventRow[];
    rows.push(...page);
    if (page.length < SYNC_PAGE_SIZE) break;
  }
  return rows;
};

const writeAdminEventRows = async (
  env: AdminEventsEnv,
  rows: SupabaseAdminEventRow[]
) => {
  if (rows.length === 0) return;

  const statement = `
    INSERT INTO admin_events (
      id, title, organizer, category, criteria, points, format, deadline,
      deadline_time, close_on_full, description, link, classification,
      location_type, status, is_manually_closed, is_deleted, created_at,
      event_date, event_time, registration_start_date, registration_start_time,
      image_url, contribution_link, contributor_note, section, score,
      title_search, organizer_search
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      organizer = excluded.organizer,
      category = excluded.category,
      criteria = excluded.criteria,
      points = excluded.points,
      format = excluded.format,
      deadline = excluded.deadline,
      deadline_time = excluded.deadline_time,
      close_on_full = excluded.close_on_full,
      description = excluded.description,
      link = excluded.link,
      classification = excluded.classification,
      location_type = excluded.location_type,
      status = excluded.status,
      is_manually_closed = excluded.is_manually_closed,
      is_deleted = excluded.is_deleted,
      created_at = excluded.created_at,
      event_date = excluded.event_date,
      event_time = excluded.event_time,
      registration_start_date = excluded.registration_start_date,
      registration_start_time = excluded.registration_start_time,
      image_url = excluded.image_url,
      contribution_link = excluded.contribution_link,
      contributor_note = excluded.contributor_note,
      section = excluded.section,
      score = excluded.score,
      title_search = excluded.title_search,
      organizer_search = excluded.organizer_search
    WHERE admin_events.title IS NOT excluded.title
       OR admin_events.organizer IS NOT excluded.organizer
       OR admin_events.category IS NOT excluded.category
       OR admin_events.criteria IS NOT excluded.criteria
       OR admin_events.points IS NOT excluded.points
       OR admin_events.format IS NOT excluded.format
       OR admin_events.deadline IS NOT excluded.deadline
       OR admin_events.deadline_time IS NOT excluded.deadline_time
       OR admin_events.close_on_full IS NOT excluded.close_on_full
       OR admin_events.description IS NOT excluded.description
       OR admin_events.link IS NOT excluded.link
       OR admin_events.classification IS NOT excluded.classification
       OR admin_events.location_type IS NOT excluded.location_type
       OR admin_events.status IS NOT excluded.status
       OR admin_events.is_manually_closed IS NOT excluded.is_manually_closed
       OR admin_events.is_deleted IS NOT excluded.is_deleted
       OR admin_events.created_at IS NOT excluded.created_at
       OR admin_events.event_date IS NOT excluded.event_date
       OR admin_events.event_time IS NOT excluded.event_time
       OR admin_events.registration_start_date IS NOT excluded.registration_start_date
       OR admin_events.registration_start_time IS NOT excluded.registration_start_time
       OR admin_events.image_url IS NOT excluded.image_url
       OR admin_events.contribution_link IS NOT excluded.contribution_link
       OR admin_events.contributor_note IS NOT excluded.contributor_note
       OR admin_events.section IS NOT excluded.section
       OR admin_events.score IS NOT excluded.score
       OR admin_events.title_search IS NOT excluded.title_search
       OR admin_events.organizer_search IS NOT excluded.organizer_search
  `;

  for (let index = 0; index < rows.length; index += 50) {
    const batch = rows.slice(index, index + 50).map((row) =>
      env.DB.prepare(statement).bind(
        Number(row.id),
        String(row.title || ''),
        row.organizer || null,
        row.category || null,
        row.criteria || null,
        row.points === null || row.points === undefined
          ? null
          : String(row.points),
        row.format || null,
        row.deadline || null,
        row.deadline_time || null,
        row.close_on_full ? 1 : 0,
        row.description || null,
        row.link || null,
        row.classification || null,
        row.location_type || null,
        row.status || null,
        row.is_manually_closed ? 1 : 0,
        row.is_deleted ? 1 : 0,
        row.created_at,
        row.event_date || null,
        row.event_time || null,
        row.registration_start_date || null,
        row.registration_start_time || null,
        row.image_url || null,
        row.contribution_link || null,
        row.contributor_note || null,
        row.section || null,
        row.score === null || row.score === undefined
          ? null
          : String(row.score),
        normalizeEventSearch(row.title),
        normalizeEventSearch(row.organizer)
      )
    );
    await env.DB.batch(batch);
  }
};

const refreshAdminEventMetadata = async (env: AdminEventsEnv) => {
  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS row_count, MAX(created_at) AS max_created_at
       FROM admin_events`
  ).first<{ row_count: number; max_created_at: string | null }>();
  const rowCount = Number(summary?.row_count || 0);
  const syncedAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO sync_metadata (
       resource, source_row_count, source_max_created_at, synced_at,
       visible_row_count
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET
       source_row_count = excluded.source_row_count,
       source_max_created_at = excluded.source_max_created_at,
       synced_at = excluded.synced_at,
       visible_row_count = excluded.visible_row_count`
  )
    .bind(
      'admin_events',
      rowCount,
      summary?.max_created_at || null,
      syncedAt,
      rowCount
    )
    .run();
};

export const mirrorAdminEventRow = async (
  env: AdminEventsEnv,
  row: SupabaseAdminEventRow
) => {
  await writeAdminEventRows(env, [row]);
  await refreshAdminEventMetadata(env);
};

const deleteMissingAdminEvents = async (
  env: AdminEventsEnv,
  sourceRows: SupabaseAdminEventRow[]
) => {
  const sourceIds = new Set(sourceRows.map((row) => Number(row.id)));
  const existing = await env.DB
    .prepare('SELECT id FROM admin_events')
    .all<{ id: number }>();
  const staleIds = (existing.results || [])
    .map((row) => Number(row.id))
    .filter((id) => !sourceIds.has(id));

  for (let index = 0; index < staleIds.length; index += 100) {
    const ids = staleIds.slice(index, index + 100);
    if (ids.length === 0) continue;
    await env.DB.prepare(
      `DELETE FROM admin_events WHERE id IN (${ids.map(() => '?').join(', ')})`
    )
      .bind(...ids)
      .run();
  }
  return staleIds.length;
};

export const syncAdminEvents = async (env: AdminEventsEnv) => {
  const rows = await readSupabaseAdminEvents(env);
  await writeAdminEventRows(env, rows);
  const deleted = await deleteMissingAdminEvents(env, rows);
  const sourceMaxCreatedAt = rows.reduce<string | null>(
    (current, row) =>
      !current || row.created_at > current ? row.created_at : current,
    null
  );
  const syncedAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO sync_metadata (
       resource, source_row_count, source_max_created_at, synced_at,
       visible_row_count
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET
       source_row_count = excluded.source_row_count,
       source_max_created_at = excluded.source_max_created_at,
       synced_at = excluded.synced_at,
       visible_row_count = excluded.visible_row_count`
  )
    .bind('admin_events', rows.length, sourceMaxCreatedAt, syncedAt, rows.length)
    .run();

  return {
    sourceRowCount: rows.length,
    deleted,
    syncedAt,
  };
};

const formatTimestamp = (value: string) =>
  value
    .replace(/\.([0-9]*?[1-9])0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '.$1')
    .replace(/\.0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '');

const adminEventResponseRow = (row: D1AdminEventRow) => ({
  ...row,
  close_on_full: Boolean(row.close_on_full),
  is_manually_closed: Boolean(row.is_manually_closed),
  is_deleted: Boolean(row.is_deleted),
  created_at: formatTimestamp(row.created_at),
});

export const handleAdminEvents = async (
  requestUrl: URL,
  env: AdminEventsEnv
) => {
  const query = parseAdminEventQuery(requestUrl.searchParams);
  const where: string[] = [];
  const bindings: Array<string | number> = [];

  if (query.state === 'published') {
    where.push('COALESCE(is_deleted, 0) = 0');
    where.push("COALESCE(status, '') != 'pending'");
  } else if (query.state === 'pending') {
    where.push("status = 'pending'");
  } else if (query.state === 'deleted') {
    where.push('COALESCE(is_deleted, 0) = 1');
  }
  if (query.ids !== null) {
    if (query.ids.length === 0) {
      return {
        success: true,
        data: [],
        total: 0,
        hasMore: false,
      };
    }
    where.push(`id IN (${query.ids.map(() => '?').join(', ')})`);
    bindings.push(...query.ids);
  }
  if (
    query.criteria &&
    query.criteria !== 'all' &&
    query.criteria !== 'participated'
  ) {
    where.push('criteria = ?');
    bindings.push(query.criteria);
  }
  if (query.scope === 'internal') {
    where.push("location_type = 'Trong trường'");
  } else if (query.scope === 'external') {
    where.push("location_type = 'Ngoài trường'");
  }
  if (query.group === 'open') {
    where.push('COALESCE(is_manually_closed, 0) = 0');
    where.push("COALESCE(status, '') != 'Đã kết thúc'");
  } else if (query.group === 'closed') {
    where.push(
      "(COALESCE(is_manually_closed, 0) = 1 OR status = 'Đã kết thúc')"
    );
  }
  if (query.search) {
    where.push('(title_search LIKE ? OR organizer_search LIKE ?)');
    bindings.push(`%${query.search}%`, `%${query.search}%`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql =
    query.sort === 'oldest'
      ? 'created_at ASC, id ASC'
      : query.sort === 'expiring_soon'
        ? 'deadline IS NULL ASC, deadline ASC, created_at DESC, id DESC'
      : 'created_at DESC, id DESC';
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM admin_events ${whereSql}`
  )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Number(countRow?.total || 0);
  const result = await env.DB.prepare(
    `SELECT ${ADMIN_EVENT_RESPONSE_COLUMNS.join(', ')}
       FROM admin_events
       ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?`
  )
    .bind(...bindings, query.limit, query.offset)
    .all<D1AdminEventRow>();
  const data = (result.results || []).map(adminEventResponseRow);

  return {
    success: true,
    data,
    total,
    hasMore: total > query.offset + data.length,
  };
};
