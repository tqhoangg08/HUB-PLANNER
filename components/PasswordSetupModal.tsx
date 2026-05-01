import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { playClick } from '../utils/audio';
import { updateProfilePrivate } from '../utils/profilePrivate';

type PasswordSetupModalProps = {
    email?: string | null;
    onComplete: () => void;
};

const validatePassword = (password: string, confirmPassword: string) => {
    if (password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.';
    if (password !== confirmPassword) return 'Hai mật khẩu chưa trùng khớp.';
    return null;
};

export const PasswordSetupModal: React.FC<PasswordSetupModalProps> = ({ email, onComplete }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!supabase) return setError('Chưa cấu hình kết nối Database.');

        const invalid = validatePassword(password, confirmPassword);
        if (invalid) return setError(invalid);

        setLoading(true);
        setError(null);
        playClick();

        try {
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;

            const { error: markError } = await supabase.rpc('mark_password_set');
            if (markError) {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user?.id) throw markError;
                await updateProfilePrivate(user.id, { password_set_at: new Date().toISOString() });
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (user?.id) await updateProfilePrivate(user.id, { password_set_at: new Date().toISOString() });
            }

            onComplete();
        } catch (err: any) {
            setError(err.message || 'Không thể cập nhật mật khẩu lúc này.');
        } finally {
            setLoading(false);
        }
    };

    const passwordField = (id: string, value: string, setValue: (value: string) => void, label: string, placeholder: string) => (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-slate-700">{label}</label>
            <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                    id={id}
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder={placeholder}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-11 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0B5ED7] focus:ring-4 focus:ring-[rgba(11,94,215,0.12)]"
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:text-[#003B7A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.14)]"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-4">
            <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#003B7A]">
                    <ShieldCheck size={28} />
                </div>
                <h2 className="text-2xl font-black tracking-normal text-slate-950">Cập nhật mật khẩu</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                    Tài khoản {email ? <strong className="font-bold text-[#003B7A]">{email}</strong> : 'của bạn'} trước đây đăng nhập bằng Google nên chưa có mật khẩu riêng. Bạn cần đặt mật khẩu để tiếp tục dùng HUB Planner và có thể đăng nhập nhanh bằng MSSV ở lần sau.
                </p>

                {error && (
                    <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-bold text-red-700">
                        <AlertCircle size={18} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="mt-5 space-y-4">
                    {passwordField('new-password', password, setPassword, 'Mật khẩu mới', 'Nhập mật khẩu mới')}
                    {passwordField('confirm-new-password', confirmPassword, setConfirmPassword, 'Nhập lại mật khẩu', 'Nhập lại mật khẩu mới')}
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#003B7A] px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#002F61] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.18)] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                    {loading ? 'Đang cập nhật...' : 'Hoàn tất và tiếp tục'}
                </button>
            </form>
        </div>
    );
};
