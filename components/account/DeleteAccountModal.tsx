import React from 'react';
import { ArrowLeft, HeartCrack, Loader2, Mail, ShieldAlert, X } from 'lucide-react';
import type { DeleteAccountStep } from '../../hooks/useDeleteAccount';
import { TurnstileBox } from '../TurnstileBox';

interface DeleteAccountModalProps {
    open: boolean;
    step: DeleteAccountStep;
    email: string;
    otpDigits: readonly string[];
    error: string;
    sendingOtp: boolean;
    deletingAccount: boolean;
    resendCountdown: number;
    turnstileToken: string;
    onTurnstileTokenChange: (token: string) => void;
    onClose: () => void;
    onContinue: () => void;
    onBackToIntro: () => void;
    onBackToVerification: () => void;
    onSendOtp: () => void;
    onOtpDigitChange: (index: number, value: string) => void;
    onOtpPaste: (value: string) => void;
    onVerifyTurnstileAndSendOtp: () => void;
    onConfirm: () => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
    open,
    step,
    email,
    otpDigits,
    error,
    sendingOtp,
    deletingAccount,
    resendCountdown,
    turnstileToken,
    onTurnstileTokenChange,
    onClose,
    onContinue,
    onBackToIntro,
    onBackToVerification,
    onSendOtp,
    onOtpDigitChange,
    onOtpPaste,
    onVerifyTurnstileAndSendOtp,
    onConfirm,
}) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn border border-gray-200">
                {step === 1 ? (
                    <div className="p-8 sm:p-10 animate-fadeIn text-center relative">
                        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1.5 transition-colors"><X size={18} /></button>
                        <div className="w-20 h-20 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center mx-auto mb-6">
                            <HeartCrack size={40} />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 mb-3">Khoan đã... 🥺</h3>
                        <p className="text-gray-600 text-sm leading-relaxed mb-8 px-2">
                            Bạn đã dành rất nhiều thời gian để xây dựng lộ trình học tập trên HUB Planner. Nếu xóa tài khoản, <strong className="text-red-600">toàn bộ dữ liệu, bảng điểm và sự kiện</strong> sẽ biến mất vĩnh viễn.
                            <br /><br />
                            Thay vì xóa, bạn có muốn tạm thời <strong>Đăng xuất</strong> để nghỉ ngơi không?
                        </p>
                        <div className="flex flex-col gap-3">
                            <button onClick={onClose} className="w-full py-3.5 bg-[#003375] text-white font-bold rounded-xl hover:bg-[#002855] transition-all shadow-md active:scale-95 flex items-center justify-center gap-2">
                                Thôi, mình ở lại! 💙
                            </button>
                            <button onClick={onContinue} className="w-full py-3 bg-transparent text-gray-500 font-bold rounded-xl hover:bg-gray-50 hover:text-red-600 transition-all text-sm">
                                Mình đã quyết định, tiếp tục xóa
                            </button>
                        </div>
                    </div>
                ) : step === 2 ? (
                    <div className="animate-slideInRight">
                        <div className="bg-red-50 p-6 flex flex-col items-center text-center border-b border-red-100 relative">
                            <button onClick={onClose} className="absolute top-4 right-4 text-red-400 hover:text-red-600 bg-white rounded-full p-1 transition-colors"><X size={18} /></button>
                            <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 text-red-600 border border-red-100">
                                <ShieldAlert size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-red-700">Cảnh báo xóa tài khoản</h3>
                            <p className="text-sm text-red-600/80 font-medium mt-1">Tài khoản và toàn bộ dữ liệu sẽ bị xóa vĩnh viễn.</p>
                        </div>

                        <div className="p-6">
                            <div className="space-y-4">
                                <p className="text-sm text-gray-600 text-center leading-relaxed">
                                    Để đảm bảo an toàn, chúng tôi sẽ gửi một mã xác nhận đến email:
                                </p>
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-center font-bold text-[#003375]">
                                    {email}
                                </div>

                                <div className="mt-4 flex flex-col gap-2">
                                    <label className="text-sm font-bold text-gray-700 text-center">
                                        Xác minh bảo mật
                                    </label>
                                    <TurnstileBox token={turnstileToken} onTokenChange={onTurnstileTokenChange} />
                                </div>

                                {error && <p className="text-xs text-red-500 text-center font-bold">{error}</p>}

                                <div className="flex flex-col gap-2 mt-4">
                                    <button onClick={onVerifyTurnstileAndSendOtp} disabled={sendingOtp || !turnstileToken} className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-md">
                                        {sendingOtp ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />}
                                        {sendingOtp ? 'Đang gửi mã...' : 'Xác nhận gửi mã'}
                                    </button>
                                    <button onClick={onBackToIntro} className="w-full py-3 text-sm text-gray-500 font-bold hover:text-gray-900 transition-colors">
                                        Quay lại
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : step === 3 ? (
                    <div className="relative p-6 sm:p-8 animate-slideInRight">
                        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1.5 transition-colors"><X size={18} /></button>
                        <div className="flex flex-col items-center">
                            <div className="flex flex-col items-center justify-center mb-6">
                                <div className="h-14 w-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mb-4">
                                    <img src="/logo.png" alt="HUB Logo" className="h-10 w-10 object-contain" />
                                </div>
                                <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Nhập mã xác nhận</h2>
                                <p className="text-sm text-gray-500 text-center leading-relaxed px-2">
                                    Mã xác minh gồm 6 chữ số đã được gửi đến email <br />
                                    <strong className="text-[#003375] font-bold">{email}</strong>
                                </p>
                            </div>

                            <div className="flex justify-center gap-2 sm:gap-3 mb-2 w-full px-1">
                                {[...Array(6)].map((_, index) => (
                                    <input
                                        key={index}
                                        id={`otp-input-${index}`}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={otpDigits[index] || ''}
                                        onChange={(event) => {
                                            const value = event.target.value.replace(/[^0-9]/g, '');
                                            onOtpDigitChange(index, value);
                                            if (value && index < 5) {
                                                document.getElementById(`otp-input-${index + 1}`)?.focus();
                                            }
                                        }}
                                        onPaste={(event) => {
                                            const pastedValue = event.clipboardData.getData('text');
                                            const digits = pastedValue.replace(/\D/g, '').slice(0, 6);
                                            if (!digits) return;
                                            event.preventDefault();
                                            onOtpPaste(digits);
                                            document.getElementById(`otp-input-${Math.min(digits.length, 6) - 1}`)?.focus();
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
                                                document.getElementById(`otp-input-${index - 1}`)?.focus();
                                            }
                                        }}
                                        className="w-11 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black text-[#003375] bg-white border-2 border-gray-200 rounded-xl focus:bg-blue-50/50 focus:ring-0 focus:border-[#003375] outline-none transition-all shadow-sm"
                                        autoFocus={index === 0}
                                    />
                                ))}
                            </div>

                            <div className="h-6 mt-1 mb-4 w-full">
                                {error && <p className="text-xs text-red-600 font-bold animate-shake text-center">{error}</p>}
                            </div>

                            <button
                                onClick={onConfirm}
                                disabled={otpDigits.some(digit => !digit) || deletingAccount}
                                className="w-full py-3.5 bg-[#003375] text-white font-bold rounded-xl hover:bg-[#002855] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md hover:shadow-lg mb-6 flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                {deletingAccount && <Loader2 className="animate-spin" size={18} />}
                                {deletingAccount ? 'Đang xác minh và xóa...' : 'Xác nhận xóa tài khoản'}
                            </button>

                            <div className="flex flex-col items-center gap-5 w-full border-t border-gray-100 pt-5">
                                {resendCountdown <= 0 && (
                                    <div className="w-full flex flex-col gap-2">
                                        <span className="text-xs font-bold text-gray-600 text-center">Xác minh để gửi lại mã</span>
                                        <TurnstileBox token={turnstileToken} onTokenChange={onTurnstileTokenChange} />
                                    </div>
                                )}
                                <p className="text-sm text-gray-500">
                                    Bạn chưa nhận được mã?{' '}
                                    <button
                                        onClick={onSendOtp}
                                        disabled={sendingOtp || resendCountdown > 0 || !turnstileToken}
                                        className="text-[#003375] font-bold hover:underline transition-all disabled:opacity-50 disabled:no-underline disabled:text-gray-400"
                                    >
                                        {sendingOtp
                                            ? 'Đang gửi lại...'
                                            : resendCountdown > 0
                                                ? `Gửi lại mã sau ${Math.floor(resendCountdown / 60)}:${String(resendCountdown % 60).padStart(2, '0')}`
                                                : 'Gửi lại mã'
                                        }
                                    </button>
                                </p>

                                <button
                                    onClick={onBackToVerification}
                                    className="text-sm text-gray-500 font-semibold hover:text-gray-900 transition-colors flex items-center gap-1.5"
                                >
                                    <ArrowLeft size={16} /> Quay lại
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-8 sm:p-12 animate-scaleIn flex flex-col items-center justify-center text-center">
                        <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 animate-bounce">
                            <span className="text-5xl">👋</span>
                        </div>
                        <h3 className="text-2xl font-black text-[#003375] mb-4">Tạm biệt bạn nhé!</h3>
                        <p className="text-gray-600 text-sm leading-relaxed mb-8 px-2">
                            Dữ liệu của bạn trên hệ thống đã được xóa sạch hoàn toàn. <br /><br />
                            Cảm ơn bạn đã tin tưởng và đồng hành cùng <strong>HUB Planner</strong>. Chúc bạn luôn thành công và rạng rỡ trên con đường học tập tại giảng đường đại học!
                        </p>
                        <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 bg-gray-50 px-4 py-2 rounded-full">
                            <Loader2 className="animate-spin text-[#003375]" size={14} />
                            Đang đưa bạn về trang chủ...
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
