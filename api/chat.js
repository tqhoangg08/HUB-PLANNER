import Groq from "groq-sdk"; // 👈 Thư viện mới
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// --------------------------------------------------------
// 1. KHỞI TẠO GROQ CLIENT
// --------------------------------------------------------
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// --------------------------------------------------------
// 2. KHỞI TẠO REDIS & RATE LIMITER
// --------------------------------------------------------
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const ratelimit = redis
  ? new Ratelimit({
      redis: redis,
      // 🔥 Groq cho hạn mức cao, mình tăng lên 10 lần/ngày để bạn test thoải mái
      limiter: Ratelimit.slidingWindow(10, "1 d"), 
      analytics: true,
    })
  : null;

export default async function handler(req, res) {
  // --------------------------------------------------------
  // 3. CẤU HÌNH CORS (GIỮ NGUYÊN)
  // --------------------------------------------------------
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
    // 🛡️ LỚP 1: RATE LIMITING (Upstash)
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
          message: "Bạn đã dùng hết lượt miễn phí trong ngày. Mai quay lại nhé!" 
        });
      }
    }

    // ============================================================
    // 🛡️ LỚP 2: DOMAIN VERIFICATION (Chặn request lạ)
    // ============================================================
    const referer = req.headers.referer || req.headers.referrer;
    const origin = req.headers.origin;
    const allowedDomains = ['hotrosinhvienhub.id.vn', 'localhost', '127.0.0.1'];
    
    // Nếu test Postman thì comment dòng if dưới lại
    const isAllowed = allowedDomains.some(d => (referer?.includes(d) || origin?.includes(d)));
    
    if (!isAllowed) {
      return res.status(403).json({ error: "Forbidden", message: "Domain not allowed." });
    }

    // ============================================================
    // 🚀 LỚP 3: XỬ LÝ AI BẰNG GROQ (LLAMA 3)
    // ============================================================
    const { message } = req.body;

    if (!process.env.GROQ_API_KEY) {
        throw new Error("Chưa cấu hình GROQ_API_KEY trong biến môi trường.");
    }

    const completion = await groq.chat.completions.create({
        messages: [
            {
                // Prompt hệ thống giúp định hướng JSON chặt chẽ hơn
                role: "system",
                content: "Bạn là một API xử lý dữ liệu OCR. Nhiệm vụ duy nhất của bạn là trích xuất thông tin từ văn bản được cung cấp và trả về kết quả dưới dạng JSON hợp lệ. Không được trả lời thêm bất kỳ lời dẫn hay giải thích nào."
            },
            {
                role: "user",
                content: message // Prompt + Text PDF từ Frontend gửi lên
            }
        ],
        // 🏆 Model mạnh nhất và miễn phí hiện tại
        model: "llama-3.3-70b-versatile",
        
        // 🔥 BẮT BUỘC: Ép kiểu về JSON Object để Frontend không bị lỗi
        response_format: { type: "json_object" },
        
        // Nhiệt độ thấp để AI trả lời chính xác, không sáng tạo linh tinh
        temperature: 0.1, 
    });

    // Lấy kết quả trả về
    const reply = completion.choices[0]?.message?.content || "";

    return res.status(200).json({ reply: reply });

  } catch (error) {
    console.error("Groq Handler Error:", error);
    // Xử lý lỗi Groq cụ thể
    if (error.status === 429) {
        return res.status(429).json({ error: "Groq Rate Limit", message: "Server AI đang quá tải, vui lòng thử lại sau 1 phút." });
    }
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}