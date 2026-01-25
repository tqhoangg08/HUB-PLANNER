// api/chat.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // Cấu hình CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { message } = req.body;

  // 1. TẠO KHO KEY (POOL)
  // Hãy thêm tất cả các key bạn tạo được vào đây (KEY_1, KEY_2, v.v.)
  let keyPool = [
    process.env.GEMINI_API_KEY,
    process.env.KEY_1,
    process.env.KEY_2,
    process.env.KEY_3,
    process.env.KEY_4
  ].filter(k => k); // Lọc bỏ key rỗng

  if (keyPool.length === 0) {
    return res.status(500).json({ error: "Server chưa có API Key nào!" });
  }

  // Hàm hỗ trợ gọi Gemini
  const callGemini = async (apiKey, msg) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-lite", 
        generationConfig: { responseMimeType: "application/json" }
    });
    const result = await model.generateContent(msg);
    const response = await result.response;
    return response.text();
  };

  // 2. CHIẾN THUẬT: RANDOM + RETRY (FALLBACK)
  // Thử tối đa 3 lần với 3 key khác nhau trước khi bỏ cuộc
  let attempts = 0;
  const maxAttempts = 3; 
  let lastError = null;

  while (attempts < maxAttempts && keyPool.length > 0) {
    attempts++;
    
    // Chọn ngẫu nhiên 1 key (Chiến thuật Random/Round Robin)
    const randomIndex = Math.floor(Math.random() * keyPool.length);
    const currentKey = keyPool[randomIndex];

    try {
      // Gọi thử
      const text = await callGemini(currentKey, message);
      
      // Nếu thành công -> Trả về ngay
      return res.status(200).json({ reply: text });

    } catch (error) {
      console.error(`Lần thử ${attempts} thất bại với key đuôi ...${currentKey.slice(-4)}:`, error.message);
      lastError = error;

      // CHIẾN THUẬT FALLBACK:
      // Nếu lỗi liên quan đến Quota (429) hoặc Quyền (403), xóa key này khỏi pool và thử key khác
      if (error.message.includes('429') || error.message.includes('403') || error.message.includes('Quota')) {
        // Xóa key hỏng khỏi danh sách để vòng lặp sau không chọn trúng nó nữa
        keyPool.splice(randomIndex, 1);
        console.log("-> Đang đổi sang Key khác...");
        continue; // Chạy tiếp vòng lặp while
      } else {
        // Nếu lỗi khác (ví dụ sai cú pháp, server google sập) thì dừng luôn
        break;
      }
    }
  }

  // Nếu thử hết cách mà vẫn lỗi
  return res.status(500).json({ 
    error: "Tất cả các Key đều đang bận hoặc hết hạn mức.", 
    details: lastError ? lastError.message : "Unknown error"
  });
}
