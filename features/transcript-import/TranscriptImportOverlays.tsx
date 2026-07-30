import type { RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import type { Semester } from '../../types';
import { ImportGuideModal } from '../../components/ImportGuideModal';
import { TranscriptImportPreviewModal } from '../../components/TranscriptImportPreviewModal';
import { TurnstileBox } from '../../components/TurnstileBox';
import type { PendingTranscriptImport } from '../../hooks/useTranscriptTransfer';

interface TranscriptImportOverlaysProps {
    fileInputRef: RefObject<HTMLInputElement | null>;
    showLoadingToast: boolean;
    pendingImport: PendingTranscriptImport | null;
    isConfirmingImport: boolean;
    showImportGuide: boolean;
    turnstileToken: string;
    onTurnstileTokenChange: (token: string) => void;
    onPendingSemestersChange: (semesters: Semester[]) => void;
    onCancelPendingImport: () => void;
    onConfirmImport: () => void;
    onCloseImportGuide: () => void;
    onFileDrop: (file: File) => void;
}

export const TranscriptImportOverlays = ({
    fileInputRef,
    showLoadingToast,
    pendingImport,
    isConfirmingImport,
    showImportGuide,
    turnstileToken,
    onTurnstileTokenChange,
    onPendingSemestersChange,
    onCancelPendingImport,
    onConfirmImport,
    onCloseImportGuide,
    onFileDrop,
}: TranscriptImportOverlaysProps) => (
    <>
        {showLoadingToast && (
            <div className="fixed bottom-6 right-6 bg-white shadow-xl p-4 rounded-xl border border-gray-200 flex items-start gap-3 z-[100] animate-slideInRight max-w-xs">
                <Loader2 className="animate-spin text-[#003375] shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-gray-700 leading-snug">
                    Đang xử lý PDF của bạn, vui lòng đợi giây lát...
                </p>
            </div>
        )}

        {pendingImport && (
            <TranscriptImportPreviewModal
                semesters={pendingImport.semesters}
                isSaving={isConfirmingImport}
                onChange={onPendingSemestersChange}
                onCancel={onCancelPendingImport}
                onConfirm={onConfirmImport}
            />
        )}

        {showImportGuide && (
            <ImportGuideModal
                onClose={onCloseImportGuide}
                securitySlot={(
                    <TurnstileBox
                        token={turnstileToken}
                        onTokenChange={onTurnstileTokenChange}
                    />
                )}
                canSelectFile={Boolean(turnstileToken)}
                onFileClick={() => fileInputRef.current?.click()}
                onFileDrop={onFileDrop}
            />
        )}
    </>
);
