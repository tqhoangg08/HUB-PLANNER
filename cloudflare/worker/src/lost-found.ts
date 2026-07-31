interface LostFoundEnv {
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface SupabaseLostFoundRow {
  id: number;
  created_at: string;
  type: 'FOUND' | 'LOST';
  title: string;
  description: string | null;
  location: string | null;
  contact_info: string | null;
  user_name: string | null;
  image_url: string | null;
  status: 'approved' | 'resolved';
  is_deleted: boolean | number | null;
  user_id: string | null;
}

interface D1LostFoundRow extends Omit<SupabaseLostFoundRow, 'is_deleted'> {
  is_deleted: number;
}

export interface LostFoundQuery {
  limit: number;
  offset: number;
  type: 'FOUND' | 'LOST' | null;
  search: string;
}

const LOST_FOUND_COLUMNS = [
  'id',
  'created_at',
  'type',
  'title',
  'description',
  'location',
  'contact_info',
  'user_name',
  'image_url',
  'status',
  'is_deleted',
  'user_id',
] as const;

const SYNC_PAGE_SIZE = 500;

export const normalizeLostFoundSearch = (value: unknown) =>
  String(value || '')
    .toLocaleLowerCase('vi-VN')
    .trim()
    .replace(/[%,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const parseLostFoundQuery = (params: URLSearchParams): LostFoundQuery => {
  const rawType = String(params.get('type') || '').trim().toUpperCase();
  return {
    limit: Math.max(1, Math.min(Number(params.get('limit')) || 24, 50)),
    offset: Math.max(0, Number(params.get('offset')) || 0),
    type: rawType === 'FOUND' || rawType === 'LOST' ? rawType : null,
    search: normalizeLostFoundSearch(params.get('search')),
  };
};

export const buildSupabaseLostFoundUrl = (
  baseUrl: string,
  offset = 0
) => {
  const url = new URL(
    '/rest/v1/lost_found_items',
    baseUrl.replace(/\/$/, '')
  );
  url.searchParams.set('select', LOST_FOUND_COLUMNS.join(','));
  url.searchParams.set('is_deleted', 'eq.false');
  url.searchParams.set('status', 'in.(approved,resolved)');
  url.searchParams.set('order', 'id.asc');
  url.searchParams.set('limit', String(SYNC_PAGE_SIZE));
  url.searchParams.set('offset', String(Math.max(0, offset)));
  return url;
};

const readSupabaseLostFound = async (env: LostFoundEnv) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Cloudflare lost-found sync is missing Supabase service configuration.'
    );
  }

  const rows: SupabaseLostFoundRow[] = [];
  for (let offset = 0; ; offset += SYNC_PAGE_SIZE) {
    const response = await fetch(
      buildSupabaseLostFoundUrl(env.SUPABASE_URL, offset),
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(
        `Supabase lost-found sync failed with status ${response.status}.`
      );
    }
    const page = (await response.json()) as SupabaseLostFoundRow[];
    rows.push(...page);
    if (page.length < SYNC_PAGE_SIZE) break;
  }
  return rows;
};

