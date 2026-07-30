import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
    createEmptyDeleteAccountOtp,
    parseDeleteAccountOtp,
    updateDeleteAccountOtpDigit,
} from '../features/account/deleteAccountOtp';
import { apiHeaders, apiUrl } from '../utils/api';
import { playClick } from '../utils/audio';
import { clearLocalStoragePreservingDevicePreferences } from '../utils/devicePreferences';
import { logWebError } from '../utils/logWebError';
import {
    setActivePushNotificationUser,
    unbindDeviceNotificationsForCurrentUser,
} from '../utils/pushNotifications';
import { supabase } from '../utils/supabase';

export type DeleteAccountStep = 1 | 2 | 3 | 4;

interface UseDeleteAccountOptions {
    session: Session | null;
    onCloseUserMenu: () => void;
    onNavigateToLogin: () => void;
}

export const useDeleteAccount = ({
    session,
    onCloseUserMenu,
    onNavigateToLogin,
}: UseDeleteAccountOptions) => {
    const sessionUserId = session?.user.id || null;
    const sessionEmail = session?.user.email || '';
    const sessionAccessToken = session?.access_token || '';
    const isGuest = !sessionUserId;
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetStep, setResetStep] = useState<DeleteAccountStep>(1);
    const [otpDigits, setOtpDigits] = useState<string[]>(createEmptyDeleteAccountOtp);
    const otpInput = otpDigits.join('');
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [otpError, setOtpError] = useState('');
    const [resendCountdown, setResendCountdown] = useState(0);
    const [deleteTurnstileToken, setDeleteTurnstileToken] = useState('');

    const resetDeleteAccountModal = useCallback(() => {
        setShowResetModal(false);
        setResetStep(1);
        setOtpDigits(createEmptyDeleteAccountOtp());
        setOtpError('');
        setResendCountdown(0);
        setDeleteTurnstileToken('');
        setIsDeletingAccount(false);
    }, []);

    const closeDeleteAccountModal = useCallback(() => {
        setShowResetModal(false);
    }, []);

    useEffect(() => {
        if (!sessionUserId && showResetModal) {
            resetDeleteAccountModal();
        }
    }, [resetDeleteAccountModal, sessionUserId, showResetModal]);

    useEffect(() => {
        if (resendCountdown <= 0) return;
        const timer = window.setTimeout(() => {
            setResendCountdown(previous => previous - 1);
        }, 1000);
        return () => window.clearTimeout(timer);
    }, [resendCountdown]);

    const finishLocalDeletion = useCallback(async () => {
        try {
            setActivePushNotificationUser(null);
            await unbindDeviceNotificationsForCurrentUser(sessionUserId || undefined);
        } catch {
            // Device notification cleanup is best-effort.
        }

        try {
            await supabase.auth.signOut();
        } catch {
            // Local cleanup and navigation must still complete.
        }

        clearLocalStoragePreservingDevicePreferences();
        sessionStorage.clear();
        onNavigateToLogin();
    }, [onNavigateToLogin, sessionUserId]);

    const executeResetData = useCallback(async (otp = '') => {
        if (isGuest) {
            await new Promise(resolve => window.setTimeout(resolve, 3000));
            await finishLocalDeletion();
            return true;
        }

        try {
            const response = await fetch(apiUrl('/auth'), {
                method: 'POST',
                headers: apiHeaders({
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionAccessToken}`,
                }),
                body: JSON.stringify({
                    action: 'delete-account',
                    otp,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || 'Không thể xóa tài khoản.');
            }

            setResetStep(4);
            await new Promise(resolve => window.setTimeout(resolve, 3000));
            await finishLocalDeletion();
            return true;
        } catch (error) {
            console.error('Lỗi khi xóa tài khoản:', error);
            setOtpError(error instanceof Error ? error.message : 'Không thể xóa tài khoản.');
            await logWebError({
                source: 'auth',
                action: 'delete_data',
                error,
            });
            return false;
        }
    }, [finishLocalDeletion, isGuest, sessionAccessToken]);

    const requestDeleteAccount = useCallback(() => {
        playClick();
        if (isGuest) {
            if (window.confirm('Xóa toàn bộ dữ liệu dùng thử?')) {
                void executeResetData();
            }
            return;
        }

        setShowResetModal(true);
        setResetStep(1);
        setOtpDigits(createEmptyDeleteAccountOtp());
        setOtpError('');
        setDeleteTurnstileToken('');
        onCloseUserMenu();
    }, [executeResetData, isGuest, onCloseUserMenu]);

    const continueDeleteAccount = useCallback(() => {
        playClick();
        setResetStep(2);
        setDeleteTurnstileToken('');
    }, []);

    const backToDeleteIntro = useCallback(() => {
        setResetStep(1);
    }, []);

    const backToDeleteVerification = useCallback(() => {
        setResetStep(2);
        setOtpDigits(createEmptyDeleteAccountOtp());
        setOtpError('');
        setDeleteTurnstileToken('');
    }, []);

    const sendOtpEmail = useCallback(async () => {
        if (!deleteTurnstileToken) {
            setOtpError('Vui lòng xác minh bạn không phải robot.');
            return;
        }

        setIsSendingOtp(true);
        setOtpError('');
        try {
            const response = await fetch(apiUrl('/auth'), {
                method: 'POST',
                headers: apiHeaders({
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionAccessToken}`,
                }),
                body: JSON.stringify({
                    action: 'send-otp',
                    purpose: 'delete_data',
                    turnstileToken: deleteTurnstileToken,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            const retryAfterSeconds = Number(payload.retryAfterSeconds || 0);
            if (!response.ok) {
                if (response.status === 429 && retryAfterSeconds > 0) {
                    setResetStep(3);
                    setResendCountdown(retryAfterSeconds);
                }
                throw new Error(payload.error || 'Không thể gửi mã OTP.');
            }

            setResetStep(3);
            setOtpDigits(createEmptyDeleteAccountOtp());
            setResendCountdown(retryAfterSeconds || 600);
            setDeleteTurnstileToken('');
        } catch (error) {
            console.error('Lỗi gửi mail:', error);
            setOtpError(error instanceof Error
                ? error.message
                : 'Hệ thống mail đang bận. Vui lòng thử lại sau.');
            await logWebError({
                source: 'otp',
                action: 'otp_request',
                error,
                metadata: {
                    purpose: 'delete_data',
                    email: sessionEmail,
                },
            });
            setDeleteTurnstileToken('');
        } finally {
            setIsSendingOtp(false);
        }
    }, [deleteTurnstileToken, sessionAccessToken, sessionEmail]);

    const verifyTurnstileAndSendOtp = useCallback(async () => {
        playClick();
        await sendOtpEmail();
    }, [sendOtpEmail]);

    const updateOtpDigit = useCallback((index: number, value: string) => {
        setOtpDigits(previous => updateDeleteAccountOtpDigit(previous, index, value));
        setOtpError('');
    }, []);

    const pasteOtp = useCallback((value: string) => {
        setOtpDigits(parseDeleteAccountOtp(value));
        setOtpError('');
    }, []);

    const verifyOtpAndReset = useCallback(async () => {
        playClick();
        if (otpInput.length !== 6) {
            setOtpError('Mã OTP cần đủ 6 chữ số.');
            return;
        }

        setOtpError('');
        setIsDeletingAccount(true);
        const deleted = await executeResetData(otpInput);
        if (!deleted) setIsDeletingAccount(false);
    }, [executeResetData, otpInput]);

    return {
        showResetModal,
        resetStep,
        otpDigits,
        isSendingOtp,
        isDeletingAccount,
        otpError,
        resendCountdown,
        deleteTurnstileToken,
        setDeleteTurnstileToken,
        closeDeleteAccountModal,
        resetDeleteAccountModal,
        requestDeleteAccount,
        continueDeleteAccount,
        backToDeleteIntro,
        backToDeleteVerification,
        sendOtpEmail,
        updateOtpDigit,
        pasteOtp,
        verifyTurnstileAndSendOtp,
        verifyOtpAndReset,
    };
};

export type DeleteAccountController = ReturnType<typeof useDeleteAccount>;
