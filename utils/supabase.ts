import { createClient } from '@supabase/supabase-js';

// 1. Lấy chìa khóa đúng chuẩn Vite (import.meta.env)
// Dùng dấu || "" để nếu thiếu chìa thì lấy chuỗi rỗng chứ không crash web
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || "";

// 2. Kiểm tra nhẹ nhàng
if (!supabaseUrl || !supabaseKey) {
  console.error("⚠️ CẢNH BÁO: Chưa tìm thấy API Key của Supabase. Tính năng bình luận sẽ không chạy.");
}

// 3. Khởi tạo client an toàn
// Dù key rỗng nó vẫn tạo object, giúp web KHÔNG bị trắng màn hình
export const supabase = createClient(supabaseUrl, supabaseKey);
