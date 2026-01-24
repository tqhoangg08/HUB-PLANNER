import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { UserData, Semester, Subject } from '../types';

// Set worker for PDF.js - ensure version matches the main library import
// Tự động lấy đúng phiên bản worker khớp với thư viện
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: { start: number; end: number }[];
}

interface PositionedTextItem {
    str: string;
    x: number;
    y: number;
}

// --- HÀM 1: TÁI TẠO DÒNG (CORE LOGIC) ---
// Hàm này giúp text không bị dính chùm bằng cách kiểm tra tọa độ
const extractCleanTextFromPage = async (page: pdfjsLib.PDFPageProxy) => {
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    // Chuyển đổi sang dạng có tọa độ để xử lý
    const positionedItems: PositionedTextItem[] = items.map(item => ({
        str: item.str as string,
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0
    }));

    // Sắp xếp: Ưu tiên dòng (Y) rồi đến cột (X)
    positionedItems.sort((a, b) => {
        const yDiff = b.y - a.y; // Y trong PDF thường tính từ dưới lên
        if (Math.abs(yDiff) > 0.5) { // Nếu lệch nhau > 0.5 đơn vị -> Khác dòng
            return yDiff;
        }
        return a.x - b.x; // Cùng dòng -> Sắp xếp trái sang phải
    });

    const lines: string[] = [];
    let currentLine = '';
    let currentY: number | null = null;

    for (const item of positionedItems) {
        if (currentY === null) {
            currentY = item.y;
        }

        // Nếu lệch dòng quá 2 đơn vị -> Coi là xuống dòng
        if (Math.abs(item.y - currentY) > 2) {
            if (currentLine.trim()) {
                lines.push(currentLine.trim());
            }
            currentLine = item.str;
            currentY = item.y;
        } else {
            // Cùng dòng -> Nối thêm dấu cách để tách cột (Tránh dính chữ)
            currentLine += `${currentLine ? ' ' : ''}${item.str}`;
        }
    }

    if (currentLine.trim()) {
        lines.push(currentLine.trim());
    }

    return lines.join('\n');
};

// --- HÀM 2: XỬ LÝ CHÍNH (LOGIC MAP - KHÔNG TRÙNG BIẾN) ---
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let allLines: string[] = [];

    // 1. Đọc tất cả các trang và gom thành danh sách dòng
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const pageText = await extractCleanTextFromPage(page);
        const lines = pageText.split('\n');
        allLines = [...allLines, ...lines];
    }

    // 2. Khởi tạo biến (CHỈ KHAI BÁO 1 LẦN DUY NHẤT TẠI ĐÂY)
    const studentInfo: Partial<UserData> = {};
    const semestersMap = new Map<string, Semester>(); // Dùng Map để gom nhóm môn học
    const yearRanges: { start: number; end: number }[] = [];

    let currentSemId = "";
    let currentSemName = "";

    // Regex Definitions
    const semHeaderRegex = /Học kỳ\s+(\d)\s*(?:\/|Năm học)?\s*(\d{4})[-–](\d{4})/i;
    // Regex dòng môn học: STT Mã Tên TC ... Điểm
    const rowRegex = /^\d+\s+[A-Z0-9_.]+\s+(.+?)\s+(\d+)\s+.*?\s([0-9.]+|M|Đạt|Không đạt|Vắng)\s*(?:[A-Z+-]+)?\s*(?:Đạt|Không đạt)?$/i;
    
    const nonGpaKeywords = ['gdtc', 'giáo dục thể chất', 'quốc phòng', 'an ninh', 'tiếng anh tăng cường', 'kỹ năng', 'đầu vào', 'sinh hoạt', 'học phần'];

    // 3. Quét qua từng dòng (Linear Scan)
    for (const line of allLines) {
        const trimmedLine = line.trim().replace(/\s+/g, ' ');

        // A. Tìm thông tin sinh viên
        if (!studentInfo.studentName) {
            const nameMatch = trimmedLine.match(/([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i);
            if (nameMatch) studentInfo.studentName = nameMatch[1].replace(/^(SV\.|Sinh viên)\s*/i, '').trim();
        }
        if (!studentInfo.majorName) {
            const majorMatch = trimmedLine.match(/Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:|$)/i);
            if (majorMatch) studentInfo.majorName = majorMatch[1].trim();
        }

        // B. Phát hiện tiêu đề Học Kỳ
        const semMatch = trimmedLine.match(semHeaderRegex);
        if (semMatch) {
            const hk = parseInt(semMatch[1]);
            const y1 = parseInt(semMatch[2]);
            const y2 = parseInt(semMatch[3]);

            currentSemId = `imported_${y1}_${y2}_hk${hk}`;
            currentSemName = `Năm học ${y1}-${y2} - Học kỳ ${hk}`;

            if (!yearRanges.some(y => y.start === y1)) {
                yearRanges.push({ start: y1, end: y2 });
            }

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

        // C. Phát hiện dòng Môn Học (khi đang ở trong 1 học kỳ)
        if (currentSemId) {
            const subjectMatch = trimmedLine.match(rowRegex);
            if (subjectMatch) {
                const nameRaw = subjectMatch[1].trim();
                const credits = parseInt(subjectMatch[2]);
                const rawScore = subjectMatch[3];

                let scoreVal: number | null = null;
                let isNonGPA = false;

                if (['M', 'Đạt', 'Không đạt', 'Vắng'].includes(rawScore)) {
                    isNonGPA = true;
                } else {
                    scoreVal = parseFloat(rawScore);
                    if (isNaN(scoreVal)) scoreVal = null;
                }

                if (credits === 0 || nonGpaKeywords.some(k => nameRaw.toLowerCase().includes(k))) {
                    isNonGPA = true;
                }

                semestersMap.get(currentSemId)?.subjects.push({
                    id: `sub_${currentSemId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: nameRaw,
                    credits: credits,
                    scoreCC: scoreVal, scoreProcess: scoreVal, scoreMid: scoreVal, scoreFinal: scoreVal,
                    isNonGPA: isNonGPA
                });
            }
        }
    }

    // 4. Chuyển đổi Map thành Array (Đây là lần khai báo biến 'semesters' DUY NHẤT)
    const semesters = Array.from(semestersMap.values()).sort((a, b) => a.id.localeCompare(b.id));

    return { studentInfo, semesters, yearRanges };
};
