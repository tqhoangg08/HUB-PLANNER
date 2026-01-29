import Groq from "groq-sdk";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from '@supabase/supabase-js';

// ============================================================
// 1. CẤU HÌNH KEY (THEO ĐÚNG CHỐT CỦA BẠN) 🔑
// ============================================================
const CHAT_API_KEY = process.env.GROQ_CHAT_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

// Cấu hình Redis (Giữ nguyên nếu bạn có dùng)
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ============================================================
// 2. KHỞI TẠO CLIENT
// ============================================================
// Redis Rate Limit
const redis = (UPSTASH_URL && UPSTASH_TOKEN)
  ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }) 
  : null;

const ratelimit = redis
  ? new Ratelimit({ redis: redis, limiter: Ratelimit.slidingWindow(100, "1 d"), analytics: true }) 
  : null;

// Supabase
const supabase = (SUPABASE_URL && SUPABASE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // --- KIỂM TRA BIẾN MÔI TRƯỜNG ---
    if (!CHAT_API_KEY) {
        console.error("❌ LỖI: Thiếu biến GROQ_CHAT_KEY trên Vercel");
        throw new Error("Server chưa cấu hình Key Chat.");
    }

    // --- RATE LIMIT ---
    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v3"); 
      if (!success) return res.status(429).json({ reply: "Bạn chat nhanh quá, nghỉ tay chút nhé! 😴" });
    }

    const { message, history } = req.body; 

    // --- SYSTEM PROMPT ---
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
    - Trả lời ngắn gọn, đi thẳng vào vấn đề.
    - Nếu sinh viên hỏi về tính năng: Hãy chỉ dẫn họ vào đúng menu trên web.
    `;

    const conversation = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(history || []).map(msg => ({ role: msg.role, content: msg.content })), 
        { role: "user", content: message } 
    ];

    // --- GỌI AI ---
    const groq = new Groq({ apiKey: CHAT_API_KEY });
    const completion = await groq.chat.completions.create({
        messages: conversation,
        model: "llama-3.1-8b-instant", 
        temperature: 0.7, 
        max_tokens: 1024, 
    });

    const replyText = completion.choices[0]?.message?.content || "Bot đang suy nghĩ... bạn chờ xíu nha!";
    
    // --- LƯU LOG VÀO SUPABASE ---
    let logId = null;
    if (supabase) {
        try {
            const { data, error } = await supabase.from('ai_chat_logs').insert([
                { user_message: message, bot_reply: replyText }
            ]).select();

            if (error) {
                console.error("❌ Lỗi Supabase Insert:", error.message);
            } else if (data && data.length > 0) {
                logId = data[0].id;
            }
            
        } catch (dbError) {
            console.error("❌ Lỗi kết nối DB:", dbError.message);
        }
    } else {
        console.warn("⚠️ Server chưa kết nối được Supabase (Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_KEY)");
    }

    // --- TRẢ KẾT QUẢ ---
    return res.status(200).json({ reply: replyText, logId: logId });

  } catch (error) {
    console.error("❌ LỖI SERVER:", error);
    if (error.status === 429) {
        return res.status(429).json({ reply: "Bot đang quá tải, bạn đợi 1 phút rồi thử lại nha! ⏳" });
    }
    // Trả về lỗi chi tiết để bạn dễ debug
    return res.status(500).json({ 
        reply: `Lỗi Server: ${error.message}` 
    });
  }
}
