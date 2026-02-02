import Groq from "groq-sdk";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from '@supabase/supabase-js';

// Cấu hình Key
const CHAT_API_KEY = process.env.GROQ_CHAT_KEY || process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = (UPSTASH_URL && UPSTASH_TOKEN) ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }) : null;
const ratelimit = redis ? new Ratelimit({ redis: redis, limiter: Ratelimit.slidingWindow(20, "1 m"), analytics: true }) : null;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ==============================================================================
// 1. KHO DỮ LIỆU ĐÃ ĐƯỢC CHIA NHỎ (RAG THỦ CÔNG)
// ==============================================================================
const TOPICS = {
    // Thông tin chung luôn luôn cần
    "DEFAULT": `
    [THÔNG TIN CƠ BẢN]
    - Web: HUB Planner (Hỗ trợ sinh viên HUB, không chính chủ).
    - Trường: ĐH Ngân hàng TP.HCM (HUB) - Công lập, trực thuộc NHNN.
    - Cơ sở: 36 Tôn Thất Đạm Q1 (CS1), 39 Hàm Nghi Q1 (CS2), 56 Hoàng Diệu 2 Thủ Đức (CS3 - Chính).
    - Portal: online.hub.edu.vn (Xem điểm, lịch thi).
    `,

    // Khi hỏi về liên hệ, địa chỉ, phòng ban
    "CONTACT": `
    [LIÊN HỆ & PHÒNG BAN]
    - Phòng Đào tạo (Học vụ): phongdaotao@hub.edu.vn | 028.38.212.430.
    - TT SV&QHDN (Xác nhận SV, ĐRL): trungtamsvvaqhdn@hub.edu.vn | 028.38.971.636.
    - Phòng Kế toán (Học phí): phongketoan@hub.edu.vn.
    - Ký túc xá: trungtamhtsv@hub.edu.vn | 028.38.971.633.
    - Y tế (Cô Hoa): 0912.048.079.
    - Các Khoa: Ngân hàng (khoanh@hub.edu.vn), QTKD (khoaktqt@hub.edu.vn), Kế toán (khoaktkt@hub.edu.vn), Luật (khoalkt@hub.edu.vn).
    `,

    // Khi hỏi về điểm số, học vụ, tín chỉ
    "ACADEMIC": `
    [QUY CHẾ HỌC VỤ]
    - Thang điểm 4: A+(4.0), A(3.7), B+(3.2), B(3.0), C+(2.6), C(2.4), D+(2.0), D(1.8), F(0 - Rớt).
    - Xếp loại: Xuất sắc(3.6+), Giỏi(3.2+), Khá(2.5+), TB(2.0+), Yếu(<2.0).
    - Cảnh báo học vụ (Đuổi học): ĐTB kỳ < 1.0 (kỳ đầu <0.8); ĐTB tích lũy <1.2 (năm 1).
    - Đăng ký tín chỉ: Min 6 môn, Max 9 môn. Web: dangkytinchi.hub.edu.vn.
    `,

    // Khi hỏi về tiền, học phí, học bổng
    "MONEY": `
    [HỌC PHÍ & HỌC BỔNG]
    - Học bổng KKHT: Xét theo GPA & ĐRL. Yêu cầu: Min 15 tín/kỳ, không rớt, không kỷ luật.
    - Mức HB: Xuất sắc, Giỏi, Khá.
    - Vay vốn: Tại NH Chính sách xã hội địa phương.
    - Trợ cấp: Con liệt sĩ, dân tộc thiểu số nghèo, mồ côi.
    `,

    // Khi hỏi về ăn ở, đi lại, tiện ích
    "LIFE": `
    [ĐỜI SỐNG SINH VIÊN]
    - Ký túc xá (56 Hoàng Diệu 2): Giá 600k (8 người) - 1350k (4 người)/tháng. Đóng cửa 23h.
    - Xe buýt: 
      + Số 53: Lê Hồng Phong - ĐHQG (Đi ngang CS3).
      + Số 104: An Sương - Nông Lâm.
      + Số 168: HUB Thủ Đức - Metro.
    - Thư viện: Mở T2-T7.
    `,

    // Khi hỏi về hoạt động, CLB, ĐRL
    "ACTIVITY": `
    [HOẠT ĐỘNG & ĐRL]
    - Điểm rèn luyện: Xuất sắc(90+), Tốt(80+), Khá(65+). Dưới 50 bị cảnh cáo.
    - CLB Nhóm 1: B4T, Bóng đá/chuyền/rổ, Văn nghệ Grand, Guitar, Nữ sinh, Vovinam...
    - CLB Nhóm 2 (Khoa): SSC (Ngân hàng), MMC (QTKD), IEC (Kinh tế QT)...
    - Đoàn Hội: Chuyển sinh hoạt đoàn vào tháng 6 (năm cuối).
    `
};

