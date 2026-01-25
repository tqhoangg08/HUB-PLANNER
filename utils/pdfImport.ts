import * as pdfjsLib from 'pdfjs-dist';
import { UserData, Semester, Subject } from '../types';

// Set worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
}

// --- 1. PROMPT MỚI: YÊU CẦU TRẢ VỀ TOÀN BỘ DỮ LIỆU ---
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
      "hoc_ky_so": number, // Ví dụ: 1, 2 hoặc 3
      "diem_ren_luyen": number, // Nếu không thấy thì để null
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

QUY TẮC XỬ LÝ QUAN TRỌNG:
1. Tìm tất cả các học kỳ có trong văn bản (thường bắt đầu bằng "Học kỳ ... Năm học ...").
2. Tự động sửa lỗi dính chữ (ví dụ "ACC101Kế toán" -> "Kế toán").
3. Nếu môn học có điểm là "M" hoặc "Đạt" hoặc môn Giáo dục thể chất/Quốc phòng/Kỹ năng -> Hãy ghi vào trường "diem_so".
4. Bỏ qua các môn bị hủy hoặc chưa có điểm.
5. Chỉ trả về JSON thuần, không kèm markdown block.
`;

// --- 2. HÀM GỌI API (CHỈ GỌI 1 LẦN DUY NHẤT) ---
const extractFullTranscriptWithAI = async (text: string): Promise<any> => {
    try {
        const fullMessage = `${GEMINI_SYSTEM_PROMPT}\n\nVĂN BẢN ĐẦU VÀO:\n${text}`;
        
        // Gọi về Serverless Function của bạn
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: fullMessage })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        const jsonText = data.reply;

        if (!jsonText) return null;

        // Làm sạch chuỗi JSON (xóa markdown ```json ... ```)
        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);

    } catch (error) {
        console.error("AI Full Extraction Error:", error);
        return null;
    }
};

// --- 3. HÀM CHÍNH: XỬ LÝ FILE PDF ---
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    // A. Đọc toàn bộ PDF thành Text
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    // Lặp qua từng trang để nối chuỗi
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n'; // Xuống dòng giữa các trang
    }
    
    // Làm sạch sơ bộ (xóa khoảng trắng thừa)
    fullText = fullText.replace(/\s+/g, ' ');

    // B. GỌI AI 1 LẦN DUY NHẤT (ONE-SHOT)
    console.log("Đang gửi toàn bộ bảng điểm lên AI...");
    const aiResult = await extractFullTranscriptWithAI(fullText);

    // C. Chuẩn bị kết quả trả về
    const result: ParsedResult = {
        studentInfo: {},
        semesters: [],
        yearRanges: []
    };

    if (!aiResult) {
        console.error("Không nhận được dữ liệu từ AI.");
        return result;
    }

    // D. Map dữ liệu từ AI vào cấu trúc App

    // 1. Thông tin sinh viên
    if (aiResult.sinh_vien) {
        result.studentInfo = {
            studentName: aiResult.sinh_vien.ho_ten,
            studentId: aiResult.sinh_vien.ma_sv,
            majorName: aiResult.sinh_vien.chuyen_nganh
        };
    }

    // 2. Danh sách học kỳ
    if (aiResult.hoc_ky && Array.isArray(aiResult.hoc_ky)) {
        result.semesters = aiResult.hoc_ky.map((hk: any, index: number) => {
            const y1 = hk.nam_bat_dau;
            const y2 = hk.nam_ket_thuc;
            const hky = hk.hoc_ky_so;
            
            // Tự động thêm vào yearRanges để vẽ biểu đồ
            if (!result.yearRanges.some(y => y.start === y1)) {
                result.yearRanges.push({ start: y1, end: y2 });
            }

            // Xử lý danh sách môn học trong học kỳ đó
            const subjects: Subject[] = Array.isArray(hk.mon_hoc) ? hk.mon_hoc.map((mon: any, monIdx: number) => {
                let isNonGPA = false;
                let scoreVal: number | null = null;
                
                // Logic xử lý điểm số (số hoặc chữ)
                if (typeof mon.diem_so === 'number') {
                    scoreVal = mon.diem_so;
                } else if (typeof mon.diem_so === 'string') {
                    // Thử ép kiểu sang số
                    const parsed = parseFloat(mon.diem_so);
                    if (!isNaN(parsed)) {
                        scoreVal = parsed;
                    } else {
                        // Nếu là chữ (Đạt, M, v.v.) -> Không tính GPA
                        isNonGPA = true; 
                    }
                }

                // Logic check môn không tính GPA dựa trên tên môn
                const nameLower = mon.ten_mon ? mon.ten_mon.toLowerCase() : "";
                const nonGpaKeywords = [
                    'gdtc', 'thể chất', 'quốc phòng', 'an ninh', 
                    'kỹ năng', 'đầu vào', 'tiếng anh tăng cường', 'sinh hoạt'
                ];
                
                if (mon.tin_chi === 0 || nonGpaKeywords.some(kw => nameLower.includes(kw))) {
                    isNonGPA = true;
                }

                return {
                    id: `ai_${y1}_${hky}_${monIdx}`,
                    name: mon.ten_mon || "Môn học không tên",
                    credits: mon.tin_chi || 0,
                    scoreCC: scoreVal,      // Gán tạm các điểm thành phần bằng điểm tổng kết
                    scoreProcess: scoreVal, // vì AI chỉ trả về 1 điểm chốt
                    scoreMid: scoreVal,
                    scoreFinal: scoreVal,
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
