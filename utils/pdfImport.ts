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
        const lines = pageText
