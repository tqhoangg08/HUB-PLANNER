import React from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { TurnstileBox } from '../TurnstileBox';

interface AccountPasswordPanelProps {
    error: string | null;
    notice: string | null;
    turnstileToken: string;
    showPasswordChange: boolean;
    otpMode: boolean;
    cooldownRemaining: number;
    loading: boolean;
    currentPassword: string;
    otp: string;
    newPassword: string;
    confirmNewPassword: string;
    showCurrentPassword: boolean;
    showNewPassword: boolean;
    onTurnstileTokenChange: (value: string) => void;
    onForgotPassword: () => void;
    onStartPasswordChange: () => void;
    onCurrentPasswordChange: (value: string) => void;
    onOtpChange: (value: string) => void;
    onNewPasswordChange: (value: string) => void;
    onConfirmNewPasswordChange: (value: string) => void;
    onToggleCurrentPasswordVisibility: () => void;
    onToggleNewPasswordVisibility: () => void;
    onCancelPasswordChange: () => void;
    onSubmit: React.FormEventHandler<HTMLFormElement>;
}

const formatOtpCooldown = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const AccountPasswordPanel: React.FC<AccountPasswordPanelProps> = ({
    error,
    notice,
    turnstileToken,
    showPasswordChange,
    otpMode,
    cooldownRemaining,
    loading,
    currentPassword,
    otp,
    newPassword,
    confirmNewPassword,
    showCurrentPassword,
    showNewPassword,
    onTurnstileTokenChange,
    onForgotPassword,
    onStartPasswordChange,
    onCurrentPasswordChange,
    onOtpChange,
    onNewPasswordChange,
    onConfirmNewPasswordChange,
    onToggleCurrentPasswordVisibility,
    onToggleNewPasswordVisibility,
    onCancelPasswordChange,
    onSubmit,
}) => (
    <div>
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-gray-100 pb-1">
            <h4 className="text-xs font-black text-[#003375] uppercase tracking-wider">
                2. Bảo mật tài khoản
            </h4>
            <button
                type="button"
                onClick={onForgotPassword}
                disabled={loading}
                className="text-xs font-black text-[#003375] hover:underline disabled:cursor-not-allowed disabled:text-gray-400"
            >
                {cooldownRemaining > 0
                    ? `Gửi lại sau ${formatOtpCooldown(cooldownRemaining)}`
                    : otpMode ? 'Gửi lại mã OTP' : 'Quên mật khẩu?'}
            </button>
        </div>

        {error && (
            <div className="mb-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">
                {error}
            </div>
        )}
        {notice && (
            <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-[#003375]">
                {notice}
            </div>
        )}

        <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-bold text-gray-500">Xác minh bạn không phải robot</p>
            <TurnstileBox token={turnstileToken} onTokenChange={onTurnstileTokenChange} />
        </div>

        {!showPasswordChange ? (
            <button
                type="button"
                onClick={onStartPasswordChange}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-[#003375]"
            >
                <Lock size={16} />
                Cài lại mật khẩu
            </button>
        ) : (
            <form
                onSubmit={onSubmit}
                className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3"
            >
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500">
                        {otpMode ? 'Mã OTP' : 'Mật khẩu cũ'}
                    </label>
                    <div className="relative">
                        <Lock
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            size={16}
                        />
                        <input
                            type={otpMode ? 'text' : showCurrentPassword ? 'text' : 'password'}
                            value={otpMode ? otp : currentPassword}
                            onChange={event => {
                                if (otpMode) {
                                    onOtpChange(event.target.value.replace(/\D/g, '').slice(0, 6));
                                } else {
                                    onCurrentPasswordChange(event.target.value);
                                }
                            }}
                            className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                            placeholder={otpMode ? 'Nhập 6 chữ số' : 'Nhập mật khẩu hiện tại'}
                            autoComplete={otpMode ? 'one-time-code' : 'current-password'}
                        />
                        {!otpMode && (
                            <button
                                type="button"
                                onClick={onToggleCurrentPasswordVisibility}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-[#003375]"
                                aria-label={showCurrentPassword ? 'Ẩn mật khẩu cũ' : 'Hiện mật khẩu cũ'}
                            >
                                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        )}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500">Mật khẩu mới</label>
                    <div className="relative">
                        <Lock
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            size={16}
                        />
                        <input
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={event => onNewPasswordChange(event.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                            placeholder="Ít nhất 8 ký tự"
                            autoComplete="new-password"
                        />
                        <button
                            type="button"
                            onClick={onToggleNewPasswordVisibility}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-[#003375]"
                            aria-label={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
                        >
                            {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500">Nhập lại mật khẩu mới</label>
                    <div className="relative">
                        <Lock
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            size={16}
                        />
                        <input
                            type={showNewPassword ? 'text' : 'password'}
                            value={confirmNewPassword}
                            onChange={event => onConfirmNewPasswordChange(event.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                            placeholder="Nhập lại mật khẩu mới"
                            autoComplete="new-password"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onCancelPasswordChange}
                        className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
                    >
                        Hủy
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-[1.4] rounded-lg bg-[#003375] px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-[#002855] disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                    </button>
                </div>
            </form>
        )}
    </div>
);
