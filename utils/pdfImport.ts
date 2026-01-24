import * as pdfjsLib from 'pdfjs-dist';
import { UserData, Semester, Subject } from '../types';

// --- CẤU HÌNH WORKER (FIX LỖI BẢO MẬT & CSP) ---
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// ------------------------------------------------

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[];
}

// --- HÀM 1: TÁI TẠO DÒNG VĂN BẢN (CHỐNG DÍNH CHỮ) ---
const extractCleanTextFromPage = async (page: any): Promise<string[]> => {
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    if (items.length === 0) return [];

    // Sắp xếp item: Ưu tiên dòng (Y) rồi đến cột (X)
    items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 5) return yDiff; // Khác dòng
        return a.transform[4] - b.transform[4]; // Cùng dòng
    });

    const lines: string[] = [];
    let currentLineY = -1;
    let currentLineText = "";

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemY = item.transform[5];
        const itemText = item.str;

        // Nếu lệch dòng quá 5 đơn vị -> Dòng mới
        if (currentLineY === -1 || Math.abs(itemY - currentLineY) > 5) {
            if (currentLineText) lines.push(currentLineText.trim());
            currentLineY = itemY;
            currentLineText = itemText;
        } else {
            // Cùng dòng -> Nối thêm dấu cách để tách cột
            currentLineText += " " + itemText;
        }
    }
    if (currentLineText) lines.push(currentLineText.trim());

    return lines;
};

// --- HÀM 2: XỬ LÝ CHÍNH (LOGIC OFFLINE) ---
export const parseHubPdf = async (file: File): Promise<ParsedResult> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let allLines: string[] = [];

    // 1. Đọc toàn bộ PDF
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const pageLines = await extractCleanTextFromPage(page);
        allLines = [...allLines, ...pageLines];
    }

    // 2. Chuẩn bị biến lưu trữ
    const studentInfo: Partial<UserData> = {};
    const semestersMap = new Map<string, Semester>();
    const yearRanges: {start: number, end: number}[] = [];

    let currentSemId = "";
    let currentSemName = "";

    // Regex nhận diện
    const semHeaderRegex = /Học kỳ\s+(\d)\s*(?:\/|Năm học)?\s*(\d{4})[-–](\d{4})/i;
    // Regex dòng môn học: STT Mã Tên TC ... Điểm
    const rowRegex = /^\d+\s+[A-Z0-9_.]+\s+(.+?)\s+(\d+)\s+.*?\s([0-9.]+|M
