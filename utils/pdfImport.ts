import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI } from "@google/genai";
import { UserData, Semester, Subject } from '../types';

// Set worker for PDF.js - ensure version matches the main library import
// Tự động lấy đúng phiên bản worker khớp với thư viện
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[]; // Keep track of found years
}

interface AiSubject {
    ten_mon: string | null;
    tin_chi: number | null;
    diem_he_10: number | null;
    diem_he_4: number | null;
    diem_chu: string | null;
}

// System instruction for Gemini
const GEMINI_SYSTEM_PROMPT = `
Bạn là một chuyên gia trích xuất dữ liệu từ văn bản và hình ảnh (OCR). Nhiệm vụ của bạn là đọc bảng điểm từ văn bản được cung cấp và trích xuất dữ liệu sạch.

YÊU CẦU VỀ DỮ LIỆU ĐẦU RA:
1. Định dạng: Chỉ trả về duy nhất một mảng JSON (JSON Array). Không thêm markdown (json), không thêm lời dẫn hay giải thích.
2. Cấu trúc mỗi phần tử (Object) trong mảng chỉ bao gồm 5 trường sau:
   - "ten_mon": (String) Tên đầy đủ của môn học.
   - "tin_chi": (Number) Số tín chỉ.
   - "diem_he_10": (Number|null) Điểm hệ 10.
   - "diem_he_4": (Number|null) Điểm hệ 4.
   - "diem_chu": (String|null) Điểm chữ.

QUY TẮC LỌC VÀ XỬ LÝ LỖI (BẮT BUỘC):
1. BỎ QUA HOÀN TOÀN các cột sau: Mã học phần (như ITC301, ACC705...), các nút chức năng (Chi tiết, Xóa), và các ô checkbox.
2. BỎ QUA DÒNG TIÊU ĐỀ: Không trích xuất các dòng chứa chữ "Mã học phần", "Tên học phần", "Tín chỉ", "Học kỳ".
3. XỬ LÝ DÍNH CHỮ:
   - Nếu tên môn học bị dính với mã học phần (ví dụ: "ACC705 Kế toán tài chính"), hãy tự động cắt bỏ mã, chỉ giữ lại "Kế toán tài chính".
   - Nếu tên môn học bị ngắt xuống dòng, hãy nối chúng lại thành một chuỗi hoàn chỉnh.
4. Các môn bắt đầu bằng chữ "Kỹ năng", "GDTC", "Học phần", "Tiếng anh tăng cường" thường không tính vào GPA nhưng vẫn cần trích xuất chính xác.
`;

const parseGeminiResponse = (jsonText?: string) => {
    if (!jsonText) return [];
    const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
};

const extractSubjectsWithAI = async (
    fullText: string,
    ai: GoogleGenAI
): Promise<AiSubject[]> => {
    try {
        const prompt = `${GEMINI_SYSTEM_PROMPT}\n\nDưới đây là toàn bộ nội dung bảng điểm. Hãy trích xuất tất cả các môn học thành một JSON Array. Mỗi phần tử gồm: tên môn, số tín chỉ, điểm hệ 10, điểm hệ 4, điểm chữ. Nếu không tìm thấy thông tin nào thì để null.\n\nDữ liệu:\n${fullText}`;
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        return parseGeminiResponse(response.text) as AiSubject[];
    } catch (error) {
        console.error("Gemini Extraction Error:", error);
        return [];
    }

    return results;
};

const normalizeSemesterKey = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const mapAiSubjectsToSubjects = (aiSubjects: AiSubject[], currentId: string) => {
    return aiSubjects.map((s: AiSubject, idx: number) => {
        let isNonGPA = false;
        const nameLower = s.ten_hoc_phan.toLowerCase();
        const nonGpaKeywords = [
            'gdtc', 'giáo dục thể chất',
            'quốc phòng', 'an ninh',
            'tiếng anh tăng cường',
            'kỹ năng',
            'đầu vào', 'học phần'
        ];

        if (s.tin_chi === 0 || s.ket_qua === 'M' || nonGpaKeywords.some(k => nameLower.includes(k))) {
            isNonGPA = true;
        }

        let scoreVal: number | null = null;
        if (typeof s.ket_qua === 'number') {
            scoreVal = s.ket_qua;
        } else if (typeof s.ket_qua === 'string') {
            const parsed = parseFloat(s.ket_qua);
            if (!isNaN(parsed)) scoreVal = parsed;
        }

        return {
            id: `ai_${currentId}_${idx}`,
            name: s.ten_hoc_phan,
            credits: s.tin_chi,
            scoreCC: scoreVal,
            scoreProcess: scoreVal,
            scoreMid: scoreVal,
            scoreFinal: scoreVal,
            isNonGPA: isNonGPA
        };
    });
};

