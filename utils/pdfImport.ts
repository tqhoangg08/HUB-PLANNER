
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

// System instruction for Gemini
const GEMINI_SYSTEM_PROMPT = `
Bạn là một chuyên gia trích xuất dữ liệu từ văn bản và hình ảnh (OCR). Nhiệm vụ của bạn là đọc bảng điểm từ văn bản được cung cấp và trích xuất dữ liệu sạch.

YÊU CẦU VỀ DỮ LIỆU ĐẦU RA:
1. Định dạng: Chỉ trả về duy nhất một mảng JSON (JSON Array). Không thêm markdown (json), không thêm lời dẫn hay giải thích.
2. Cấu trúc mỗi phần tử (Object) trong mảng chỉ bao gồm 3 trường sau:
   - "ten_hoc_phan": (String) Tên đầy đủ của môn học.
   - "tin_chi": (Number) Số tín chỉ.
   - "ket_qua": (String/Number) Điểm tổng kết hoặc kết quả xếp loại (ví dụ: 8.5, "Đạt", "M").

QUY TẮC LỌC VÀ XỬ LÝ LỖI (BẮT BUỘC):
1. BỎ QUA HOÀN TOÀN các cột sau: Mã học phần (như ITC301, ACC705...), các nút chức năng (Chi tiết, Xóa), và các ô checkbox.
2. BỎ QUA DÒNG TIÊU ĐỀ: Không trích xuất các dòng chứa chữ "Mã học phần", "Tên học phần", "Tín chỉ", "Học kỳ".
3. XỬ LÝ DÍNH CHỮ:
   - Nếu tên môn học bị dính với mã học phần (ví dụ: "ACC705 Kế toán tài chính"), hãy tự động cắt bỏ mã, chỉ giữ lại "Kế toán tài chính".
   - Nếu tên môn học bị ngắt xuống dòng, hãy nối chúng lại thành một chuỗi hoàn chỉnh.
4. Các môn bắt đầu bằng chữ "Kỹ năng", "GDTC", "Học phần", "Tiếng anh tăng cường" thường không tính vào GPA nhưng vẫn cần trích xuất chính xác.
`;

