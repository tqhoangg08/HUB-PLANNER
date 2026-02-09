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
const ratelimit = redis ? new Ratelimit({ redis: redis, limiter: Ratelimit.slidingWindow(10, "10 s"), analytics: true }) : null;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!CHAT_API_KEY) throw new Error("Thiếu GROQ_CHAT_KEY");

    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v3");
      if (!success) return res.status(429).json({ reply: "Chat chậm lại xíu bạn ơi! ⏳" });
    }

    const { message, history } = req.body;

    // 👇 DỮ LIỆU ĐÃ ĐƯỢC "NÉN" (Bỏ từ thừa, giữ nguyên ý chính)
    const KNOWLEDGE_BASE = `
[INFO WEB]
- HUB Planner: Web hỗ trợ SV HUB (phi lợi nhuận, ko phải của trường). Tính điểm, ĐRL, Lost&Found.

[CẨM NANG HUB 2025-2026]
1. TỔNG QUAN
- HUB: ĐH công lập trực thuộc NHNN.
- CS1: 36 Tôn Thất Đạm Q1. Hotline: 028.387.1636.
- CS2: 39 Hàm Nghi Q1.
- CS3 (Chính): 56 Hoàng Diệu 2, Thủ Đức. ĐT: 028.38.971.629.
- Lãnh đạo: Hiệu trưởng PGS.TS Nguyễn Đức Trung.

2. LIÊN HỆ KHOA (56 Hoàng Diệu 2)
- Ngân hàng: khoanh@hub.edu.vn | 028.38.971.624.
- Tài chính: khoatc@hub.edu.vn | 028.38.971.631.
- QTKD: khoaktqt@hub.edu.vn | 028.38.971.639.
- Kế-Kiểm: khoaktkt@hub.edu.vn | 028.38.971.641.
- HTTTQL: khoahtttql@hub.edu.vn | 028.38.971.655.
- KTQT: khoaktqt@hub.edu.vn | 028.38.971.640.
- Luật KT: khoalkt@hub.edu.vn | 028.37.200.151.
- N.Ngữ: khoangoaingu@hub.edu.vn | 028.38.214.305.
- KHDL: khoakhdltkd@hub.edu.vn | 0916.132.429.
- KHXH: khoakhxh@hub.edu.vn | 028.37.200.149.
- Sau ĐH (Q1): khoasaudaihoc@hub.edu.vn | 028.38.212.590.
- GDTC&QP: bomongdtc@hub.edu.vn | 0932.088.188.

3. PHÒNG BAN CHỨC NĂNG
- Đào tạo (Học vụ): phongdaotao@hub.edu.vn | 028.38.212.430 (Q1) - 028.38.971.638 (TĐ).
- TT SV&QHDN (Xác nhận SV, ĐRL, Vay vốn): trungtamsvvaqhdn@hub.edu.vn | 028.38.971.636.
- Khảo thí (Phúc khảo): phongktdbcl@hub.edu.vn | 028.37.200.150.
- Kế toán (Học phí): phongketoan@hub.edu.vn | 028.38.971.646.
- CNTT (Pass portal): phongqlcntt@hub.edu.vn | 028.37.201.034.
- Thư viện: thuvien@hub.edu.vn | 028.38.971.651.
- KTX: trungtamhtsv@hub.edu.vn | 028.38.971.633.
- Y tế (Cô Hoa): 0912.048.079.
- FLIC (Tin học/NN): trungtamnnth@hub.edu.vn | 0909.901.277.

4. HỌC VỤ & QUY CHẾ
- Tín chỉ ngành: Đa số 125 TC (TC-NH 123, Luật 121, KTQT 122).
- Đăng ký: Min 6 môn, Max 7-9 môn/kỳ. Web: dangkytinchi.hub.edu.vn.
- Thang điểm đánh giá học phần (Hệ 10 sang Hệ 4):
• 9,5 - 10,0: A+ (4.0) - Đạt.
• 9,0 - 9,4: A (3.7) - Đạt.
• 8,5 - 8,9: A- (3.4) - Đạt.
• 8,0 - 8,4: B+ (3.2) - Đạt.
• 7,5 - 7,9: B (3.0) - Đạt.
• 7,0 - 7,4: B- (2.8) - Đạt.
• 6,5 - 6,9: C+ (2.6) - Đạt.
• 6,0 - 6,4: C (2.4) - Đạt.
• 5,5 - 5,9: C- (2.2) - Đạt.
• 5,0 - 5,4: D+ (2.0) - Đạt.
• 4,5 - 4,9: D (1.8) - Đạt.
• 4,0 - 4,4: D- (1.6) - Đạt.
• Dưới 4,0: F (0) - Không đạt.
- Thang điểm 4: A+(4.0), A(3.7), B+(3.2), B(3.0), C+(2.6), C(2.4), D+(2.0), D(1.8), F(0-Rớt).
- Xếp loại: XS(3.6+), Giỏi(3.2+), Khá(2.5+), TB(2.0+), Yếu(<2.0).
- Cảnh báo học vụ (Đuổi): ĐTB kỳ <1.0 (kỳ 1 <0.8). Tích lũy <1.2(N1), <1.4(N2), <1.6(N3), <1.8(N4). Cảnh báo 2 lần -> Đuổi.
- Học 2 chương trình: ĐK khi là SV năm 2, học lực Khá. Nếu ĐTB <2.0 phải dừng.

5. HỌC BỔNG & QUYỀN LỢI
- HB KKHT: Min 15 tín/kỳ, ko rớt, ko kỷ luật. Mức: XS (GPA/ĐRL XS), Giỏi (GPA Giỏi/ĐRL Tốt), Khá.
- HB Tương hỗ: GPA Khá, ĐRL Khá, đạt chuẩn NN/TH.
- Trợ cấp: Con liệt sĩ, tàn tật, mồ côi, dân tộc nghèo.
- Vay vốn: NHCSXH địa phương.
- Phụ cấp cán bộ: Lớp/Chi đoàn 500k/năm; Khoa 1tr; Trường 1.2-1.5tr.

6. ĐIỂM RÈN LUYỆN (ĐRL)
- Thang: XS(90-100), Tốt(80-89), Khá(65-79), TB(50-64), Yếu/Kém(<50).
- Hậu quả: Yếu/Kém 2 kỳ -> Tạm dừng hoặc Thôi học.
- Quy trình: Tự chấm (member.youth.hub.edu.vn) -> Họp lớp -> Khoa -> Trường.

7. TIỆN ÍCH & ĐỜI SỐNG
- KTX (56 Hoàng Diệu 2): Phòng 8(600k), 6(875k), 5(1.1tr), 4(1.35tr). Điện nước riêng. Cấm nấu ăn, rượu bia. Đóng cửa 23h.
- Xe buýt: 53 (Lê Hồng Phong), 104 (An Sương), 168 (Metro).
- Thư viện: T2-T7 (Sáng/Chiều).
- BHYT: Bắt buộc. Đóng trước 10/9 (Năm 1), 30/11 (Năm sau). Dùng app VssID.

8. ĐOÀN HỘI & CLB
- Chuyển sinh hoạt Đoàn: Tháng 6 (năm cuối).
- CLB Trường (18): B4T, Grand, Bóng đá/chuyền/rổ/lông, Guitar, Nữ sinh, Vovinam, Mầm sống, NCKH, YFC...
- CLB Khoa (13): SSC, Career Link (NH); MMC, CTXH (QTKD); IEC, ICC (KTQT); SARA (KTKT)...
- FLIC: Chuẩn ra trường TA Bậc 3/6 (Đại trà), 4/6 (CLC). Hotline 0909.901.277.
`;

    // System Prompt ngắn gọn
    const SYSTEM_PROMPT = `
Vai trò: Trợ lý ảo HUB Planner.
Nhiệm vụ: Trả lời sinh viên HUB dựa trên [KNOWLEDGE_BASE].
Nguyên tắc:
1. Chỉ dùng thông tin trong KNOWLEDGE_BASE.
2. Trả lời ngắn, có tâm, dùng emoji 🎓.
3. Không bịa đặt. Nếu không có info -> Bảo liên hệ phòng đào tạo.

[KNOWLEDGE_BASE]:
${KNOWLEDGE_BASE}
`;

    // 👇 CẮT LỊCH SỬ CHAT (Chỉ giữ 2 tin cuối để tiết kiệm token)
    const limitedHistory = (history || []).slice(-2).map(msg => ({
        role: msg.role,
        content: msg.content.substring(0, 300) // Cắt bớt tin nhắn dài
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
        max_tokens: 800, // Giới hạn câu trả lời ko quá dài
    });

    const replyText = completion.choices[0]?.message?.content || "Bot đang quá tải, thử lại sau nhé!";

    if (supabase && req.body.userId) {
        await supabase.from('ai_chat_logs').insert([{
            user_id: req.body.userId,
            user_message: message,
            bot_reply: replyText
        }]);
    }

    return res.status(200).json({ reply: replyText });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    // Xử lý lỗi 413 riêng để báo user
    if (error.status === 413 || error.error?.code === 'rate_limit_exceeded') {
        return res.status(429).json({ reply: "Câu hỏi dài quá hoặc server đang bận, bạn thử hỏi ngắn gọn lại nhé! 📉" });
    }
    return res.status(500).json({ reply: "Lỗi hệ thống rồi! 😵" });
  }
}