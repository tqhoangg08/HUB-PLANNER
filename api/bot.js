import Groq from "groq-sdk";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from '@supabase/supabase-js';

const CHAT_API_KEY = process.env.GROQ_CHAT_KEY || process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = (UPSTASH_URL && UPSTASH_TOKEN) ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }) : null;
const ratelimit = redis ? new Ratelimit({ redis: redis, limiter: Ratelimit.slidingWindow(20, "1 m"), analytics: true }) : null;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

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

    // 👇 DATA ĐÃ ĐƯỢC NÉN (GIỮ NGUYÊN Ý, GIẢM SỐ LƯỢNG TỪ)
    const KNOWLEDGE_BASE = `
[INFO WEB HUB PLANNER]
- Web hỗ trợ SV HUB (không chính chủ), giúp tính điểm GPA/CPA, xem ĐRL, Lost&Found.
- Dữ liệu điểm lưu local (an toàn). Tác giả: Nhóm SV HUB.

[CẨM NANG SV HUB 2025-2026]
1. TỔNG QUAN
- HUB: ĐH công lập trực thuộc NHNN.
- CS1: 36 Tôn Thất Đạm Q1. CS2: 39 Hàm Nghi Q1. CS3: 56 Hoàng Diệu 2 Thủ Đức (Chính).
- Sứ mạng: Đào tạo nhân lực chất lượng cao ngành TC-NH.

2. LIÊN HỆ KHOA & PHÒNG BAN (Quan trọng)
- Phòng Đào tạo: phongdaotao@hub.edu.vn | 028.38.212.430 - 028.38.971.638.
- TT SV&QHDN (Xác nhận SV, ĐRL): trungtamsvvaqhdn@hub.edu.vn | 028.38.971.636.
- Phòng Kế toán (Học phí): phongketoan@hub.edu.vn | 028.38.971.646.
- Phòng Khảo thí (Phúc khảo): phongktdbcl@hub.edu.vn | 028.37.200.150.
- TT Thư viện: thuvien@hub.edu.vn | 028.38.971.651.
- Ký túc xá (KTX): trungtamhtsv@hub.edu.vn | 028.38.971.633.
- Y tế: toyte.tccb@hub.edu.vn | 0912.048.079 (Cô Hoa).
- Các Khoa: Ngân hàng (khoanh@hub.edu.vn), Tài chính (khoatc@hub.edu.vn), QTKD (khoaktqt@hub.edu.vn), Kế toán (khoaktkt@hub.edu.vn), HTTTQL (khoahtttql@hub.edu.vn), N.Ngữ (khoangoaingu@hub.edu.vn), Luật KT (khoalkt@hub.edu.vn).

3. HỌC VỤ & QUY CHẾ
- Thang điểm 4: A+(4.0), A(3.7), B+(3.2), B(3.0), C+(2.6), C(2.4), D+(2.0), D(1.8), F(0-Rớt).
- Xếp loại: Xuất sắc(3.6-4.0), Giỏi(3.2-3.59), Khá(2.5-3.19), TB(2.0-2.49), Yếu(<2.0).
- Cảnh báo học vụ (Bị đuổi): ĐTB kỳ < 1.0 (kỳ đầu <0.8); ĐTB tích lũy <1.2 (năm 1), <1.4 (năm 2), <1.6 (năm 3), <1.8 (năm 4).
- Đăng ký tín chỉ: Min 6 môn/kỳ. Max 7-9 môn. Link: dangkytinchi.hub.edu.vn.
- Portal: online.hub.edu.vn (Xem điểm, lịch thi). Email: MSSV@st.buh.edu.vn.

4. HỌC BỔNG & RÈN LUYỆN
- HB KKHT: 15 tín/kỳ, ko rớt, ko kỷ luật. 3 mức: Xuất sắc, Giỏi, Khá (Dựa trên GPA & ĐRL).
- ĐRL: Xuất sắc(90+), Tốt(80+), Khá(65+), TB(50+), Yếu/Kém(<50 - bị cảnh báo).
- Quy trình ĐRL: Tự chấm (member.youth.hub.edu.vn) -> Lớp -> Khoa -> Trường.

5. TIỆN ÍCH & DỊCH VỤ
- KTX (56 Hoàng Diệu 2): Giá 600k-1350k/tháng (tùy loại phòng 4-8 người). Đóng cửa 23h.
- Xe buýt: 53 (Lê Hồng Phong), 104 (An Sương), 168 (Metro).
- Thư viện: Mở T2-T7 (Sáng/Chiều).
- Ngoại ngữ (FLIC): Chuẩn ra trường B bậc 3/6 (Đại trà), 4/6 (CLC). Hotline: 0909.901.277.

6. CÂU LẠC BỘ (CLB)
- Trường: B4T, Bóng đá/chuyền/rổ, Văn nghệ Grand, Guitar, Nữ sinh, Vovinam, Mầm sống, NCKH...
- Khoa: SSC, Career Link, MMC, IIC, IEC, SARA...
`;

    // --- SYSTEM PROMPT NGẮN GỌN HƠN ---
    const SYSTEM_PROMPT = `
ROLE: Trợ lý ảo HUB Planner.
DATA: Dựa vào [KNOWLEDGE_BASE] bên dưới.
RULE:
1. Chỉ trả lời thông tin có trong DATA.
2. Nếu không biết thì bảo liên hệ phòng đào tạo.
3. Trả lời ngắn gọn, thân thiện (emoji).

[KNOWLEDGE_BASE]:
${KNOWLEDGE_BASE}
`;

    // 👇 CẮT BỚT LỊCH SỬ CHAT ĐỂ TIẾT KIỆM TOKEN (Giữ lại 2 tin nhắn gần nhất)
    const limitedHistory = (history || []).slice(-2).map(msg => ({ 
        role: msg.role, 
        content: msg.content.substring(0, 500) // Cắt bớt nếu tin nhắn quá dài
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
        max_tokens: 800, // Giới hạn output để tránh lỗi
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