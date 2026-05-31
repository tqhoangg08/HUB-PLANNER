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
let publicEventsCache = {
  expiresAt: 0,
  payload: null,
};

async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức GET' });
  }

  try {
    response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800');

    if (publicEventsCache.payload && publicEventsCache.expiresAt > Date.now()) {
      response.setHeader('X-Hub-Cache', 'memory-hit');
      return response.status(200).json(publicEventsCache.payload);
    }

    // ---> ĐÃ SỬA: Sắp xếp theo ngày tạo mới nhất và nới lỏng trần lên 300 <---
    let query = supabase.from('events')
      .select(EVENT_LIST_COLUMNS)
      .order('created_at', { ascending: false }) // Những event mới thêm sẽ luôn được ưu tiên lấy trước
      .limit(300); // Bạn có thể tăng lên 500 nếu sau này web có quá nhiều sự kiện

    const { data, error } = await query;

    if (error) throw error;

    const payload = { success: true, data: data };
    publicEventsCache = {
      expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS,
      payload,
    };
    response.setHeader('X-Hub-Cache', 'miss');
    return response.status(200).json(payload);

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

export default withLogging(handler);
