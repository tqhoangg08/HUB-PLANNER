import type { DeleteAccountController } from '../../hooks/useDeleteAccount';
import { DeleteAccountModal } from './DeleteAccountModal';

interface DeleteAccountOverlayProps {
    email: string;
    controller: DeleteAccountController;
}

export const DeleteAccountOverlay = ({
    email,
    controller,
}: DeleteAccountOverlayProps) => (
    <DeleteAccountModal
        open={controller.showResetModal}
        step={controller.resetStep}
        email={email}
        otpDigits={controller.otpDigits}
        error={controller.otpError}
        sendingOtp={controller.isSendingOtp}
        deletingAccount={controller.isDeletingAccount}
        resendCountdown={controller.resendCountdown}
        turnstileToken={controller.deleteTurnstileToken}
        onTurnstileTokenChange={controller.setDeleteTurnstileToken}
        onClose={controller.closeDeleteAccountModal}
        onContinue={controller.continueDeleteAccount}
        onBackToIntro={controller.backToDeleteIntro}
        onBackToVerification={controller.backToDeleteVerification}
        onSendOtp={controller.sendOtpEmail}
        onOtpDigitChange={controller.updateOtpDigit}
        onOtpPaste={controller.pasteOtp}
        onVerifyTurnstileAndSendOtp={controller.verifyTurnstileAndSendOtp}
        onConfirm={controller.verifyOtpAndReset}
    />
);
