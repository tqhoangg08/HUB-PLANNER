import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { apiHeaders, apiUrl } from './api';

// Set worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const extractJsonObject = (raw: string): any | null => {
    const cleanText = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
        return JSON.parse(cleanText);
    } catch {
        const start = cleanText.indexOf('{');
        const end = cleanText.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return null;
        try {
            return JSON.parse(cleanText.slice(start, end + 1));
        } catch {
            return null;
        }
    }
};

const getFirstArray = (source: any, keys: string[]) => {
    if (!source || typeof source !== 'object') return null;
    for (const key of keys) {
        if (Array.isArray(source[key])) return source[key];
    }
    return null;
};

const saveScheduleImportDebug = (payload: Record<string, any>) => {
    try {
        localStorage.setItem('hub_last_schedule_import_debug', JSON.stringify({
            ...payload,
            at: new Date().toISOString()
        }));
    } catch {
        // ignore storage errors
    }
};

// Dùng chung bộ đếm Spam với Bảng điểm
const checkSpamLimit = (): boolean => {
    const LIMIT_CONFIG = { MAX_REQUESTS: 3, TIME_WINDOW: 60 * 60 * 1000, STORAGE_KEY: 'hub_planner_rate_limit' };
    const rawData = localStorage.getItem(LIMIT_CONFIG.STORAGE_KEY);
    const now = Date.now();
    let data = rawData ? JSON.parse(rawData) : null;
    if (!data || (now - data.startTime > LIMIT_CONFIG.TIME_WINDOW)) {
        localStorage.setItem(LIMIT_CONFIG.STORAGE_KEY, JSON.stringify({ startTime: now, count: 1 }));
        return true; 
    }
    if (data.count >= LIMIT_CONFIG.MAX_REQUESTS) {
        alert("⚠️ ĐÃ ĐẠT GIỚI HẠN TẢI LÊN!\nHệ thống giới hạn 3 lần/giờ để tránh quá tải. Vui lòng thử lại sau!");
        return false; 
    }
    data.count++;
    localStorage.setItem(LIMIT_CONFIG.STORAGE_KEY, JSON.stringify(data));
    return true;
};

// ĐÃ SỬA: Yêu cầu AI lấy thêm trường start_date
const SCHEDULE_PROMPT = `
Bạn là chuyên gia trích xuất Thời khóa biểu đại học từ văn bản.
Nhiệm vụ: Trích xuất danh sách môn học và trả về JSON hợp lệ.

CẤU TRÚC JSON BẮT BUỘC:
{
  "semester": "HK2_2025_2026", // Suy luận từ văn bản (VD: HK02/2025-2026 -> HK2_2025_2026)
  "courses": [
    {
      "course_code": "string (Mã học phần, VD: MAG318_252_1_D02)",
      "subject_name": "string (Tên học phần, bỏ các ký tự thừa như () ở cuối)",
      "credits": number (Số tín chỉ),
      "instructor": "string (Tên giảng viên)",
      "day_of_week": "string (Thứ trong tuần, chỉ lấy số. VD: Thứ Ba -> '3', Chủ nhật -> '8'. Nếu 2 buổi thì nối bằng '\\n'. VD: '6\\n7')",
      "shift": "string (Nếu 7H00 -> 'S', Nếu 13H00 -> 'C'. Nếu 2 buổi thì 'C\\nC')",
      "room": "string (Tên phòng học, VD: A207. 2 phòng thì 'A207\\nB101')",
      "campus": "string (Nếu chứa 'Hoàng Diệu 2' -> 'TD', nếu 'Tôn Thất Đạm' -> 'Q1')",
      "weeks": "1-15", // Mặc định luôn điền '1-15'
      "start_date": "string (Ngày bắt đầu học, định dạng dd/mm/yyyy)"
    }
  ]
}

QUY TẮC:
1. Cột "Thông tin" chứa Thứ, Giờ, Phòng, Cơ sở. Hãy tách chính xác.
2. Một số môn có 2 buổi/tuần (VD: Thứ Sáu 13H00... Thứ Bảy 13H00...). Hãy gộp vào 1 object, các thông tin cách nhau bằng ký tự xuống dòng '\\n'.
3. Bắt buộc lấy chính xác cột "Ngày bắt đầu" cho từng môn.
4. Bắt buộc chỉ trả về JSON thuần, KHÔNG giải thích, KHÔNG markdown.
`;

export const parseSchedulePdf = async (file: File) => {
    if (!checkSpamLimit()) return null;
    const debug: Record<string, any> = {
        fileName: file.name,
        fileSize: file.size,
        stage: 'start'
    };

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    debug.stage = 'pdf-loaded';
    debug.pages = pdf.numPages;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }
    
    fullText = fullText.replace(/\s+/g, ' ').trim();
    debug.stage = 'pdf-text-extracted';
    debug.textLength = fullText.length;
    if (fullText.length < 80) {
        const error = 'PDF TKB không trích xuất được đủ văn bản. Hãy dùng file PDF gốc dạng text, không phải ảnh scan.';
        saveScheduleImportDebug({ ...debug, error });
        return { courses: [], error };
    }

    try {
        const fullMessage = `${SCHEDULE_PROMPT}\n\nVĂN BẢN ĐẦU VÀO:\n${fullText}`;
        debug.stage = 'calling-chat-api';
        const response = await fetch(apiUrl('/chat'), {
            method: 'POST',
            headers: apiHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ message: fullMessage })
        });
        if (!response.ok) {
            const message = await response.text().catch(() => '');
            throw new Error(`API Error: ${response.status}${message ? ` - ${message.slice(0, 160)}` : ''}`);
        }
        const data = await response.json();
        const parsed = extractJsonObject(data.reply || '');
        if (!parsed) {
            const error = 'Groq không trả về JSON TKB hợp lệ.';
            saveScheduleImportDebug({ ...debug, stage: 'invalid-ai-json', error });
            return { courses: [], error };
        }
        debug.stage = 'ai-json-parsed';
        debug.aiKeys = Object.keys(parsed || {}).slice(0, 12).join(', ') || 'none';

        const courses = getFirstArray(parsed, ['courses', 'subjects', 'classes', 'mon_hoc', 'hoc_phan'])
            || getFirstArray(parsed.data, ['courses', 'subjects', 'classes', 'mon_hoc', 'hoc_phan'])
            || [];
        debug.courseCount = courses.length;
        saveScheduleImportDebug(debug);

        return {
            ...parsed,
            semester: parsed.semester || parsed.hoc_ky || parsed.term,
            courses
        };
    } catch (error) {
        const message = `Lỗi tại bước gọi Groq wrapper (/chat) cho TKB: ${error instanceof Error ? error.message : 'Không gọi được API Groq.'}`;
        saveScheduleImportDebug({ ...debug, error: message });
        return { courses: [], error: message };
    }
};
