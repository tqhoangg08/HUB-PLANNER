import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI } from "@google/genai";
import { UserData, Semester, Subject } from '../types';

// --- 1. CẤU HÌNH WORKER (Giữ nguyên logic của bạn nhưng dùng CDN ổn định hơn) ---
try {
    // Tự động lấy phiên bản khớp với thư viện, nếu không được thì dùng bản mặc định
    const pdfVersion = pdfjsLib.version || '4.0.379';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`;
} catch (e) {
    console.warn("Lỗi khởi tạo PDF Worker:", e);
}

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
}

// --- 2. HÀM LẤY API KEY (QUAN TRỌNG: Chạy được cả trên Web và AI Studio) ---
const getApiKey = () => {
    // Ưu tiên 1: Chạy trên Web (Vercel)
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
            // @ts-ignore
            return import.meta.env.VITE_GEMINI_API_KEY;
        }
    } catch(e) {}
    
    // Ưu tiên 2: Chạy Test hoặc Nodejs
    try {
        if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
            return process.env.API_KEY;
        }
    } catch(e) {}
    
    return ''; // Trả về rỗng nếu không tìm thấy
};

// --- 3. PROMPT MỚI (Sửa lỗi dính chữ và tiêu đề rác) ---
const GEMINI_SYSTEM_PROMPT = `
Bạn là chuyên gia OCR bảng điểm đại học. Nhiệm vụ: Trích xuất danh sách môn học sạch sẽ.

QUY TẮC BẮT BUỘC (KHÔNG ĐƯỢC SAI):
1. ĐẦU RA: Chỉ trả về 1 mảng JSON. Cấu trúc: [{"ten_hoc_phan": "Tên Môn", "tin_chi": 2, "ket_qua": 8.5}]
2. XỬ LÝ DÍNH CHỮ (QUAN TRỌNG):
   - Nếu tên môn dính mã (VD: "ENG101Tiếng Anh"), hãy TÁCH và CHỈ LẤY tên ("Tiếng Anh").
   - Nếu tên môn dính số tín chỉ (VD: "Kinh tế vĩ mô3"), hãy TÁCH ra ("Kinh tế vĩ mô").
3. LỌC RÁC:
   - TUYỆT ĐỐI BỎ các dòng tiêu đề: "STT", "Mã học phần", "Tên học phần", "Tín chỉ", "Điểm", "Ghi chú".
   - BỎ các dòng chỉ có mã số hoặc ký tự vô nghĩa.
4. ĐIỂM SỐ:
   - Điểm số (8.5) -> number.
   - Điểm chữ (M, Đạt, Miễn) -> string.
`;

// Hàm gọi Google AI (Đã tối ưu)
const extractSubjectsWithAI = async (text: string, ai: GoogleGenAI): Promise<any[]> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash', // Dùng bản Flash ổn định hơn Preview
            contents: [
                { role: 'user', parts: [{ text: GEMINI_SYSTEM_PROMPT + `\n\nVĂN BẢN GỐC:\n${text}` }] }
            ],
            config: { responseMimeType: "application/json" }
        });
        
        const candidates = response.data?.candidates || [];
        const jsonText = candidates[0]?.content?.parts?.[0]?.text || response.text;
        
        if (!jsonText) return [];
        // Lọc sạch markdown thừa
        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (error) {
        console.warn("AI xử lý thất bại (Sẽ dùng Regex dự phòng):", error);
        return [];
    }
};

// --- 4. HÀM CHÍNH: XỬ LÝ PDF ---
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    // Đọc file PDF
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + ' '; 
    }
    // Chuẩn hóa khoảng trắng
    fullText = fullText.replace(/\s+/g, ' ');

    // --- Trích xuất thông tin sinh viên ---
    const studentInfo: Partial<UserData> = {};
    const studentMatch = fullText.match(/([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i);
    if (studentMatch) {
        let rawName = studentMatch[1];
        rawName = rawName.replace(/^SV\.\s*/i, '').replace(/^Sinh viên\s*/i, '').trim();
        studentInfo.studentName = rawName;
    }

    const programMatch = fullText.match(/Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:)/i);
    if (programMatch) studentInfo.majorName = programMatch[1].trim();

    // --- Chia nhỏ theo Học kỳ ---
    const semesters: Semester[] = [];
    const yearRanges: {start: number, end: number}[] = [];
    const semHeaderRegex = /Học kỳ\s+(\d)\s*\/\s*(\d{4})\s*-\s*(\d{4})/gi;
    let match;
    const indices: any[] = [];
    
    while ((match = semHeaderRegex.exec(fullText)) !== null) {
        const hk = parseInt(match[1]);
        const y1 = parseInt(match[2]);
        const y2 = parseInt(match[3]);
        indices.push({ 
            index: match.index, 
            name: `Năm học ${y1}-${y2} - Học kỳ ${hk}`, 
            id: `imported_${y1}_${y2}_hk${hk}`, 
            semesterNo: hk, yearStart: y1, yearEnd: y2 
        });
        if (!yearRanges.some(y => y.start === y1)) yearRanges.push({start: y1, end: y2});
    }

    // --- KHỞI TẠO AI (Dùng hàm getApiKey thông minh) ---
    let ai: GoogleGenAI | null = null;
    const apiKey = getApiKey(); // <--- ĐIỂM SỬA QUAN TRỌNG

    if (apiKey) {
        ai = new GoogleGenAI({ apiKey: apiKey });
        // console.log("AI initialized");
    } else {
        console.warn("⚠️ KHÔNG TÌM THẤY API KEY! Đang chạy chế độ Regex (Offline).");
    }

    // --- Xử lý từng học kỳ ---
    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        const end = next ? next.index : fullText.length;
        const blockContent = fullText.substring(current.index, end);

        let subjects: Subject[] = [];
        let aiSuccess = false;

        // CÁCH 1: DÙNG AI (ƯU TIÊN)
        if (ai) {
            try {
                const aiSubjects = await extractSubjectsWithAI(blockContent, ai);
                if (aiSubjects.length > 0) {
                    subjects = aiSubjects.map((s: any, idx: number) => {
                        let isNonGPA = false;
                        const nameLower = (s.ten_hoc_phan || "").toLowerCase();
                        // Từ khóa không tính GPA
                        const nonGpaKeywords = ['gdtc', 'giáo dục thể chất', 'quốc phòng', 'an ninh', 'tiếng anh tăng cường', 'kỹ năng', 'đầu vào', 'sinh hoạt', 'giáo dục công dân'];
                        
                        if (s.tin_chi === 0 || s.ket_qua === 'M' || nonGpaKeywords.some(k => nameLower.includes(k))) isNonGPA = true;
                        
                        let scoreVal: number | null = null;
                        if (typeof s.ket_qua === 'number') scoreVal = s.ket_qua;
                        else if (typeof s.ket_qua === 'string' && !isNaN(parseFloat(s.ket_qua))) scoreVal = parseFloat(s.ket_qua);

                        return {
                            id: `ai_${current.id}_${idx}`,
                            name: s.ten_hoc_phan || "Môn chưa rõ tên",
                            credits: s.tin_chi || 0,
                            scoreCC: scoreVal, scoreProcess: scoreVal, scoreMid: scoreVal, scoreFinal: scoreVal,
                            isNonGPA: isNonGPA
                        };
                    });
                    aiSuccess = true;
                }
            } catch (err) { console.warn("AI lỗi, thử Regex..."); }
        }

        // CÁCH 2: DÙNG REGEX (Dự phòng - Đã cải tiến để lọc rác)
        if (!aiSuccess) {
            const subjectRegex = /(\d+)\s+([A-Z0-9_]+)\s+(.+?)\s+(\d+)\s+(Bắt Buộc|Tự Chọn)\s+([0-9.]+|M|Đạt|Không Đạt)/gi;
            let subMatch;
            while ((subMatch = subjectRegex.exec(blockContent)) !== null) {
                const name = subMatch[3].trim();
                
                // --- BỘ LỌC RÁC MỚI (Fix lỗi code cũ của bạn) ---
                // Bỏ qua nếu dòng này là tiêu đề bảng
                if (name.includes("Tên học phần") || name.includes("Tín chỉ") || name.length < 3) continue;

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
