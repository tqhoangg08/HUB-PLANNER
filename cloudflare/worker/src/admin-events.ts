import { normalizeEventSearch, parseEventIds } from './events.ts';
import type { PushEventMessage } from './push-events.ts';

export interface AdminEventsEnv {
  DB: D1Database;
  EVENT_PUSH_CUTOFF?: string;
  PUSH_EVENTS_QUEUE?: Queue<PushEventMessage>;
}

export interface CoreAdminEventRow {
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
  CoreAdminEventRow,
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
