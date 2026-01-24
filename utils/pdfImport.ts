import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI } from "@google/genai";
import { UserData, Semester, Subject } from '../types';

// Set worker
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
    hoc_ky_raw: string;
}

// --- 1. CONFIG & HELPERS ---
const SYSTEM_PROMPT = `Trích xuất bảng điểm thành JSON Array. Mỗi item: { "ten_hoc_phan": string, "tin_chi": number, "ket_qua": number|string, "hoc_ky_raw": string }. hoc_ky_raw lấy từ tiêu đề gần nhất bên trên (VD: "Học kỳ 1 Năm học 2023-2024"). Bỏ qua tiêu đề bảng. Chỉ trả về JSON.`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// --- 2. HÀM REGEX PARSING (CỨU TINH KHI AI SẬP) ---
// Hàm này chạy thuần túy bằng logic chuỗi, không sợ giới hạn API
const parseWithRegexFallback = (fullText: string): Semester[] => {
    console.log("⚠️ Đang chạy chế độ Regex Fallback (Do AI quá tải)...");
    
    const semestersMap = new Map<string, Semester>();
    
    // 1. Tách văn bản thành từng phần dựa trên tiêu đề học kỳ
    // Regex tìm: "Học kỳ 1/2023-2024" hoặc "Học kỳ 1 Năm học 2023-2024"
    const splitRegex = /(Học kỳ\s+\d\s*[\/\-]?\s*(?:Năm học\s*)?\d{4}\s*[\-–]\s*\d{4})/gi;
    
    const parts = fullText.split(splitRegex);
    let currentSemesterName = "";
    
    // Mảng chứa các keyword môn không tính điểm
    const nonGpaKeywords = ['gdtc', 'giáo dục thể chất', 'quốc phòng', 'an ninh', 'tiếng anh tăng cường', 'kỹ năng', 'đầu vào', 'sinh hoạt'];

    // Duyệt qua từng phần text đã cắt
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;

        // Nếu part là tên học kỳ (do regex group giữ lại)
        if (part.match(/^Học kỳ/i)) {
            currentSemesterName = part;
            continue;
        }

        // Nếu part là nội dung môn học và đã có tên học kỳ
        if (currentSemesterName) {
            // Tạo ID cho học kỳ
            const yearMatch = currentSemesterName.match(/(\d{4})[-–](\d{4})/);
            const hkMatch = currentSemesterName.match(/Học kỳ\s*(\d)/i);
            
            let semId = `sem_${Math.random().toString(36).substr(2, 9)}`;
            if (yearMatch && hkMatch) {
                semId = `imported_${yearMatch[1]}_${yearMatch[2]}_hk${hkMatch[1]}`;
            }

            if (!semestersMap.has(semId)) {
                semestersMap.set(semId, {
                    id: semId,
                    name: currentSemesterName,
                    subjects: [],
                    trainingScore: null
                });
            }

            // Parse từng dòng môn học
            // Regex tìm dòng: STT MãHP TênHP TC ... Điểm
            // VD: 1 00123 Kinh tế vi mô 3 ... 8.5
            const lines = part.split('\n');
            const rowRegex = /^\s*\d+\s+[A-Z0-9_]+\s+(.+?)\s+(\d+)\s+.*?\s([0-9.]+|M|Đạt|Không đạt)\s*$/i;

            lines.forEach((line, idx) => {
                const match = line.trim().match(rowRegex);
                if (match) {
                    const name = match[1].trim();
                    const credits = parseInt(match[2]);
                    const rawScore = match[3];
                    
                    // Logic tính điểm
                    let scoreVal: number | null = null;
                    let isNonGPA = false;

                    if (rawScore === 'M' || rawScore === 'Đạt' || rawScore === 'Không đạt') {
                        isNonGPA = true;
                    } else {
                        scoreVal = parseFloat(rawScore);
                        if (isNaN(scoreVal)) scoreVal = null;
                    }

                    if (credits === 0 || nonGpaKeywords.some(k => name.toLowerCase().includes(k))) {
                        isNonGPA = true;
                    }

                    semestersMap.get(semId)?.subjects.push({
                        id: `reg_${semId}_${idx}`,
                        name: name,
                        credits: credits,
                        scoreCC: scoreVal,
                        scoreProcess: scoreVal,
                        scoreMid: scoreVal,
                        scoreFinal: scoreVal,
                        isNonGPA: isNonGPA
                    });
                }
            });
        }
    }

    return Array.from(semestersMap.values()).sort((a, b) => a.id.localeCompare(b.id));
};

