import { createClient } from '@supabase/supabase-js';
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ===========================================
// ✨ HỆ THỐNG CÂN BẰNG TẢI API KEY (LOAD BALANCING) ✨
// ===========================================
const GEMINI_KEYS_STRING = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
const GEMINI_KEYS = GEMINI_KEYS_STRING.split(',').map(key => key.trim()).filter(key => key.length > 0);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (UPSTASH_URL && UPSTASH_TOKEN) ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }) : null;
const ratelimit = redis ? new Ratelimit({ redis: redis, limiter: Ratelimit.slidingWindow(10, "10 s"), analytics: true }) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (GEMINI_KEYS.length === 0) throw new Error("Thiếu API Key Gemini");

    if (ratelimit) {
      const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
      const { success } = await ratelimit.limit(ip + "_chat_v3");
      if (!success) return res.status(429).json({ reply: "Chat chậm lại xíu bạn ơi! ⏳" });
    }

    const { question, context, history, userId } = req.body;

    // ===========================================
    // ✨ GHI LOG PARTIAL LÊN SUPABASE NGAY LẬP TỨC ✨
    // ===========================================
    let logId = null;
    if (supabase) {
        const { data: logData, error: logError } = await supabase.from('ai_chat_logs').insert([{
            user_id: userId || null, 
            user_message: question,
            bot_reply: '⏳ Đang xử lý (Chờ cập nhật trên web)'
        }]).select('id').single();
        
        if (logData) logId = logData.id;
        if (logError) console.error("Lỗi ghi log partial lên Supabase:", logError);
    }

    // ===========================================
    // ✨ KÉO TẤT CẢ DỮ LIỆU SONG SONG BẰNG PROMISE.ALL ✨
    // ===========================================
    // ===========================================
    // ✨ KÉO TẤT CẢ DỮ LIỆU SONG SONG BẰNG PROMISE.ALL ✨
    // ===========================================
    const [
        { data: kbData },
        { data: eventsData },
        { data: announcementsData },
        { data: lostFoundData },
        { data: coursesData }
    ] = await Promise.all([
        // 1. Cẩm nang hệ thống
        supabase.from('system_knowledge').select('id, content').order('id', { ascending: true }),
        
        // 2. SỬA CHỖ NÀY: Chỉ lấy "Đang diễn ra" và sắp xếp lấy mới nhất
       supabase.from('events').select('title, status, deadline, format, points, link')
                .eq('status', 'Đang diễn ra') 
                .order('id', { ascending: false }),
                
        // 3. Thông báo mới nhất
        supabase.from('school_announcements').select('title, date, link')
                .eq('is_hidden', false).order('date', { ascending: false }).limit(5),
        // 4. Tìm đồ thất lạc mới nhất
        supabase.from('lost_found_items').select('title, description, location, contact_info')
                .order('created_at', { ascending: false }).limit(5),
        // 5. Học phần
        supabase.from('course_schedules').select('subject_name, course_code, instructor, credits')
                .limit(5)
    ]);

    // XỬ LÝ TEXT CHO TỪNG PHẦN
    let handbookText = kbData?.length ? kbData.map(row => `--- TÀI LIỆU PHẦN ${row.id} ---\n${row.content}`).join('\n\n') : "Không có cẩm nang.";
    
    let realtimeContext = "\n[THÔNG TIN THỰC TẾ TRÊN WEB (REAL-TIME)]\n";
    
    if (eventsData?.length) {
        realtimeContext += "\n**🎉 SỰ KIỆN NỔI BẬT:**\n" + eventsData.map(e => `- ${e.title} (${e.status}). Hình thức: ${e.format}. Điểm: ${e.points}. Hạn: ${e.deadline || 'Không có'}`).join('\n');
    }
    
    if (announcementsData?.length) {
        realtimeContext += "\n\n**📢 THÔNG BÁO MỚI NHẤT:**\n" + announcementsData.map(a => `- ${a.title} (Ngày: ${a.date}). Link: ${a.link}`).join('\n');
    }

    if (lostFoundData?.length) {
        realtimeContext += "\n\n**🔍 TÌM ĐỒ THẤT LẠC:**\n" + lostFoundData.map(l => `- [${l.title}]: ${l.description} (Khu vực: ${l.location}). LH: ${l.contact_info}`).join('\n');
    }

    if (coursesData?.length) {
        realtimeContext += "\n\n**📚 MỘT SỐ HỌC PHẦN MẪU (Lưu ý: Đây không phải toàn bộ môn học):**\n" + coursesData.map(c => `- ${c.subject_name} (${c.course_code}) - GV: ${c.instructor} - ${c.credits} TC`).join('\n');
    }

    // ===========================================
    // ✨ GOM VÀO SYSTEM PROMPT ✨
    // ===========================================
    const systemInstruction = `Bạn là AI Cố vấn học tập của website HUB Planner.
Nhiệm vụ: Tư vấn cho sinh viên Đại học Ngân hàng TP.HCM (HUB).

[THÔNG TIN CÁ NHÂN CỦA SINH VIÊN]:
${context || "Chưa có thông tin."}

${realtimeContext}

[CẨM NANG TRƯỜNG (TOÀN BỘ QUY CHẾ)]:
${handbookText}

NGUYÊN TẮC BẮT BUỘC:
1. Trả lời chuẩn xác 100% dựa vào CẨM NANG và THÔNG TIN THỰC TẾ ở trên. 
2. Khi sinh viên hỏi về sự kiện, thông báo, hoặc đồ thất lạc, hãy ưu tiên dùng dữ liệu trong [THÔNG TIN THỰC TẾ TRÊN WEB].
3. Nếu sinh viên hỏi về một "Môn học/Học phần" không có trong danh sách mẫu, hãy nói: "Hệ thống hiện chưa tải toàn bộ thời khóa biểu, bạn vui lòng tra cứu trực tiếp trên chức năng Môn học của web nhé!".
4. Trả lời bằng Markdown rõ ràng, thân thiện, xưng "mình" gọi "bạn". Không tự ý bịa thông tin.`;

    // Chuẩn bị lịch sử chat cho Gemini
    const formattedHistory = (history || []).slice(-4).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content.substring(0, 500) }]
    }));
    formattedHistory.push({ role: 'user', parts: [{ text: question }] });

    // Bốc thăm API Key
    const activeKey = GEMINI_KEYS[Math.floor(Math.random() * GEMINI_KEYS.length)];

    // GỌI GEMINI 3.1 FLASH LITE
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: formattedHistory,
            generationConfig: { temperature: 0.2 } // Tăng nhẹ temp một chút để nó chat mượt hơn
        })
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Lỗi từ Gemini:", data);
        throw new Error('Lỗi gọi AI Google');
    }

    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Mình đang xử lý hơi lâu, bạn hỏi lại nha!";
    
    // CẬP NHẬT LOG THỰC TẾ VÀO DATABASE
    if (supabase && logId) {
        await supabase.from('ai_chat_logs').update({ bot_reply: replyText }).eq('id', logId);
    }
    
    return res.status(200).json({ reply: replyText, logId: logId });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error);
    return res.status(500).json({ reply: "Xin lỗi, máy chủ AI đang bận. Bạn thử lại sau nhé! 😵" });
  }
}