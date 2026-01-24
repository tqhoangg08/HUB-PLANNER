import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { UserData, Semester, Subject } from '../types';

// Set worker for PDF.js
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
const extractCleanTextFromPage = async (page: pdfjsLib.PDFPageProxy) => {
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    const positionedItems: PositionedTextItem[] = items.map(item => ({
        str: item.str as string,
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0
    }));

    positionedItems.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 0.5) return yDiff;
        return a.x - b.x;
    });

    const lines: string[] = [];
    let currentLine = '';
    let currentY: number | null = null;

    for (const item of positionedItems) {
        if (currentY === null) currentY = item.y;

        if (Math.abs(item.y - currentY) > 2) {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = item.str;
            currentY = item.y;
        } else {
            currentLine += `${currentLine ? ' ' : ''}${item.str}`;
        }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    return lines.join('\n');
};

// --- HÀM 2: XỬ LÝ CHÍNH ---
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let allLines: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const pageText = await extractCleanTextFromPage(page);
        const lines = pageText.split('\n');
        allLines = [...allLines, ...lines];
    }

    // 2. Setup variables
    const studentInfo: Partial<UserData> = {};
    const semestersMap = new Map<string, Semester>();
    
    // FIX LỖI Ở ĐÂY: Khởi tạo luôn giá trị rỗng = []
    const yearRanges: { start: number; end: number }[] = []; 

    let currentSemId = "";
    let currentSemName = "";

    const semHeaderRegex = /Học kỳ\s+(\d)\s*(?:\/|Năm học)?\s*(\d{4})[-–](\d{4})/i;
    const rowRegex = /^\d+\s+[A-Z0-9_.]+\s+(.+?)\s+(\d+)\s+.*?\s([0-9.]+|M|Đạt|Không đạt|Vắng)\s*(?:[A-Z+-]+)?\s*(?:Đạt|Không đạt)?$/i;
    const nonGpaKeywords = ['gdtc', 'giáo dục thể chất', 'quốc phòng', 'an ninh', 'tiếng anh tăng cường', 'kỹ năng', 'đầu vào', 'sinh hoạt', 'học phần'];

    for (const line of allLines) {
        const trimmedLine = line.trim().replace(/\s+/g, ' ');

        if (!studentInfo.studentName) {
            const nameMatch = trimmedLine.match(/([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i);
            if (nameMatch) studentInfo.studentName = nameMatch[1].replace(/^(SV\.|Sinh viên)\s*/i, '').trim();
        }
        if (!studentInfo.majorName) {
            const majorMatch = trimmedLine.match(/Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:|$)/i);
            if (majorMatch) studentInfo.majorName = majorMatch[1].trim();
        }

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
            continue;
        }

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
                    scoreCC: scoreVal, scoreProcess: scoreVal,
