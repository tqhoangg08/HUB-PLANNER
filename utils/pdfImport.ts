import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI } from "@google/genai";
import { UserData, Semester, Subject } from '../types';

// --- 1. Cấu hình Worker (Dùng CDN để ổn định trên mọi môi trường) ---
try {
    // Tự động lấy phiên bản khớp với thư viện để tránh lỗi màn hình trắng
    const pdfVersion = pdfjsLib.version || '4.0.379';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`;
} catch (e) {
    console.warn("Worker init warning:", e);
}

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
}

// --- 2. Prompt cho AI (Nếu có Key) ---
const GEMINI_SYSTEM_PROMPT = `
Bạn là chuyên gia OCR. Nhiệm vụ: Trích xuất môn học từ bảng điểm.

QUY TẮC BẮT BUỘC:
1. OUTPUT: Mảng JSON. Cấu trúc: [{"ten_hoc_phan": "Tên", "tin_chi": 2, "ket_qua": 8.5}]
2. XỬ LÝ DÍNH CHỮ: Tách tên môn dính mã (VD: "ENG1Tiếng Anh" -> "Tiếng Anh").
3. LỌC RÁC: Bỏ các dòng tiêu đề bảng (Mã HP, Tên HP, Tín chỉ, Điểm).
4. ĐIỂM SỐ: Số là number, Chữ là string.
`;

const extractSubjectsWithAI = async (text: string, ai: GoogleGenAI): Promise<any[]> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [{ role: 'user', parts: [{ text: GEMINI_SYSTEM_PROMPT + `\n\nTEXT:\n${text}` }] }],
            config: { responseMimeType: "application/json" }
        });
        
        const jsonText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || response.text;
        if (!jsonText) return [];
        return JSON.parse(jsonText.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (error) {
        console.warn("AI extraction failed (swapping to regex):", error);
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

    // --- Parsing Info ---
    const studentInfo: Partial<UserData> = {};
    const smatch = fullText.match(/([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i);
    if (smatch) studentInfo.studentName = smatch[1].replace(/^(SV\.|Sinh viên)\s*/i, '').trim();
    
    const pmatch = fullText.match(/Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:)/i);
    if (pmatch) studentInfo.majorName = pmatch[1].trim();

    // --- Split Semesters ---
    const semesters: Semester[] = [];
    const yearRanges: {start: number, end: number}[] = [];
    const semRegex = /Học kỳ\s+(\d)\s*\/\s*(\d{4})\s*-\s*(\d{4})/gi;
    let match;
    const indices: any[] = [];
    
    while ((match = semRegex.exec(fullText)) !== null) {
        const [_, hk, y1, y2] = match;
        indices.push({ index: match.index, name: `Năm học ${y1}-${y2} - Học kỳ ${hk}`, id: `imported_${y1}_${y2}_hk${hk}`, semesterNo: parseInt(hk), yearStart: parseInt(y1), yearEnd: parseInt(y2) });
        if (!yearRanges.some(y => y.start === parseInt(y1))) yearRanges.push({start: parseInt(y1), end: parseInt(y2)});
    }

    // --- KHỞI TẠO AI (LOGIC NGOẠI GIAO - KHÔNG BÁO LỖI ĐỎ) ---
    let ai: GoogleGenAI | null = null;
    let apiKey = '';

    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            // @ts-ignore
            apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
        }
    } catch (e) {}

    if (apiKey) {
        ai = new GoogleGenAI({ apiKey });
    } else {
        console.info("Running in Offline Mode (Regex). This is normal.");
    }

    // --- Process Loop ---
    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        const blockContent = fullText.substring(current.index, next ? next.index : fullText.length);

        let subjects: Subject[] = [];
        let aiSuccess = false;

        // 1. Try AI (Nếu có Key)
        if (ai) {
            const aiSub = await extractSubjectsWithAI(blockContent, ai);
            if (aiSub.length > 0) {
                subjects = aiSub.map((s: any, idx: number) => {
                    let isNonGPA = false;
                    const name = (s.ten_hoc_phan || "").toLowerCase();
                    if (s.tin_chi === 0 || s.ket_qua === 'M' || ['gdtc','quốc phòng','an ninh','kỹ năng','đầu vào','sinh hoạt'].some(k => name.includes(k))) isNonGPA = true;
                    
                    let score = null;
                    if (typeof s.ket_qua === 'number') score = s.ket_qua;
                    else if (!isNaN(parseFloat(s.ket_qua))) score = parseFloat(s.ket_qua);

                    return {
                        id: `ai_${current.id}_${idx}`,
                        name: s.ten_hoc_phan, credits: s.tin_chi,
                        scoreCC: score, scoreProcess: score, scoreMid: score, scoreFinal: score,
                        isNonGPA
                    };
                });
                aiSuccess = true;
            }
        }

        // 2. Fallback Regex (ĐƯỢC CẢI TIẾN - Fix lỗi rác trên Web thật)
        if (!aiSuccess) {
            const regex = /(\d+)\s+([A-Z0-9_]+)\s+(.+?)\s+(\d+)\s+(Bắt Buộc|Tự Chọn)\s+([0-9.]+|M|Đạt|Không Đạt)/gi;
            let m;
            while ((m = regex.exec(blockContent)) !== null) {
                const name = m[3].trim();
                
                // --- CHỐT CHẶN QUAN TRỌNG: Lọc bỏ dòng tiêu đề ---
                // Nếu tên môn chứa các từ khóa này -> Bỏ qua ngay
                if (
                    name.includes("Tên học phần") || 
                    name.includes("Tín chỉ") || 
                    name.includes("Mã học phần") ||
                    name.length < 3
                ) {
                    continue; 
                }

                const cred = parseInt(m[4]);
                let score = (!['M','ĐẠT','KHÔNG ĐẠT'].includes(m[6].toUpperCase())) ? parseFloat(m[6]) : null;
                if (isNaN(score!)) score = null;
                
                subjects.push({
                    id: `${m[2]}_${i}_${subjects.length}`,
                    name, credits: cred,
                    scoreCC: score, scoreProcess: score, scoreMid: score, scoreFinal: score,
                    isNonGPA: (cred === 0 || score === null)
                });
            }
        }

        const trMatch = blockContent.match(/Điểm rèn luyện\s*[=:]\s*(\d+)/i);
        const trainingScore = trMatch ? parseInt(trMatch[1]) : null;

        if (subjects.length > 0) semesters.push({ id: current.id, name: current.name, subjects, trainingScore });
    }

    return { studentInfo, semesters, yearRanges };
};
