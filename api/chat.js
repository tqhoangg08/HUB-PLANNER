// api/chat.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
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

  try {
    const { message } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Server Error: Thiếu GEMINI_API_KEY");
      return res.status(500).json({ error: "Server configuration error: Missing API Key" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // --- SỬA Ở ĐÂY: Đổi tên model ---
    // Thay vì 'gemini-1.5-flash', hãy dùng 'gemini-1.5-flash-latest'
    // Hoặc nếu vẫn lỗi thì thử 'gemini-pro' (tuy cũ hơn nhưng rất ổn định)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-latest", 
        generationConfig: {
            responseMimeType: "application/json"
        }
    });

    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ reply: text });

  } catch (error) {
    console.error("API Error:", error);
    // Trả về lỗi chi tiết để dễ debug
    return res.status(500).json({ 
        error: error.message || "Internal Server Error",
        details: error.toString()
    });
  }
}
