import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import type { Semester, UserData } from '../types';
import {
    countTranscriptSubjects,
    reconstructTranscriptSemesters,
} from '../features/transcript-import/model';
import { playClick } from '../utils/audio';
import { showAlert } from '../utils/appNotifications';
import { logWebError } from '../utils/logWebError';
import { promptSendParserDebugFile } from '../utils/parserDebugTicket';

export interface PendingTranscriptImport {
    semesters: Semester[];
    onImportedSemesters?: (semesters: Semester[]) => void;
}

interface UseTranscriptTransferOptions {
    data: UserData;
    commitDataUpdate: (updater: (previousData: UserData) => UserData) => void;
}

export const useTranscriptTransfer = ({
    data,
    commitDataUpdate,
}: UseTranscriptTransferOptions) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [showImportGuide, setShowImportGuide] = useState(false);
    const [showImportLoadingToast, setShowImportLoadingToast] = useState(false);
    const [gradeImportTurnstileToken, setGradeImportTurnstileToken] = useState('');
    const [pendingTranscriptImport, setPendingTranscriptImport] = useState<PendingTranscriptImport | null>(null);
    const [isConfirmingTranscriptImport, setIsConfirmingTranscriptImport] = useState(false);

    const openImportGuide = useCallback(() => {
        playClick();
        setShowImportGuide(true);
    }, []);

    const closeImportGuide = useCallback(() => {
        setShowImportGuide(false);
    }, []);

    const exportTranscriptPdf = useCallback(async () => {
        playClick();
        const { exportTranscriptToPdf } = await import('../utils/pdfExport');
        await exportTranscriptToPdf(data);
    }, [data]);

    const handleFileUpload = useCallback(async (
        event: ChangeEvent<HTMLInputElement>,
        onImportedSemesters?: (semesters: Semester[]) => void,
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setShowImportGuide(false);
        setIsImporting(true);
        setShowImportLoadingToast(true);

        try {
            setGradeImportTurnstileToken('');
            const { parseHubPdf } = await import('../utils/pdfImport');
            const result = await parseHubPdf(file, gradeImportTurnstileToken);
            const importedSubjectCount = countTranscriptSubjects(result.semesters);

            if (importedSubjectCount === 0) {
                try {
                    localStorage.setItem('hub_last_transcript_import_debug', JSON.stringify({
                        at: new Date().toISOString(),
                        stage: 'app-zero-subjects',
                        error: result.error || null,
                        semesterCount: result.semesters.length,
                        yearRangeCount: result.yearRanges.length,
                        debug: result.debug || null,
                    }));
                } catch {
                    // Storage diagnostics are best-effort only.
                }

                const parserMessage = result.error || 'Transcript parser returned zero subjects';
                const errorLogId = await logWebError({
                    source: 'parser',
                    action: 'import_transcript',
                    error: parserMessage,
                    metadata: {
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type,
                        semesterCount: result.semesters.length,
                        yearRangeCount: result.yearRanges.length,
                    },
                    level: 'warn',
                });
                await promptSendParserDebugFile({
                    kind: 'transcript',
                    file,
                    errorLogId,
                    parserMessage,
                    metadata: {
                        semesterCount: result.semesters.length,
                        yearRangeCount: result.yearRanges.length,
                    },
                });
                return;
            }

            setPendingTranscriptImport({
                semesters: reconstructTranscriptSemesters(result.semesters, result.yearRanges),
                onImportedSemesters,
            });
        } catch (error) {
            console.error(error);
            const errorLogId = await logWebError({
                source: 'parser',
                action: 'import_transcript',
                error,
                metadata: {
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                },
            });
            const message = error instanceof Error ? error.message : '';
            await promptSendParserDebugFile({
                kind: 'transcript',
                file,
                errorLogId,
                parserMessage: message || 'Lỗi khi đọc file PDF.',
            });
        } finally {
            setIsImporting(false);
            setShowImportLoadingToast(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [gradeImportTurnstileToken]);

    const handleDroppedFile = useCallback((file: File) => {
        setShowImportGuide(false);
        if (!fileInputRef.current) return;

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInputRef.current.files = dataTransfer.files;
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }, []);

    const updatePendingSemesters = useCallback((semesters: Semester[]) => {
        setPendingTranscriptImport(current => (
            current ? { ...current, semesters } : current
        ));
    }, []);

    const cancelPendingImport = useCallback(() => {
        setPendingTranscriptImport(null);
    }, []);

    const confirmTranscriptImport = useCallback(async () => {
        if (!pendingTranscriptImport) return;

        const subjectCount = countTranscriptSubjects(pendingTranscriptImport.semesters);
        if (subjectCount === 0) {
            await showAlert('Danh sách xem trước đang trống. Vui lòng giữ lại ít nhất một môn học.');
            return;
        }

        setIsConfirmingTranscriptImport(true);
        try {
            if (pendingTranscriptImport.onImportedSemesters) {
                pendingTranscriptImport.onImportedSemesters(pendingTranscriptImport.semesters);
            } else {
                commitDataUpdate(previousData => ({
                    ...previousData,
                    semesters: pendingTranscriptImport.semesters,
                }));
            }
            setPendingTranscriptImport(null);
            await showAlert(
                `Đã đưa ${subjectCount} môn vào bảng điểm. Dữ liệu cũ đã được thay thế.\n\n`
                + 'Khuyến khích bạn rà soát lại các học kỳ, tên môn, số tín chỉ và điểm số. '
                + 'Nếu đang ở chế độ chỉnh sửa, chỉ bấm "Lưu bảng điểm" khi mọi thông tin đã chính xác.',
            );
        } finally {
            setIsConfirmingTranscriptImport(false);
        }
    }, [commitDataUpdate, pendingTranscriptImport]);

    return {
        fileInputRef,
        isImporting,
        showImportGuide,
        showImportLoadingToast,
        gradeImportTurnstileToken,
        setGradeImportTurnstileToken,
        pendingTranscriptImport,
        isConfirmingTranscriptImport,
        openImportGuide,
        closeImportGuide,
        exportTranscriptPdf,
        handleFileUpload,
        handleDroppedFile,
        updatePendingSemesters,
        cancelPendingImport,
        confirmTranscriptImport,
    };
};

export type TranscriptTransferController = ReturnType<typeof useTranscriptTransfer>;
