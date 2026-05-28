import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { apiHeaders, apiUrl } from './api';
import { UserData, Semester, Subject } from '../types';

// Set worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
    error?: string;
    debug?: Record<string, any>;
}

const summarizeKeys = (value: any) => {
    if (!value || typeof value !== 'object') return 'none';
    return Object.keys(value).slice(0, 12).join(', ') || 'none';
};

const saveImportDebug = (payload: Record<string, any>) => {
    try {
        localStorage.setItem('hub_last_transcript_import_debug', JSON.stringify({
            ...payload,
            at: new Date().toISOString()
        }));
    } catch {
        // ignore storage errors
    }
};

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

const normalizeYear = (value: any): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;

    const match = value.match(/\b(20\d{2})\b/);
    return match ? Number(match[1]) : null;
};

const normalizeYearRange = (hk: any): { start: number; end: number } | null => {
    const combinedYearText = [
        hk.nam_hoc,
        hk.nien_khoa,
        hk.nam,
        hk.year,
        hk.academic_year,
        hk.ten_hoc_ky,
        hk.hoc_ky,
        hk.semester,
        hk.semester_name,
        hk.name
    ].filter(Boolean).join(' ');

    const rangeMatch = combinedYearText.match(/\b(20\d{2})\s*[-–]\s*(20\d{2})\b/);
    const start = normalizeYear(hk.nam_bat_dau ?? hk.start_year ?? hk.year_start) ?? (rangeMatch ? Number(rangeMatch[1]) : null);
    const end = normalizeYear(hk.nam_ket_thuc ?? hk.end_year ?? hk.year_end) ?? (rangeMatch ? Number(rangeMatch[2]) : (start ? start + 1 : null));

    if (!start || !end) return null;
    return { start, end };
};

const normalizeSemesterNo = (value: any): 1 | 2 | 'Hè' | null => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (value === 1 || raw === '1' || raw.includes('học kỳ 1') || raw.includes('hoc ky 1') || raw.includes('hk1') || raw.includes('semester 1')) return 1;
    if (value === 2 || raw === '2' || raw.includes('học kỳ 2') || raw.includes('hoc ky 2') || raw.includes('hk2') || raw.includes('semester 2')) return 2;
    if (value === 3 || raw === '3' || raw.includes('hè') || raw.includes('he') || raw.includes('summer') || raw.includes('phụ') || raw.includes('phu')) return 'Hè';
    return null;
};

const normalizeScore = (value: any): { score: number | null; isNonGPA: boolean } => {
    if (typeof value === 'number' && Number.isFinite(value)) return { score: value, isNonGPA: false };
    if (typeof value !== 'string') return { score: null, isNonGPA: false };

    const numeric = Number.parseFloat(value.replace(',', '.'));
    if (!Number.isNaN(numeric)) return { score: numeric, isNonGPA: false };
    return { score: null, isNonGPA: value.trim().length > 0 };
};

const getFirstValue = (source: any, keys: string[]) => {
    if (!source || typeof source !== 'object') return undefined;
    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return undefined;
};

const getFirstArray = (source: any, keys: string[]) => {
    if (!source || typeof source !== 'object') return null;
    for (const key of keys) {
        if (Array.isArray(source[key])) return source[key];
    }
    return null;
};

// ==========================================
// 🛡️ PHẦN 1: BỘ LỌC CHỐNG SPAM
// ==========================================
const checkSpamLimit = (): boolean => {
    const LIMIT_CONFIG = {
        MAX_REQUESTS: 2,              // Tối đa 2 lần upload
        TIME_WINDOW: 60 * 60 * 1000, // 1 giờ
        STORAGE_KEY: 'hub_planner_rate_limit'
    };

    const rawData = localStorage.getItem(LIMIT_CONFIG.STORAGE_KEY);
    const now = Date.now();
    let data = rawData ? JSON.parse(rawData) : null;

    // Reset nếu quá hạn (sau 24h từ lần đầu tiên)
    if (!data || (now - data.startTime > LIMIT_CONFIG.TIME_WINDOW)) {
        const newData = { startTime: now, count: 1 };
        localStorage.setItem(LIMIT_CONFIG.STORAGE_KEY, JSON.stringify(newData));
        return true; 
    }

    // Chặn nếu quá giới hạn
    if (data.count >= LIMIT_CONFIG.MAX_REQUESTS) {
        const waitMinutes = Math.ceil((data.startTime + LIMIT_CONFIG.TIME_WINDOW - now) / 60000);
        const waitHours = (waitMinutes / 60).toFixed(1);

        alert(`⚠️ ĐÃ ĐẠT GIỚI HẠN TRONG NGÀY!\n\nĐể tiết kiệm tài nguyên, hệ thống giới hạn mỗi người chỉ được dùng 2 lần/giờ.\n\nVui lòng quay lại sau khoảng ${waitHours} giờ nữa (hoặc ${waitMinutes} phút).`);
        return false; 
    }

    // Tăng đếm và cho qua
    data.count++;
    localStorage.setItem(LIMIT_CONFIG.STORAGE_KEY, JSON.stringify(data));
    return true;
};

