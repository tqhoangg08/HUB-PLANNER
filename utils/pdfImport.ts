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
        
        // Add a space to separate items to avoid merging words
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + ' '; 
    }

    // Clean up text: replace multiple spaces/tabs/newlines/NBSP with single space
    // Also remove soft hyphens or other invisible chars
    fullText = fullText.replace(/[\s\u00A0\u00AD]+/g, ' ').trim();

    // 2. Parse Student Info
    // Pattern: "Trần Quốc Hoàng [Mã số: 030839230074]"
    const studentNameRegex = /(?:SV\.|Sinh viên)?\s*([^\s].+?)\s*\[Mã số:\s*(\d+)\]/i;
    const studentMatch = fullText.match(studentNameRegex);
    
    const studentInfo: Partial<UserData> = {};
    if (studentMatch) {
        let rawName = studentMatch[1].trim();
        rawName = rawName.replace(/^SV\.\s*/i, '').replace(/^Sinh viên\s*/i, '').trim();
        studentInfo.studentName = rawName;
    }

    // Pattern: "Chương trình đào tạo: Kinh doanh quốc tế"
    const programRegex = /Chương trình đào tạo:\s*(.+?)\s+(?:Kết quả:|Năm học:|Học kỳ:)/i;
    const programMatch = fullText.match(programRegex);
    if (programMatch) {
        studentInfo.majorName = programMatch[1].trim();
    }

    // 3. Split by Semester Headers
    const semesters: Semester[] = [];
    const yearRanges: {start: number, end: number}[] = [];
    
    const semHeaderRegex = /Học kỳ\s+(\d)\s*\/\s*(\d{4})\s*-\s*(\d{4})/gi;
    let match;
    const indices: { index: number, name: string, id: string, semesterNo: number, yearStart: number, yearEnd: number }[] = [];
    
    while ((match = semHeaderRegex.exec(fullText)) !== null) {
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
        const end = next ? next.index : fullText.length;
        const blockContent = fullText.substring(current.index, end);

        const subjects: Subject[] = [];
        let trainingScore: number | null = null;

        // --- NEW PARSING STRATEGY: SPLIT BY "Chi tiết" ---
        // Instead of trying to match lines with regex which fails when columns merge,
        // we use "Chi tiết" as a reliable row delimiter.
        // Each subject row ends with "Chi tiết".
        
        const rowSegments = blockContent.split(/Chi\s*ti.t/gi);

        for (const segment of rowSegments) {
            const cleanSeg = segment.trim();
            if (!cleanSeg) continue;

            // Regex to extract data from the segment. 
            // Since we split by "Chi tiết", the segment contains the subject data ending at the score/checkbox.
            // We search for the pattern: STT -> Code -> Name -> Credits -> Type -> Score
            
            // (\d+)                -> STT
            // \s*
            // ([A-Z0-9_.-]+)       -> Code (e.g. ITC301)
            // \s+
            // (.+?)                -> Name (Lazy match)
            // \s*
            // (\d+)                -> Credits
            // \s*
            // ([^\d]+?)            -> Type (Non-digit text like "Bắt Buộc")
            // \s*
            // ([0-9.,]+|M)?        -> Score (Float or M, optional)
            // .*$                  -> Garbage (checkboxes etc) at end of segment

            const rowRegex = /(\d+)\s*([A-Z0-9_.-]+)\s+(.+?)\s*(\d+)\s*([^\d]+?)\s*([0-9.,]+|M)?.*$/i;
            const subMatch = cleanSeg.match(rowRegex);

            if (subMatch) {
                const code = subMatch[2];
                let name = subMatch[3].trim();
                const credits = parseInt(subMatch[4]);
                const rawScore = subMatch[6]; // Group 6 is score
                
                let scoreVal: number | null = null;
                let isNonGPA = false;

                if (rawScore) {
                    if (rawScore.toUpperCase() === 'M') {
                        isNonGPA = true;
                        scoreVal = null;
                    } else {
                        // Handle Vietnamese comma decimal (8,5 -> 8.5)
                        const normalizedScore = rawScore.replace(',', '.');
                        scoreVal = parseFloat(normalizedScore);
                        if (isNaN(scoreVal)) scoreVal = null;
                    }
                }

                // Heuristic: Check specifically excluded subjects for GPA calculation
                const nonGpaKeywords = [
                    'GDTC', 'Giáo dục thể chất',
                    'Quốc phòng', 'An ninh',
                    'Tiếng Anh tăng cường',
                    'Kỹ năng giao tiếp và thuyết trình',
                    'Kỹ năng thuyết trình và chinh phục đối tác',
                    'Kỹ năng lãnh đạo và làm việc nhóm',
                    'Kỹ năng phân tích và giải quyết vấn đề'
                ];

                if (credits === 0 || nonGpaKeywords.some(kw => name.toLowerCase().includes(kw.toLowerCase()))) {
                    isNonGPA = true;
                }

                // Validate STT to avoid matching random text as subjects
                // We assume STT is a number.
                
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

        // Parse Training Score - Robust Search
        // Look for "Điểm rèn luyện" followed by number, allowing flexible separators
        const trScoreRegex = /Điểm rèn luyện\s*[^0-9]*\s*(\d+)/i;
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
