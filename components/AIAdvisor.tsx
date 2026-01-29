import Groq from "groq-sdk";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from '@supabase/supabase-js';

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
    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v2"); 
      if (!success) {
        return res.status(429).json({ reply: "Hôm nay bạn nói chuyện nhiều quá rồi, mai quay lại tâm sự tiếp nhé! 😴" });
      }
    }

    const { message, history } = req.body; 

    if (!CHAT_API_KEY) throw new Error("Server chưa cấu hình Key Chat.");

    const SYSTEM_PROMPT = `
    I. NHÂN DẠNG:
    Bạn là "Trợ lý ảo HUB Planner" - người bạn đồng hành thông minh của sinh viên Đại học Ngân hàng TP.HCM (HUB).
    - Tính cách: Thân thiện, năng động, hài hước, dùng emoji 🎓✨, xưng hô "mình - bạn".
    
    II. KIẾN THỨC VỀ WEBSITE (HUB PLANNER):
    1. 📊 Tính điểm & Quản lý học tập: Upload PDF từ Portal, tính GPA/CPA tự động, bảo mật trên trình duyệt.
    2. 📅 Sự kiện (Events): Lịch hoạt động, deadline đăng ký.
    3. 🏆 Tính điểm Rèn luyện (ĐRL): Tự chấm và ước lượng ĐRL.
    4. 🔍 Tìm đồ thất lạc (Lost & Found): Đăng tin tìm đồ/nhặt được đồ.
    5. 📖 Cẩm nang sinh viên (Wiki): Tips sinh tồn, xe buýt, sơ đồ trường.

    III. NGUYÊN TẮC TRẢ LỜI:
    - Ngắn gọn, đi thẳng vấn đề.
    - Chỉ dẫn vào đúng menu chức năng.
    `;

    const conversation = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(history || []).map(msg => ({ role: msg.role, content: msg.content })), // Chỉ lấy role và content
        { role: "user", content: message } 
    ];

    const groq = new Groq({ apiKey: CHAT_API_KEY });

    const completion = await groq.chat.completions.create({
        messages: conversation,
        model: "llama-3.1-8b-instant", 
        temperature: 0.7, 
        max_tokens: 1024, 
    });

    const replyText = completion.choices[0]?.message?.content || "Bot đang suy nghĩ... bạn chờ xíu nha!";
    
    // ============================================================
    // 📝 LƯU LOG VÀ TRẢ VỀ ID (SỬA ĐOẠN NÀY)
    // ============================================================
    let logId = null;
    if (supabase) {
        try {
            const { data, error } = await supabase.from('ai_chat_logs').insert([
                {
                    user_message: message,
                    bot_reply: replyText,
                }
            ]).select(); // Thêm .select() để lấy dữ liệu vừa tạo

            if (data && data.length > 0) {
                logId = data[0].id; // Lấy ID
            }
        } catch (logError) {
            console.error("Lỗi lưu log:", logError);
        }
    }

    // Trả về cả reply và logId
    return res.status(200).json({ reply: replyText, logId: logId });

  } catch (error) {
    console.error("Chat Error:", error);
    if (error.status === 429) {
        return res.status(429).json({ reply: "Bot đang quá tải, bạn đợi 1 phút rồi thử lại nha! ⏳" });
    }
    return res.status(500).json({ reply: "Hệ thống đang bảo trì một chút! 🛠️" });
  }
}
