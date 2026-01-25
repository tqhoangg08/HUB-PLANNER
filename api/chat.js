import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // --------------------------------------------------------
  // 1. CẤU HÌNH CORS (Để trình duyệt không báo lỗi)
  // --------------------------------------------------------
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Xử lý request OPTIONS (Preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // --------------------------------------------------------
  // 2. 🛡️ BẢO MẬT CẤP 2: XÁC THỰC TÊN MIỀN (DOMAIN CHECK)
  // --------------------------------------------------------
  const referer = req.headers.referer || req.headers.referrer;
  const origin = req.headers.origin;
  
  const allowedDomains = [
    'hotrosinhvienhub.id.vn', // Web chính
    'localhost',              // Để test dưới máy
    '127.0.0.1'
  ];

  // Kiểm tra: Nếu request không đến từ các nguồn trên -> CHẶN
  // Lưu ý: Postman hay tool chạy trực tiếp thường không có referer -> Bị chặn luôn
  const isAllowed = allowedDomains.some(domain => 
    (referer && referer.includes(domain)) || (origin && origin.includes(domain))
  );

  if (!isAllowed) {
    console.warn(`⛔ Blocked request from: ${referer || origin || 'Unknown'}`);
    return res.status(403).json({ 
      error: "Forbidden", 
      message: "Access denied. Requests must originate from hotrosinhvienhub.id.vn" 
    });
  }

  // --------------------------------------------------------
  // 3. 🔄 CHIẾN THUẬT XOAY VÒNG KEY (RANDOM KEY ROTATION)
  // --------------------------------------------------------
  try {
    const { message } = req.body;

    let keyPool = [
      process.env.GEMINI_API_KEY,
      process.env.KEY_1,
      process.env.KEY_2,
      process.env.KEY_3,
      process.env.KEY_4
    ].filter(k => k); // Lọc bỏ các key rỗng (undefined)

    if (keyPool.length === 0) {
      return res.status(500).json({ error: "Server Configuration Error: No API Keys found." });
    }

    // Hàm gọi Gemini (Có thể tái sử dụng)
    const callGemini = async (apiKey, prompt) => {
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const model = genAI.getGenerativeModel({ 
          model: "gemini-2.5-flash-lite", 
          generationConfig: { responseMimeType: "application/json" }
      });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    };

    // --- LOGIC THỬ LẠI (RETRY) ---
    // Chọn ngẫu nhiên 1 key để bắt đầu
    let attempts = 0;
    let maxAttempts = 2; // Thử tối đa 2 key khác nhau nếu lỗi
    let lastError = null;

    while (attempts < maxAttempts && keyPool.length > 0) {
      attempts++;
      
      // Random Key
      const randomIndex = Math.floor(Math.random() * keyPool.length);
      const currentKey = keyPool[randomIndex];

      try {
        const text = await callGemini(currentKey, message);
        return res.status(200).json({ reply: text }); // Thành công -> Trả về luôn

      } catch (error) {
        console.error(`Attempt ${attempts} failed with key ...${currentKey.slice(-4)}: ${error.message}`);
        lastError = error;

        // Nếu lỗi liên quan đến Hết hạn mức (429) hoặc Quyền (403) -> Xóa key này và thử key khác
        if (error.message.includes('429') || error.message.includes('403') || error.message.includes('Quota')) {
           keyPool.splice(randomIndex, 1); // Loại bỏ key hỏng
           continue; // Thử lại
        } 
        
        // Nếu lỗi khác (ví dụ sai cú pháp) thì dừng luôn, không thử lại
        break;
      }
    }

    // Nếu chạy hết vòng lặp mà vẫn lỗi
    throw lastError || new Error("All API keys are exhausted or busy.");

  } catch (error) {
    console.error("Final API Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