const writeLostFoundRows = async (
  env: LostFoundEnv,
  rows: SupabaseLostFoundRow[]
) => {
  if (rows.length === 0) return;

  const statement = `
    INSERT INTO public_lost_found_items (
      id, created_at, type, title, description, location, contact_info,
      user_name, image_url, status, is_deleted, user_id, title_search,
      location_search, description_search
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      created_at = excluded.created_at,
      type = excluded.type,
      title = excluded.title,
      description = excluded.description,
      location = excluded.location,
      contact_info = excluded.contact_info,
      user_name = excluded.user_name,
      image_url = excluded.image_url,
      status = excluded.status,
      is_deleted = excluded.is_deleted,
      user_id = excluded.user_id,
      title_search = excluded.title_search,
      location_search = excluded.location_search,
      description_search = excluded.description_search
    WHERE public_lost_found_items.created_at IS NOT excluded.created_at
       OR public_lost_found_items.type IS NOT excluded.type
       OR public_lost_found_items.title IS NOT excluded.title
       OR public_lost_found_items.description IS NOT excluded.description
       OR public_lost_found_items.location IS NOT excluded.location
       OR public_lost_found_items.contact_info IS NOT excluded.contact_info
       OR public_lost_found_items.user_name IS NOT excluded.user_name
       OR public_lost_found_items.image_url IS NOT excluded.image_url
       OR public_lost_found_items.status IS NOT excluded.status
       OR public_lost_found_items.is_deleted IS NOT excluded.is_deleted
       OR public_lost_found_items.user_id IS NOT excluded.user_id
       OR public_lost_found_items.title_search IS NOT excluded.title_search
       OR public_lost_found_items.location_search IS NOT excluded.location_search
       OR public_lost_found_items.description_search IS NOT excluded.description_search
  `;

  for (let index = 0; index < rows.length; index += 50) {
    const batch = rows.slice(index, index + 50).map((row) =>
      env.DB.prepare(statement).bind(
        Number(row.id),
        row.created_at,
        row.type,
        String(row.title || ''),
        row.description || null,
        row.location || null,
        row.contact_info || null,
        row.user_name || null,
        row.image_url || null,
        row.status,
        row.is_deleted ? 1 : 0,
        row.user_id || null,
        normalizeLostFoundSearch(row.title),
        normalizeLostFoundSearch(row.location),
        normalizeLostFoundSearch(row.description)
      )
    );
    await env.DB.batch(batch);
  }
};

const deleteMissingLostFound = async (
  env: LostFoundEnv,
  sourceRows: SupabaseLostFoundRow[]
) => {
  const sourceIds = new Set(sourceRows.map((row) => Number(row.id)));
  const existing = await env.DB.prepare(
    'SELECT id FROM public_lost_found_items'
  ).all<{ id: number }>();
  const staleIds = (existing.results || [])
    .map((row) => Number(row.id))
    .filter((id) => !sourceIds.has(id));

  for (let index = 0; index < staleIds.length; index += 100) {
    const ids = staleIds.slice(index, index + 100);
    if (ids.length === 0) continue;
    await env.DB.prepare(
      `DELETE FROM public_lost_found_items WHERE id IN (${ids
        .map(() => '?')
        .join(', ')})`
    )
      .bind(...ids)
      .run();
  }
  return staleIds.length;
};

export const syncPublicLostFound = async (env: LostFoundEnv) => {
  const rows = await readSupabaseLostFound(env);
  await writeLostFoundRows(env, rows);
  const deleted = await deleteMissingLostFound(env, rows);
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
    .bind(
      'lost_found_items',
      rows.length,
      sourceMaxCreatedAt,
      syncedAt,
      rows.length
    )
    .run();

  return {
    sourceRowCount: rows.length,
    visibleRowCount: rows.length,
    deleted,
    syncedAt,
  };
};

const formatTimestamp = (value: string) =>
  value
    .replace(
      /\.([0-9]*?[1-9])0+(?=(?:Z|[+-]\d{2}:\d{2})$)/,
      '.$1'
    )
    .replace(/\.0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '');

const publicLostFoundRow = (row: D1LostFoundRow) => ({
  ...row,
  created_at: formatTimestamp(row.created_at),
  is_deleted: Boolean(row.is_deleted),
});

export const handleLostFound = async (
  requestUrl: URL,
  env: LostFoundEnv
) => {
  const query = parseLostFoundQuery(requestUrl.searchParams);
  const where = [
    'is_deleted = 0',
    "status IN ('approved', 'resolved')",
  ];
  const bindings: Array<string | number> = [];

  if (query.type) {
    where.push('type = ?');
    bindings.push(query.type);
  }
  if (query.search) {
    where.push(
      '(title_search LIKE ? OR location_search LIKE ? OR description_search LIKE ?)'
    );
    const pattern = `%${query.search}%`;
    bindings.push(pattern, pattern, pattern);
  }

  const whereSql = where.join(' AND ');
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total
       FROM public_lost_found_items
      WHERE ${whereSql}`
  )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Number(countRow?.total || 0);
  const result = await env.DB.prepare(
    `SELECT ${LOST_FOUND_COLUMNS.join(', ')}
       FROM public_lost_found_items
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`
  )
    .bind(...bindings, query.limit, query.offset)
    .all<D1LostFoundRow>();
  const data = (result.results || []).map(publicLostFoundRow);

  return {
    success: true,
    data,
    total,
    hasMore: total > query.offset + data.length,
  };
};
