import { useEffect, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  beginGoogleRecoverySignIn,
  getRecoverySession,
  recoveryAuthMessage,
  signInRecoveryWithEmail,
} from '../app/auth/recoveryAuthClient';
import { PASSWORD_RECOVERY_ENABLED } from '../utils/rescueMode';
import { TURNSTILE_SITE_KEY } from '../utils/turnstileConfig';

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.24.81-.6z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

export const RecoveryLoginScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [googleToken, setGoogleToken] = useState('');
  const [loginToken, setLoginToken] = useState('');
  const [googleKey, setGoogleKey] = useState(0);
  const [loginKey, setLoginKey] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState(
    searchParams.has('error') ? 'Không thể hoàn tất đăng nhập Google. Vui lòng thử lại.' : '',
  );
  const siteKey = TURNSTILE_SITE_KEY;

  useEffect(() => {
    let active = true;
    getRecoverySession()
      .then((state) => {
        if (active && state.authenticated) navigate('/dashboard', { replace: true });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    if (!googleToken) return setError('Vui lòng hoàn tất bước xác minh bảo mật.');
    setLoading('google');
    setError('');
    try {
      window.location.assign(await beginGoogleRecoverySignIn(googleToken));
    } catch (reason) {
      setError(recoveryAuthMessage(reason));
      setGoogleToken('');
      setGoogleKey((value) => value + 1);
      setLoading(null);
    }
  };

  const handleEmailSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!loginToken) return setError('Vui lòng hoàn tất bước xác minh bảo mật.');
    setLoading('email');
    setError('');
    try {
      await signInRecoveryWithEmail(email, password, loginToken);
      setPassword('');
      navigate('/dashboard', { replace: true });
    } catch (reason) {
      setPassword('');
      setError(recoveryAuthMessage(reason));
      setLoginToken('');
      setLoginKey((value) => value + 1);
      setLoading(null);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#F8FAFC] px-4 py-10">
      <section className="mx-auto w-full max-w-md rounded-[28px] border border-[#E3E8F2] bg-white p-6 shadow-[0_18px_50px_rgba(13,27,62,0.09)] sm:p-8">
        <div className="mb-6 text-center">
          <img src="/logo192.png" alt="" className="mx-auto h-16 w-16 object-contain" />
          <h1 className="mt-4 text-2xl font-extrabold text-[#0D1B3E]">Đăng nhập HUB Planner</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-[#64748B]">
            {PASSWORD_RECOVERY_ENABLED
              ? 'Đăng nhập bằng Google hoặc tài khoản sinh viên đã kích hoạt mật khẩu.'
              : 'Đăng nhập bằng tài khoản Google đã được liên kết.'}
          </p>
        </div>

        {PASSWORD_RECOVERY_ENABLED && searchParams.get('password-reset') === 'success' && (
          <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Mật khẩu đã được đặt lại. Bạn có thể đăng nhập.</p>
        )}
        {error && <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

        <button type="button" disabled={loading !== null || !googleToken || !siteKey} onClick={handleGoogleSignIn} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-[#D7E0EC] bg-white px-4 text-sm font-extrabold text-[#0D1B3E] disabled:opacity-60">
          {loading === 'google' ? <Loader2 className="animate-spin" size={20} aria-hidden="true" /> : <GoogleIcon />}
          Đăng nhập bằng Google
        </button>
        {siteKey && <div className="mt-3"><Turnstile key={googleKey} siteKey={siteKey} options={{ action: 'google_login', appearance: 'interaction-only', language: 'vi' }} onSuccess={setGoogleToken} onExpire={() => setGoogleToken('')} onError={() => setGoogleToken('')} /></div>}

        {PASSWORD_RECOVERY_ENABLED && <>
        <div className="my-6 h-px bg-[#E3E8F2]" />
        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <label className="block text-sm font-bold text-[#0D1B3E]">Email sinh viên<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#D7E0EC] px-3 font-medium" /></label>
          <label className="block text-sm font-bold text-[#0D1B3E]">Mật khẩu<input type="password" autoComplete="current-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#D7E0EC] px-3 font-medium" /></label>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#003375]"><ShieldCheck size={18} aria-hidden="true" />Xác minh bảo mật</div>
            {siteKey ? <Turnstile key={loginKey} siteKey={siteKey} options={{ action: 'login', appearance: 'interaction-only', language: 'vi' }} onSuccess={setLoginToken} onExpire={() => setLoginToken('')} onError={() => setLoginToken('')} /> : <p className="text-sm font-semibold text-amber-700">Dịch vụ xác minh chưa được cấu hình.</p>}
          </div>
          <button type="submit" disabled={loading !== null || !loginToken || !siteKey} className="min-h-12 w-full rounded-2xl bg-[#0052CC] px-4 text-sm font-extrabold text-white disabled:opacity-60">{loading === 'email' ? 'Đang đăng nhập…' : 'Đăng nhập bằng mật khẩu'}</button>
        </form>

        <Link to="/forgot-password" className="mt-5 block text-center text-sm font-bold text-[#0052CC]">Kích hoạt / đặt lại mật khẩu</Link>
        </>}
        <a href="/dashboard" className="mt-5 block text-center text-sm font-bold text-[#0052CC]">Quay lại trang công khai</a>
      </section>
    </main>
  );
};
