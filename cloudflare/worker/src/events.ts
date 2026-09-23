export interface EventsEnv {
  DB: D1Database;
}

export interface CoreEventRow {
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
  view_count: number;
}

interface D1EventRow extends Omit<
  CoreEventRow,
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
  eventType: string;
  dateFrom: string;
  dateTo: string;
  registrationStatus: string;
  sort: 'newest' | 'oldest' | 'expiring_soon' | 'upcoming' | 'highest_score';
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
  'view_count',
] as const;

export const parseEventViewId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
};

export const incrementPublicEventView = async (env: EventsEnv, id: number) => {
  const row = await env.DB.prepare(`
    UPDATE public_events
       SET view_count = view_count + 1
     WHERE id = ?
       AND COALESCE(is_deleted, 0) = 0
       AND COALESCE(status, '') != 'pending'
     RETURNING view_count
  `).bind(id).first<{ view_count: number }>();
  return row ? Number(row.view_count) : null;
};

export const incrementPendingAdminEventView = async (env: EventsEnv, id: number) => {
  const row = await env.DB.prepare(`
    UPDATE admin_events
       SET view_count = view_count + 1
     WHERE id = ?
       AND COALESCE(is_deleted, 0) = 0
       AND status = 'pending'
     RETURNING view_count
  `).bind(id).first<{ view_count: number }>();
  return row ? Number(row.view_count) : null;
};

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
  const sort = ['oldest', 'expiring_soon', 'upcoming', 'highest_score'].includes(rawSort)
    ? rawSort as EventQuery['sort']
    : 'newest';
  const rawGroup = clean(params.get('group'));
  const group =
    rawGroup === 'open' || rawGroup === 'closed' ? rawGroup : 'all';

  return {
    limit: clampLimit(params.get('limit')),
    offset: Math.max(0, Number(params.get('offset')) || 0),
    search: normalizeEventSearch(params.get('search')),
    criteria: clean(params.get('criteria') || 'all'),
    scope: clean(params.get('scope') || 'all'),
    eventType: clean(params.get('eventType') || 'all'),
    dateFrom: clean(params.get('dateFrom')),
    dateTo: clean(params.get('dateTo')),
    registrationStatus: clean(params.get('registrationStatus') || 'all'),
    sort,
    group,
    ids: parseEventIds(params.get('ids')),
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
    const criteria = query.criteria.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 5);
    where.push(`criteria IN (${criteria.map(() => '?').join(', ')})`);
    bindings.push(...criteria);
  }
  if (query.scope === 'internal') {
    where.push("location_type = 'Trong trường'");
  } else if (query.scope === 'external') {
    where.push("location_type = 'Ngoài trường'");
  }
  if (query.eventType !== 'all') {
    where.push('category = ?');
    bindings.push(query.eventType);
  }
  if (query.dateFrom) {
    where.push('event_date >= ?');
    bindings.push(query.dateFrom);
  }
  if (query.dateTo) {
    where.push('event_date <= ?');
    bindings.push(query.dateTo);
  }
  if (query.registrationStatus === 'ended') {
    where.push("(COALESCE(is_manually_closed, 0) = 1 OR LOWER(COALESCE(status, '')) LIKE '%kết thúc%' OR (event_date IS NOT NULL AND event_date < date('now'))) ");
  } else if (query.registrationStatus === 'ongoing') {
    where.push("(event_date = date('now') OR LOWER(COALESCE(status, '')) LIKE '%đang diễn ra%')");
  } else if (query.registrationStatus === 'upcoming') {
    where.push("registration_start_date IS NOT NULL AND registration_start_date > date('now')");
  } else if (query.registrationStatus === 'closed') {
    where.push("(deadline IS NOT NULL AND deadline < date('now'))");
  } else if (query.registrationStatus === 'open') {
    where.push("COALESCE(is_manually_closed, 0) = 0 AND (deadline IS NULL OR deadline >= date('now')) AND (registration_start_date IS NULL OR registration_start_date <= date('now')) AND (event_date IS NULL OR event_date >= date('now'))");
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
        : query.sort === 'upcoming'
          ? 'event_date IS NULL ASC, event_date ASC, created_at DESC'
          : query.sort === 'highest_score'
            ? 'CAST(points AS REAL) DESC, created_at DESC'
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
