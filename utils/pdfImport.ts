import * as pdfjsLib from 'pdfjs-dist';
import { UserData, Semester, Subject } from '../types';

// Set worker for PDF.js - ensure version matches the main library import
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: {start: number, end: number}[]; // Keep track of found years
}

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

    // Process each block
    for (let i = 0; i < indices.length; i++) {
        const current = indices[i];
        const next = indices[i + 1];
        const end = next ? next.index : fullText.length;
        const blockContent = fullText.substring(current.index, end);

        const subjects: Subject[] = [];
        let trainingScore: number | null = null;

        // Parse Subjects
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