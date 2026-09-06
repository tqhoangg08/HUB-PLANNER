import { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Link } from 'react-router-dom';
import { GENERIC_PASSWORD_RESET_MESSAGE, recoveryAuthMessage, requestStaffPasswordActivation } from '../app/auth/recoveryAuthClient';
import { TURNSTILE_SITE_KEY } from '../utils/turnstileConfig';

export const StaffPasswordActivationScreen = () => {
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [widgetKey, setWidgetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const siteKey = TURNSTILE_SITE_KEY;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!turnstileToken) return setError('Vui lòng hoàn tất bước xác minh bảo mật.');
    setBusy(true);
    setError('');
    try {
      await requestStaffPasswordActivation(email, turnstileToken);
      setMessage(GENERIC_PASSWORD_RESET_MESSAGE);
    } catch (reason) {
      setError(recoveryAuthMessage(reason));
      setTurnstileToken('');
      setWidgetKey((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#F8FAFC] px-4 py-10">
      <section className="mx-auto w-full max-w-md rounded-[28px] border border-[#E3E8F2] bg-white p-6 shadow-[0_18px_50px_rgba(13,27,62,0.09)] sm:p-8">
        <h1 className="text-2xl font-extrabold text-[#0D1B3E]">Kích hoạt tài khoản nhân sự</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-[#64748B]">Chỉ tài khoản quản trị hoặc kiểm toán đã được cấp quyền mới có thể nhận liên kết thiết lập mật khẩu.</p>
        {message ? <p role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</p> : <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-bold text-[#0D1B3E]">Email nhân sự<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#D7E0EC] px-3 font-medium" /></label>
          {siteKey ? <Turnstile key={widgetKey} siteKey={siteKey} options={{ action: 'forgot_password', appearance: 'interaction-only', language: 'vi' }} onSuccess={setTurnstileToken} onExpire={() => setTurnstileToken('')} onError={() => setTurnstileToken('')} /> : <p className="text-sm font-semibold text-amber-700">Dịch vụ xác minh chưa được cấu hình.</p>}
          {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          <button type="submit" disabled={busy || !turnstileToken || !siteKey} className="min-h-12 w-full rounded-2xl bg-[#0052CC] px-4 text-sm font-extrabold text-white disabled:opacity-60">{busy ? 'Đang gửi yêu cầu…' : 'Gửi liên kết kích hoạt'}</button>
        </form>}
        <Link to="/staff/login" className="mt-6 block text-center text-sm font-bold text-[#0052CC]">Quay lại đăng nhập nhân sự</Link>
      </section>
    </main>
  );
};