// ==========================================
// 🤖 PHẦN 2: CẤU HÌNH AI (PROMPT NÂNG CẤP)
// ==========================================
const AI_SYSTEM_PROMPT = `
Bạn là chuyên gia OCR xử lý bảng điểm đại học.
Nhiệm vụ: Trích xuất toàn bộ dữ liệu từ văn bản đầu vào và trả về 1 JSON duy nhất.

CẤU TRÚC JSON YÊU CẦU (Bắt buộc tuân thủ):
{
  "sinh_vien": {
    "ho_ten": "string",
    "ma_sv": "string",
    "chuyen_nganh": "string"
  },
  "hoc_ky": [
    {
      "nam_bat_dau": number,
      "nam_ket_thuc": number,
      "hoc_ky_so": number hoặc string (Chỉ được trả về: 1, 2, hoặc "Hè"),
      "diem_ren_luyen": number,
      "mon_hoc": [
        {
          "ten_mon": "Tên đầy đủ môn học",
          "tin_chi": number,
          "diem_so": number hoặc string (ví dụ: 8.5 hoặc "Đạt", "M")
        }
      ]
    }
  ]
}

QUY TẮC QUAN TRỌNG:
1. Tìm tất cả các học kỳ.
2. Tự động sửa lỗi dính chữ.
3. Nếu là học kỳ Hè/Học kỳ phụ, ở trường "hoc_ky_so" bắt buộc ghi là "Hè" hoặc 3.
4. Nếu điểm là "M", "Đạt" hoặc môn thể chất/quốc phòng -> ghi vào "diem_so".
5. Chỉ trả về JSON thuần.
`;

// ==========================================
// 📡 PHẦN 3: GỌI API
// ==========================================
const extractFullTranscriptWithAI = async (text: string): Promise<any> => {
    try {
        const fullMessage = `${AI_SYSTEM_PROMPT}\n\nVĂN BẢN ĐẦU VÀO:\n${text}`;
        
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
        const jsonText = data.reply;
        if (!jsonText) return null;

        return extractJsonObject(jsonText);
    } catch (error) {
        console.error("AI Full Extraction Error:", error);
        throw error;
    }
};

