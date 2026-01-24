import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI } from "@google/genai";
import { UserData, Semester, Subject } from '../types';

// Set worker for PDF.js - ensure version matches the main library import
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
}

interface AiSubject {
    ten_hoc_phan: string;
    tin_chi: number;
    ket_qua: string | number;
    hoc_ky_raw: string; // AI trả về tên học kỳ gốc trong văn bản
}

// --- 1. SYSTEM PROMPT (Tối ưu cho One-Shot) ---
const GEMINI_SYSTEM_PROMPT = `
Bạn là chuyên gia OCR xử lý bảng điểm đại học.
Nhiệm vụ: Trích xuất TOÀN BỘ các môn học từ văn bản đầu vào và trả về JSON.

INPUT: Một văn bản thô chứa dữ liệu của nhiều học kỳ.

OUTPUT: Một mảng JSON duy nhất (JSON Array), mỗi phần tử là một môn học với cấu trúc:
[
  {
    "ten_hoc_phan": "Tên môn học (String)",
    "tin_chi": Số tín chỉ (Number),
    "ket_qua": Điểm số hệ 10 hoặc Điểm chữ hoặc "Đạt"/"Không đạt" (String/Number),
    "hoc_ky_raw": "Tên tiêu đề học kỳ mà môn này thuộc về (String)" (Ví dụ: "Học kỳ 1/2023-2024")
  }
]

QUY TẮC QUAN TRỌNG:
1. "hoc_ky_raw": Phải tìm dòng tiêu đề học kỳ gần nhất ở phía trên môn học đó để điền vào. Ví dụ thấy dòng "Học kỳ 1 Năm học 2023-2024" thì gán chuỗi đó cho tất cả các môn phía dưới cho đến khi gặp tiêu đề học kỳ mới.
2. Bỏ qua các dòng tiêu đề bảng (Mã HP, Tên HP...).
3. Bỏ qua các môn bị hủy hoặc không có dữ liệu điểm.
4. Nếu tên môn bị ngắt dòng, hãy nối lại.
5. CHỈ TRẢ VỀ JSON, KHÔNG TRẢ VỀ MARKDOWN HAY LỜI DẪN.
`;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRateLimitError = (error: unknown) => {
    if (!error) return false;
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('429') || message.toLowerCase().includes('rate limit');
};

const parseGeminiResponse = (jsonText?: string) => {
    if (!jsonText) return [];
    try {
        const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("JSON Parse Error:", e);
        return [];
    }
};

// --- 2. HÀM GỌI API (Chỉ gọi 1 lần) ---
const generateContentOneShot = async (
    fullText: string,
    ai: GoogleGenAI,
    maxRetries = 3
): Promise<AiSubject[]> => {
    let attempt = 0;
    while (attempt <= maxRetries) {
        try {
            // Sử dụng model flash để tiết kiệm token và nhanh hơn
            const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const result = await model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: GEMINI_SYSTEM_PROMPT },
                            { text: `\n\n--- DỮ LIỆU BẢNG ĐIỂM TOÀN KHÓA ---\n${fullText}` }
                        ]
                    }
                ],
                generationConfig: {
                    responseMimeType: "application/json"
                }
            });

            const responseText = result.response.text();
            return parseGeminiResponse(responseText) as AiSubject[];

        } catch (error) {
            if (isRateLimitError(error) && attempt < maxRetries) {
                const delayMs = 2000 * Math.pow(2, attempt); // Đợi lâu hơn chút: 2s, 4s, 8s
                console.warn(`Gemini 429. Retry in ${delayMs}ms...`);
                await sleep(delayMs);
                attempt++;
                continue;
            }
            console.error("Gemini Critical Error:", error);
            throw error; // Ném lỗi để UI bắt được
        }
    }
    return [];
};

