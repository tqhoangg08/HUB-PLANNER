import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    Eye,
    EyeOff,
    GraduationCap,
    Loader2,
    Lock,
    Mail,
    ShieldCheck,
    Sparkles
} from 'lucide-react';
import { playClick } from '../utils/audio';

const SCHOOL_DOMAIN = 'st.buh.edu.vn';

type LoginMode = 'student' | 'admin';

const easingClass = 'transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';

const GoogleIcon = () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.24.81-.6z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

const BrandMark = ({ compact = false }: { compact?: boolean }) => (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
        <div className={`${compact ? 'h-10 w-10' : 'h-12 w-12'} rounded-2xl bg-white/95 flex items-center justify-center border border-white/30 shadow-sm`}>
            <img
                src="/logo.png"
                alt="HUB Planner"
                className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} object-contain`}
                onError={(e) => {
                    e.currentTarget.style.display = 'none';
                }}
            />
        </div>
        <div>
            <p className="text-sm font-extrabold tracking-wide text-white">HUB PLANNER</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Hỗ trợ sinh viên</p>
        </div>
    </div>
);

const TermsCheckbox = ({
    checked,
    onChange,
    id
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    id: string;
}) => (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-1 text-left">
        <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <input
                id={id}
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                onChange={(e) => {
                    playClick();
                    onChange(e.target.checked);
                }}
            />
            <span className="h-5 w-5 rounded-md border-2 border-slate-300 bg-white transition-colors peer-checked:border-[#003B7A] peer-checked:bg-[#003B7A] peer-focus-visible:ring-4 peer-focus-visible:ring-[rgba(11,94,215,0.14)]" />
            <svg className={`pointer-events-none absolute h-3.5 w-3.5 text-white transition-transform ${checked ? 'scale-100' : 'scale-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
        </span>
        <span className="text-xs leading-5 text-slate-500">
            Tôi đồng ý với{' '}
            <Link to="/terms" onClick={(e) => e.stopPropagation()} className="font-semibold text-[#003B7A] hover:underline">
                Điều khoản sử dụng
            </Link>{' '}
            và{' '}
            <Link to="/privacy" onClick={(e) => e.stopPropagation()} className="font-semibold text-[#003B7A] hover:underline">
                Chính sách bảo mật
            </Link>
        </span>
    </label>
);

