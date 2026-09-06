import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Turnstile } from '@marsidev/react-turnstile';
import {
  AlertCircle, ArrowLeft, BookOpen, CalendarDays, Clock3, Eye, EyeOff,
  Loader2, Lock, Mail, ShieldCheck, Target, UserRound,
} from 'lucide-react';
import { playClick } from '../utils/audio';
import { TURNSTILE_SITE_KEY } from '../utils/turnstileConfig';
import type { AuthRefresh } from '../hooks/useUserRole';
import { getRecoverySession } from '../app/auth/recoveryAuthClient';
import {
  beginGoogleStudentAuth,
  getRegistrationStatus,
  resendStudentSignup,
  signInWithLoginDispatch,
  startStudentSignup,
  studentAuthMessage,
  verifyStudentSignup,
} from '../app/auth/studentAuthClient';

type Flow = 'login' | 'register';
const SCHOOL_DOMAIN = 'st.buh.edu.vn';

interface LoginScreenProps {
  onRefreshAuth?: AuthRefresh;
}

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.24.81-.6z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const validatePassword = (value: string, confirmation?: string) => {
  if (value.length < 12) return 'Mật khẩu cần ít nhất 12 ký tự.';
  if (confirmation !== undefined && value !== confirmation) return 'Hai mật khẩu chưa trùng khớp.';
  return '';
};

