import { useMemo, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { recoveryAuthMessage, submitRecoveryPasswordReset } from '../app/auth/recoveryAuthClient';

export const RecoveryResetPasswordScreen = ({ returnTo = '/login?password-reset=success' }: { returnTo?: string }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [widgetKey, setWidgetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const siteKey = String(import.meta.env.VITE_AUTH_TURNSTILE_SITE_KEY || '').trim();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetToken) return setError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    if (password.length < 12 || password.length > 128) return setError('Mật khẩu phải có từ 12 đến 128 ký tự.');
    if (password !== confirmPassword) return setError('Mật khẩu xác nhận không khớp.');
    if (!turnstileToken) return setError('Vui lòng hoàn tất bước xác minh bảo mật.');
    setBusy(true);
    setError('');
    try {
      await submitRecoveryPasswordReset(resetToken, password, turnstileToken);
      setPassword('');
      setConfirmPassword('');
      window.history.replaceState({}, '', returnTo.split('?')[0]);
      navigate(returnTo, { replace: true });
    } catch (reason) {
      setPassword('');
      setConfirmPassword('');
      setError(recoveryAuthMessage(reason));
      setTurnstileToken('');
      setWidgetKey((value) => value + 1);
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#F8FAFC] px-4 py-10">
      <section className="mx-auto w-full max-w-md rounded-[28px] border border-[#E3E8F2] bg-white p-6 shadow-[0_18px_50px_rgba(13,27,62,0.09)] sm:p-8">
        <h1 className="text-2xl font-extrabold text-[#0D1B3E]">Đặt mật khẩu mới</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-[#64748B]">Mật khẩu phải có từ 12 đến 128 ký tự. Không có yêu cầu thành phần ký tự bắt buộc.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-bold text-[#0D1B3E]">Mật khẩu mới<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#D7E0EC] px-3 font-medium" /></label>
          <label className="block text-sm font-bold text-[#0D1B3E]">Xác nhận mật khẩu<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#D7E0EC] px-3 font-medium" /></label>
          {siteKey ? <Turnstile key={widgetKey} siteKey={siteKey} options={{ action: 'reset_password', appearance: 'interaction-only', language: 'vi' }} onSuccess={setTurnstileToken} onExpire={() => setTurnstileToken('')} onError={() => setTurnstileToken('')} /> : <p className="text-sm font-semibold text-amber-700">Dịch vụ xác minh chưa được cấu hình.</p>}
          {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          <button type="submit" disabled={busy || !resetToken || !turnstileToken || !siteKey} className="min-h-12 w-full rounded-2xl bg-[#0052CC] px-4 text-sm font-extrabold text-white disabled:opacity-60">{busy ? 'Đang cập nhật…' : 'Đặt mật khẩu'}</button>
        </form>
        <Link to="/login" className="mt-6 block text-center text-sm font-bold text-[#0052CC]">Quay lại đăng nhập</Link>
      </section>
    </main>
  );
};
