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
    yearRanges: { start: number; end: number }[]; // Keep track of found years
}

interface PositionedTextItem {
    str: string;
    x: number;
    y: number;
}

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
        if (Math.abs(yDiff) > 0.5) {
            return yDiff;
        }
        return a.x - b.x;
    });

    const lines: string[] = [];
    let currentLine = '';
    let currentY: number | null = null;

    for (const item of positionedItems) {
        if (currentY === null) {
            currentY = item.y;
        }

        if (Math.abs(item.y - currentY) > 2) {
            if (currentLine.trim()) {
                lines.push(currentLine.trim());
            }
            currentLine = item.str;
            currentY = item.y;
        } else {
            currentLine += `${currentLine ? ' ' : ''}${item.str}`;
        }
    }

    if (currentLine.trim()) {
        lines.push(currentLine.trim());
    }

    return lines.join('\n');
};

// --- 2. HÀM PARSE CHÍNH ---
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    let fullTextWithLines = '';

    // 1. Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const pageText = await extractCleanTextFromPage(page);

        fullTextWithLines += `${pageText}\n`;
        fullText += `${pageText} `;
    }

    fullText = fullText.replace(/\s+/g, ' ');
    const textForRegex = fullTextWithLines;

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
    const yearRanges: { start: number; end: number }[] = [];
    const skipKeywords = [
        'Mã học phần',
        'Tên học phần',
        'STT',
        'Học kỳ',
        'Trung bình chung',
        'Điểm rèn luyện',
        'STC Đậu'
    ];

    // Find all indices of "Học kỳ X/YYYY-YYYY"
    const semHeaderRegex = /Học kỳ\s+(\d)\s*\/\s*(\d{4})\s*-\s*(\d{4})/gi;
    let match;
    const indices: { index: number; name: string; id: string; semesterNo: number; yearStart: number; yearEnd: number }[] = [];

    while ((match = semHeaderRegex.exec(textForRegex)) !== null) {
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
            yearRanges.push({ start: y1, end: y2 });
        }
    }

    // Process each block
    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        const end = next ? next.index : textForRegex.length;
        const blockContent = textForRegex.substring(current.index, end);

        const subjects: Subject[] = [];
        let trainingScore: number | null = null;

        const lines = blockContent.split(/\r?\n/);
        const rowRegex = /^\s*(\d+)\s+([A-Z0-9_]+)\s+(.+?)\s+(\d+)\s+.*?\s([0-9.]+|M)\s*$/;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (skipKeywords.some(keyword => trimmed.includes(keyword))) {
                continue;
            }
            if (!/^\d+/.test(trimmed)) {
                continue;
            }

            const match = trimmed.match(rowRegex);
            if (!match) continue;

            const code = match[2];
            const name = match[3].trim();
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
                'đầu vào', 'học phần'
            ];

            if (nonGpaKeywords.some(kw => name.toLowerCase().includes(kw.toLowerCase()))) {
                isNonGPA = true;
            }

            subjects.push({
                id: `${code}_${i}_${subjects.length}`,
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

    // Chuyển Map thành Array và sắp xếp theo thời gian
    const semesters = Array.from(semestersMap.values()).sort((a, b) => a.id.localeCompare(b.id));

    return { studentInfo, semesters, yearRanges };
};
