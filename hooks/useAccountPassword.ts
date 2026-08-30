import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AppSession } from '../utils/privateApi';
import { playClick } from '../utils/audio';
import { apiHeaders, apiUrl } from '../utils/api';
import { logWebError } from '../utils/logWebError';
import { verifyTurnstileOnly } from '../utils/protectedSubmit';

const OTP_RESEND_COOLDOWN_SECONDS = 10 * 60;
const normalizeOtpEmail = (email: string) => email.trim().toLowerCase();
const otpCooldownKey = (email: string) =>
    `hubplanner:otp-cooldown:forgot_password:${normalizeOtpEmail(email)}`;
const getStoredOtpCooldown = (email: string) => {
    const until = Number(localStorage.getItem(otpCooldownKey(email)) || 0);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
};
const storeOtpCooldown = (email: string, seconds = OTP_RESEND_COOLDOWN_SECONDS) => {
    localStorage.setItem(otpCooldownKey(email), String(Date.now() + seconds * 1000));
};
const formatOtpCooldown = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

interface UseAccountPasswordOptions {
    settingsOpen: boolean;
    session: AppSession | null;
    setPasswordSetAt: (value: string | null | undefined) => void;
}

export const useAccountPassword = ({
    settingsOpen,
    session,
    setPasswordSetAt,
}: UseAccountPasswordOptions) => {
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [showAccountPasswordOtpModal, setShowAccountPasswordOtpModal] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [accountPasswordOtp, setAccountPasswordOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isAccountPasswordOtpMode, setIsAccountPasswordOtpMode] = useState(false);
    const [
        accountPasswordOtpCooldownRemaining,
        setAccountPasswordOtpCooldownRemaining,
    ] = useState(0);
    const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
    const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
    const [passwordChangeNotice, setPasswordChangeNotice] = useState<string | null>(null);
    const [accountPasswordTurnstileToken, setAccountPasswordTurnstileToken] = useState('');

    const sessionUserId = session?.user?.id || null;
    const sessionEmail = session?.user?.email || '';

    const resetPasswordDraft = useCallback(() => {
        setShowPasswordChange(false);
        setCurrentPassword('');
        setAccountPasswordOtp('');
        setNewPassword('');
        setConfirmNewPassword('');
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setIsAccountPasswordOtpMode(false);
        setPasswordChangeError(null);
        setPasswordChangeNotice(null);
        setAccountPasswordTurnstileToken('');
    }, []);

    useEffect(() => {
        if (settingsOpen) {
            resetPasswordDraft();
        }
    }, [resetPasswordDraft, settingsOpen]);

    useEffect(() => {
        if (!sessionEmail) {
            setAccountPasswordOtpCooldownRemaining(0);
            return;
        }

        const syncCooldown = () => {
            setAccountPasswordOtpCooldownRemaining(
                getStoredOtpCooldown(sessionEmail),
            );
        };

        syncCooldown();
        const timer = window.setInterval(syncCooldown, 1000);
        return () => window.clearInterval(timer);
    }, [sessionEmail]);

    const startPasswordChange = useCallback(() => {
        playClick();
        setShowPasswordChange(false);
        setIsAccountPasswordOtpMode(false);
        setAccountPasswordOtp('');
        setPasswordChangeError('Đổi mật khẩu trong ứng dụng đang tạm bảo trì. Vui lòng dùng luồng Quên mật khẩu tại trang đăng nhập.');
        setPasswordChangeNotice(null);
    }, []);

    const cancelPasswordChange = useCallback(() => {
        resetPasswordDraft();
    }, [resetPasswordDraft]);

    const validatePasswordChange = useCallback(() => {
        if (isAccountPasswordOtpMode && accountPasswordOtp.length !== 6) {
            return 'Nhập mã OTP gồm 6 chữ số.';
        }
        if (!isAccountPasswordOtpMode && !currentPassword) {
            return 'Nhập mật khẩu cũ để xác nhận.';
        }
        if (!isAccountPasswordOtpMode && !accountPasswordTurnstileToken) {
            return 'Vui lòng xác minh bạn không phải robot.';
        }
        if (newPassword.length < 8) {
            return 'Mật khẩu mới cần ít nhất 8 ký tự.';
        }
        if (newPassword !== confirmNewPassword) {
            return 'Mật khẩu mới và nhập lại mật khẩu mới chưa trùng khớp.';
        }
        if (!isAccountPasswordOtpMode && currentPassword === newPassword) {
            return 'Mật khẩu mới cần khác mật khẩu cũ.';
        }
        return null;
    }, [
        accountPasswordOtp,
        accountPasswordTurnstileToken,
        confirmNewPassword,
        currentPassword,
        isAccountPasswordOtpMode,
        newPassword,
    ]);

    const changeAccountPassword = useCallback(async (event: FormEvent) => {
        event.preventDefault();
        if (!sessionEmail || !sessionUserId) return;

        const invalid = validatePasswordChange();
        if (invalid) {
            setPasswordChangeError(invalid);
            setPasswordChangeNotice(null);
            return;
        }

        setPasswordChangeLoading(true);
        setPasswordChangeError(null);
        setPasswordChangeNotice(null);
        playClick();

        try {
            if (isAccountPasswordOtpMode) {
                const response = await fetch(apiUrl('/auth'), {
                    method: 'POST',
                    headers: apiHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        action: 'verify-otp',
                        purpose: 'forgot_password',
                        email: sessionEmail,
                        otp: accountPasswordOtp,
                        password: newPassword,
                        confirmPassword: confirmNewPassword,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(
                        payload.error || 'Mã OTP không chính xác hoặc đã hết hạn.',
                    );
                }
            } else {
                await verifyTurnstileOnly(accountPasswordTurnstileToken);
                throw new Error('Đổi mật khẩu bằng mật khẩu hiện tại đang tạm bảo trì. Vui lòng dùng luồng Quên mật khẩu.');
            }

            // Profile metadata is server-managed. Browser profile writes are
            // intentionally retired before the profile authority cutover.
            const markedAt = new Date().toISOString();
            setPasswordSetAt(markedAt);
            localStorage.removeItem(otpCooldownKey(sessionEmail));
            setAccountPasswordOtpCooldownRemaining(0);
            setShowAccountPasswordOtpModal(false);
            setCurrentPassword('');
            setAccountPasswordOtp('');
            setNewPassword('');
            setConfirmNewPassword('');
            setIsAccountPasswordOtpMode(false);
            setAccountPasswordTurnstileToken('');
            setPasswordChangeNotice('Đã cập nhật mật khẩu thành công.');
        } catch (error: any) {
            setPasswordChangeError(
                error.message || 'Không thể cập nhật mật khẩu lúc này.',
            );
            await logWebError({
                source: 'auth',
                action: 'reset_password',
                error,
                metadata: {
                    mode: isAccountPasswordOtpMode
                        ? 'otp'
                        : 'current_password',
                    email: sessionEmail,
                },
            });
            if (!isAccountPasswordOtpMode) {
                setAccountPasswordTurnstileToken('');
            }
        } finally {
            setPasswordChangeLoading(false);
        }
    }, [
        accountPasswordOtp,
        accountPasswordTurnstileToken,
        confirmNewPassword,
        currentPassword,
        isAccountPasswordOtpMode,
        newPassword,
        sessionEmail,
        sessionUserId,
        setPasswordSetAt,
        validatePasswordChange,
    ]);

    const forgotAccountPassword = useCallback(async () => {
        if (!sessionEmail) return;

        const storedCooldown = getStoredOtpCooldown(sessionEmail);
        if (storedCooldown > 0) {
            setShowAccountPasswordOtpModal(true);
            setIsAccountPasswordOtpMode(true);
            setAccountPasswordOtpCooldownRemaining(storedCooldown);
            setPasswordChangeError(null);
            setPasswordChangeNotice(
                `Mã OTP đã được gửi đến ${sessionEmail}. Bạn có thể gửi lại sau ${formatOtpCooldown(storedCooldown)}.`,
            );
            return;
        }

        if (!accountPasswordTurnstileToken) {
            setPasswordChangeError('Vui lòng xác minh bạn không phải robot.');
            setPasswordChangeNotice(null);
            return;
        }

        setPasswordChangeLoading(true);
        setPasswordChangeError(null);
        setPasswordChangeNotice(null);
        playClick();

        try {
            const response = await fetch(apiUrl('/auth'), {
                method: 'POST',
                headers: apiHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    action: 'send-otp',
                    purpose: 'forgot_password',
                    email: sessionEmail,
                    turnstileToken: accountPasswordTurnstileToken,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (response.status === 429 && payload.retryAfterSeconds) {
                    const retryAfterSeconds = Number(payload.retryAfterSeconds);
                    storeOtpCooldown(sessionEmail, retryAfterSeconds);
                    setAccountPasswordOtpCooldownRemaining(retryAfterSeconds);
                    setShowAccountPasswordOtpModal(true);
                    setIsAccountPasswordOtpMode(true);
                    setPasswordChangeNotice(
                        `Mã OTP đã được gửi đến ${sessionEmail}. Bạn có thể gửi lại sau ${formatOtpCooldown(retryAfterSeconds)}.`,
                    );
                    return;
                }
                throw new Error(
                    payload.error
                    || 'Không thể gửi mã OTP đặt lại mật khẩu.',
                );
            }

            const cooldownSeconds = Number(
                payload.retryAfterSeconds
                || payload.expiresInSeconds
                || OTP_RESEND_COOLDOWN_SECONDS,
            );
            storeOtpCooldown(sessionEmail, cooldownSeconds);
            setAccountPasswordOtpCooldownRemaining(cooldownSeconds);
            setShowAccountPasswordOtpModal(true);
            setIsAccountPasswordOtpMode(true);
            setCurrentPassword('');
            setAccountPasswordOtp('');
            setNewPassword('');
            setConfirmNewPassword('');
            setPasswordChangeNotice(
                `Đã gửi mã OTP đặt lại mật khẩu đến ${sessionEmail}.`,
            );
        } catch (error: any) {
            setPasswordChangeError(
                error.message || 'Không thể gửi mã OTP đặt lại mật khẩu.',
            );
            await logWebError({
                source: 'otp',
                action: 'otp_request',
                error,
                metadata: {
                    purpose: 'forgot_password',
                    email: sessionEmail,
                },
            });
            setAccountPasswordTurnstileToken('');
        } finally {
            setPasswordChangeLoading(false);
        }
    }, [accountPasswordTurnstileToken, sessionEmail]);

    return {
        showPasswordChange,
        showAccountPasswordOtpModal,
        setShowAccountPasswordOtpModal,
        currentPassword,
        setCurrentPassword,
        accountPasswordOtp,
        setAccountPasswordOtp,
        newPassword,
        setNewPassword,
        confirmNewPassword,
        setConfirmNewPassword,
        showCurrentPassword,
        setShowCurrentPassword,
        showNewPassword,
        setShowNewPassword,
        isAccountPasswordOtpMode,
        accountPasswordOtpCooldownRemaining,
        passwordChangeLoading,
        passwordChangeError,
        passwordChangeNotice,
        accountPasswordTurnstileToken,
        setAccountPasswordTurnstileToken,
        startPasswordChange,
        cancelPasswordChange,
        changeAccountPassword,
        forgotAccountPassword,
    };
};

export type AccountPasswordController = ReturnType<typeof useAccountPassword>;
