import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Key API từ Dify.ai
const DIFY_API_KEY = process.env.DIFY_API_KEY;

// Chống spam (Giữ nguyên của bạn)
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
    if (!DIFY_API_KEY) throw new Error("Thiếu DIFY_API_KEY");

    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v3");
      if (!success) return res.status(429).json({ reply: "Chat chậm lại xíu bạn ơi! ⏳" });
    }

    const { question, context, userId } = req.body;

    // Trộn thông tin sinh viên vào câu hỏi để Dify hiểu
    const finalQuery = `
[THÔNG TIN BẢNG ĐIỂM/CÁ NHÂN CỦA TÔI]:
${context || "Chưa có thông tin"}

[CÂU HỎI]: 
${question}
`;

    // GỌI DIFY API
    const response = await fetch('https://api.dify.ai/v1/chat-messages', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            inputs: {}, // Có thể truyền biến phụ vào đây nếu set trên Dify
            query: finalQuery,
            response_mode: "blocking", // Nhận kết quả một lần (giống cách code React của bạn đang xử lý)
            user: userId || "hub_student_default" // Bắt buộc phải có user ID cho Dify
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Lỗi từ Dify:", data);
        throw new Error(data.message || 'Lỗi khi gọi AI');
    }

    // Trả kết quả về cho web của bạn
    return res.status(200).json({ reply: data.answer });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    return res.status(500).json({ reply: "Xin lỗi, máy chủ AI đang bận. Bạn thử lại sau nhé! 😵" });
  }
}