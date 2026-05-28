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
}

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
        hk.hoc_ky
    ].filter(Boolean).join(' ');

    const rangeMatch = combinedYearText.match(/\b(20\d{2})\s*[-–]\s*(20\d{2})\b/);
    const start = normalizeYear(hk.nam_bat_dau ?? hk.start_year ?? hk.year_start) ?? (rangeMatch ? Number(rangeMatch[1]) : null);
    const end = normalizeYear(hk.nam_ket_thuc ?? hk.end_year ?? hk.year_end) ?? (rangeMatch ? Number(rangeMatch[2]) : (start ? start + 1 : null));

    if (!start || !end) return null;
    return { start, end };
};

const normalizeSemesterNo = (value: any): 1 | 2 | 'Hè' | null => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (value === 1 || raw === '1' || raw.includes('học kỳ 1') || raw.includes('hoc ky 1') || raw.includes('hk1')) return 1;
    if (value === 2 || raw === '2' || raw.includes('học kỳ 2') || raw.includes('hoc ky 2') || raw.includes('hk2')) return 2;
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

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        const jsonText = data.reply;
        if (!jsonText) return null;

        return extractJsonObject(jsonText);
    } catch (error) {
        console.error("AI Full Extraction Error:", error);
        return null;
    }
};

// ==========================================
// 🚀 PHẦN 4: HÀM CHÍNH  (MAIN FUNCTION)
// ==========================================
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const result: ParsedResult = { studentInfo: {}, semesters: [], yearRanges: [] };

    if (!checkSpamLimit()) {
        return result; 
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }
    fullText = fullText.replace(/\s+/g, ' ');

    console.log("Đang gửi toàn bộ bảng điểm lên AI...");
    const aiResult = await extractFullTranscriptWithAI(fullText);

    if (!aiResult) return result;

    if (aiResult.sinh_vien) {
        result.studentInfo = {
            studentName: aiResult.sinh_vien.ho_ten,
            studentCode: aiResult.sinh_vien.ma_sv,
            majorName: aiResult.sinh_vien.chuyen_nganh
        } as any; // <-- Thêm "as any" ở đây để dập lỗi TypeScript
    }

    if (aiResult.hoc_ky && Array.isArray(aiResult.hoc_ky)) {
        result.semesters = aiResult.hoc_ky.reduce((semesters: Semester[], hk: any, index: number) => {
            const yearRange = normalizeYearRange(hk);
            const hky = normalizeSemesterNo(hk.hoc_ky_so ?? hk.hoc_ky ?? hk.ten_hoc_ky ?? hk.semester);

            if (!yearRange || !hky) return semesters;

            const y1 = yearRange.start;
            const y2 = yearRange.end;

            if (!result.yearRanges.some(y => y.start === y1 && y.end === y2)) {
                result.yearRanges.push({ start: y1, end: y2 });
            }

            const subjects: Subject[] = Array.isArray(hk.mon_hoc) ? hk.mon_hoc
                .filter((mon: any) => mon && (mon.ten_mon || mon.name || mon.mon_hoc))
                .map((mon: any, monIdx: number) => {
                    const rawName = String(mon.ten_mon || mon.name || mon.mon_hoc || '').trim();
                    const { score, isNonGPA: scoreIsNonGPA } = normalizeScore(mon.diem_so ?? mon.diem ?? mon.score ?? mon.tb10);
                    const credits = Number.parseFloat(String(mon.tin_chi ?? mon.credits ?? 0).replace(',', '.')) || 0;
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
                }) : [];

            if (subjects.length === 0) return semesters;

            const trainingScore = Number.parseInt(String(hk.diem_ren_luyen ?? hk.drl ?? ''), 10);

            semesters.push({
                id: `imported_${y1}_${y2}_hk${hky}`,
                name: `Học kỳ ${hky} Năm học ${y1}-${y2}`,
                subjects,
                trainingScore: Number.isFinite(trainingScore) ? trainingScore : null
            });

            return semesters;
        }, []);
    }

    return result;
};
