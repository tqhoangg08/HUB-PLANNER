import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const DIFY_API_KEY = process.env.DIFY_API_KEY;

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

    // GỌI DIFY API CHUẨN XÁC
    const response = await fetch('https://api.dify.ai/v1/chat-messages', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            // 1. Nhét thông tin sinh viên vào biến độc lập
            inputs: {
                student_info: context || "Chưa có thông tin"
            },
            // 2. Trả lại câu hỏi TINH GỌN để Dify quét PDF chính xác 100%
            query: question, 
            response_mode: "blocking", 
            user: userId || "hub_student_default"
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Lỗi từ Dify:", data);
        throw new Error(data.message || 'Lỗi khi gọi AI');
    }

    return res.status(200).json({ reply: data.answer });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    return res.status(500).json({ reply: "Xin lỗi, máy chủ AI đang bận. Bạn thử lại sau nhé! 😵" });
  }
}