import * as pdfjsLib from 'pdfjs-dist';
import { UserData, Semester, Subject } from '../types';

// Cấu hình Worker (Bắt buộc)
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min?url'; 
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
}

// --- 1. HÀM TÁI TẠO DÒNG (CORE LOGIC) ---
// Hàm này giúp text không bị dính chùm bằng cách kiểm tra tọa độ
const extractCleanTextFromPage = async (page: any): Promise<string[]> => {
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    if (items.length === 0) return [];

    // Bước 1: Sắp xếp các item text theo thứ tự đọc tự nhiên
    // Ưu tiên Y (từ trên xuống), sau đó đến X (từ trái sang)
    // Lưu ý: Trong PDF, Y gốc (0) thường ở dưới cùng, nên Y lớn là ở trên.
    items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5]; // So sánh độ cao
        if (Math.abs(yDiff) > 5) { // Nếu lệch nhau quá 5 đơn vị thì coi là khác dòng
            return yDiff; 
        }
        return a.transform[4] - b.transform[4]; // Nếu cùng dòng thì so sánh trái-phải
    });

    // Bước 2: Gom nhóm thành từng dòng văn bản
    const lines: string[] = [];
    let currentLineY = -1;
    let currentLineText = "";

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemY = item.transform[5]; // Tọa độ Y
        const itemText = item.str;

        // Nếu đây là item đầu tiên hoặc Y lệch nhiều so với dòng hiện tại -> Dòng mới
        if (currentLineY === -1 || Math.abs(itemY - currentLineY) > 5) {
            if (currentLineText) lines.push(currentLineText.trim());
            currentLineY = itemY;
            currentLineText = itemText;
        } else {
            // Cùng dòng -> Nối thêm vào (Thêm dấu cách để tách cột)
            // Mẹo: Luôn thêm dấu cách giữa các block text để tránh dính chữ (VD: MãHP TênHP)
            currentLineText += " " + itemText;
        }
    }
    // Đẩy dòng cuối cùng
    if (currentLineText) lines.push(currentLineText.trim());

    return lines;
};

