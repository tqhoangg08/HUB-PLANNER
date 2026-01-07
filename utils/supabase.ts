import { createClient } from '@supabase/supabase-js';

// 1. Lấy chìa khóa theo chuẩn Vite (Quan trọng: Không dùng process.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// 2. Khai báo biến client
// Mặc định là null (chưa kết nối) để tránh lỗi undefined
let supabase: any = null;

// 3. Cơ chế "Khởi động mềm"
// Chỉ khi nào CÓ ĐỦ chìa khóa thì mới khởi động máy
if (supabaseUrl && supabaseUrl.startsWith("http") && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
    } catch (error) {
        console.error("Lỗi khởi tạo Supabase:", error);
        // Web vẫn chạy tiếp, chỉ là không có database thôi
    }
} else {
    // Nếu thiếu key, web vẫn hiện bình thường, chỉ in dòng này vào F12 để bạn biết
    console.warn("⚠️ Cảnh báo: Chưa tìm thấy Key Supabase. Tính năng bình luận sẽ tạm tắt.");
}

// Xuất ra để dùng ở chỗ khác
export { supabase };
