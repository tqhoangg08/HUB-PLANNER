import { useEffect, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { completeGoogleRegistration, getRegistrationStatus, studentAuthMessage } from '../app/auth/studentAuthClient';
import { TURNSTILE_SITE_KEY } from '../utils/turnstileConfig';

export const RegistrationPasswordScreen = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [visible, setVisible] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const siteKey = TURNSTILE_SITE_KEY;

  useEffect(() => {
    getRegistrationStatus().then((status) => {
      if (status.complete) navigate('/dashboard', { replace: true });
      else if (!status.pending) navigate('/login', { replace: true });
      else setEmail(status.email);
    }).catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 12) return setError('Mật khẩu cần ít nhất 12 ký tự.');
    if (password !== confirm) return setError('Hai mật khẩu chưa trùng khớp.');
    if (!token) return setError('Vui lòng hoàn tất bước xác minh bảo mật.');
    setBusy(true);
    try { await completeGoogleRegistration(password, token); navigate('/dashboard', { replace: true }); }
    catch (reason) { setError(studentAuthMessage(reason)); setToken(''); }
    finally { setBusy(false); }
  };

  const field = (id: string, value: string, update: (value: string) => void, label: string) => (
    <label htmlFor={id} className="block text-sm font-bold text-slate-700">{label}<div className="relative mt-2"><Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input id={id} type={visible ? 'text' : 'password'} required minLength={12} maxLength={128} autoComplete="new-password" value={value} onChange={(event) => update(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-11 font-semibold outline-none focus:border-[#0B5ED7]" /><button type="button" onClick={() => setVisible((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
  );

  return <main className="min-h-[100dvh] bg-[#F8FAFC] px-4 py-10"><form onSubmit={submit} className="mx-auto w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl sm:p-8"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#003B7A]"><ShieldCheck size={28} /></div><h1 className="text-2xl font-black text-slate-950">Tạo mật khẩu đăng nhập</h1><p className="mt-2 text-sm leading-6 text-slate-500">Google HUB đã xác minh <strong className="text-[#003B7A]">{email || 'email sinh viên của bạn'}</strong>. Tạo mật khẩu để lần sau có thể đăng nhập bằng MSSV.</p>{error && <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700"><AlertCircle size={18} /><span>{error}</span></div>}<div className="mt-5 space-y-4">{field('registration-password', password, setPassword, 'Mật khẩu mới')}{field('registration-confirm', confirm, setConfirm, 'Nhập lại mật khẩu')}<p className="text-xs text-slate-500">Tối thiểu 12 ký tự.</p>{siteKey && <Turnstile siteKey={siteKey} options={{ action: 'signup_password', appearance: 'interaction-only', language: 'vi' }} onSuccess={setToken} onExpire={() => setToken('')} onError={() => setToken('')} />}</div><button type="submit" disabled={busy || !token || !siteKey} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#003B7A] font-black text-white disabled:bg-slate-300">{busy && <Loader2 className="animate-spin" size={18} />}{busy ? 'Đang hoàn tất…' : 'Hoàn tất đăng ký'}</button></form></main>;
};
