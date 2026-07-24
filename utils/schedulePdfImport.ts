import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { apiHeaders, apiUrl } from './api';
import {
    parseHubScheduleLayout,
    type SchedulePdfLayoutPage,
} from './hubScheduleParser';

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
            at: new Date().toISOString(),
        }));
    } catch {
        // Không để lỗi localStorage làm gián đoạn import.
    }
};

const checkSpamLimit = (): boolean => {
    const LIMIT_CONFIG = {
        MAX_REQUESTS: 3,
        TIME_WINDOW: 60 * 60 * 1000,
        STORAGE_KEY: 'hub_planner_rate_limit',
    };
    const rawData = localStorage.getItem(LIMIT_CONFIG.STORAGE_KEY);
    const now = Date.now();
    let data = rawData ? JSON.parse(rawData) : null;
    if (!data || now - data.startTime > LIMIT_CONFIG.TIME_WINDOW) {
        localStorage.setItem(LIMIT_CONFIG.STORAGE_KEY, JSON.stringify({ startTime: now, count: 1 }));
        return true;
    }
    if (data.count >= LIMIT_CONFIG.MAX_REQUESTS) {
        alert('Đã đạt giới hạn tải lên bằng AI!\nHệ thống giới hạn 3 lần/giờ để tránh quá tải. Vui lòng thử lại sau.');
        return false;
    }
    data.count += 1;
    localStorage.setItem(LIMIT_CONFIG.STORAGE_KEY, JSON.stringify(data));
    return true;
};

const SCHEDULE_PROMPT = `
Bạn là chuyên gia trích xuất thời khóa biểu đại học từ văn bản có giữ cấu trúc dòng.
Hãy trả về JSON thuần, không markdown, theo cấu trúc:
{
  "semester": "HK1_2026_2027",
  "courses": [
    {
      "course_code": "MAG318_252_1_D02",
      "subject_name": "Đàm phán kinh doanh quốc tế",
      "credits": 3,
      "instructor": "Nguyễn Văn Tiến",
      "day_of_week": "3",
      "shift": "07:00-11:05",
      "room": "A207",
      "campus": "TD",
      "weeks": "",
      "start_date": "03/02/2026",
      "end_date": "21/04/2026"
    }
  ]
}

Quy tắc bắt buộc:
1. Giữ chính xác giờ bắt đầu và kết thúc. Không đổi giờ thành S/C.
2. Nếu một môn có nhiều buổi, nối day_of_week, shift và room bằng ký tự xuống dòng theo cùng thứ tự.
3. Thứ Hai đến Chủ Nhật lần lượt là 2 đến 8.
4. Hoàng Diệu 2/Thủ Đức là TD; Tôn Thất Đạm/Quận 1 là Q1.
5. Lấy chính xác cả ngày bắt đầu và ngày kết thúc.
`;

const buildReadableLayoutText = (pages: SchedulePdfLayoutPage[]) => pages
    .map(page => {
        const rows: { y: number; items: typeof page.items }[] = [];
        [...page.items]
            .sort((a, b) => b.y - a.y || a.x - b.x)
            .forEach(item => {
                let row = rows.find(candidate => Math.abs(candidate.y - item.y) <= 2.2);
                if (!row) {
                    row = { y: item.y, items: [] };
                    rows.push(row);
                }
                row.items.push(item);
            });
        return rows
            .sort((a, b) => b.y - a.y)
            .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' | '))
            .join('\n');
    })
    .join('\n\n--- TRANG MỚI ---\n\n');

export const parseSchedulePdf = async (file: File) => {
    const debug: Record<string, any> = {
        fileName: file.name,
        fileSize: file.size,
        stage: 'start',
    };

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    debug.stage = 'pdf-loaded';
    debug.pages = pdf.numPages;

    const layoutPages: SchedulePdfLayoutPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        layoutPages.push({
            pageNumber,
            width: viewport.width,
            height: viewport.height,
            items: textContent.items
                .filter((item: any) => typeof item.str === 'string' && item.str.trim())
                .map((item: any) => ({
                    text: item.str,
                    x: Number(item.transform?.[4] || 0),
                    y: Number(item.transform?.[5] || 0),
                    width: Number(item.width || 0),
                    height: Number(item.height || 0),
                })),
        });
    }

    const directResult = parseHubScheduleLayout(layoutPages);
    debug.directParser = directResult.diagnostics;
    if (directResult.reliable) {
        debug.stage = 'hub-layout-parsed';
        debug.courseCount = directResult.courses.length;
        saveScheduleImportDebug(debug);
        return {
            semester: directResult.semester,
            courses: directResult.courses,
            parser: 'hub-layout',
        };
    }

    const layoutText = buildReadableLayoutText(layoutPages).trim();
    debug.stage = 'pdf-text-extracted';
    debug.textLength = layoutText.length;
    if (layoutText.length < 80) {
        const error = 'PDF TKB không trích xuất được đủ văn bản. Hãy dùng file PDF gốc dạng text, không phải ảnh scan.';
        saveScheduleImportDebug({ ...debug, error });
        return { courses: [], error };
    }

    // File không đúng mẫu HUB mới cần dùng AI và tính vào giới hạn request.
    if (!checkSpamLimit()) {
        return { courses: [], error: 'Đã đạt giới hạn import bằng AI.' };
    }

    try {
        const fullMessage = `${SCHEDULE_PROMPT}\n\nVĂN BẢN ĐẦU VÀO:\n${layoutText}`;
        debug.stage = 'calling-chat-api';
        const response = await fetch(apiUrl('/chat'), {
            method: 'POST',
            headers: apiHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ message: fullMessage }),
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

        const courses = getFirstArray(parsed, ['courses', 'subjects', 'classes', 'mon_hoc', 'hoc_phan'])
            || getFirstArray(parsed.data, ['courses', 'subjects', 'classes', 'mon_hoc', 'hoc_phan'])
            || [];
        debug.stage = 'ai-json-parsed';
        debug.courseCount = courses.length;
        saveScheduleImportDebug(debug);

        return {
            ...parsed,
            semester: parsed.semester || parsed.hoc_ky || parsed.term,
            courses,
            parser: 'ai-fallback',
        };
    } catch (error) {
        const message = `Lỗi tại bước gọi Groq cho TKB: ${error instanceof Error ? error.message : 'Không gọi được API Groq.'}`;
        saveScheduleImportDebug({ ...debug, error: message });
        return { courses: [], error: message };
    }
};
