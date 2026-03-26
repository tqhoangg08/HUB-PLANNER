import { createClient } from '@supabase/supabase-js';
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ===========================================
// ✨ HỆ THỐNG CÂN BẰNG TẢI API KEY (LOAD BALANCING) ✨
// ===========================================
// Lấy chuỗi API Keys từ Vercel (Ví dụ: "Key1,Key2,Key3")
const GEMINI_KEYS_STRING = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
// Tách chuỗi thành mảng, loại bỏ khoảng trắng và các key rỗng
const GEMINI_KEYS = GEMINI_KEYS_STRING.split(',').map(key => key.trim()).filter(key => key.length > 0);

// Kéo dữ liệu từ Supabase (Dùng khóa Service Role để không bị kẹt bảo mật RLS)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Chống spam bằng Upstash Redis (Giữ nguyên của bạn)
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (UPSTASH_URL && UPSTASH_TOKEN) ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }) : null;
const ratelimit = redis ? new Ratelimit({ redis: redis, limiter: Ratelimit.slidingWindow(10, "10 s"), analytics: true }) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Báo lỗi nếu không có API Key nào được nạp
    if (GEMINI_KEYS.length === 0) throw new Error("Thiếu API Key Gemini");

    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v3");
      if (!success) return res.status(429).json({ reply: "Chat chậm lại xíu bạn ơi! ⏳" });
    }

    const { question, context, history, userId } = req.body;

    // ===========================================
    // ✨ GHI LOG PARTIAL LÊN SUPABASE NGAY LẬP TỨC ✨
    // ===========================================
    let logId = null;
    if (supabase) {
        const { data: logData, error: logError } = await supabase.from('ai_chat_logs').insert([{
            user_id: userId || null, // ✨ NẾU CÓ USER ID THÌ LƯU, GUEST THÌ ĐỂ NULL
            user_message: question,
            bot_reply: '⏳ Đang xử lý (Chờ cập nhật trên web)'
        }]).select('id').single();
        
        if (logData) {
            logId = logData.id;
        }
        if (logError) {
            console.error("Lỗi ghi log partial lên Supabase:", logError);
        }
    }

    // 1. KÉO NGUYÊN CUỐN CẨM NANG TỪ SUPABASE TRONG 1 GIÂY
    const { data: kbData } = await supabase.from('system_knowledge').select('content').eq('id', 1).single();
    const handbookText = kbData?.content || "Không tìm thấy dữ liệu cẩm nang.";

    // 2. GOM TẤT CẢ VÀO MỘT SYSTEM PROMPT "THÉP"
    const systemInstruction = `Bạn là AI Cố vấn học tập của website HUB Planner.
Nhiệm vụ: Tư vấn cho sinh viên DỰA TRÊN "CẨM NANG SINH VIÊN" dưới đây. 

[THÔNG TIN SINH VIÊN HIỆN TẠI]:
${context || "Chưa có thông tin."}

[CẨM NANG TRƯỜNG (TOÀN BỘ)]:
${handbookText}

NGUYÊN TẮC BẮT BUỘC:
1. Trả lời chuẩn xác 100% dựa vào CẨM NANG SINH VIÊN. Không tự ý bịa điểm, bịa quy chế.
2. Nếu câu hỏi không có trong Cẩm nang, bắt buộc nói: "Dạ thông tin này mình chưa rõ, bạn liên hệ Phòng Đào tạo nhé!".
3. Trả lời bằng Markdown rõ ràng, dễ đọc, xưng "mình" gọi "bạn".`;

    // 3. Chuẩn bị lịch sử chat cho Gemini
    const formattedHistory = (history || []).slice(-4).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content.substring(0, 500) }]
    }));
    formattedHistory.push({ role: 'user', parts: [{ text: question }] });

    // ===========================================
    // ✨ BỐC THĂM RANDOM API KEY ✨
    // ===========================================
    const activeKey = GEMINI_KEYS[Math.floor(Math.random() * GEMINI_KEYS.length)];

    // 4. GỌI GEMINI 3.1 FLASH LITE PREVIEW (Model không băm tài liệu)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: formattedHistory,
            generationConfig: { temperature: 0.1 } 
        })
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Lỗi từ Gemini:", data);
        throw new Error('Lỗi gọi AI Google');
    }

    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Mình đang xử lý hơi lâu, bạn hỏi lại nha!";
    
    // 5. CẬP NHẬT CÂU TRẢ LỜI THỰC TẾ VÀO DATABASE
    if (supabase && logId) {
        await supabase.from('ai_chat_logs')
            .update({ bot_reply: replyText })
            .eq('id', logId);
    }
    
    // TRẢ VỀ LỜI ĐÁP VÀ LOG ID. Frontend vẫn nhận được logId để like/dislike.
    return res.status(200).json({ reply: replyText, logId: logId });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    return res.status(500).json({ reply: "Xin lỗi, máy chủ AI đang bận. Bạn thử lại sau nhé! 😵" });
  }
}