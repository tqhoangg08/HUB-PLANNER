import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI } from "@google/genai";
import { UserData, Semester, Subject } from '../types';

// Cấu hình Worker cho PDF.js
try {
    const pdfVersion = pdfjsLib.version || '4.0.379';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`;
} catch (e) {
    console.warn("Failed to initialize PDF worker source:", e);
}

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
}

// --- 1. HÀM QUAN TRỌNG: LẤY API KEY TỪ MỌI NGUỒN ---
const getApiKey = () => {
    try {
        // Ưu tiên 1: Lấy từ biến môi trường Vite (Chạy trên Web Vercel)
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
            // @ts-ignore
            return import.meta.env.VITE_GEMINI_API_KEY;
        }
    } catch(e) {}
    
    try {
        // Ưu tiên 2: Lấy từ process.env (Dự phòng)
        if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
            return process.env.API_KEY;
        }
    } catch(e) {}
    
    return '';
};

// --- 2. PROMPT CHO AI (Đã tối ưu để xóa tiêu đề rác) ---
const GEMINI_SYSTEM_PROMPT = `
Bạn là chuyên gia xử lý dữ liệu bảng điểm. Nhiệm vụ: Trích xuất danh sách môn học sạch sẽ.

QUY TẮC BẮT BUỘC:
1. ĐẦU RA: Chỉ trả về Mảng JSON. Cấu trúc: [{"ten_hoc_phan": "Tên Môn", "tin_chi": 2, "ket_qua": 8.5}]
2. LỌC RÁC:
   - XÓA BỎ các dòng tiêu đề như: "STT", "Mã học phần", "Tên học phần", "Tín chỉ", "Điểm", "Ghi chú".
   - NẾU tên môn dính mã (vd: "ENG101 Tiếng Anh"), HÃY XÓA MÃ, chỉ lấy "Tiếng Anh".
   - NẾU tên môn dính số (vd: "Kinh tế2"), hãy tách ra "Kinh tế".
   - Các môn "Giáo dục thể chất", "Quốc phòng", "Kỹ năng": Vẫn lấy bình thường.
3. ĐIỂM SỐ:
   - Số thì trả về số (8.5).
   - Chữ (M, Đạt) trả về chuỗi.
`;

const extractSubjectsWithAI = async (text: string, ai: GoogleGenAI): Promise<any[]> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash', 
            contents: [
                { role: 'user', parts: [{ text: GEMINI_SYSTEM_PROMPT + `\n\nVĂN BẢN:\n${text}` }] }
            ],
            config: { responseMimeType: "application/json" }
        });
        
        const candidates = response.data?.candidates || [];
        const jsonText = candidates[0]?.content?.parts?.[0]?.text || response.text;
        
        if (!jsonText) return [];
        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (error) {
        console.error("Gemini Extraction Error:", error);
        return [];
    }
};

export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + ' '; 
    }
    fullText = fullText.replace(/\s+/g, ' ');

    // --- Parse Info ---
    const studentInfo: Partial<UserData> = {};
    const studentMatch = fullText.match(/([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i);
    if (studentMatch) studentInfo.studentName = studentMatch[1].replace(/^(SV\.|Sinh viên)\s*/i, '').trim();

    const programMatch = fullText.match(/Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:)/i);
    if (programMatch) studentInfo.majorName = programMatch[1].trim();

    // --- Split Semesters ---
    const semesters: Semester[] = [];
    const yearRanges: {start: number, end: number}[] = [];
    const semHeaderRegex = /Học kỳ\s+(\d)\s*\/\s*(\d{4})\s*-\s*(\d{4})/gi;
    let match;
    const indices: any[] = [];
    
    while ((match = semHeaderRegex.exec(fullText)) !== null) {
        const hk = parseInt(match[1]);
        const y1 = parseInt(match[2]);
        const y2 = parseInt(match[3]);
        indices.push({ index: match.index, name: `Năm học ${y1}-${y2} - Học kỳ ${hk}`, id: `imported_${y1}_${y2}_hk${hk}`, semesterNo: hk, yearStart: y1, yearEnd: y2 });
        if (!yearRanges.some(y => y.start === y1)) yearRanges.push({start: y1, end: y2});
    }

    // --- KHỞI TẠO AI ---
    let ai: GoogleGenAI | null = null;
    const apiKey = getApiKey(); // <--- ĐIỂM SỬA QUAN TRỌNG NHẤT: Dùng hàm getApiKey()

    if (apiKey) {
        ai = new GoogleGenAI({ apiKey: apiKey });
        console.log("AI initialized successfully");
    } else {
        console.warn("⚠️ KHÔNG TÌM THẤY API KEY! Đang dùng Regex dự phòng.");
    }

    // --- Xử lý từng học kỳ ---
    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        const end = next ? next.index : fullText.length;
        const blockContent = fullText.substring(current.index, end);

        let subjects: Subject[] = [];
        let aiSuccess = false;

        // 1. CHẠY AI (ƯU TIÊN)
        if (ai) {
            try {
                const aiSubjects = await extractSubjectsWithAI(blockContent, ai);
                if (aiSubjects.length > 0) {
                    subjects = aiSubjects.map((s: any, idx: number) => {
                        let isNonGPA = false;
                        const nameLower = (s.ten_hoc_phan || "").toLowerCase();
                        const nonGpaKeywords = ['gdtc', 'giáo dục thể chất', 'quốc phòng', 'an ninh', 'tiếng anh tăng cường', 'kỹ năng', 'đầu vào', 'sinh hoạt'];
                        
                        if (s.tin_chi === 0 || s.ket_qua === 'M' || nonGpaKeywords.some(k => nameLower.includes(k))) isNonGPA = true;
                        
                        let scoreVal: number | null = null;
                        if (typeof s.ket_qua === 'number') scoreVal = s.ket_qua;
                        else if (typeof s.ket_qua === 'string' && !isNaN(parseFloat(s.ket_qua))) scoreVal = parseFloat(s.ket_qua);

                        return {
                            id: `ai_${current.id}_${idx}`,
                            name: s.ten_hoc_phan || "Môn không tên",
                            credits: s.tin_chi || 0,
                            scoreCC: scoreVal, scoreProcess: scoreVal, scoreMid: scoreVal, scoreFinal: scoreVal,
                            isNonGPA: isNonGPA
                        };
                    });
                    aiSuccess = true;
                }
            } catch (err) { console.warn("AI lỗi, chuyển sang Regex"); }
        }

        // 2. CHẠY REGEX (DỰ PHÒNG)
        if (!aiSuccess) {
            const subjectRegex = /(\d+)\s+([A-Z0-9_]+)\s+(.+?)\s+(\d+)\s+(Bắt Buộc|Tự Chọn)\s+([0-9.]+|M|Đạt|Không Đạt)/gi;
            let subMatch;
            while ((subMatch = subjectRegex.exec(blockContent)) !== null) {
                const name = subMatch[3].trim();
                // Lọc bỏ tiêu đề thủ công
                if (name.includes("Tên học phần") || name.includes("Tín chỉ")) continue;

                const credits = parseInt(subMatch[4]);
                const rawScore = subMatch[6];
                let scoreVal = (!['M', 'ĐẠT', 'KHÔNG ĐẠT'].includes(rawScore.toUpperCase())) ? parseFloat(rawScore) : null;
                if (isNaN(scoreVal!)) scoreVal = null;
                const isNonGPA = (credits === 0 || scoreVal === null);

                subjects.push({
                    id: subMatch[2] + '_' + i + '_' + subjects.length,
                    name: name,
                    credits: credits,
                    scoreCC: scoreVal, scoreProcess: scoreVal, scoreMid: scoreVal, scoreFinal: scoreVal,
                    isNonGPA: isNonGPA
                });
            }
        }

        const trMatch = blockContent.match(/Điểm rèn luyện\s*[=:]\s*(\d+)/i);
        const trainingScore = trMatch ? parseInt(trMatch[1]) : null;

        if (subjects.length > 0) {
            semesters.push({ id: current.id, name: current.name, subjects, trainingScore });
        }
    }

    return { studentInfo, semesters, yearRanges };
};