const mapAiSubjectsToSubjects = (aiSubjects: AiSubject[]) => {
    return aiSubjects.map((s: AiSubject, idx: number) => {
        const name = s.ten_mon?.trim() ?? '';
        const credits = typeof s.tin_chi === 'number' ? s.tin_chi : 0;
        const score10 = typeof s.diem_he_10 === 'number' ? s.diem_he_10 : null;
        const letter = s.diem_chu?.toUpperCase() ?? '';

        let isNonGPA = false;
        const nameLower = name.toLowerCase();
        const nonGpaKeywords = [
            'gdtc', 'giáo dục thể chất',
            'quốc phòng', 'an ninh',
            'tiếng anh tăng cường',
            'kỹ năng',
            'đầu vào', 'học phần'
        ];

        if (credits === 0 || letter === 'M' || nonGpaKeywords.some(k => nameLower.includes(k))) {
            isNonGPA = true;
        }

        return {
            id: `ai_subject_${idx}`,
            name: name,
            credits: credits,
            scoreCC: score10,
            scoreProcess: score10,
            scoreMid: score10,
            scoreFinal: score10,
            isNonGPA: isNonGPA
        };
    }).filter(subject => subject.name);
};

export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';

    // 1. Extract full text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let pageText = '';

        for (const item of textContent.items as any[]) {
            pageText += item.str;
            pageText += ' ';
        }

        fullText += pageText + ' ';
    }

    fullText = fullText.replace(/\s+/g, ' ');

    // 2. Parse Student Info
    const studentNameRegex = /([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i;
    const studentMatch = fullText.match(studentNameRegex);

    const studentInfo: Partial<UserData> = {};
    if (studentMatch) {
        let rawName = studentMatch[1];
        rawName = rawName.replace(/^SV\.\s*/i, '').replace(/^Sinh viên\s*/i, '').trim();
        studentInfo.studentName = rawName;
    }

    const programRegex = /Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:)/i;
    const programMatch = fullText.match(programRegex);
    if (programMatch) {
        studentInfo.majorName = programMatch[1].trim();
    }

    // 3. Capture year ranges if available
    const yearRanges: {start: number, end: number}[] = [];
    const semHeaderRegex = /Học kỳ\s+(\d)\s*\/\s*(\d{4})\s*-\s*(\d{4})/gi;
    let match;

    while ((match = semHeaderRegex.exec(fullText)) !== null) {
        const y1 = parseInt(match[2]);
        const y2 = parseInt(match[3]);

        if (!yearRanges.some(y => y.start === y1)) {
            yearRanges.push({start: y1, end: y2});
        }
    }

    // 4. Initialize AI (if API key exists)
    let ai: GoogleGenAI | null = null;
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (apiKey) {
        ai = new GoogleGenAI({ apiKey: apiKey });
    } else {
        console.error("LỖI: Chưa tìm thấy VITE_GEMINI_API_KEY. Hãy kiểm tra cài đặt trên Vercel!");
    }

    // 5. One-shot AI extraction
    let subjects: Subject[] = [];
    if (ai) {
        const aiSubjects = await extractSubjectsWithAI(fullText, ai);
        if (aiSubjects.length > 0) {
            subjects = mapAiSubjectsToSubjects(aiSubjects);
        }
    }

    // 6. Training score (if present)
    const trScoreRegex = /Điểm rèn luyện\s*[=:]\s*(\d+)/i;
    const trMatch = fullText.match(trScoreRegex);
    const trainingScore = trMatch ? parseInt(trMatch[1]) : null;

    const semesters: Semester[] = [];
    if (subjects.length > 0) {
        semesters.push({
            id: 'imported_all',
            name: 'Bảng điểm PDF',
            subjects,
            trainingScore
        });
    }

    return { studentInfo, semesters, yearRanges };
};
