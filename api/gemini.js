// api/gemini.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // 1. Cấu hình CORS để cho phép Web của bạn gọi vào
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Hoặc điền domain của bạn vào đây cho chắc
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Xử lý preflight request (cho trình duyệt)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Chỉ chấp nhận method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 3. Lấy prompt từ phía Client gửi lên
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 4. Gọi Google Gemini (Key lấy từ Server Environment, KHÔNG CÓ VITE_)
    // Lưu ý: Key này nằm trong két sắt server, không ai thấy.
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_SECRET_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    // 5. Trả kết quả về cho Client
    return res.status(200).json({ result: text });

  } catch (error) {
    console.error("Gemini Error:", error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