// --- 2. HÀM PARSE CHÍNH ---
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let allLines: string[] = [];

    // Đọc từng trang và tái tạo dòng sạch sẽ
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const pageLines = await extractCleanTextFromPage(page);
        allLines = [...allLines, ...pageLines];
    }

    const studentInfo: Partial<UserData> = {};
    const semestersMap = new Map<string, Semester>();
    const yearRanges: {start: number, end: number}[] = [];

    // Biến để theo dõi ngữ cảnh hiện tại (Đang ở học kỳ nào)
    let currentSemId = "";
    let currentSemName = "";

    // Regex nhận diện tiêu đề học kỳ
    // VD: "Học kỳ 1 Năm học 2023-2024" hoặc "Học kỳ 2/2023-2024"
    const semHeaderRegex = /Học kỳ\s+(\d)\s*(?:\/|Năm học)?\s*(\d{4})[-–](\d{4})/i;

    // Regex nhận diện dòng môn học (Quan trọng nhất)
    // Cấu trúc mong đợi: [STT] [Mã] [Tên Môn] [TC] ... [Điểm]
    // VD: 1 002345 Kinh tế vi mô 3 ... 8.5
    // Giải thích Regex:
    // ^\d+ : Bắt đầu bằng số (STT)
    // \s+ : Dấu cách
    // [A-Z0-9_]+ : Mã môn (Chữ hoa + số)
    // \s+ : Dấu cách
    // (.+?) : Tên môn (Lấy tham lam tối thiểu)
    // \s+ : Dấu cách trước số tín chỉ
    // (\d+) : Số tín chỉ
    // \s+ : Dấu cách
    // .*? : Các cột ở giữa (Điểm quá trình, thi...) - bỏ qua
    // \s : Dấu cách trước điểm tổng kết
    // ([0-9.]+|M|Đạt|Không đạt|Vắng) : Điểm tổng kết hoặc trạng thái
    // \s*$ : Kết thúc dòng
    const rowRegex = /^\d+\s+[A-Z0-9_.]+\s+(.+?)\s+(\d+)\s+.*?\s([0-9.]+|M|Đạt|Không đạt|Vắng)\s*(?:[A-Z+-]+)?\s*(?:Đạt|Không đạt)?$/i;

    // Keyword môn không tính GPA
    const nonGpaKeywords = ['gdtc', 'giáo dục thể chất', 'quốc phòng', 'an ninh', 'tiếng anh tăng cường', 'kỹ năng', 'đầu vào', 'sinh hoạt', 'học phần'];

    // --- BẮT ĐẦU DUYỆT TỪNG DÒNG ---
    for (const line of allLines) {
        const trimmedLine = line.trim().replace(/\s+/g, ' '); // Chuẩn hóa dấu cách thừa

        // 1. Tìm thông tin sinh viên (nếu chưa có)
        if (!studentInfo.studentName) {
            const nameMatch = trimmedLine.match(/([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i);
            if (nameMatch) studentInfo.studentName = nameMatch[1].replace(/^(SV\.|Sinh viên)\s*/i, '').trim();
        }
        if (!studentInfo.majorName) {
            const majorMatch = trimmedLine.match(/Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:|$)/i);
            if (majorMatch) studentInfo.majorName = majorMatch[1].trim();
        }

        // 2. Kiểm tra xem dòng này có phải là tiêu đề Học kỳ mới không?
        const semMatch = trimmedLine.match(semHeaderRegex);
        if (semMatch) {
            const hk = parseInt(semMatch[1]);
            const y1 = parseInt(semMatch[2]);
            const y2 = parseInt(semMatch[3]);

            currentSemId = `imported_${y1}_${y2}_hk${hk}`;
            currentSemName = `Năm học ${y1}-${y2} - Học kỳ ${hk}`;

            // Lưu range năm học
            if (!yearRanges.some(y => y.start === y1)) {
                yearRanges.push({start: y1, end: y2});
            }

            // Tạo học kỳ mới trong Map nếu chưa có
            if (!semestersMap.has(currentSemId)) {
                semestersMap.set(currentSemId, {
                    id: currentSemId,
                    name: currentSemName,
                    subjects: [],
                    trainingScore: null
                });
            }
            continue; // Xong dòng này, sang dòng tiếp
        }

        // 3. Nếu đang ở trong một học kỳ, thử parse dòng môn học
        if (currentSemId) {
            const subjectMatch = trimmedLine.match(rowRegex);
            if (subjectMatch) {
                // Đã bắt được dòng môn học!
                const nameRaw = subjectMatch[1].trim();
                const credits = parseInt(subjectMatch[2]);
                const rawScore = subjectMatch[3];

                // Logic xử lý điểm số
                let scoreVal: number | null = null;
                let isNonGPA = false;

                if (['M', 'Đạt', 'Không đạt', 'Vắng'].includes(rawScore)) {
                    isNonGPA = true;
                } else {
                    scoreVal = parseFloat(rawScore);
                    if (isNaN(scoreVal)) scoreVal = null;
                }

                // Logic môn kỹ năng/GDTC
                if (credits === 0 || nonGpaKeywords.some(k => nameRaw.toLowerCase().includes(k))) {
                    isNonGPA = true;
                }

                // Thêm vào học kỳ hiện tại
                semestersMap.get(currentSemId)?.subjects.push({
                    id: `sub_${currentSemId}_${Date.now()}_${Math.random()}`,
                    name: nameRaw,
                    credits: credits,
                    scoreCC: scoreVal,
                    scoreProcess: scoreVal,
                    scoreMid: scoreVal,
                    scoreFinal: scoreVal,
                    isNonGPA: isNonGPA
                });
            }
        }
    }

    // Chuyển Map thành Array và sắp xếp theo thời gian
    const semesters = Array.from(semestersMap.values()).sort((a, b) => a.id.localeCompare(b.id));

    return { studentInfo, semesters, yearRanges };
};
