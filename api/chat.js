// api/chat.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // 1. Cấu hình CORS (Giữ nguyên như cũ để không lỗi chặn truy cập)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Xử lý Preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { message } = req.body;

    // Lấy Key từ biến môi trường Server (Bảo mật tuyệt đối)
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Server Error: Thiếu GEMINI_API_KEY");
      return res.status(500).json({ error: "Server configuration error: Missing API Key" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // 2. Cấu hình Model
    // Sử dụng 'gemini-1.5-flash' vì nó nhanh, rẻ và đọc tài liệu rất tốt.
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        // QUAN TRỌNG: Ép kiểu trả về là JSON để frontend dễ xử lý
        generationConfig: {
            responseMimeType: "application/json"
        }
    });

    // 3. Gọi Gemini
    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    // 4. Trả kết quả
    return res.status(200).json({ reply: text });

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
