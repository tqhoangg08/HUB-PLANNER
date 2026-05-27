import Groq from "groq-sdk"; 
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { handleCors } from './_cors.js';

// ============================================================
// 1. CẤU HÌNH KHO KHÓA (KEY ROTATION POOL) 🔑
// ============================================================
const keyPool = [
    process.env.GROQ_API_KEY,      
    process.env.GROQ_API_KEY_2,    // Key phụ 1
    process.env.GROQ_API_KEY_3,    // Key phụ 2
    process.env.GROQ_API_KEY_4,    // Key phụ 3
    process.env.GROQ_API_KEY_5,    // Key phụ 4
].filter(k => k); 

// Hàm lấy ngẫu nhiên 1 chìa khóa từ kho
const getRandomKey = () => keyPool[Math.floor(Math.random() * keyPool.length)];

// ============================================================
// 2. KHỞI TẠO REDIS & RATE LIMITER (UPSTASH)
// ============================================================
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const ratelimit = redis
  ? new Ratelimit({
      redis: redis,
      // 🔥 Giới hạn người dùng: 5 lần/ngày
      limiter: Ratelimit.slidingWindow(15, "1 d"), 
      analytics: true,
    })
  : null;

export default async function handler(req, res) {
  // --------------------------------------------------------
  // 3. CẤU HÌNH CORS
  // --------------------------------------------------------
  if (handleCors(req, res, {
    methods: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
    headers: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
  })) return;

  try {
    // ============================================================
    // 🛡️ LỚP 1: RATE LIMITING (Upstash - Chặn theo IP)
    // ============================================================
    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success, limit, remaining } = await ratelimit.limit(ip);

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);

      if (!success) {
        console.warn(`⛔ Rate Limit Exceeded for IP: ${ip}`);
        return res.status(429).json({ 
          error: "Too Many Requests", 
          message: "Bạn đã dùng hết lượt miễn phí trong ngày (5/5). Mai quay lại nhé!" 
        });
      }
    }

    // ============================================================
    // 🛡️ LỚP 2: DOMAIN VERIFICATION (Chặn request lạ)
    // ============================================================
    const referer = req.headers.referer || req.headers.referrer;
    const origin = req.headers.origin;
    const allowedDomains = ['hotrosinhvienhub.id.vn', 'localhost:3000'];
    
    const isAllowed = allowedDomains.some(d => (referer?.includes(d) || origin?.includes(d)));
    
    if (!isAllowed) {
      return res.status(403).json({ error: "Forbidden", message: "Domain not allowed." });
    }

    // ============================================================
    // 🚀 LỚP 3: XỬ LÝ AI VỚI CƠ CHẾ XOAY VÒNG KEY (QUAN TRỌNG)
    // ============================================================
    const { message } = req.body;

    if (keyPool.length === 0) {
        throw new Error("Chưa cấu hình GROQ_API_KEY nào trong biến môi trường.");
    }

    let lastError = null;
    let success = false;
    let reply = "";

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            // 🎲 Bốc thăm 1 key ngẫu nhiên
            const currentKey = getRandomKey();
            const groq = new Groq({ apiKey: currentKey });

            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "Bạn là một API xử lý dữ liệu OCR. Nhiệm vụ duy nhất của bạn là trích xuất thông tin từ văn bản được cung cấp và trả về kết quả dưới dạng JSON hợp lệ. Không được trả lời thêm bất kỳ lời dẫn hay giải thích nào."
                    },
                    {
                        role: "user",
                        content: message 
                    }
                ],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" },
                temperature: 0.1, 
            });

            reply = completion.choices[0]?.message?.content || "";
            success = true;
            break; 

        } catch (error) {
            console.error(`Lần thử ${attempt + 1} thất bại:`, error.message);
            lastError = error;
            

        }
    }

    if (!success) {
        // Nếu thử 3 lần (3 key) mà vẫn lỗi thì đầu hàng
        if (lastError?.status === 429) {
             return res.status(429).json({ error: "System Busy", message: "Hệ thống đang quá tải, vui lòng thử lại sau vài phút." });
        }
        throw lastError || new Error("Không thể kết nối đến AI Server.");
    }

    return res.status(200).json({ reply: reply });

  } catch (error) {
    console.error("Handler Error:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Hệ thống đang gặp sự cố, vui lòng thử lại sau."
    });
  }
}
