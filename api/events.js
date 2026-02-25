import { createClient } from '@supabase/supabase-js';
import { withLogging } from './middleware.js'; 

// Khởi tạo kết nối Supabase an toàn trên máy chủ
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(request, response) {
  // API này chỉ cho phép đọc dữ liệu (GET)
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức GET' });
  }

  try {
    // Lấy dữ liệu từ Supabase 
    // THÊM BẢO VỆ: Giới hạn lấy tối đa 50 sự kiện mỗi lần để chống "cào sạch"
    let query = supabase.from('events')
      .select('*')
      .order('deadline', { ascending: true })
      .limit(50); 

    const { data, error } = await query;

    if (error) throw error;

    // Trả dữ liệu về cho Frontend
    return response.status(200).json({ success: true, data: data });

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

// Bọc API bằng "Bác bảo vệ" để tự động ghi log IP lên Axiom
export default withLogging(handler);