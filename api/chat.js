import { GoogleGenerativeAI } from "@google/generative-ai";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// --------------------------------------------------------
// KHỞI TẠO REDIS & RATE LIMITER (Nằm ngoài handler để tối ưu)
// --------------------------------------------------------
// Kiểm tra xem đã cấu hình Redis chưa để tránh lỗi crash server
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;
const ratelimit = redis
  ? new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(2, "1 d"), 
      analytics: true, // Để xem biểu đồ trên Upstash dashboard
    })
  : null;

export default async function handler(req, res) {
  // 1. CẤU HÌNH CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ============================================================
    // 🛡️ LỚP 1: RATE LIMITING (CHẶN THEO IP) - CAO CẤP
    // ============================================================
    if (ratelimit) {
      // Lấy IP người dùng. Trên Vercel, IP thật nằm trong header 'x-forwarded-for'
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      
      // Gọi Upstash để kiểm tra xem IP này đã spam chưa
      const { success, limit, remaining, reset } = await ratelimit.limit(ip);

      // Trả về Header để Frontend biết còn bao nhiêu lượt (Tùy chọn)
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);

      if (!success) {
        console.warn(`⛔ Rate Limit Exceeded for IP: ${ip}`);
        return res.status(429).json({ 
          error: "Too Many Requests", 
          message: "Bạn đã dùng hết lượt thử miễn phí trong ngày hôm nay (2/2). Vui lòng quay lại sau." 
        });
      }
    }

    // ============================================================
    // 🛡️ LỚP 2: DOMAIN VERIFICATION (CHẶN REQUEST NGOÀI)
    // ============================================================
    const referer = req.headers.referer || req.headers.referrer;
    const origin = req.headers.origin;
    const allowedDomains = ['hotrosinhvienhub.id.vn', 'localhost', '127.0.0.1'];
    
    // Lưu ý: Nếu bạn test bằng Postman thì referer sẽ null -> Bị chặn
    // Nếu muốn test Postman, hãy tạm comment đoạn if này lại
    const isAllowed = allowedDomains.some(d => (referer?.includes(d) || origin?.includes(d)));
    
    if (!isAllowed) {
      return res.status(403).json({ error: "Forbidden", message: "Domain not allowed." });
    }

    // ============================================================
    // 🚀 LỚP 3: AI PROCESSING & KEY ROTATION
    // ============================================================
    const { message } = req.body;
    let keyPool = [
      process.env.GEMINI_API_KEY,
      process.env.KEY_1, process.env.KEY_2, process.env.KEY_3, process.env.KEY_4
    ].filter(k => k);

    if (keyPool.length === 0) throw new Error("No API Keys configured.");

    // Hàm gọi AI
    const callGemini = async (apiKey, prompt) => {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "learnlm-2.0-flash-experimental", generationConfig: { responseMimeType: "application/json" }});
      const result = await model.generateContent(prompt);
      return (await result.response).text();
    };

    // Retry Logic
    let attempts = 0;
    while (attempts < 2 && keyPool.length > 0) {
      attempts++;
      const idx = Math.floor(Math.random() * keyPool.length);
      const key = keyPool[idx];
      try {
        const text = await callGemini(key, message);
        return res.status(200).json({ reply: text });
      } catch (err) {
        console.error(`Key ...${key.slice(-4)} failed:`, err.message);
        if (err.message.includes('429') || err.message.includes('Quota')) {
           keyPool.splice(idx, 1);
           continue;
        }
        break;
      }
    }
    throw new Error("Service busy, please try again.");

  } catch (error) {
    console.error("Handler Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}



