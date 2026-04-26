import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../server/middleware.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức GET' });
  }

  try {
    // ---> ĐÃ SỬA: Sắp xếp theo ngày tạo mới nhất và nới lỏng trần lên 300 <---
    let query = supabase.from('events')
      .select('*')
      .order('created_at', { ascending: false }) // Những event mới thêm sẽ luôn được ưu tiên lấy trước
      .limit(300); // Bạn có thể tăng lên 500 nếu sau này web có quá nhiều sự kiện

    const { data, error } = await query;

    if (error) throw error;

    return response.status(200).json({ success: true, data: data });

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

export default withLogging(handler);
