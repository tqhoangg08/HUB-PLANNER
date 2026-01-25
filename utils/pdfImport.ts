import * as pdfjsLib from 'pdfjs-dist';
// ĐÃ XÓA: import { GoogleGenAI } from "@google/genai"; -> Không dùng SDK ở client để bảo mật
import { UserData, Semester, Subject } from '../types';

// Set worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
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

// --- HÀM MỚI: Gọi về API Serverless (api/chat.js) ---
const extractSubjectsWithAI = async (text: string): Promise<any[]> => {
    try {
        const fullMessage = `${GEMINI_SYSTEM_PROMPT}\n\nVĂN BẢN CẦN XỬ LÝ:\n${text}`;

        // Gọi API của chính bạn thay vì gọi Google trực tiếp
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: fullMessage })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const jsonText = data.reply; // Lấy kết quả từ server trả về
        
        if (!jsonText) return [];
        
        // Clean up markdown code blocks if present
        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (error) {
        console.error("Gemini Extraction Error via API:", error);
        return [];
    }
};

export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    let fullTextWithLines = '';
    
    // 1. Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        let pageText = '';
        for (const item of textContent.items as any[]) {
            pageText += item.str;
            if (item.hasEOL) {
                pageText += '\n';
            } else {
                pageText += ' ';
            }
        }
        fullTextWithLines += pageText + '\n';
        fullText += pageText + ' ';
    }

    fullText = fullText.replace(/\s+/g, ' ');
    const textForRegex = fullTextWithLines;

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

    // 3. Split by Semester Headers
    const semesters: Semester[] = [];
    const yearRanges: {start: number, end: number}[] = [];
    const skipKeywords = [
        'Mã học phần', 'Tên học phần', 'STT', 'Học kỳ',
        'Trung bình chung', 'Điểm rèn luyện', 'STC Đậu'
    ];
    
    const semHeaderRegex = /Học kỳ\s+(\d)\s*\/\s*(\d{4})\s*-\s*(\d{4})/gi;
    let match;
    const indices: { index: number, name: string, id: string, semesterNo: number, yearStart: number, yearEnd: number }[] = [];
    
    while ((match = semHeaderRegex.exec(textForRegex)) !== null) {
        const hk = parseInt(match[1]);
        const y1 = parseInt(match[2]);
        const y2 = parseInt(match[3]);
        
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

    // Process each block
    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        const end = next ? next.index : textForRegex.length;
        const blockContent = textForRegex.substring(current.index, end);

        let subjects: Subject[] = [];
        let trainingScore: number | null = null;

        // --- STRATEGY: Try AI (via API) first, Fallback to Regex ---
        let aiSuccess = false;

        // Luôn thử gọi AI trước (qua serverless API)
        try {
            const aiSubjects = await extractSubjectsWithAI(blockContent);
            
            if (aiSubjects && aiSubjects.length > 0) {
                subjects = aiSubjects.map((s: any, idx: number) => {
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
                        scoreProcess: scoreVal,
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

        // Fallback: Regex Parsing (if AI failed or returned empty)
        if (!aiSuccess) {
            const lines = blockContent.split(/\r?\n/);
            const rowRegex = /^\s*(\d+)\s+([A-Z0-9_]+)\s+(.+?)\s+(\d+)\s+.*?\s([0-9.]+|M)\s*$/;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (skipKeywords.some(keyword => trimmed.includes(keyword))) continue;
                if (!/^\d+/.test(trimmed)) continue;

                // console.log('Raw Line:', trimmed);
                const match = trimmed.match(rowRegex);
                if (!match) continue;

                const code = match[2];
                let name = match[3].trim();
                const credits = parseInt(match[4], 10);
                const rawScore = match[5];

                if (!name || Number.isNaN(credits)) continue;

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

        // Parse Training Score
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
