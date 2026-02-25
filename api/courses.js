import { createClient } from '@supabase/supabase-js';
import { withLogging } from './middleware.js'; // Bọc Bác bảo vệ

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức GET' });
  }

  try {
    // Nhận các tham số lọc từ đường link URL do Frontend gửi lên
    const { semester, phase, search, limit = 50 } = request.query;

    let query = supabase.from('course_schedules')
      .select('*')
      .limit(Number(limit)); // Giới hạn số lượng lấy để chống cào data

    if (semester) {
      query = query.eq('semester', semester);
    }
    
    if (phase && phase !== 'all') {
      query = query.eq('phase', phase);
    }

    if (search) {
      query = query.or(`subject_name.ilike.%${search}%,course_code.ilike.%${search}%,instructor.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return response.status(200).json({ success: true, data: data });

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

export default withLogging(handler);