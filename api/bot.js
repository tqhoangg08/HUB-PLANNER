import Groq from "groq-sdk";
import { createClient } from '@supabase/supabase-js';
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Key của Groq và Supabase lấy từ Vercel
const GROQ_API_KEY = process.env.GROQ_CHAT_KEY || process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

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
    if (!GROQ_API_KEY) throw new Error("Thiếu GROQ_API_KEY");

    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v3");
      if (!success) return res.status(429).json({ reply: "Chat chậm lại xíu bạn ơi! ⏳" });
    }

    const { question, context, history } = req.body;

    // 1. KÉO NGUYÊN CUỐN CẨM NANG TỪ SUPABASE TRONG 1 GIÂY
    const { data: kbData, error: dbError } = await supabase
        .from('system_knowledge')
        .select('content')
        .eq('id', 1)
        .single();
        
    const handbookText = kbData?.content || "Không tìm thấy dữ liệu cẩm nang.";

    // 2. GOM TẤT CẢ VÀO MỘT SYSTEM PROMPT "THÉP"
    const SYSTEM_PROMPT = `
Bạn là AI Cố vấn học tập của Đại học Ngân hàng TP.HCM (HUB).
Nhiệm vụ: Tư vấn cho sinh viên TUYỆT ĐỐI DỰA TRÊN "CẨM NANG TRƯỜNG" dưới đây. 

[THÔNG TIN SINH VIÊN HIỆN TẠI]:
${context || "Chưa có thông tin."}

[CẨM NANG TRƯỜNG (TOÀN BỘ)]:
${handbookText}

NGUYÊN TẮC BẮT BUỘC:
1. Trả lời chuẩn xác 100% dựa vào CẨM NANG TRƯỜNG. Không được làm tròn số, không tự ý suy diễn.
2. Nếu câu hỏi không có trong Cẩm nang, bắt buộc nói: "Dạ thông tin này mình chưa rõ, bạn liên hệ Phòng Đào tạo nhé!".
3. Trả lời bằng Markdown rõ ràng, dễ đọc, xưng "mình" gọi "bạn".
`;

    // 3. Chuẩn bị lịch sử chat cho Groq (Giữ 4 tin gần nhất để nó nhớ ngữ cảnh)
    const limitedHistory = (history || []).slice(-4).map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content.substring(0, 500)
    }));

    const conversation = [
        { role: "system", content: SYSTEM_PROMPT },
        ...limitedHistory,
        { role: "user", content: question }
    ];

    // 4. GỌI GROQ API VỚI MODEL KHỦNG NHẤT
    const groq = new Groq({ apiKey: GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
        messages: conversation,
        model: "llama-3.3-70b-versatile", // Xài con đỉnh nhất, 128k context
        temperature: 0.1, // Set siêu thấp để AI chỉ tập trung tìm sách, không bịa chuyện
        max_tokens: 1024,
    });

    const replyText = completion.choices[0]?.message?.content || "Mình đang xử lý hơi lâu, bạn hỏi lại nha!";

    return res.status(200).json({ reply: replyText });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    // Groq thỉnh thoảng báo lỗi 413 nếu chữ quá dài, nhưng 128k token thì rất hiếm khi chạm nóc
    if (error.status === 413) {
        return res.status(429).json({ reply: "Nội dung đang quá tải, bạn chờ mình xíu nhé! 📉" });
    }
    return res.status(500).json({ reply: "Xin lỗi, máy chủ AI đang bận. Bạn thử lại sau nhé! 😵" });
  }
}