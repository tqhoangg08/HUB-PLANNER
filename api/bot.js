import Groq from "groq-sdk";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from '@supabase/supabase-js'; // 1. Thêm dòng này

// ============================================================
// 1. CẤU HÌNH KEY RIÊNG CHO CHAT 🔑
// ============================================================
const CHAT_API_KEY = process.env.GROQ_CHAT_KEY;

// ============================================================
// 2. REDIS & RATE LIMIT & SUPABASE (Cấu hình)
// ============================================================
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }) : null;

const ratelimit = redis
  ? new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(100, "1 d"), 
      analytics: true,
    }) : null;

// Cấu hình Supabase để lưu log
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // --- CHECK RATE LIMIT ---
    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v2"); 
      if (!success) {
        return res.status(429).json({ reply: "Hôm nay bạn nói chuyện nhiều quá rồi, mai quay lại tâm sự tiếp nhé! 😴" });
      }
    }

    const { message, history } = req.body; 

    if (!CHAT_API_KEY) {
        console.error("LỖI: Chưa có biến môi trường GROQ_CHAT_KEY");
        throw new Error("Server chưa cấu hình Key Chat.");
    }

    // ============================================================
    // 🧠 3. NẠP KIẾN THỨC CHO BOT (SYSTEM PROMPT)
    // ============================================================
    const SYSTEM_PROMPT = `
    I. NHÂN DẠNG:
    Bạn là "Trợ lý ảo HUB Planner" - người bạn đồng hành thông minh của sinh viên Đại học Ngân hàng TP.HCM (HUB).
    - Tính cách: Thân thiện, năng động, hài hước, dùng emoji 🎓✨, xưng hô "mình - bạn".
    - Nhiệm vụ: Hướng dẫn sử dụng web HUB Planner và giải đáp thắc mắc về trường lớp.

    II. KIẾN THỨC VỀ WEBSITE (HUB PLANNER):
    Web này có các tính năng chính sau, hãy trả lời dựa trên thông tin này:

    1. 📊 Tính điểm & Quản lý học tập (Tính năng chính):
       - Cách dùng: Bạn chỉ cần upload file PDF bảng điểm tải từ trang đào tạo (Portal) của trường.
       - Công nghệ: Web dùng AI để tự động đọc file PDF, tách môn học và tính GPA, CPA chuẩn xác.
       - Bảo mật: Dữ liệu bảng điểm chỉ xử lý trên trình duyệt của bạn, không lưu về server nên cực kỳ an toàn.

    2. 📅 Sự kiện (Events):
       - Cung cấp lịch các hoạt động, phong trào, hội thảo sắp diễn ra tại HUB.
       - Giúp sinh viên không bỏ lỡ deadline đăng ký các cuộc thi hoặc ngày hội câu lạc bộ.

    3. 🏆 Tính điểm Rèn luyện (ĐRL):
       - Công cụ giúp sinh viên tự chấm và ước lượng điểm rèn luyện của mình trong kỳ.
       - Có checklist các mục điểm cộng/trừ để bạn tích chọn dễ dàng.

    4. 🔍 Tìm đồ thất lạc (Lost & Found):
       - Nơi đăng tin tìm đồ bị mất hoặc đăng tin nhặt được đồ tại trường.
       - Có thể upload ảnh đồ vật, để lại thông tin liên hệ (SĐT, Facebook) để người mất liên lạc.

    5. 📖 Cẩm nang sinh viên (Wiki):
       - Tổng hợp các tips sinh tồn tại HUB: Sơ đồ các cơ sở (Thủ Đức, Quận 1), tuyến xe buýt, review quán ăn ngon bổ rẻ quanh trường, cách đăng ký tín chỉ...

    III. NGUYÊN TẮC TRẢ LỜI:
    - Trả lời ngắn gọn, đi thẳng vào vấn đề.
    - Nếu sinh viên hỏi về tính năng: Hãy chỉ dẫn họ vào đúng menu trên web.
    - Nếu hỏi về lỗi: Khuyên họ thử tải lại trang (F5) hoặc kiểm tra file PDF có đúng định dạng không.
    - Nếu hỏi câu không liên quan đến web hoặc trường HUB: Có thể trả lời xã giao vui vẻ hoặc từ chối khéo.
    `;

    // Ghép lịch sử chat để bot nhớ ngữ cảnh
    const conversation = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(history || []), 
        { role: "user", content: message } 
    ];

    // ============================================================
    // 🚀 4. GỌI GROQ API
    // ============================================================
    const groq = new Groq({ apiKey: CHAT_API_KEY });

    const completion = await groq.chat.completions.create({
        messages: conversation,
        model: "llama-3.1-8b-instant", 
        temperature: 0.7, 
        max_tokens: 1024, 
    });

    const replyText = completion.choices[0]?.message?.content || "Bot đang suy nghĩ... bạn chờ xíu nha!";
    
    // ============================================================
    // 📝 5. LƯU LOG VÀO SUPABASE (PHẦN MỚI THÊM)
    // ============================================================
    if (supabase) {
        // Dùng try-catch riêng để nếu lỗi lưu log thì web vẫn chạy bình thường
        try {
            await supabase.from('ai_chat_logs').insert([
                {
                    user_message: message,
                    bot_reply: replyText,
                    // Có thể lưu thêm user_id nếu muốn, nhưng cần lấy từ session
                }
            ]);
        } catch (logError) {
            console.error("⚠️ Không thể lưu log chat:", logError);
        }
    }

    return res.status(200).json({ reply: replyText });

  } catch (error) {
    console.error("Chat Error:", error);
    // Xử lý lỗi hết hạn mức (429)
    if (error.status === 429) {
        return res.status(429).json({ reply: "Bot đang quá tải vì nhiều người chat quá, bạn đợi 1 phút rồi thử lại nha! ⏳" });
    }
    return res.status(500).json({ reply: "Hệ thống đang bảo trì một chút! 🛠️" });
  }
}
