import type { UserData } from '../../types';
import type { AccountPasswordController } from '../../hooks/useAccountPassword';
import type { AccountProfileDraftController } from '../../hooks/useAccountProfileDraft';
import type { DeleteAccountController } from '../../hooks/useDeleteAccount';
import type { TranscriptTransferController } from '../../hooks/useTranscriptTransfer';
import { ActivityLogModal } from '../../components/ActivityLogModal';
import { AppAiAdvisorOverlay } from '../../components/AppAiAdvisorOverlay';
import { PwaInstallInstructionsModal } from '../../components/PwaInstallInstructionsModal';
import { UserGuideModal } from '../../components/UserGuideModal';
import { AccountSettingsOverlays } from '../../components/account/AccountSettingsOverlays';
import { DeleteAccountOverlay } from '../../components/account/DeleteAccountOverlay';
import { TranscriptImportOverlays } from '../../features/transcript-import/TranscriptImportOverlays';

interface ProtectedAppOverlaysProps {
    data: UserData;
    userId?: string;
    email?: string;
    mobileScreen: boolean;
    mobileLayout: boolean;
    showAiHint: boolean;
    showGuide: boolean;
    showActivityLog: boolean;
    accountSettingsOpen: boolean;
    showIOSInstructions: boolean;
    avatarSeed: string;
    transcript: TranscriptTransferController;
    deleteAccount: DeleteAccountController;
    accountProfile: AccountProfileDraftController;
    accountPassword: AccountPasswordController;
    onCloseGuide: () => void;
    onCloseActivityLog: () => void;
    onCloseAccountSettings: () => void;
    onCloseIOSInstructions: () => void;
}

export const ProtectedAppOverlays = ({
    data,
    userId,
    email,
    mobileScreen,
    mobileLayout,
    showAiHint,
    showGuide,
    showActivityLog,
    accountSettingsOpen,
    showIOSInstructions,
    avatarSeed,
    transcript,
    deleteAccount,
    accountProfile,
    accountPassword,
    onCloseGuide,
    onCloseActivityLog,
    onCloseAccountSettings,
    onCloseIOSInstructions,
}: ProtectedAppOverlaysProps) => (
    <>
        <AppAiAdvisorOverlay
            data={data}
            userId={userId}
            mobileScreen={mobileScreen}
            mobileLayout={mobileLayout}
            showHint={showAiHint}
        />

        <TranscriptImportOverlays
            fileInputRef={transcript.fileInputRef}
            showLoadingToast={transcript.showImportLoadingToast}
            pendingImport={transcript.pendingTranscriptImport}
            isConfirmingImport={transcript.isConfirmingTranscriptImport}
            showImportGuide={transcript.showImportGuide}
            turnstileToken={transcript.gradeImportTurnstileToken}
            onTurnstileTokenChange={transcript.setGradeImportTurnstileToken}
            onPendingSemestersChange={transcript.updatePendingSemesters}
            onCancelPendingImport={transcript.cancelPendingImport}
            onConfirmImport={transcript.confirmTranscriptImport}
            onCloseImportGuide={transcript.closeImportGuide}
            onFileDrop={transcript.handleDroppedFile}
        />

        {showGuide && <UserGuideModal onClose={onCloseGuide} />}
        {showActivityLog && <ActivityLogModal onClose={onCloseActivityLog} />}

        <DeleteAccountOverlay
            email={email || ''}
            controller={deleteAccount}
        />

        <AccountSettingsOverlays
            open={accountSettingsOpen}
            mobile={mobileLayout || mobileScreen}
            email={email}
            avatarSeed={avatarSeed}
            profile={accountProfile}
            password={accountPassword}
            onClose={onCloseAccountSettings}
        />

        <PwaInstallInstructionsModal
            open={showIOSInstructions}
            onClose={onCloseIOSInstructions}
        />
    </>
);
