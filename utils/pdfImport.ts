import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { UserData, Semester } from '../types';
import { getTranscriptImportIssue, type TranscriptImportIntegrity } from '../features/transcript-import/model';
import { extractPageRows, parseHubTranscriptRows, type PositionedPdfRow } from './hubTranscriptParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface ParsedResult {
    studentInfo: Partial<UserData>;
    semesters: Semester[];
    yearRanges: { start: number; end: number }[];
    error?: string;
    debug?: Record<string, unknown>;
    integrity?: TranscriptImportIntegrity;
}

const saveImportDebug = (payload: Record<string, unknown>) => {
    try {
        localStorage.setItem('hub_last_transcript_import_debug', JSON.stringify({
            ...payload, at: new Date().toISOString(),
        }));
    } catch {
        // Diagnostics are best-effort and contain only counts/checks, never PDF text or identity.
    }
};

// Keep the existing call signature; native BUH text does not need an AI token.
export const parseHubPdf = async (file: File, _turnstileToken: string): Promise<ParsedResult> => {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    try {
        const positionedRows: PositionedPdfRow[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const textContent = await page.getTextContent();
            positionedRows.push(...extractPageRows(textContent.items, pageNumber));
        }
        const direct = parseHubTranscriptRows(positionedRows);
        const integrity: TranscriptImportIntegrity = {
            detectedSemesterCount: direct.detectedSemesterCount,
            semesters: direct.rowChecks.map(check => {
                const credits = direct.creditChecks.find(credit => credit.semesterId === check.semesterId);
                return { id: check.semesterId, subjectCount: check.expected, credits: credits?.expected ?? credits?.actual ?? 0 };
            }),
            sourceReliable: direct.reliable,
        };
        const unverifiedSummaries = direct.creditChecks.filter(check => check.summaryEvidence !== 'verified').length;
        const error = unverifiedSummaries > 0
            ? `Có ${unverifiedSummaries} học kỳ thiếu hoặc không đọc rõ một dòng tổng kết STC duy nhất với tổng tín chỉ sau dấu =. `
                + 'Vui lòng xuất lại PDF đầy đủ từ BUH Portal. Không thể xác nhận nhập; bảng điểm cũ được giữ nguyên.'
            : getTranscriptImportIssue(direct.semesters, integrity) ?? undefined;
        const debug = {
            stage: direct.reliable ? 'hub-layout-parser-success' : 'hub-layout-parser-incomplete',
            pages: pdf.numPages,
            fileSize: file.size,
            directDetectedSemesterCount: direct.detectedSemesterCount,
            directSubjectCount: direct.subjectCount,
            directCreditChecks: direct.creditChecks,
            directRowChecks: direct.rowChecks,
            directReliable: direct.reliable,
            mappedSemesterCount: direct.semesters.length,
            mappedSubjectCount: direct.subjectCount,
        };
        saveImportDebug(debug);
        // Unverifiable native tables and unsupported layouts fail closed locally.
        // A whole-document AI response cannot establish missing source evidence.
        return { studentInfo: direct.studentInfo, semesters: direct.semesters, yearRanges: direct.yearRanges, integrity, error, debug };
    } finally {
        await pdf.destroy();
    }
};
