import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { apiUrl } from '../utils/api';
import { playClick } from '../utils/audio';
import { clearLocalStoragePreservingDevicePreferences } from '../utils/devicePreferences';
import { logWebError } from '../utils/logWebError';
import {
    setActivePushNotificationUser,
    unbindDeviceNotificationsForCurrentUser,
} from '../utils/pushNotifications';
import { verifyTurnstileOnly } from '../utils/protectedSubmit';
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
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [otpError, setOtpError] = useState('');
    const [resendCountdown, setResendCountdown] = useState(0);
    const [deleteTurnstileToken, setDeleteTurnstileToken] = useState('');

    const resetDeleteAccountModal = useCallback(() => {
        setShowResetModal(false);
        setResetStep(1);
        setGeneratedOtp('');
        setOtpInput('');
        setOtpError('');
        setResendCountdown(0);
        setDeleteTurnstileToken('');
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

    const executeResetData = useCallback(async () => {
        try {
            if (!isGuest && sessionUserId) {
                const response = await fetch(apiUrl('/auth'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${sessionAccessToken}`,
                    },
                    body: JSON.stringify({ action: 'delete-account' }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload.error || 'Không thể xóa tài khoản.');
                }
            }

            await new Promise(resolve => window.setTimeout(resolve, 3000));
        } catch (error) {
            console.error('Lỗi khi reset:', error);
            await logWebError({
                source: 'auth',
                action: 'delete_data',
                error,
            });
        } finally {
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
        }
    }, [isGuest, onNavigateToLogin, sessionAccessToken, sessionUserId]);

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
        setOtpInput('');
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
        setOtpInput('');
        setOtpError('');
        setDeleteTurnstileToken('');
    }, []);

    const sendOtpEmail = useCallback(async () => {
        setIsSendingOtp(true);
        setOtpError('');
        try {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            setGeneratedOtp(otp);

            const expireTime = new Date(Date.now() + 15 * 60 * 1000);
            const timeString = expireTime.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Ho_Chi_Minh',
            });
            const { data, error } = await supabase.functions.invoke('send-otp-email', {
                body: {
                    email: sessionEmail,
                    passcode: otp,
                    time: timeString,
                    expiresAt: expireTime.toISOString(),
                    purpose: 'delete_data',
                },
            });

            if (error || !data || data.error) {
                throw new Error('Lỗi từ máy chủ Backend');
            }

            setResetStep(3);
            setOtpInput('');
            setResendCountdown(300);
        } catch (error) {
            console.error('Lỗi gửi mail:', error);
            setOtpError('Hệ thống mail đang bận. Vui lòng thử lại sau.');
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
    }, [sessionEmail]);

    const verifyTurnstileAndSendOtp = useCallback(async () => {
        playClick();
        if (!deleteTurnstileToken) {
            setOtpError('Vui lòng xác minh bạn không phải robot.');
            return;
        }

        setOtpError('');
        setIsSendingOtp(true);
        try {
            await verifyTurnstileOnly(deleteTurnstileToken);
            await sendOtpEmail();
        } catch (error) {
            await logWebError({
                source: 'otp',
                action: 'otp_request',
                error,
                metadata: { purpose: 'delete_data' },
            });
            setOtpError(error instanceof Error
                ? error.message
                : 'Xác minh bảo mật không thành công. Vui lòng thử lại.');
            setDeleteTurnstileToken('');
            setIsSendingOtp(false);
        }
    }, [deleteTurnstileToken, sendOtpEmail]);

    const updateOtpInput = useCallback((value: string) => {
        setOtpInput(value.replace(/\D/g, '').slice(0, 6));
        setOtpError('');
    }, []);

    const verifyOtpAndReset = useCallback(() => {
        playClick();
        if (otpInput !== generatedOtp) {
            setOtpError('Mã xác nhận không chính xác!');
            return;
        }

        setOtpError('');
        setResetStep(4);
        void executeResetData();
    }, [executeResetData, generatedOtp, otpInput]);

    return {
        showResetModal,
        resetStep,
        otpInput,
        isSendingOtp,
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
        updateOtpInput,
        verifyTurnstileAndSendOtp,
        verifyOtpAndReset,
    };
};