// Hàm chọn lọc kiến thức thông minh
function getContext(userMessage) {
    const msg = userMessage.toLowerCase();
    let context = TOPICS.DEFAULT; // Luôn có thông tin cơ bản

    // Kiểm tra từ khóa để cộng thêm kiến thức (RAG)
    if (msg.match(/(sđt|email|liên hệ|địa chỉ|phòng|khoa|gọi|hỏi)/)) context += TOPICS.CONTACT;
    if (msg.match(/(điểm|gpa|cpa|tín chỉ|rớt|học vụ|cảnh báo|xếp loại)/)) context += TOPICS.ACADEMIC;
    if (msg.match(/(tiền|phí|học bổng|hb|vay|nghèo)/)) context += TOPICS.MONEY;
    if (msg.match(/(xe|buýt|bus|ktx|ký túc|ở|ăn|thư viện)/)) context += TOPICS.LIFE;
    if (msg.match(/(đrl|rèn luyện|clb|đoàn|hội|hoạt động|tham gia)/)) context += TOPICS.ACTIVITY;

    return context;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!CHAT_API_KEY) throw new Error("Server chưa cấu hình GROQ_CHAT_KEY.");

    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat");
      if (!success) return res.status(429).json({ reply: "Bạn chat nhanh quá, nghỉ tay xíu nha! ⏳" });
    }

    const { message, history } = req.body;

    // 1. LẤY KIẾN THỨC TINH GỌN (CHỈ LẤY CÁI CẦN THIẾT)
    const dynamicKnowledge = getContext(message);

    // 2. TẠO PROMPT
    const SYSTEM_PROMPT = `
ROLE: Trợ lý ảo HUB Planner.
CONTEXT:
${dynamicKnowledge}

RULE:
- Chỉ trả lời dựa trên CONTEXT.
- Ngắn gọn, thân thiện (emoji).
- Nếu không có trong CONTEXT, bảo liên hệ trường.
`;

    // 3. CẮT LỊCH SỬ CHAT (Chỉ giữ 2 tin cuối)
    const limitedHistory = (history || []).slice(-2).map(msg => ({ 
        role: msg.role, 
        content: msg.content.substring(0, 300) 
    }));

    const conversation = [
        { role: "system", content: SYSTEM_PROMPT },
        ...limitedHistory,
        { role: "user", content: message }
    ];

    const groq = new Groq({ apiKey: CHAT_API_KEY });
    const completion = await groq.chat.completions.create({
        messages: conversation,
        model: "llama-3.1-8b-instant",
        temperature: 0.3,
        max_tokens: 800, // Giữ output ngắn
    });

    const replyText = completion.choices[0]?.message?.content || "Xin lỗi, mình đang bận xíu!";

    if (supabase && req.body.userId) {
        await supabase.from('ai_chat_logs').insert([{ 
            user_id: req.body.userId,
            user_message: message, 
            bot_reply: replyText 
        }]);
    }

    return res.status(200).json({ reply: replyText });

  } catch (error) {
    console.error("❌ ERROR:", error);
    return res.status(500).json({ reply: "Lỗi server rồi, bạn thử lại sau nha! 😢" });
  }
}