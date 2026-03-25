import { createClient } from '@supabase/supabase-js';
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Key của Google
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Kéo dữ liệu từ Supabase (Dùng khóa Service Role để không bị kẹt bảo mật RLS)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Chống spam 
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
    if (!GEMINI_API_KEY) throw new Error("Thiếu GEMINI_API_KEY");

    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v3");
      if (!success) return res.status(429).json({ reply: "Chat chậm lại xíu bạn ơi! ⏳" });
    }

    const { question, context, history } = req.body;

    // 1. KÉO NGUYÊN CUỐN CẨM NANG TỪ SUPABASE
    const { data: kbData } = await supabase.from('system_knowledge').select('content').eq('id', 1).single();
    const handbookText = kbData?.content || "Không tìm thấy dữ liệu cẩm nang.";

    // 2. GOM VÀO SYSTEM PROMPT 
    const systemInstruction = `Bạn là AI Cố vấn học tập của Đại học Ngân hàng TP.HCM (HUB).
Nhiệm vụ: Tư vấn cho sinh viên DỰA TRÊN "CẨM NANG TRƯỜNG". 

[THÔNG TIN SINH VIÊN HIỆN TẠI]:
${context || "Chưa có thông tin."}

[CẨM NANG TRƯỜNG]:
${handbookText}

NGUYÊN TẮC:
1. Trả lời chuẩn xác 100% dựa vào CẨM NANG TRƯỜNG. Không tự ý bịa điểm, bịa quy chế.
2. Nếu câu hỏi không có trong Cẩm nang, nói: "Thông tin này mình chưa rõ, bạn liên hệ Phòng Đào tạo nhé!".
3. Trả lời bằng Markdown rõ ràng, dễ đọc, xưng "mình" gọi "bạn".`;

    // 3. Format lịch sử chat cho Gemini
    const formattedHistory = (history || []).slice(-4).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content.substring(0, 500) }]
    }));
    formattedHistory.push({ role: 'user', parts: [{ text: question }] });

    // 4. GỌI GEMINI 3.1 FLASH LITE (Tối ưu tốc độ & Rate limit 250k TPM)
const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`, {        method: 'POST',
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

    return res.status(200).json({ reply: replyText });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    return res.status(500).json({ reply: "Xin lỗi, máy chủ AI đang bận. Bạn thử lại sau nhé! 😵" });
  }
}