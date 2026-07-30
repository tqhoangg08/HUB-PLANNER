interface EventsEnv {
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface SupabaseEventRow {
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
}

interface D1EventRow extends Omit<
  SupabaseEventRow,
  'close_on_full' | 'is_manually_closed' | 'is_deleted'
> {
  close_on_full: number;
  is_manually_closed: number;
  is_deleted: number;
}

export interface EventQuery {
  limit: number;
  offset: number;
  search: string;
  criteria: string;
  scope: string;
  sort: 'newest' | 'oldest' | 'expiring_soon';
  group: 'all' | 'open' | 'closed';
  ids: number[] | null;
}

const EVENT_COLUMNS = [
  'id',
  'title',
  'criteria',
  'points',
  'format',
  'deadline',
  'deadline_time',
  'close_on_full',
  'description',
  'link',
  'organizer',
  'category',
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
const MAX_EVENT_IDS = 100;

const clean = (value: unknown) => String(value || '').trim();

export const normalizeEventSearch = (value: unknown) =>
  clean(value)
    .toLocaleLowerCase('vi-VN')
    .replace(/[%,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clampLimit = (value: string | null) =>
  Math.max(1, Math.min(Number(value) || 100, 100));

export const parseEventIds = (value: string | null) => {
  if (value === null) return null;
  const ids = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, MAX_EVENT_IDS);
};

export const parseEventQuery = (params: URLSearchParams): EventQuery => {
  const rawSort = clean(params.get('sort'));
  const sort =
    rawSort === 'oldest' || rawSort === 'expiring_soon' ? rawSort : 'newest';
  const rawGroup = clean(params.get('group'));
  const group =
    rawGroup === 'open' || rawGroup === 'closed' ? rawGroup : 'all';

  return {
    limit: clampLimit(params.get('limit')),
    offset: Math.max(0, Number(params.get('offset')) || 0),
    search: normalizeEventSearch(params.get('search')),
    criteria: clean(params.get('criteria') || 'all'),
    scope: clean(params.get('scope') || 'all'),
    sort,
    group,
    ids: parseEventIds(params.get('ids')),
  };
};

export const buildSupabaseEventsUrl = (
  baseUrl: string,
  offset = 0
) => {
  const url = new URL('/rest/v1/events', baseUrl.replace(/\/$/, ''));
  url.searchParams.set('select', EVENT_COLUMNS.join(','));
  url.searchParams.set('or', '(is_deleted.is.false,is_deleted.is.null)');
  url.searchParams.set('status', 'neq.pending');
  url.searchParams.set('order', 'id.asc');
  url.searchParams.set('limit', String(SYNC_PAGE_SIZE));
  url.searchParams.set('offset', String(Math.max(0, offset)));
  return url;
};

const readSupabaseEvents = async (env: EventsEnv) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Cloudflare event sync is missing Supabase service configuration.');
  }

  const rows: SupabaseEventRow[] = [];
  for (let offset = 0; ; offset += SYNC_PAGE_SIZE) {
    const response = await fetch(buildSupabaseEventsUrl(env.SUPABASE_URL, offset), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Supabase event sync failed with status ${response.status}.`);
    }
    const page = (await response.json()) as SupabaseEventRow[];
    rows.push(...page);
    if (page.length < SYNC_PAGE_SIZE) break;
  }
  return rows;
};

const writeEventRows = async (env: EventsEnv, rows: SupabaseEventRow[]) => {
  if (rows.length === 0) return;

  const statement = `
    INSERT INTO public_events (
      id, title, organizer, category, criteria, points, format, deadline,
      deadline_time, close_on_full, description, link, classification,
      location_type, status, is_manually_closed, is_deleted, created_at,
      event_date, event_time, registration_start_date, registration_start_time,
      image_url, title_search, organizer_search
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
      title_search = excluded.title_search,
      organizer_search = excluded.organizer_search
    WHERE public_events.title IS NOT excluded.title
       OR public_events.organizer IS NOT excluded.organizer
       OR public_events.category IS NOT excluded.category
       OR public_events.criteria IS NOT excluded.criteria
       OR public_events.points IS NOT excluded.points
       OR public_events.format IS NOT excluded.format
       OR public_events.deadline IS NOT excluded.deadline
       OR public_events.deadline_time IS NOT excluded.deadline_time
       OR public_events.close_on_full IS NOT excluded.close_on_full
       OR public_events.description IS NOT excluded.description
       OR public_events.link IS NOT excluded.link
       OR public_events.classification IS NOT excluded.classification
       OR public_events.location_type IS NOT excluded.location_type
       OR public_events.status IS NOT excluded.status
       OR public_events.is_manually_closed IS NOT excluded.is_manually_closed
       OR public_events.is_deleted IS NOT excluded.is_deleted
       OR public_events.created_at IS NOT excluded.created_at
       OR public_events.event_date IS NOT excluded.event_date
       OR public_events.event_time IS NOT excluded.event_time
       OR public_events.registration_start_date IS NOT excluded.registration_start_date
       OR public_events.registration_start_time IS NOT excluded.registration_start_time
       OR public_events.image_url IS NOT excluded.image_url
       OR public_events.title_search IS NOT excluded.title_search
       OR public_events.organizer_search IS NOT excluded.organizer_search
  `;

  for (let index = 0; index < rows.length; index += 50) {
    const batch = rows.slice(index, index + 50).map((row) =>
      env.DB.prepare(statement).bind(
        Number(row.id),
        String(row.title || ''),
        row.organizer || null,
        row.category || null,
        row.criteria || null,
        row.points === null || row.points === undefined ? null : String(row.points),
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
        normalizeEventSearch(row.title),
        normalizeEventSearch(row.organizer)
      )
    );
    await env.DB.batch(batch);
  }
};

const deleteMissingEvents = async (env: EventsEnv, sourceRows: SupabaseEventRow[]) => {
  const sourceIds = new Set(sourceRows.map((row) => Number(row.id)));
  const existing = await env.DB.prepare('SELECT id FROM public_events').all<{ id: number }>();
  const staleIds = (existing.results || [])
    .map((row) => Number(row.id))
    .filter((id) => !sourceIds.has(id));
  for (let index = 0; index < staleIds.length; index += 100) {
    const ids = staleIds.slice(index, index + 100);
    if (ids.length === 0) continue;
    await env.DB.prepare(
      `DELETE FROM public_events WHERE id IN (${ids.map(() => '?').join(', ')})`
    ).bind(...ids).run();
  }
  return staleIds.length;
};

export const syncPublicEvents = async (env: EventsEnv) => {
  const rows = await readSupabaseEvents(env);
  await writeEventRows(env, rows);
  const deleted = await deleteMissingEvents(env, rows);
  const sourceMaxCreatedAt = rows.reduce<string | null>(
    (current, row) =>
      !current || row.created_at > current ? row.created_at : current,
    null
  );
  const visibleRowCount = rows.length;
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
    .bind('events', rows.length, sourceMaxCreatedAt, syncedAt, visibleRowCount)
    .run();

  return {
    sourceRowCount: rows.length,
    visibleRowCount,
    deleted,
    syncedAt,
  };
};

const formatTimestamp = (value: string) =>
  value
    .replace(/\.([0-9]*?[1-9])0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '.$1')
    .replace(/\.0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '');

const publicEventRow = (row: D1EventRow) => ({
  ...row,
  close_on_full: Boolean(row.close_on_full),
  is_manually_closed: Boolean(row.is_manually_closed),
  is_deleted: Boolean(row.is_deleted),
  created_at: formatTimestamp(row.created_at),
});

export const handleEvents = async (requestUrl: URL, env: EventsEnv) => {
  const query = parseEventQuery(requestUrl.searchParams);
  if (query.ids !== null && query.ids.length === 0) {
    return {
      success: true,
      data: [],
      total: 0,
      hasMore: false,
    };
  }

  const where = [
    'COALESCE(is_deleted, 0) = 0',
    "COALESCE(status, '') != 'pending'",
  ];
  const bindings: Array<string | number> = [];

  if (query.ids) {
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
    where.push("(COALESCE(is_manually_closed, 0) = 1 OR status = 'Đã kết thúc')");
  }
  if (query.search) {
    where.push('(title_search LIKE ? OR organizer_search LIKE ?)');
    bindings.push(`%${query.search}%`, `%${query.search}%`);
  }

  const whereSql = where.join(' AND ');
  const orderSql =
    query.sort === 'oldest'
      ? 'created_at ASC'
      : query.sort === 'expiring_soon'
        ? 'deadline IS NULL ASC, deadline ASC, created_at DESC'
        : 'created_at DESC';
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM public_events WHERE ${whereSql}`
  ).bind(...bindings).first<{ total: number }>();
  const total = Number(countRow?.total || 0);
  const result = await env.DB.prepare(
    `SELECT ${EVENT_COLUMNS.join(', ')}
       FROM public_events
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?`
  )
    .bind(...bindings, query.limit, query.offset)
    .all<D1EventRow>();
  const data = (result.results || []).map(publicEventRow);

  return {
    success: true,
    data,
    total,
    hasMore: total > query.offset + data.length,
  };
};