export const LoginScreen: React.FC<LoginScreenProps> = ({ onRefreshAuth }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [flow, setFlow] = useState<Flow>(params.get('tab') === 'register' ? 'register' : 'login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [otpPending, setOtpPending] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<'form' | 'google' | 'resend' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [token, setToken] = useState('');
  const [googleToken, setGoogleToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [googleTurnstileKey, setGoogleTurnstileKey] = useState(0);
  const siteKey = TURNSTILE_SITE_KEY;
  const action = otpPending ? 'verify_email' : flow === 'login' ? 'login' : 'signup';

  const resetChallenge = () => {
    setToken('');
    setTurnstileKey((value) => value + 1);
  };

  const resetGoogleChallenge = () => {
    setGoogleToken('');
    setGoogleTurnstileKey((value) => value + 1);
  };

  useEffect(() => {
    let current = true;
    getRecoverySession().then(async (session) => {
      if (!current || !session.authenticated) return;
      try {
        const registration = await getRegistrationStatus();
        navigate(registration.pending ? '/complete-registration' : '/dashboard', { replace: true });
      } catch {
        navigate('/dashboard', { replace: true });
      }
    }).catch(() => undefined);
    return () => { current = false; };
  }, [navigate]);

  useEffect(() => {
    const oauth = params.get('oauth');
    if (!oauth) return;
    if (oauth.startsWith('signup')) {
      setFlow('login');
      setError('Tài khoản đã được đăng ký. Vui lòng đăng nhập.');
    } else {
      setFlow('register');
      setError('Tài khoản này chưa được đăng ký trên HUB Planner. Vui lòng chuyển sang Đăng ký để tạo tài khoản.');
    }
  }, [params]);

  const switchFlow = (next: Flow) => {
    playClick();
    setFlow(next); setOtpPending(false); setOtp(''); setError(''); setNotice(''); resetChallenge(); resetGoogleChallenge();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setNotice(''); playClick();
    if (!token) return setError('Vui lòng hoàn tất bước xác minh bảo mật.');
    if (flow === 'register' && !agreed) return setError('Bạn cần đồng ý Điều khoản trước khi đăng ký.');
    setBusy('form');
    try {
      if (flow === 'login') {
        await signInWithLoginDispatch(identifier, password, token);
        const identity = await onRefreshAuth?.({ preserveStateOnError: true });
        if (!identity?.current || !identity.authenticated) {
          throw new Error('Đăng nhập thành công nhưng chưa thể đồng bộ tài khoản. Vui lòng thử lại.');
        }
        navigate('/dashboard', { replace: true });
      } else if (!otpPending) {
        const invalid = validatePassword(password, confirm);
        if (invalid) throw new Error(invalid);
        await startStudentSignup(identifier, password, token);
        setOtpPending(true);
        setNotice('Mã OTP đã được gửi đến email sinh viên của bạn.');
        resetChallenge();
      } else {
        await verifyStudentSignup(identifier, otp, token);
        setFlow('login'); setOtpPending(false); setOtp(''); setConfirm(''); setPassword('');
        setNotice('Đăng ký thành công. Bạn có thể đăng nhập bằng MSSV và mật khẩu vừa tạo.');
        resetChallenge(); resetGoogleChallenge();
      }
    } catch (reason) {
      setError(reason instanceof Error && !(reason as { kind?: unknown }).kind ? reason.message : studentAuthMessage(reason));
      resetChallenge();
    } finally { setBusy(null); }
  };

  const google = async () => {
    if (!googleToken) return setError('Vui lòng hoàn tất bước xác minh bảo mật cho Google HUB.');
    if (flow === 'register' && !agreed) return setError('Bạn cần đồng ý Điều khoản trước khi đăng ký.');
    setBusy('google'); setError(''); playClick();
    try { window.location.assign(await beginGoogleStudentAuth(flow === 'login' ? 'login' : 'signup', googleToken)); }
    catch (reason) { setError(studentAuthMessage(reason)); setBusy(null); resetGoogleChallenge(); }
  };

  const resend = async () => {
    if (!token) return setError('Vui lòng hoàn tất bước xác minh bảo mật.');
    setBusy('resend'); setError('');
    try { await resendStudentSignup(identifier, token); setNotice('Một mã OTP mới đã được gửi.'); setOtp(''); }
    catch (reason) { setError(studentAuthMessage(reason)); }
    finally { setBusy(null); resetChallenge(); }
  };

  const passwordField = (confirmation = false) => (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input
        type={visible ? 'text' : 'password'} required minLength={12} maxLength={128}
        autoComplete={confirmation ? 'new-password' : flow === 'login' ? 'current-password' : 'new-password'}
        value={confirmation ? confirm : password}
        onChange={(event) => confirmation ? setConfirm(event.target.value) : setPassword(event.target.value)}
        placeholder={confirmation ? 'Nhập lại mật khẩu' : 'Nhập mật khẩu'}
        className="auth-input auth-input-password"
      />
      <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );

  return (
    <div className="auth-page-root">
      <button type="button" onClick={() => navigate('/')} className="auth-back-button"><ArrowLeft size={17} /><span>Về trang chủ</span></button>
      <main className="auth-page"><div className="auth-shell">
        <section className="auth-mobile-brand">
          <div className="relative z-10 flex items-center gap-3"><div className="flex h-10 w-10 overflow-hidden rounded-[14px] bg-white"><img src="/logoapp.png" alt="HUB Planner" className="h-full w-full object-cover" /></div><div><p className="text-[14px] font-bold">HUB Planner</p><p className="text-[11.5px] text-blue-100">Tài khoản sinh viên HUB</p></div></div>
        </section>
        <section className="auth-visual-panel">
          <div className="flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white"><img src="/logo.png" alt="HUB Planner" className="h-9 w-9" /></div><div><p className="text-sm font-black">HUB Planner</p><p className="text-xs font-semibold text-blue-100">Đồng hành cùng sinh viên</p></div></div>
          <div className="py-5"><h1>Chào mừng bạn đến với<span>HUB Planner</span></h1><p className="onboarding-description">Vui lòng đăng nhập để chúng tôi có thể hỗ trợ hành trình học tập của bạn tốt nhất.</p></div>
          <div className="rounded-[22px] border border-white/16 bg-white/[0.08] p-4"><div className="mb-3 flex justify-between"><div><p className="text-xs font-bold uppercase text-blue-100">Tuần này</p><p className="mt-1 text-lg font-black">4 việc cần nhớ</p></div><div className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#003B7A]">HK2</div></div><div className="flex items-center gap-3 rounded-2xl bg-white p-3 text-slate-900"><CalendarDays size={18} className="text-[#003B7A]" /><div className="flex-1"><p className="text-sm font-black">Marketing căn bản</p><p className="text-xs text-slate-500">Phòng B203 - 07:00</p></div><Clock3 size={18} className="text-slate-300" /></div><div className="mt-2.5 grid grid-cols-2 gap-2.5"><div className="rounded-2xl bg-white/12 p-3"><Target size={16} /><p className="mt-2 text-xs font-bold">Deadline</p><p className="text-lg font-black">2 bài</p></div><div className="rounded-2xl bg-white/12 p-3"><BookOpen size={16} /><p className="mt-2 text-xs font-bold">HK2</p><p className="text-lg font-black">18 TC</p></div></div></div>
        </section>
        <section className="auth-card">
          <header className="auth-card-header"><div className="auth-card-icon"><Lock size={25} /></div><div><h2>{otpPending ? 'Xác nhận OTP' : flow === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h2><p>{otpPending ? 'Nhập mã xác nhận đã gửi đến email sinh viên.' : flow === 'login' ? 'Dùng MSSV và mật khẩu của bạn' : `Chỉ dành cho sinh viên @${SCHOOL_DOMAIN}`}</p></div></header>
          {!otpPending && <div className="auth-tabs"><button type="button" onClick={() => switchFlow('login')} className={`auth-tab${flow === 'login' ? ' auth-tab-active' : ''}`}>Đăng nhập</button><button type="button" onClick={() => switchFlow('register')} className={`auth-tab${flow === 'register' ? ' auth-tab-active' : ''}`}>Đăng ký</button></div>}
          {error && <div role="alert" className="mb-4 flex gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700"><AlertCircle size={18} /><span>{error}</span></div>}
          {notice && <div role="status" className="mb-4 flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-[#003B7A]"><Mail size={18} /><span>{notice}</span></div>}
          <form onSubmit={submit} className="auth-form">
            <div><label htmlFor="student-identifier" className="mb-1 block text-sm font-bold text-slate-700">Mã số sinh viên</label><div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input id="student-identifier" type="text" required inputMode="email" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Ví dụ: 030841250048" className="auth-input auth-input-with-icon" /></div><p className="mt-1 text-[11px] text-slate-500">Bạn cũng có thể nhập email sinh viên đầy đủ.</p></div>
            {!otpPending && <><div><label className="mb-1 block text-sm font-bold text-slate-700">Mật khẩu</label>{passwordField()}</div>{flow === 'register' && <div><label className="mb-1 block text-sm font-bold text-slate-700">Nhập lại mật khẩu</label>{passwordField(true)}<p className="mt-1 text-[11px] text-slate-500">Tối thiểu 12 ký tự.</p></div>}</>}
            {otpPending && <div><label htmlFor="student-otp" className="mb-1 block text-sm font-bold text-slate-700">Mã OTP</label><input id="student-otp" type="text" inputMode="numeric" required maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Nhập 6 chữ số" className="auth-input text-center text-xl font-black tracking-[0.35em]" /></div>}
            {flow === 'register' && !otpPending && <label className="flex items-start gap-3 text-xs text-slate-500"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-1" /><span>Tôi đồng ý với <Link to="/terms" className="font-semibold text-[#003B7A]">Điều khoản</Link> và <Link to="/privacy" className="font-semibold text-[#003B7A]">Chính sách bảo mật</Link>.</span></label>}
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3"><div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#003B7A]"><ShieldCheck size={18} />Xác minh bảo mật</div>{siteKey ? <Turnstile key={`${action}-${turnstileKey}`} siteKey={siteKey} options={{ action, appearance: 'interaction-only', language: 'vi' }} onSuccess={setToken} onExpire={() => setToken('')} onError={() => setToken('')} /> : <p className="text-sm font-semibold text-amber-700">Dịch vụ xác minh chưa được cấu hình.</p>}</div>
            <button type="submit" disabled={busy !== null || !token || !siteKey || (flow === 'register' && !otpPending && !agreed)} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003B7A] px-4 text-sm font-black text-white disabled:bg-slate-300">{busy === 'form' && <Loader2 className="animate-spin" size={18} />}{otpPending ? 'Xác nhận đăng ký' : flow === 'login' ? 'Đăng nhập' : 'Gửi mã OTP'}</button>
            {otpPending && <><button type="button" onClick={resend} disabled={busy !== null || !token} className="h-11 rounded-xl border border-slate-200 text-sm font-bold text-[#003B7A]">{busy === 'resend' ? 'Đang gửi…' : 'Gửi lại mã OTP'}</button><button type="button" onClick={() => { setOtpPending(false); setOtp(''); resetChallenge(); }} className="h-10 text-sm font-bold text-slate-500">Quay lại chỉnh MSSV/email</button></>}
          </form>
          {!otpPending && <div className="auth-oauth"><div className="auth-divider"><span className="h-px flex-1 bg-slate-200" />hoặc<span className="h-px flex-1 bg-slate-200" /></div>{siteKey && <div className="mb-3"><Turnstile key={`${flow}-google-${googleTurnstileKey}`} siteKey={siteKey} options={{ action: flow === 'login' ? 'google_login' : 'google_signup', appearance: 'interaction-only', language: 'vi' }} onSuccess={setGoogleToken} onExpire={() => setGoogleToken('')} onError={() => setGoogleToken('')} /></div>}<button type="button" onClick={google} disabled={busy !== null || !googleToken || (flow === 'register' && !agreed)} className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900 disabled:bg-slate-100">{busy === 'google' ? <Loader2 className="animate-spin" size={18} /> : <GoogleIcon />}{flow === 'login' ? 'Đăng nhập bằng Google HUB' : 'Đăng ký bằng Google HUB'}</button>{flow === 'login' && <Link to="/forgot-password" className="mt-4 block text-center text-sm font-bold text-[#003B7A]">Quên mật khẩu?</Link>}</div>}
        </section>
      </div></main>
    </div>
  );
};