// --- 3. HÀM GỌI AI ---
const generateContentOneShot = async (fullText: string, apiKey: string): Promise<AiSubject[]> => {
    const ai = new GoogleGenAI(apiKey);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT }, { text: `\nDATA:\n${fullText}` }] }],
        generationConfig: { responseMimeType: "application/json" }
    });
    
    const text = result.response.text();
    return JSON.parse(text.replace(/```json|```/g, '').trim());
};

// --- 4. HÀM CHÍNH (PARSE PDF) ---
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    // A. Đọc PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    // Đọc text giữ nguyên xuống dòng để Regex hoạt động tốt
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' '); // Dùng join(' ') để tránh dính chữ
        // Thêm xuống dòng giả lập sau mỗi item có vẻ là cuối dòng (Optional optimization)
        fullText += pageText + '\n'; 
    }
    
    // B. Lấy Info Sinh Viên
    const studentInfo: Partial<UserData> = {};
    const nameMatch = fullText.match(/([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i);
    if (nameMatch) studentInfo.studentName = nameMatch[1].replace(/^(SV\.|Sinh viên)\s*/i, '').trim();
    
    const progMatch = fullText.match(/Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:)/i);
    if (progMatch) studentInfo.majorName = progMatch[1].trim();

    // C. Xử lý Môn học (HYBRID MODE)
    let semesters: Semester[] = [];
    
    try {
        // CÁCH 1: Dùng AI (Ưu tiên)
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error("No API Key");

        console.log("🚀 Đang thử dùng AI...");
        const aiData = await generateContentOneShot(fullText, apiKey);
        
        // Map dữ liệu AI ra Semester (Code cũ của bạn)
        const semMap = new Map<string, Semester>();
        aiData.forEach((item, idx) => {
            if (!item.hoc_ky_raw) return;
            const yearMatch = item.hoc_ky_raw.match(/(\d{4})[-–](\d{4})/);
            const hkMatch = item.hoc_ky_raw.match(/Học kỳ\s*(\d)/i);
            
            let semId = `sem_${idx}`, semName = item.hoc_ky_raw;
            if (yearMatch && hkMatch) {
                semId = `imported_${yearMatch[1]}_${yearMatch[2]}_hk${hkMatch[1]}`;
                semName = `Năm học ${yearMatch[1]}-${yearMatch[2]} - Học kỳ ${hkMatch[1]}`;
            }

            if (!semMap.has(semId)) {
                semMap.set(semId, { id: semId, name: semName, subjects: [], trainingScore: null });
            }

            // Logic môn học AI
            let isNonGPA = false;
            if (item.tin_chi === 0 || item.ket_qua === 'M' || item.ket_qua === 'Đạt') isNonGPA = true;
            let scoreVal = (typeof item.ket_qua === 'number') ? item.ket_qua : parseFloat(item.ket_qua as string);
            if (isNaN(scoreVal)) scoreVal = null;

            semMap.get(semId)?.subjects.push({
                id: `ai_${idx}`,
                name: item.ten_hoc_phan,
                credits: item.tin_chi,
                scoreFinal: scoreVal,
                scoreCC: scoreVal, scoreProcess: scoreVal, scoreMid: scoreVal,
                isNonGPA
            });
        });
        semesters = Array.from(semMap.values());
        
    } catch (error) {
        // CÁCH 2: Dùng REGEX (Nếu AI lỗi 429 hoặc lỗi khác)
        console.warn("⚠️ AI thất bại, chuyển sang Regex:", error);
        semesters = parseWithRegexFallback(fullText);
        
        if (semesters.length === 0) {
             alert("Hệ thống đang quá tải. Vui lòng thử lại sau ít phút!");
             throw error;
        }
    }

    // Sort lại học kỳ
    semesters.sort((a, b) => a.id.localeCompare(b.id));

    // Lấy range năm học
    const yearRanges: {start: number, end: number}[] = [];
    semesters.forEach(s => {
        const match = s.id.match(/imported_(\d{4})_(\d{4})/);
        if (match) {
             const start = parseInt(match[1]);
             if (!yearRanges.some(y => y.start === start)) yearRanges.push({start, end: parseInt(match[2])});
        }
    });

    return { studentInfo, semesters, yearRanges };
};
