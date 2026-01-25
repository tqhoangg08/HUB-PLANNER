import * as pdfjsLib from 'pdfjs-dist';
import { UserData, Semester, Subject } from '../types';

// Set worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
}

// ==========================================
// 🛡️ PHẦN 1: BỘ LỌC CHỐNG SPAM 
// ==========================================
const checkSpamLimit = (): boolean => {
    const LIMIT_CONFIG = {
        MAX_REQUESTS: ,      // Tối đa 10 lần upload
        TIME_WINDOW: 60 * 60 * 1000, // Trong 1 giờ
        STORAGE_KEY: 'hub_planner_rate_limit'
    };

    const rawData = localStorage.getItem(LIMIT_CONFIG.STORAGE_KEY);
    const now = Date.now();
    let data = rawData ? JSON.parse(rawData) : null;

    // Reset nếu quá hạn
    if (!data || (now - data.startTime > LIMIT_CONFIG.TIME_WINDOW)) {
        const newData = { startTime: now, count: 1 };
        localStorage.setItem(LIMIT_CONFIG.STORAGE_KEY, JSON.stringify(newData));
        return true; 
    }

    // Chặn nếu quá giới hạn
    if (data.count >= LIMIT_CONFIG.MAX_REQUESTS) {
        const waitMinutes = Math.ceil((data.startTime + LIMIT_CONFIG.TIME_WINDOW - now) / 60000);
        alert(`⚠️ BẠN ĐANG THAO TÁC QUÁ NHANH!\n\nHệ thống giới hạn  lần xử lý/giờ để đảm bảo ổn định.\nVui lòng quay lại sau ${waitMinutes} phút nữa.`);
        return false; // CHẶN
    }

    // Tăng đếm và cho qua
    data.count++;
    localStorage.setItem(LIMIT_CONFIG.STORAGE_KEY, JSON.stringify(data));
    return true;
};

// ==========================================
// 🤖 PHẦN 2: CẤU HÌNH AI (PROMPT)
// ==========================================
const GEMINI_SYSTEM_PROMPT = `
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
      "hoc_ky_so": number,
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
3. Nếu điểm là "M", "Đạt" hoặc môn thể chất/quốc phòng -> ghi vào "diem_so".
4. Chỉ trả về JSON thuần.
`;

// ==========================================
// 📡 PHẦN 3: GỌI API (ONE-SHOT)
// ==========================================
const extractFullTranscriptWithAI = async (text: string): Promise<any> => {
    try {
        const fullMessage = `${GEMINI_SYSTEM_PROMPT}\n\nVĂN BẢN ĐẦU VÀO:\n${text}`;
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: fullMessage })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        const jsonText = data.reply;
        if (!jsonText) return null;

        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (error) {
        console.error("AI Full Extraction Error:", error);
        return null;
    }
};

// ==========================================
// 🚀 PHẦN 4: HÀM CHÍNH (MAIN FUNCTION)
// ==========================================
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const result: ParsedResult = { studentInfo: {}, semesters: [], yearRanges: [] };

    // --- BƯỚC 0: KIỂM TRA SPAM NGAY ĐẦU VÀO ---
    // Nếu bị chặn, hàm sẽ trả về kết quả rỗng ngay lập tức
    if (!checkSpamLimit()) {
        return result; 
    }
    // -------------------------------------------

    // A. Đọc PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }
    fullText = fullText.replace(/\s+/g, ' ');

    // B. Gọi AI
    console.log("Đang gửi toàn bộ bảng điểm lên AI...");
    const aiResult = await extractFullTranscriptWithAI(fullText);

    if (!aiResult) return result;

    // C. Map dữ liệu
    if (aiResult.sinh_vien) {
        result.studentInfo = {
            studentName: aiResult.sinh_vien.ho_ten,
            studentId: aiResult.sinh_vien.ma_sv,
            majorName: aiResult.sinh_vien.chuyen_nganh
        };
    }

    if (aiResult.hoc_ky && Array.isArray(aiResult.hoc_ky)) {
        result.semesters = aiResult.hoc_ky.map((hk: any, index: number) => {
            const y1 = hk.nam_bat_dau;
            const y2 = hk.nam_ket_thuc;
            const hky = hk.hoc_ky_so;
            
            if (!result.yearRanges.some(y => y.start === y1)) {
                result.yearRanges.push({ start: y1, end: y2 });
            }

            const subjects: Subject[] = Array.isArray(hk.mon_hoc) ? hk.mon_hoc.map((mon: any, monIdx: number) => {
                let isNonGPA = false;
                let scoreVal: number | null = null;
                
                if (typeof mon.diem_so === 'number') {
                    scoreVal = mon.diem_so;
                } else if (typeof mon.diem_so === 'string') {
                    const parsed = parseFloat(mon.diem_so);
                    if (!isNaN(parsed)) scoreVal = parsed;
                    else isNonGPA = true; 
                }

                const nameLower = mon.ten_mon ? mon.ten_mon.toLowerCase() : "";
                const nonGpaKeywords = ['gdtc', 'thể chất', 'quốc phòng', 'an ninh', 'kỹ năng', 'đầu vào', 'tiếng anh tăng cường'];
                if (mon.tin_chi === 0 || nonGpaKeywords.some(kw => nameLower.includes(kw))) isNonGPA = true;

                return {
                    id: `ai_${y1}_${hky}_${monIdx}`,
                    name: mon.ten_mon || "Môn học",
                    credits: mon.tin_chi || 0,
                    scoreCC: scoreVal, scoreProcess: scoreVal, scoreMid: scoreVal, scoreFinal: scoreVal,
                    isNonGPA: isNonGPA
                };
            }) : [];

            return {
                id: `imported_${y1}_${y2}_hk${hky}`,
                name: `Học kỳ ${hky} Năm học ${y1}-${y2}`,
                subjects: subjects,
                trainingScore: hk.diem_ren_luyen || null
            };
        });
    }

    return result;
};