const extractSubjectsWithAI = async (text: string, ai: GoogleGenAI): Promise<any[]> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `${GEMINI_SYSTEM_PROMPT}\n\nVĂN BẢN CẦN XỬ LÝ:\n${text}`,
            config: {
                responseMimeType: "application/json"
            }
        });
        
        const jsonText = response.text;
        if (!jsonText) return [];
        
        // Clean up markdown code blocks if present (though prompt says not to)
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
    
    // 1. Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + ' '; 
    }

    fullText = fullText.replace(/\s+/g, ' ');

    // 2. Parse Student Info
    // Pattern: "Trần Quốc Hoàng [Mã số: 030839230074]"
    const studentNameRegex = /([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i;
    const studentMatch = fullText.match(studentNameRegex);
    
    const studentInfo: Partial<UserData> = {};
    if (studentMatch) {
        let rawName = studentMatch[1];
        rawName = rawName.replace(/^SV\.\s*/i, '').replace(/^Sinh viên\s*/i, '').trim();
        studentInfo.studentName = rawName;
    }

    // Pattern: "Chương trình đào tạo: Kinh doanh quốc tế"
    const programRegex = /Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:)/i;
    const programMatch = fullText.match(programRegex);
    if (programMatch) {
        studentInfo.majorName = programMatch[1].trim();
    }

    // 3. Split by Semester Headers
    // Header pattern: "Học kỳ 1/2023-2024"
    const semesters: Semester[] = [];
    const yearRanges: {start: number, end: number}[] = [];
    
    // Find all indices of "Học kỳ X/YYYY-YYYY"
    const semHeaderRegex = /Học kỳ\s+(\d)\s*\/\s*(\d{4})\s*-\s*(\d{4})/gi;
    let match;
    const indices: { index: number, name: string, id: string, semesterNo: number, yearStart: number, yearEnd: number }[] = [];
    
    while ((match = semHeaderRegex.exec(fullText)) !== null) {
        const hk = parseInt(match[1]);
        const y1 = parseInt(match[2]);
        const y2 = parseInt(match[3]);
        
        // Construct a structured ID that we can parse later in App.tsx
        // Format: imported_2023_2024_hk1
        const id = `imported_${y1}_${y2}_hk${hk}`;
        const name = `Năm học ${y1}-${y2} - Học kỳ ${hk}`;
        
        indices.push({ 
            index: match.index, 
            name, 
            id, 
            semesterNo: hk,
            yearStart: y1,
            yearEnd: y2
        });

        if (!yearRanges.some(y => y.start === y1)) {
            yearRanges.push({start: y1, end: y2});
        }
    }

    // Initialize AI (if API key exists)
let ai: GoogleGenAI | null = null;
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (apiKey) {
    ai = new GoogleGenAI({ apiKey: apiKey });
} else {
    console.error("LỖI: Chưa tìm thấy VITE_GEMINI_API_KEY. Hãy kiểm tra cài đặt trên Vercel!");
}

    // Process each block
    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        const end = next ? next.index : fullText.length;
        const blockContent = fullText.substring(current.index, end);

        let subjects: Subject[] = [];
        let trainingScore: number | null = null;

        // --- STRATEGY: Try AI first, Fallback to Regex ---
        let aiSuccess = false;

        if (ai) {
            try {
                const aiSubjects = await extractSubjectsWithAI(blockContent, ai);
                if (aiSubjects && aiSubjects.length > 0) {
                    subjects = aiSubjects.map((s: any, idx: number) => {
                        // Check non-GPA based on rules
                        let isNonGPA = false;
                        const nameLower = s.ten_hoc_phan.toLowerCase();
                        const nonGpaKeywords = [
                            'gdtc', 'giáo dục thể chất',
                            'quốc phòng', 'an ninh',
                            'tiếng anh tăng cường',
                            'kỹ năng',
                            'đầu vào','học phần'
                        ];

                        if (s.tin_chi === 0 || s.ket_qua === 'M' || nonGpaKeywords.some(k => nameLower.includes(k))) {
                            isNonGPA = true;
                        }
                        
                        // Parse score
                        let scoreVal: number | null = null;
                        if (typeof s.ket_qua === 'number') {
                            scoreVal = s.ket_qua;
                        } else if (typeof s.ket_qua === 'string') {
                            const parsed = parseFloat(s.ket_qua);
                            if (!isNaN(parsed)) scoreVal = parsed;
                        }

                        return {
                            id: `ai_${current.id}_${idx}`,
                            name: s.ten_hoc_phan,
                            credits: s.tin_chi,
                            scoreCC: scoreVal,
                            scoreProcess: scoreVal, // AI gives summary, we assume components match for now
                            scoreMid: scoreVal,
                            scoreFinal: scoreVal,
                            isNonGPA: isNonGPA
                        };
                    });
                    aiSuccess = true;
                }
            } catch (err) {
                console.warn("AI parsing failed for block, falling back to regex", err);
            }
        }

        // Fallback: Regex Parsing (if AI missing or failed)
        if (!aiSuccess) {
            const subjectRegex = /(\d+)\s+([A-Z0-9_]+)\s+(.+?)\s+(\d+)\s+(Bắt Buộc|Tự Chọn)\s+([0-9.]+|M)/gi;
            let subMatch;
            while ((subMatch = subjectRegex.exec(blockContent)) !== null) {
                const code = subMatch[2];
                let name = subMatch[3].trim();
                const credits = parseInt(subMatch[4]);
                const rawScore = subMatch[6];
                
                let scoreVal: number | null = null;
                let isNonGPA = false;

                if (rawScore.toUpperCase() === 'M') {
                    isNonGPA = true;
                    scoreVal = null;
                } else {
                    scoreVal = parseFloat(rawScore);
                    if (isNaN(scoreVal)) scoreVal = null;
                }

                if (credits === 0) isNonGPA = true;

                const nonGpaKeywords = [
                    'GDTC', 'Giáo dục thể chất',
                    'Quốc phòng', 'An ninh',
                    'Tiếng Anh tăng cường',
                    'Kỹ năng',
                    'đầu vào','học phần'
                ];

                if (nonGpaKeywords.some(kw => name.toLowerCase().includes(kw.toLowerCase()))) {
                    isNonGPA = true;
                }

                subjects.push({
                    id: code + '_' + i + '_' + subjects.length,
                    name: name,
                    credits: credits,
                    scoreCC: scoreVal,
                    scoreProcess: scoreVal,
                    scoreMid: scoreVal,
                    scoreFinal: scoreVal,
                    isNonGPA: isNonGPA
                });
            }
        }

        // Parse Training Score (Regex is usually fine for this simple field)
        const trScoreRegex = /Điểm rèn luyện\s*[=:]\s*(\d+)/i;
        const trMatch = blockContent.match(trScoreRegex);
        if (trMatch) {
            trainingScore = parseInt(trMatch[1]);
        }

        if (subjects.length > 0) {
            semesters.push({
                id: current.id,
                name: current.name,
                subjects,
                trainingScore
            });
        }
    }

    return { studentInfo, semesters, yearRanges };
};