// --- 3. HÀM MAP DỮ LIỆU ---
const mapAiSubjectToSubject = (s: AiSubject, index: number): Subject => {
    let isNonGPA = false;
    const nameLower = s.ten_hoc_phan.toLowerCase();
    
    // Logic xác định môn không tính GPA
    const nonGpaKeywords = [
        'gdtc', 'giáo dục thể chất', 'quốc phòng', 'an ninh',
        'tiếng anh tăng cường', 'kỹ năng', 'đầu vào', 'học phần', 'sinh hoạt công dân'
    ];

    if (s.tin_chi === 0 || s.ket_qua === 'M' || s.ket_qua === 'Đạt' || nonGpaKeywords.some(k => nameLower.includes(k))) {
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
        id: `sub_${Date.now()}_${index}`,
        name: s.ten_hoc_phan,
        credits: s.tin_chi,
        scoreCC: scoreVal,
        scoreProcess: scoreVal,
        scoreMid: scoreVal,
        scoreFinal: scoreVal,
        isNonGPA: isNonGPA
    };
};

// --- 4. HÀM CHÍNH ---
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    // A. Đọc PDF thành Text
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
    }

    // B. Lấy thông tin sinh viên (Dùng Regex cho nhanh)
    const studentInfo: Partial<UserData> = {};
    const studentNameRegex = /([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i;
    const studentMatch = fullText.match(studentNameRegex);
    if (studentMatch) {
        let rawName = studentMatch[1].replace(/^SV\.\s*/i, '').replace(/^Sinh viên\s*/i, '').trim();
        studentInfo.studentName = rawName;
    }
    const programRegex = /Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:)/i;
    const programMatch = fullText.match(programRegex);
    if (programMatch) studentInfo.majorName = programMatch[1].trim();

    // C. Gọi AI (ONE SHOT)
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Chưa cấu hình API Key");

    const genAI = new GoogleGenAI(apiKey);
    
    // Gửi toàn bộ text 1 lần duy nhất
    const aiData = await generateContentOneShot(fullText, genAI);

    // D. Xử lý dữ liệu trả về và gom nhóm theo học kỳ
    const semestersMap = new Map<string, Semester>();
    const yearRanges: {start: number, end: number}[] = [];

    aiData.forEach((item, idx) => {
        if (!item.hoc_ky_raw) return;

        // Chuẩn hóa tên học kỳ để làm Key (Ví dụ: "Học kỳ 1/2023-2024")
        const rawSem = item.hoc_ky_raw.trim();
        
        // Tạo ID cho học kỳ từ chuỗi raw (để sort sau này)
        // Tìm năm học trong chuỗi (Ví dụ lấy được 2023, 2024)
        const yearMatch = rawSem.match(/(\d{4})[-–](\d{4})/);
        const hkMatch = rawSem.match(/Học kỳ\s*(\d)/i);
        
        let semId = `sem_${idx}`;
        let semName = rawSem;
        let y1 = 0, y2 = 0;

        if (yearMatch && hkMatch) {
            y1 = parseInt(yearMatch[1]);
            y2 = parseInt(yearMatch[2]);
            const hk = parseInt(hkMatch[1]);
            semId = `imported_${y1}_${y2}_hk${hk}`;
            semName = `Năm học ${y1}-${y2} - Học kỳ ${hk}`;
            
            // Lưu range năm học
            if (!yearRanges.some(y => y.start === y1)) {
                yearRanges.push({start: y1, end: y2});
            }
        } else {
            // Fallback nếu AI trả về chuỗi lạ
            semId = `imported_unknown_${idx}`; 
        }

        // Tạo hoặc lấy Semester từ Map
        if (!semestersMap.has(semId)) {
            semestersMap.set(semId, {
                id: semId,
                name: semName,
                subjects: [],
                trainingScore: null // PDF thường khó lấy ĐRL chính xác, để null user tự nhập
            });
        }

        // Map môn học và push vào semester tương ứng
        const subject = mapAiSubjectToSubject(item, idx);
        semestersMap.get(semId)?.subjects.push(subject);
    });

    // Chuyển Map thành Array và sort
    const semesters = Array.from(semestersMap.values()).sort((a, b) => {
        // Sort đơn giản theo ID (vì ID có chứa năm học)
        return a.id.localeCompare(b.id);
    });

    return { studentInfo, semesters, yearRanges };
};