// ==========================================
// 🚀 PHẦN 4: HÀM CHÍNH  (MAIN FUNCTION)
// ==========================================
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const result: ParsedResult = {
        studentInfo: {},
        semesters: [],
        yearRanges: [],
        debug: {
            fileName: file.name,
            fileSize: file.size,
            stage: 'start'
        }
    };

    if (!checkSpamLimit()) {
        return result; 
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    result.debug = { ...result.debug, stage: 'pdf-loaded', pages: pdf.numPages };
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }
    fullText = fullText.replace(/\s+/g, ' ');
    result.debug = { ...result.debug, stage: 'pdf-text-extracted', textLength: fullText.length };

    if (fullText.length < 80) {
        result.error = 'PDF không trích xuất được đủ văn bản. Hãy dùng file PDF gốc dạng text, không phải ảnh scan.';
        saveImportDebug(result.debug || {});
        return result;
    }

    console.log("Đang gửi toàn bộ bảng điểm lên AI...");
    let aiResult: any = null;
    try {
        result.debug = { ...result.debug, stage: 'calling-chat-api' };
        aiResult = await extractFullTranscriptWithAI(fullText);
    } catch (error) {
        result.error = `Lỗi tại bước gọi Groq wrapper (/chat): ${error instanceof Error ? error.message : 'Không gọi được API Groq.'}`;
        saveImportDebug({ ...(result.debug || {}), error: result.error });
        return result;
    }

    if (!aiResult) {
        result.error = 'Groq không trả về JSON hợp lệ.';
        saveImportDebug({ ...(result.debug || {}), stage: 'invalid-ai-json' });
        return result;
    }
    result.debug = { ...result.debug, stage: 'ai-json-parsed', aiKeys: summarizeKeys(aiResult) };

    const studentInfo = aiResult.sinh_vien || aiResult.student || aiResult.student_info || aiResult.thong_tin_sinh_vien;
    if (studentInfo) {
        result.studentInfo = {
            studentName: getFirstValue(studentInfo, ['ho_ten', 'name', 'full_name', 'student_name']),
            studentCode: getFirstValue(studentInfo, ['ma_sv', 'mssv', 'student_code', 'student_id']),
            majorName: getFirstValue(studentInfo, ['chuyen_nganh', 'nganh', 'major', 'major_name'])
        } as any;
    }

    const semesterRows = getFirstArray(aiResult, ['hoc_ky', 'semesters', 'semester', 'terms', 'hocKy', 'bang_diem'])
        || getFirstArray(aiResult.data, ['hoc_ky', 'semesters', 'semester', 'terms', 'hocKy', 'bang_diem'])
        || [];
    result.debug = { ...result.debug, semesterRowCount: semesterRows.length };

    if (semesterRows.length > 0) {
        const skippedReasons: Record<string, number> = {};
        const markSkip = (reason: string) => {
            skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
        };

        result.semesters = semesterRows.reduce((semesters: Semester[], hk: any, index: number) => {
            const yearRange = normalizeYearRange(hk) || normalizeYearRange(aiResult);
            const hky = normalizeSemesterNo(
                getFirstValue(hk, ['hoc_ky_so', 'hoc_ky', 'ten_hoc_ky', 'semester', 'semester_no', 'semester_name', 'ky', 'term'])
            ) || ((index % 2) + 1 as 1 | 2);

            if (!yearRange || !hky) {
                markSkip(!yearRange ? 'missing-year-range' : 'missing-semester');
                return semesters;
            }

            const y1 = yearRange.start;
            const y2 = yearRange.end;

            if (!result.yearRanges.some(y => y.start === y1 && y.end === y2)) {
                result.yearRanges.push({ start: y1, end: y2 });
            }

            const subjectRows = getFirstArray(hk, ['mon_hoc', 'subjects', 'courses', 'hoc_phan', 'items', 'details', 'bang_diem']) || [];
            const subjects: Subject[] = subjectRows
                .filter((mon: any) => mon && getFirstValue(mon, ['ten_mon', 'ten_hoc_phan', 'subject_name', 'course_name', 'name', 'mon_hoc', 'hoc_phan']))
                .map((mon: any, monIdx: number) => {
                    const rawName = String(getFirstValue(mon, ['ten_mon', 'ten_hoc_phan', 'subject_name', 'course_name', 'name', 'mon_hoc', 'hoc_phan']) || '').trim();
                    const { score, isNonGPA: scoreIsNonGPA } = normalizeScore(getFirstValue(mon, ['diem_so', 'diem', 'score', 'tb10', 'diem_tb', 'diem_tong_ket', 'average', 'final_score', 'diem_he_10']));
                    const credits = Number.parseFloat(String(getFirstValue(mon, ['tin_chi', 'so_tin_chi', 'credits', 'credit']) ?? 0).replace(',', '.')) || 0;
                    const nameLower = rawName.toLowerCase();
                    const nonGpaKeywords = ['gdtc', 'thể chất', 'the chat', 'quốc phòng', 'quoc phong', 'an ninh', 'kỹ năng', 'ky nang', 'đầu vào', 'dau vao', 'tiếng anh tăng cường', 'tieng anh tang cuong', 'học phần', 'hoc phan', 'quân sự', 'quan su', 'chiến đấu', 'chien dau'];
                    const isNonGPA = scoreIsNonGPA || credits === 0 || nonGpaKeywords.some(kw => nameLower.includes(kw));

                    return {
                        id: `ai_${y1}_${hky}_${index}_${monIdx}`,
                        name: rawName || "Môn học",
                        credits,
                        scoreCC: score,
                        scoreProcess: score,
                        scoreMid: score,
                        scoreFinal: score,
                        isNonGPA
                    };
                });

            if (subjects.length === 0) {
                markSkip(`no-subjects keys=${summarizeKeys(hk)}`);
                return semesters;
            }

            const trainingScore = Number.parseInt(String(getFirstValue(hk, ['diem_ren_luyen', 'drl', 'training_score']) ?? ''), 10);

            semesters.push({
                id: `imported_${y1}_${y2}_hk${hky}`,
                name: `Học kỳ ${hky} Năm học ${y1}-${y2}`,
                subjects,
                trainingScore: Number.isFinite(trainingScore) ? trainingScore : null
            });

            return semesters;
        }, []);

        result.debug = {
            ...result.debug,
            mappedSemesterCount: result.semesters.length,
            skippedReasons,
            firstSemesterKeys: summarizeKeys(semesterRows[0])
        };
    }

    if (result.semesters.length === 0) {
        const debug = result.debug || {};
        result.error = semesterRows.length === 0
            ? `Groq đã trả JSON nhưng không có danh sách học kỳ/môn học mà app nhận ra. Keys Groq: ${debug.aiKeys || summarizeKeys(aiResult)}.`
            : `Groq đã trả ${semesterRows.length} học kỳ nhưng app không map được môn. Keys học kỳ đầu: ${debug.firstSemesterKeys || summarizeKeys(semesterRows[0])}. Lý do: ${JSON.stringify(debug.skippedReasons || {})}.`;
        saveImportDebug({ ...debug, error: result.error });
    } else {
        saveImportDebug(result.debug || {});
    }

    return result;
};
