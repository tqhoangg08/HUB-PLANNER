import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../middleware.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CACHE_TTL_MS = 60 * 1000;
const publicListsCache = new Map();

const ANNOUNCEMENT_COLUMNS = 'id,title,link,is_new,date,created_at';
const LOST_FOUND_COLUMNS = 'id,created_at,type,title,description,location,contact_info,user_name,image_url,status,is_deleted,user_id';

const clamp = (value, fallback, max) => Math.max(1, Math.min(Number(value) || fallback, max));
const cleanSearch = (value) => String(value || '').trim().replace(/[%,]/g, ' ').replace(/\s+/g, ' ');

const setPublicCacheHeaders = (response, bypassCache) => {
  response.setHeader(
    'Cache-Control',
    bypassCache
      ? 'no-store, max-age=0'
      : 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'
  );
};

const readCache = (key) => {
  const cached = publicListsCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.payload;
};

const writeCache = (key, payload) => {
  publicListsCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
};

const handleAnnouncements = async (params) => {
  const limit = clamp(params.get('limit'), 10, 60);
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const search = cleanSearch(params.get('search'));
  const startDate = String(params.get('startDate') || '').trim();
  const endDate = String(params.get('endDate') || '').trim();

  let query = supabase
    .from('school_announcements')
    .select(ANNOUNCEMENT_COLUMNS, { count: 'exact' })
    .or('is_hidden.eq.false,is_hidden.is.null');

  if (search) query = query.ilike('title', `%${search}%`);
  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, error, count } = await query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const rows = data || [];
  return {
    success: true,
    data: rows,
    total: count || 0,
    hasMore: (count || 0) > offset + rows.length,
  };
};

const handleLostFound = async (params) => {
  const limit = clamp(params.get('limit'), 24, 50);
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const type = String(params.get('type') || '').trim();
  const search = cleanSearch(params.get('search'));

  let query = supabase
    .from('lost_found_items')
    .select(LOST_FOUND_COLUMNS, { count: 'exact' })
    .eq('is_deleted', false)
    .in('status', ['approved', 'resolved']);

  if (type === 'FOUND' || type === 'LOST') query = query.eq('type', type);
  if (search) {
    query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const rows = data || [];
  return {
    success: true,
    data: rows,
    total: count || 0,
    hasMore: (count || 0) > offset + rows.length,
  };
};

async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức GET' });
  }

  try {
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
    const resource = String(requestUrl.searchParams.get('resource') || 'announcements');
    const cacheControl = String(request.headers['cache-control'] || '');
    const bypassCache = requestUrl.searchParams.has('refresh') || cacheControl.includes('no-cache');
    const cacheKey = `${resource}:${requestUrl.searchParams.toString()}`;

    setPublicCacheHeaders(response, bypassCache);

    if (!bypassCache) {
      const cached = readCache(cacheKey);
      if (cached) {
        response.setHeader('X-Hub-Cache', 'memory-hit');
        return response.status(200).json(cached);
      }
    } else {
      publicListsCache.delete(cacheKey);
    }

    let payload;
    if (resource === 'announcements') payload = await handleAnnouncements(requestUrl.searchParams);
    else if (resource === 'lost-found') payload = await handleLostFound(requestUrl.searchParams);
    else return response.status(400).json({ error: 'Resource không hợp lệ' });

    if (!bypassCache) writeCache(cacheKey, payload);
    response.setHeader('X-Hub-Cache', bypassCache ? 'bypass' : 'miss');
    return response.status(200).json(payload);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

export default withLogging(handler);
