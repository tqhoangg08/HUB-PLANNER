import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    CalendarDays,
    Clock3,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    Mail,
    Target,
    UserRound,
} from 'lucide-react';
import { playClick } from '../utils/audio';
import { apiUrl } from '../utils/api';
import { Turnstile } from '@marsidev/react-turnstile';
const SCHOOL_DOMAIN = 'st.buh.edu.vn';
const OTP_RESEND_COOLDOWN_SECONDS = 10 * 60;

type AuthFlow = 'login' | 'register';
type OtpState = {
    email: string;
    purpose: 'register' | 'forgot_password';
} | null;

const GoogleIcon = () => (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.24.81-.6z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

const normalizeHubEmail = (value: string) => value.trim().toLowerCase();

const isHubEmail = (value: string) => normalizeHubEmail(value).endsWith(`@${SCHOOL_DOMAIN}`);

const otpCooldownKey = (email: string, purpose: 'register' | 'forgot_password') =>
    `hubplanner:otp-cooldown:${purpose}:${normalizeHubEmail(email)}`;

const getStoredOtpCooldown = (email: string, purpose: 'register' | 'forgot_password') => {
    const until = Number(localStorage.getItem(otpCooldownKey(email, purpose)) || 0);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
};

const storeOtpCooldown = (email: string, purpose: 'register' | 'forgot_password', seconds = OTP_RESEND_COOLDOWN_SECONDS) => {
    localStorage.setItem(otpCooldownKey(email, purpose), String(Date.now() + seconds * 1000));
};

const formatOtpCooldown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const passwordError = (password: string, confirm?: string) => {
    if (password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.';
    if (confirm !== undefined && password !== confirm) return 'Hai mật khẩu chưa trùng khớp.';
    return null;
};

export const LoginScreen: React.FC = () => {
    const navigate = useNavigate();
    const [flow, setFlow] = useState<AuthFlow>('login');
    const [identifier, setIdentifier] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [registerEmail, setRegisterEmail] = useState('');
    const [registerPassword, setRegisterPassword] = useState('');
    const [registerConfirm, setRegisterConfirm] = useState('');
    const [recoveryPassword, setRecoveryPassword] = useState('');
    const [recoveryConfirm, setRecoveryConfirm] = useState('');
    const [otp, setOtp] = useState('');
    const [otpState, setOtpState] = useState<OtpState>(null);
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showRegisterPassword, setShowRegisterPassword] = useState(false);
    const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [agreed, setAgreed] = useState(false);
    const [otpCooldownRemaining, setOtpCooldownRemaining] = useState(0);
    const [captchaToken, setCaptchaToken] = useState('');
    useEffect(() => {
        if (!supabase) return;

        const urlLooksLikeRecovery =
            window.location.hash.includes('type=recovery') ||
            window.location.search.includes('type=recovery');
        if (urlLooksLikeRecovery) {
            setIsRecoveryMode(true);
            setFlow('login');
            setNotice('Nhập mật khẩu mới để hoàn tất đặt lại tài khoản.');
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setIsRecoveryMode(true);
                setFlow('login');
                setNotice('Nhập mật khẩu mới để hoàn tất đặt lại tài khoản.');
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!otpState) {
            setOtpCooldownRemaining(0);
            return;
        }

        const syncCooldown = () => {
            setOtpCooldownRemaining(getStoredOtpCooldown(otpState.email, otpState.purpose));
        };

        syncCooldown();
        const timer = window.setInterval(syncCooldown, 1000);
        return () => window.clearInterval(timer);
    }, [otpState?.email, otpState?.purpose]);

    const switchFlow = (nextFlow: AuthFlow) => {
        if (flow === nextFlow) return;
        playClick();
        setFlow(nextFlow);
        setError(null);
        setNotice(null);
        setOtpState(null);
        setOtp('');
        setIsRecoveryMode(false);
    };

    const handleGoogleLogin = async () => {
        if (flow === 'register' && !agreed) {
            setError('Bạn cần đồng ý điều khoản trước khi tiếp tục.');
            return;
        }
        if (!supabase) return setError('Chưa cấu hình kết nối Database.');

        setGoogleLoading(true);
        setError(null);
        setNotice(null);
        playClick();

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/dashboard`,
                queryParams: { hd: SCHOOL_DOMAIN, prompt: 'select_account' },
            },
        });

        if (error) {
            setError(error.message || `Vui lòng dùng email sinh viên có đuôi @${SCHOOL_DOMAIN}.`);
            setGoogleLoading(false);
        }
    };

    const resolveLoginEmail = async (rawIdentifier: string) => {
        const value = rawIdentifier.trim();
        if (!value) throw new Error('Nhập MSSV hoặc Gmail HUB của bạn.');

        if (value.includes('@')) {
            const email = normalizeHubEmail(value);
            return email;
        }

        const response = await fetch(apiUrl('/auth'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'resolve-identifier', identifier: value }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.email) {
            throw new Error(payload.error || 'Không tìm thấy MSSV này. Hãy đăng nhập Google HUB một lần hoặc dùng Gmail HUB.');
        }
        return payload.email as string;
    };

    const sendOtpCode = async (email: string, purpose: 'register' | 'forgot_password') => {
        const storedCooldown = getStoredOtpCooldown(email, purpose);
        if (storedCooldown > 0) {
            setOtpState({ email, purpose });
            setOtpCooldownRemaining(storedCooldown);
            setNotice(`Mã OTP đã được gửi. Bạn có thể gửi lại sau ${formatOtpCooldown(storedCooldown)}.`);
            return false;
        }

        const response = await fetch(apiUrl('/auth'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'send-otp', purpose, email }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 429 && payload.retryAfterSeconds) {
                const retryAfterSeconds = Number(payload.retryAfterSeconds);
                storeOtpCooldown(email, purpose, retryAfterSeconds);
                setOtpState({ email, purpose });
                setOtpCooldownRemaining(retryAfterSeconds);
                setNotice(`Mã OTP đã được gửi. Bạn có thể gửi lại sau ${formatOtpCooldown(retryAfterSeconds)}.`);
                return false;
            }
            throw new Error(payload.error || 'Không thể gửi mã OTP.');
        }

        const cooldownSeconds = Number(payload.retryAfterSeconds || payload.expiresInSeconds || OTP_RESEND_COOLDOWN_SECONDS);
        storeOtpCooldown(email, purpose, cooldownSeconds);
        setOtpCooldownRemaining(cooldownSeconds);
        return true;
    };

    const handlePasswordLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!supabase) return setError('Chưa cấu hình kết nối Database.');

        setLoading(true);
        setError(null);
        setNotice(null);
        playClick();

        try {
            const email = await resolveLoginEmail(identifier);
                        // Chặn nếu chưa xác minh CAPTCHA
            if (!captchaToken) throw new Error('Vui lòng xác minh bạn không phải robot.');
                        // Bắn token lên cho Supabase kiểm tra
            const { error } = await supabase.auth.signInWithPassword({ 
                email, 
                password: loginPassword,
                options: { captchaToken } 
            });
            
            if (error) throw new Error('MSSV/Gmail HUB hoặc mật khẩu không chính xác.');
            navigate('/dashboard', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Đăng nhập thất bại.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        setLoading(true);
        setError(null);
        setNotice(null);
        playClick();

        try {
            const email = await resolveLoginEmail(identifier);
            const sent = await sendOtpCode(email, 'forgot_password');
            setOtpState({ email, purpose: 'forgot_password' });
            setOtp('');
            setRecoveryPassword('');
            setRecoveryConfirm('');
            if (sent) setNotice(`Mã OTP đặt lại mật khẩu đã được gửi đến ${email}.`);
        } catch (err: any) {
            setError(err.message || 'Không thể gửi mã OTP đặt lại mật khẩu.');
        } finally {
            setLoading(false);
        }
    };

    const handleRecoveryPasswordUpdate = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!supabase) return setError('Chưa cấu hình kết nối Database.');

        const invalidPassword = passwordError(recoveryPassword, recoveryConfirm);
        if (invalidPassword) return setError(invalidPassword);

        setLoading(true);
        setError(null);
        playClick();

        try {
            const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
            if (error) throw error;
            try {
                await supabase.rpc('mark_password_set');
            } catch {
                // Best effort: migration may not be applied in older environments yet.
            }
            navigate('/dashboard', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Không thể cập nhật mật khẩu mới.');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!agreed) return setError('B\u1ea1n c\u1ea7n \u0111\u1ed3ng \u00fd \u0110i\u1ec1u kho\u1ea3n tr\u01b0\u1edbc khi \u0111\u0103ng k\u00fd.');

        const email = normalizeHubEmail(registerEmail);
        if (!isHubEmail(email)) return setError(`Email \u0111\u0103ng k\u00fd ph\u1ea3i c\u00f3 \u0111u\u00f4i @${SCHOOL_DOMAIN}.`);

        const invalidPassword = passwordError(registerPassword, registerConfirm);
        if (invalidPassword) return setError(invalidPassword);

        setLoading(true);
        setError(null);
        setNotice(null);
        playClick();

        try {
            const sent = await sendOtpCode(email, 'register');
            setOtpState({ email, purpose: 'register' });
            setOtp('');
            if (sent) setNotice(`Mã OTP đăng ký đã được gửi đến ${email}. Nhập mã để hoàn tất đăng ký.`);
        } catch (err: any) {
            const message = err.message?.includes('\u0111\u00e3 \u0111\u01b0\u1ee3c \u0111\u0103ng k\u00fd') || err.message?.includes('already')
                ? 'Email n\u00e0y \u0111\u00e3 \u0111\u01b0\u1ee3c \u0111\u0103ng k\u00fd. H\u00e3y chuy\u1ec3n sang \u0111\u0103ng nh\u1eadp.'
                : err.message || 'Kh\u00f4ng th\u1ec3 g\u1eedi m\u00e3 OTP \u0111\u0103ng k\u00fd l\u00fac n\u00e0y.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!otpState) return;

        setLoading(true);
        setError(null);
        playClick();

        try {
            const isForgotPassword = otpState.purpose === 'forgot_password';
            const password = isForgotPassword ? recoveryPassword : registerPassword;
            const confirmPassword = isForgotPassword ? recoveryConfirm : registerConfirm;
            const invalidPassword = passwordError(password, confirmPassword);
            if (invalidPassword) throw new Error(invalidPassword);

            const response = await fetch(apiUrl('/auth'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'verify-otp',
                    purpose: otpState.purpose,
                    email: otpState.email,
                    otp,
                    password,
                    confirmPassword,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'M\u00e3 OTP kh\u00f4ng ch\u00ednh x\u00e1c ho\u1eb7c \u0111\u00e3 h\u1ebft h\u1ea1n.');

            localStorage.removeItem(otpCooldownKey(otpState.email, otpState.purpose));
            setOtpCooldownRemaining(0);

            if (isForgotPassword) {
                setFlow('login');
                setOtpState(null);
                setOtp('');
                setRecoveryPassword('');
                setRecoveryConfirm('');
                setLoginPassword('');
                setNotice('\u0110\u00e3 c\u1eadp nh\u1eadt m\u1eadt kh\u1ea9u. B\u1ea1n c\u00f3 th\u1ec3 \u0111\u0103ng nh\u1eadp b\u1eb1ng m\u1eadt kh\u1ea9u m\u1edbi.');
                return;
            }

            if (!supabase) throw new Error('Ch\u01b0a c\u1ea5u h\u00ecnh k\u1ebft n\u1ed1i Database.');
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: otpState.email,
                password: registerPassword,
            });
            if (signInError) throw new Error('T\u00e0i kho\u1ea3n \u0111\u00e3 t\u1ea1o xong. Vui l\u00f2ng \u0111\u0103ng nh\u1eadp b\u1eb1ng m\u1eadt kh\u1ea9u v\u1eeba \u0111\u1eb7t.');
            navigate('/dashboard', { replace: true });
        } catch (err: any) {
            setError(err.message || 'M\u00e3 OTP kh\u00f4ng ch\u00ednh x\u00e1c ho\u1eb7c \u0111\u00e3 h\u1ebft h\u1ea1n.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (!otpState || otpCooldownRemaining > 0) return;

        setLoading(true);
        setError(null);
        setNotice(null);
        playClick();

        try {
            const sent = await sendOtpCode(otpState.email, otpState.purpose);
            if (sent) {
                setOtp('');
                setNotice(`Mã OTP mới đã được gửi đến ${otpState.email}.`);
            }
        } catch (err: any) {
            setError(err.message || 'Không thể gửi lại mã OTP.');
        } finally {
            setLoading(false);
        }
    };

    const renderPasswordInput = (
        id: string,
        value: string,
        onChange: (value: string) => void,
        visible: boolean,
        setVisible: (value: boolean) => void,
        placeholder = 'Nhập mật khẩu'
    ) => (
        <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
                id={id}
                type={visible ? 'text' : 'password'}
                required
                minLength={8}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-11 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0B5ED7] focus:ring-4 focus:ring-[rgba(11,94,215,0.12)]"
            />
            <button
                type="button"
                onClick={() => setVisible(!visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:text-[#003B7A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.14)]"
                aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
        </div>
    );

    return (
        <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#F7F9FC] text-slate-950 lg:h-[100dvh] lg:overflow-hidden">
            <button
                type="button"
                onClick={() => {
                    playClick();
                    navigate('/');
                }}
                className="fixed left-4 top-4 z-30 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:text-[#003B7A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.14)] sm:left-6 sm:top-6"
            >
                <ArrowLeft size={17} />
                <span className="hidden sm:inline">Về trang chủ</span>
            </button>

            <main className="mx-auto flex min-h-[100dvh] w-full items-center justify-center px-4 pb-6 pt-16 sm:px-6 lg:h-[100dvh] lg:min-h-0 lg:py-6">
                <div className="w-full max-w-[500px] lg:grid lg:h-[min(700px,calc(100dvh-96px))] lg:max-w-6xl lg:grid-cols-[0.95fr_1.05fr] lg:overflow-hidden lg:rounded-[28px] lg:bg-white lg:shadow-[0_28px_70px_rgba(15,23,42,0.12)] lg:ring-1 lg:ring-slate-200/80">
                <section className="hidden h-full min-h-0 flex-col justify-between overflow-hidden bg-[#003B7A] p-6 text-white lg:flex lg:rounded-l-[28px]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
                            <img src="/logo.png" alt="HUB Planner" className="h-9 w-9 object-contain" />
                        </div>
                        <div>
                            <p className="text-sm font-black tracking-normal">HUB PLANNER</p>
                            <p className="text-xs font-semibold text-blue-100">Công cụ lập kế hoạch cho sinh viên HUB</p>
                        </div>
                    </div>

                    <div className="py-5">
                        <h1 className="max-w-md text-[27px] font-extrabold leading-tight tracking-normal">
                            Quản lý lịch học, deadline và kế hoạch cá nhân tại một nơi.
                        </h1>
                        <p className="mt-4 max-w-md text-sm leading-6 text-blue-50/90">
                            Đăng nhập bằng Gmail HUB hoặc dùng MSSV/Gmail HUB với mật khẩu riêng để theo dõi lịch học, deadline và kế hoạch học kỳ của bạn.
                        </p>
                    </div>

                    <div className="rounded-[22px] border border-white/16 bg-white/[0.08] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.12)]">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-normal text-blue-100">Tuần này</p>
                                <p className="mt-1 text-lg font-black">4 việc cần nhớ</p>
                            </div>
                            <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#003B7A]">HK2</div>
                        </div>
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-900">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#003B7A]">
                                    <CalendarDays size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black">Marketing căn bản</p>
                                <p className="text-xs font-semibold text-slate-500">Phòng B203 - 07:00</p>
                                </div>
                                <Clock3 className="text-slate-300" size={18} />
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <div className="rounded-2xl bg-white/12 p-3">
                                    <Target size={16} className="mb-2 text-blue-100" />
                                    <p className="text-xs font-bold text-blue-50">Deadline</p>
                                    <p className="mt-1 text-lg font-black">2 bài</p>
                                </div>
                                <div className="rounded-2xl bg-white/12 p-3">
                                    <BookOpen size={16} className="mb-2 text-blue-100" />
                                    <p className="text-xs font-bold text-blue-50">HK2</p>
                                    <p className="mt-1 text-lg font-black">18 TC</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {['Đăng ký môn', 'Lịch học', 'Ghi chú'].map((item) => (
                                    <span key={item} className="rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold text-blue-50">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mx-auto flex w-full max-w-[500px] flex-col rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-6 lg:mx-0 lg:h-full lg:min-h-0 lg:max-w-none lg:overflow-y-auto lg:rounded-none lg:rounded-r-[28px] lg:border-0 lg:border-l lg:border-slate-200 lg:p-6 lg:shadow-none">
                    <div className="mb-4 flex items-center gap-3 lg:hidden">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
                            <img src="/logo.png" alt="HUB Planner" className="h-8 w-8 object-contain" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-[#003B7A]">HUB Planner</p>
                            <p className="text-xs font-semibold text-slate-500">Tài khoản sinh viên HUB</p>
                        </div>
                    </div>

                    <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-50 p-1 ring-1 ring-slate-100">
                        <button
                            type="button"
                            onClick={() => switchFlow('login')}
                            className={`h-9 rounded-lg text-sm font-semibold transition-all ${flow === 'login' ? 'bg-white text-[#003B7A] shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'text-slate-500'}`}
                        >
                            Đăng nhập
                        </button>
                        <button
                            type="button"
                            onClick={() => switchFlow('register')}
                            className={`h-9 rounded-lg text-sm font-semibold transition-all ${flow === 'register' ? 'bg-white text-[#003B7A] shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'text-slate-500'}`}
                        >
                            Đăng ký
                        </button>
                    </div>

                    <div className="mb-4">
                        <h2 className="text-2xl font-black tracking-normal text-slate-950 sm:text-[28px]">
                            {isRecoveryMode ? '\u0110\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u' : otpState ? 'X\u00e1c nh\u1eadn OTP' : flow === 'login' ? 'Ch\u00e0o m\u1eebng tr\u1edf l\u1ea1i' : 'T\u1ea1o t\u00e0i kho\u1ea3n HUB'}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                            {isRecoveryMode
                                ? 'Tạo mật khẩu mới cho tài khoản HUB Planner của bạn.'
                                : otpState
                                ? (otpState.purpose === 'forgot_password' ? 'Nh\u1eadp m\u00e3 OTP v\u00e0 m\u1eadt kh\u1ea9u m\u1edbi \u0111\u1ec3 \u0111\u1eb7t l\u1ea1i t\u00e0i kho\u1ea3n.' : 'Nh\u1eadp m\u00e3 x\u00e1c nh\u1eadn trong email tr\u01b0\u1eddng \u0111\u1ec3 ho\u00e0n t\u1ea5t \u0111\u0103ng k\u00fd.')
                                : flow === 'login'
                                    ? '\u0110\u0103ng nh\u1eadp b\u1eb1ng Google ho\u1eb7c MSSV/Gmail HUB v\u00e0 m\u1eadt kh\u1ea9u.'
                                    : `Chỉ dùng Gmail sinh viên có đuôi @${SCHOOL_DOMAIN}.`}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-bold text-red-700">
                            <AlertCircle size={18} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                    {notice && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-semibold text-[#003B7A]">
                            <Mail size={18} className="mt-0.5 shrink-0" />
                            <span>{notice}</span>
                        </div>
                    )}

                    {isRecoveryMode ? (
                        <form onSubmit={handleRecoveryPasswordUpdate} className="space-y-3">
                            <div>
                                <label htmlFor="recovery-password" className="mb-1.5 block text-sm font-bold text-slate-700">Mật khẩu mới</label>
                                {renderPasswordInput('recovery-password', recoveryPassword, setRecoveryPassword, showRecoveryPassword, setShowRecoveryPassword, 'Nhập mật khẩu mới')}
                            </div>

                            <div>
                                <label htmlFor="recovery-confirm" className="mb-1.5 block text-sm font-bold text-slate-700">Nhập lại mật khẩu</label>
                                {renderPasswordInput('recovery-confirm', recoveryConfirm, setRecoveryConfirm, showRecoveryPassword, setShowRecoveryPassword, 'Nhập lại mật khẩu mới')}
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003B7A] px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#002F61] disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                                {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                            </button>
                        </form>
                    ) : flow === 'login' && !otpState ? (
                        <form onSubmit={handlePasswordLogin} className="space-y-3">
                            <div>
                                <label htmlFor="login-identifier" className="mb-1.5 block text-sm font-bold text-slate-700">Tài khoản</label>
                                <div className="relative">
                                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        id="login-identifier"
                                        type="text"
                                        required
                                        placeholder={`MSSV hoặc Gmail HUB`}
                                        value={identifier}
                                        onChange={(e) => setIdentifier(e.target.value)}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0B5ED7] focus:ring-4 focus:ring-[rgba(11,94,215,0.12)]"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="mb-1.5 flex items-center justify-between gap-3">
                                    <label htmlFor="login-password" className="block text-sm font-bold text-slate-700">Mật khẩu</label>
                                    <button
                                        type="button"
                                        onClick={handleForgotPassword}
                                        disabled={loading || googleLoading}
                                        className="text-xs font-black text-[#003B7A] transition-colors hover:text-[#002F61] hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                                    >
                                        Quên mật khẩu?
                                    </button>
                                </div>
                                {renderPasswordInput('login-password', loginPassword, setLoginPassword, showLoginPassword, setShowLoginPassword)}
                            </div>

                            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-xs leading-5 text-slate-600">
                                Nếu trước đây bạn chỉ đăng nhập Google, hệ thống có thể yêu cầu đặt mật khẩu riêng để đăng nhập nhanh bằng MSSV/Gmail ở lần sau.
                            </div>
                        <div className="flex justify-center py-2">
                                <Turnstile
                                    siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                                    onSuccess={(token) => setCaptchaToken(token)}
                                    onError={() => setCaptchaToken('')}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading || googleLoading}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003B7A] px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#002F61] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.18)] disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                            </button>
                        </form>
                    ) : otpState ? (
                        <form onSubmit={handleVerifyOtp} className="space-y-3">
                            <div>
                                <label htmlFor="register-otp" className="mb-1.5 block text-sm font-bold text-slate-700">Mã OTP</label>
                                <input
                                    id="register-otp"
                                    type="text"
                                    inputMode="numeric"
                                    required
                                    maxLength={6}
                                    placeholder="Nhập 6 chữ số"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-2xl font-black tracking-normal text-[#003B7A] outline-none transition-all placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#0B5ED7] focus:ring-4 focus:ring-[rgba(11,94,215,0.12)]"
                                />
                            </div>
                            {otpState?.purpose === 'forgot_password' && (
                                <>
                                    <div>
                                        <label htmlFor="forgot-password-new" className="mb-1.5 block text-sm font-bold text-slate-700">{'M\u1eadt kh\u1ea9u m\u1edbi'}</label>
                                        {renderPasswordInput('forgot-password-new', recoveryPassword, setRecoveryPassword, showRecoveryPassword, setShowRecoveryPassword, 'Nh\u1eadp m\u1eadt kh\u1ea9u m\u1edbi')}
                                    </div>
                                    <div>
                                        <label htmlFor="forgot-password-confirm" className="mb-1.5 block text-sm font-bold text-slate-700">{'Nh\u1eadp l\u1ea1i m\u1eadt kh\u1ea9u m\u1edbi'}</label>
                                        {renderPasswordInput('forgot-password-confirm', recoveryConfirm, setRecoveryConfirm, showRecoveryPassword, setShowRecoveryPassword, 'Nh\u1eadp l\u1ea1i m\u1eadt kh\u1ea9u m\u1edbi')}
                                    </div>
                                </>
                            )}
                            <button
                                type="submit"
                                disabled={loading || otp.length !== 6}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003B7A] px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#002F61] disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                                {otpState?.purpose === 'forgot_password' ? 'C\u1eadp nh\u1eadt m\u1eadt kh\u1ea9u' : 'X\u00e1c nh\u1eadn \u0111\u0103ng k\u00fd'}
                            </button>
                            <button
                                type="button"
                                onClick={handleResendOtp}
                                disabled={loading || otpCooldownRemaining > 0}
                                className="h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-bold text-[#003B7A] transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            >
                                {otpCooldownRemaining > 0 ? `Gửi lại mã sau ${formatOtpCooldown(otpCooldownRemaining)}` : 'Gửi lại mã OTP'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setOtpState(null);
                                    setOtp('');
                                    setNotice(null);
                                }}
                                className="h-11 w-full rounded-xl text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
                            >
                                {otpState?.purpose === 'forgot_password' ? 'Quay l\u1ea1i \u0111\u0103ng nh\u1eadp' : 'Quay l\u1ea1i ch\u1ec9nh email'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-3">
                            <div>
                                <label htmlFor="register-email" className="mb-1.5 block text-sm font-bold text-slate-700">Tài khoản</label>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        id="register-email"
                                        type="email"
                                        required
                                        placeholder={`MSSV@${SCHOOL_DOMAIN}`}
                                        value={registerEmail}
                                        onChange={(e) => setRegisterEmail(e.target.value)}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0B5ED7] focus:ring-4 focus:ring-[rgba(11,94,215,0.12)]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="register-password" className="mb-1.5 block text-sm font-bold text-slate-700">Mật khẩu</label>
                                {renderPasswordInput('register-password', registerPassword, setRegisterPassword, showRegisterPassword, setShowRegisterPassword)}
                            </div>

                            <div>
                                <label htmlFor="register-confirm" className="mb-1.5 block text-sm font-bold text-slate-700">Nhập lại mật khẩu</label>
                                {renderPasswordInput('register-confirm', registerConfirm, setRegisterConfirm, showRegisterPassword, setShowRegisterPassword, 'Nhập lại mật khẩu')}
                            </div>

                            <label className="flex cursor-pointer items-start gap-3 text-left">
                                <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                                    <input
                                        type="checkbox"
                                        className="peer sr-only"
                                        checked={agreed}
                                        onChange={(e) => {
                                            playClick();
                                            setAgreed(e.target.checked);
                                        }}
                                    />
                                    <span className="h-5 w-5 rounded-md border-2 border-slate-300 bg-white transition-colors peer-checked:border-[#003B7A] peer-checked:bg-[#003B7A]" />
                                    <svg className={`pointer-events-none absolute h-3.5 w-3.5 text-white transition-transform ${agreed ? 'scale-100' : 'scale-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </span>
                                <span className="text-xs leading-5 text-slate-500">
                                    Tôi đồng ý với{' '}
                                    <Link to="/terms" onClick={(e) => e.stopPropagation()} className="font-semibold text-[#003B7A] hover:underline">
                                        Điều khoản
                                    </Link>{' '}
                                    và{' '}
                                    <Link to="/privacy" onClick={(e) => e.stopPropagation()} className="font-semibold text-[#003B7A] hover:underline">
                                        Chính sách bảo mật
                                    </Link>
                                </span>
                            </label>
                            {!agreed && (
                                <p className="-mt-2 text-xs font-semibold text-slate-500">
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={loading || googleLoading || !agreed}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003B7A] px-4 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#002F61] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.18)] disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                                {loading ? 'Đang gửi OTP...' : 'Đăng ký'}
                            </button>
                        </form>
                    )}

                    {!isRecoveryMode && !otpState && (
                        <div className="mt-4">
                            <div className="mb-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-normal text-slate-400">
                                <span className="h-px flex-1 bg-slate-200" />
                                hoặc
                                <span className="h-px flex-1 bg-slate-200" />
                            </div>

                            <button
                                type="button"
                                onClick={handleGoogleLogin}
                                disabled={googleLoading || loading || (flow === 'register' && !agreed)}
                                className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:border-blue-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(11,94,215,0.14)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            >
                                {googleLoading ? <Loader2 className="animate-spin" size={18} /> : <GoogleIcon />}
                                {googleLoading ? 'Đang kết nối...' : flow === 'login' ? 'Đăng nhập bằng Google HUB' : 'Đăng ký bằng Google HUB'}
                            </button>

                            {flow === 'login' && (
                                <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                                    Bằng việc đăng nhập, bạn đồng ý với{' '}
                                    <Link to="/terms" className="font-semibold text-[#003B7A] hover:underline">Điều khoản</Link>
                                    {' '}và{' '}
                                    <Link to="/privacy" className="font-semibold text-[#003B7A] hover:underline">Chính sách bảo mật</Link>.
                                </p>
                            )}
                        </div>
                    )}
                </section>
                </div>
            </main>
        </div>
    );
};