export const LoginScreen: React.FC = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState<LoginMode>('student');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agreed, setAgreed] = useState(false);

    const switchMode = (nextMode: LoginMode) => {
        if (mode === nextMode) return;
        playClick();
        setMode(nextMode);
        setError(null);
        setLoading(false);
    };

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreed) return;
        if (!supabase) return setError('Chưa cấu hình kết nối Database.');

        setLoading(true);
        setError(null);
        playClick();

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError('Email hoặc mật khẩu không chính xác.');
        else navigate('/');

        setLoading(false);
    };

    const handleGoogleLogin = async () => {
        if (!agreed) return;
        if (!supabase) return setError('Chưa cấu hình kết nối Database.');

        setLoading(true);
        setError(null);
        playClick();

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/dashboard`,
                queryParams: { hd: SCHOOL_DOMAIN, prompt: 'select_account' },
            },
        });

        if (error) {
            setError(error.message || `Vui lòng sử dụng email sinh viên có đuôi @${SCHOOL_DOMAIN}.`);
            setLoading(false);
        }
    };

    const panelTitle = mode === 'student' ? 'Xin chào sinh viên!' : 'Chào mừng quản trị viên!';
    const panelDescription = mode === 'student'
        ? 'Đăng nhập bằng tài khoản sinh viên HUB để tiếp tục sử dụng HUB Planner.'
        : 'Đăng nhập để quản lý thông báo, dữ liệu và các tiện ích hỗ trợ sinh viên.';

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-[#F6F8FB] text-[#0F172A]">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[rgba(11,94,215,0.08)] blur-3xl" />
                <div className="absolute -bottom-48 right-[-10rem] h-[28rem] w-[28rem] rounded-full bg-[rgba(0,59,122,0.08)] blur-3xl" />
            </div>

            <button
                type="button"
                onClick={() => {
                    playClick();
                    navigate('/');
                }}
                className="absolute left-4 top-4 z-30 inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5EAF1] bg-white/90 px-3 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:text-[#003B7A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.14)] sm:left-6 sm:top-6"
            >
                <ArrowLeft size={17} />
                <span className="hidden sm:inline">Về trang chủ</span>
            </button>

            <main className="relative z-10 flex h-[100dvh] w-full items-center justify-center px-4 py-14 sm:px-6">
                <section className={`auth-shell relative grid h-[min(620px,calc(100dvh-96px))] w-[min(1120px,calc(100vw-48px))] overflow-hidden rounded-[28px] border border-[#E5EAF1] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.10)] ${easingClass} animate-[authCardEnter_520ms_cubic-bezier(0.22,1,0.36,1)_both] md:grid-cols-[60%_40%]`}>
                    <div
                        className={`order-1 bg-gradient-to-br from-[#003B7A] via-[#003B7A] to-[#0B5ED7] p-6 text-white sm:p-8 md:absolute md:inset-y-4 md:left-4 md:z-20 md:w-[calc(40%-16px)] md:rounded-[22px] md:p-9 lg:p-10 ${easingClass} ${mode === 'student' ? 'md:translate-x-[calc(150%+24px)]' : 'md:translate-x-0'}`}
                    >
                        <div className="mx-auto flex h-full min-h-[220px] max-w-md flex-col justify-between gap-6 md:min-h-0">
                            <BrandMark />

                            <div className={`${easingClass} ${mode === 'admin' ? 'md:translate-x-1' : 'md:translate-x-0'}`}>
                                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-50">
                                    {mode === 'student' ? <GraduationCap size={14} /> : <ShieldCheck size={14} />}
                                    {mode === 'student' ? 'Sinh viên HUB' : 'Khu vực quản trị'}
                                </div>
                                <h1 className="max-w-sm text-[28px] font-extrabold leading-tight tracking-tight md:text-[32px]">
                                    {panelTitle}
                                </h1>
                                <p className="mt-3 max-w-[23rem] text-sm leading-6 text-blue-50/90 md:text-[15px]">
                                    {panelDescription}
                                </p>
                            </div>

                            <div>
                                <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-blue-50/90">
                                    <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                                        <Sparkles size={15} className="mb-2" />
                                        Theo dõi học tập
                                    </div>
                                    <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                                        <CheckCircle2 size={15} className="mb-2" />
                                        Tiện ích sinh viên
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => switchMode(mode === 'student' ? 'admin' : 'student')}
                                    className="inline-flex h-11 items-center justify-center rounded-xl border border-white/30 bg-white px-5 text-sm font-bold text-[#003B7A] transition-all hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
                                >
                                    {mode === 'student' ? 'Đăng nhập quản trị' : 'Quay lại sinh viên'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={`order-2 h-full items-center px-6 py-7 sm:px-10 md:absolute md:inset-y-0 md:left-0 md:flex md:w-[60%] md:px-12 md:py-8 lg:px-16 ${mode === 'student' ? 'flex' : 'hidden'} ${easingClass} ${mode === 'admin' ? 'md:pointer-events-none md:translate-x-[-18px] md:opacity-0' : 'md:pointer-events-auto md:translate-x-0 md:opacity-100'}`}>
                        <div className="mx-auto w-full max-w-md">
                            <div className="mb-6 text-center md:text-left">
                                <p className="text-sm font-semibold text-[#0B5ED7]">HUB Planner</p>
                                <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-slate-950 md:text-[32px]">Chào mừng trở lại</h2>
                                <p className="mt-2 text-sm leading-6 text-slate-500">Sử dụng tài khoản sinh viên HUB để tiếp tục.</p>
                            </div>

                            {mode === 'student' && error && (
                                <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-semibold text-[#DC2626]">
                                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="mb-5 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 text-sm text-slate-600">
                                <CheckCircle2 className="mt-0.5 shrink-0 text-[#0B5ED7]" size={18} />
                                <span>Chỉ hỗ trợ email sinh viên có đuôi <strong className="font-bold text-[#003B7A]">@{SCHOOL_DOMAIN}</strong></span>
                            </div>

                            <TermsCheckbox checked={agreed} onChange={setAgreed} id="student-terms" />

                            <button
                                type="button"
                                onClick={handleGoogleLogin}
                                disabled={loading || !agreed || mode !== 'student'}
                                className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-slate-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.14)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:hover:translate-y-0"
                            >
                                {loading && mode === 'student' ? <Loader2 className="animate-spin" size={18} /> : <GoogleIcon />}
                                {loading && mode === 'student' ? 'Đang kết nối...' : 'Tiếp tục với Google'}
                            </button>

                            <p className="mt-5 text-center text-sm text-slate-500">
                                Bạn là quản trị viên?{' '}
                                <button type="button" onClick={() => switchMode('admin')} className="font-bold text-[#003B7A] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.14)]">
                                    Đăng nhập tại đây
                                </button>
                            </p>
                        </div>
                    </div>

                    <div className={`order-3 h-full items-center px-6 py-7 sm:px-10 md:absolute md:inset-y-0 md:right-0 md:flex md:w-[60%] md:px-12 md:py-8 lg:px-16 ${mode === 'admin' ? 'flex' : 'hidden'} ${easingClass} ${mode === 'admin' ? 'md:pointer-events-auto md:translate-x-0 md:opacity-100' : 'md:pointer-events-none md:translate-x-[18px] md:opacity-0'}`}>
                        <form onSubmit={handleAdminLogin} className="mx-auto w-full max-w-md">
                            <div className="mb-6 text-center md:text-left">
                                <p className="text-sm font-semibold text-[#0B5ED7]">Khu vực quản trị</p>
                                <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-slate-950 md:text-[32px]">Đăng nhập quản trị</h2>
                                <p className="mt-2 text-sm leading-6 text-slate-500">Dành cho cán bộ và quản trị viên hệ thống HUB Planner.</p>
                            </div>

                            {mode === 'admin' && error && (
                                <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-semibold text-[#DC2626]">
                                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="admin-email" className="mb-1.5 block text-sm font-semibold text-slate-700">Email quản trị</label>
                                    <div className="relative">
                                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input
                                            id="admin-email"
                                            type="email"
                                            required
                                            placeholder="admin@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="h-12 w-full rounded-xl border border-[#E5EAF1] bg-white pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0B5ED7] focus:ring-4 focus:ring-[rgba(11,94,215,0.14)]"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="admin-password" className="mb-1.5 block text-sm font-semibold text-slate-700">Mật khẩu</label>
                                    <div className="relative">
                                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input
                                            id="admin-password"
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            placeholder="Nhập mật khẩu"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="h-12 w-full rounded-xl border border-[#E5EAF1] bg-white pl-10 pr-11 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0B5ED7] focus:ring-4 focus:ring-[rgba(11,94,215,0.14)]"
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
                            </div>

                            <div className="mt-4">
                                <TermsCheckbox checked={agreed} onChange={setAgreed} id="admin-terms" />
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !agreed || mode !== 'admin'}
                                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#003B7A] px-4 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#002F61] hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.18)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white disabled:shadow-none disabled:hover:translate-y-0"
                            >
                                {loading && mode === 'admin' ? <Loader2 className="animate-spin" size={18} /> : null}
                                {loading && mode === 'admin' ? 'Đang đăng nhập...' : 'Đăng nhập'}
                            </button>

                            <p className="mt-5 text-center text-sm text-slate-500">
                                <button type="button" onClick={() => switchMode('student')} className="font-bold text-[#003B7A] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.14)]">
                                    Quay lại đăng nhập sinh viên
                                </button>
                            </p>
                        </form>
                    </div>
                </section>
            </main>

            <style>{`
                @keyframes authCardEnter {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @media (max-width: 767px) {
                    .auth-shell {
                        width: calc(100vw - 32px);
                        height: calc(100dvh - 88px);
                        min-height: 0;
                        overflow-y: auto;
                    }
                }
            `}</style>
        </div>
    );
};
