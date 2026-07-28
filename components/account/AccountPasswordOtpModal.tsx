import React from 'react';
import { Eye, EyeOff, Lock, X } from 'lucide-react';

interface AccountPasswordOtpModalProps {
    open: boolean;
    email?: string;
    error: string | null;
    notice: string | null;
    otp: string;
    newPassword: string;
    confirmNewPassword: string;
    showNewPassword: boolean;
    cooldownRemaining: number;
    loading: boolean;
    onClose: () => void;
    onResendOtp: () => void;
    onOtpChange: (value: string) => void;
    onNewPasswordChange: (value: string) => void;
    onConfirmNewPasswordChange: (value: string) => void;
    onToggleNewPasswordVisibility: () => void;
    onSubmit: React.FormEventHandler<HTMLFormElement>;
}

const formatOtpCooldown = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const AccountPasswordOtpModal: React.FC<AccountPasswordOtpModalProps> = ({
    open,
    email,
    error,
    notice,
    otp,
    newPassword,
    confirmNewPassword,
    showNewPassword,
    cooldownRemaining,
    loading,
    onClose,
    onResendOtp,
    onOtpChange,
    onNewPasswordChange,
    onConfirmNewPasswordChange,
    onToggleNewPasswordVisibility,
    onSubmit,
}) => {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
                onClick={event => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Đặt lại mật khẩu</h3>
                        <p className="mt-0.5 text-xs font-semibold text-gray-500">
                            Nhập mã OTP đã gửi đến {email || 'email HUB'}.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Đóng"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="space-y-4 px-5 py-5">
                    {error && (
                        <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-600">
                            {error}
                        </div>
                    )}
                    {notice && (
                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-[#003375]">
                            {notice}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                            <label className="text-xs font-bold text-gray-500">Mã OTP</label>
                            <button
                                type="button"
                                onClick={onResendOtp}
                                disabled={loading || cooldownRemaining > 0}
                                className="text-xs font-black text-[#003375] hover:underline disabled:cursor-not-allowed disabled:text-gray-400"
                            >
                                {cooldownRemaining > 0
                                    ? `Gửi lại sau ${formatOtpCooldown(cooldownRemaining)}`
                                    : 'Gửi lại mã OTP'}
                            </button>
                        </div>
                        <div className="relative">
                            <Lock
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                size={16}
                            />
                            <input
                                type="text"
                                value={otp}
                                onChange={event => onOtpChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2.5 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                                placeholder="Nhập 6 chữ số"
                                autoComplete="one-time-code"
                                inputMode="numeric"
                            />
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
                                className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2.5 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
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
                                className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2.5 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                                placeholder="Nhập lại mật khẩu mới"
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-[1.4] rounded-lg bg-[#003375] px-3 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#002855] disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                            {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
