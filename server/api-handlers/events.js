import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../middleware.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EVENT_LIST_COLUMNS = [
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
].join(', ');

const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;
const publicEventsCache = new Map();

async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức GET' });
  }

  try {
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
    const cacheControl = String(request.headers['cache-control'] || '');
    const bypassCache = requestUrl.searchParams.has('refresh') || cacheControl.includes('no-cache');
    const limit = Math.max(1, Math.min(Number(requestUrl.searchParams.get('limit')) || 300, 100));
    const offset = Math.max(0, Number(requestUrl.searchParams.get('offset')) || 0);
    const search = String(requestUrl.searchParams.get('search') || '').trim();
    const criteria = String(requestUrl.searchParams.get('criteria') || 'all');
    const scope = String(requestUrl.searchParams.get('scope') || 'all');
    const sort = String(requestUrl.searchParams.get('sort') || 'newest');
    const includeHidden = requestUrl.searchParams.has('includeHidden')
      ? requestUrl.searchParams.get('includeHidden') === '1'
      : true;
    const ids = String(requestUrl.searchParams.get('ids') || '')
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    const cacheKey = requestUrl.searchParams.toString() || 'default';

    response.setHeader(
      'Cache-Control',
      bypassCache
        ? 'no-store, max-age=0'
        : 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800'
    );

    const cached = publicEventsCache.get(cacheKey);
    if (!bypassCache && cached && cached.expiresAt > Date.now()) {
      response.setHeader('X-Hub-Cache', 'memory-hit');
      return response.status(200).json(cached.payload);
    }

    let query = supabase
      .from('events')
      .select(EVENT_LIST_COLUMNS, { count: 'exact' });

    if (!includeHidden) {
      query = query.or('is_deleted.is.false,is_deleted.is.null').neq('status', 'pending');
    }

    if (ids.length > 0) {
      query = query.in('id', ids);
    }

    if (criteria && criteria !== 'all' && criteria !== 'participated') {
      query = query.eq('criteria', criteria);
    }

    if (scope === 'internal') {
      query = query.eq('location_type', 'Trong trường');
    } else if (scope === 'external') {
      query = query.eq('location_type', 'Ngoài trường');
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,organizer.ilike.%${search}%`);
    }

    if (sort === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (sort === 'expiring_soon') {
      query = query
        .order('deadline', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const rows = data || [];
    const payload = {
      success: true,
      data: rows,
      total: count || 0,
      hasMore: (count || 0) > offset + rows.length,
    };

    if (bypassCache) {
      publicEventsCache.clear();
    } else {
      publicEventsCache.set(cacheKey, {
        expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS,
        payload,
      });
    }

    response.setHeader('X-Hub-Cache', bypassCache ? 'bypass' : 'miss');
    return response.status(200).json(payload);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

export default withLogging(handler);
