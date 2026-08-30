import { useEffect, useState } from 'react';
import { Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getRecoverySession,
  recoveryAuthMessage,
  signOutRecovery,
  type RecoveryIdentity,
} from '../app/auth/recoveryAuthClient';

export const RecoveryAccountScreen = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<RecoveryIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getRecoverySession()
      .then((state) => {
        if (!active) return;
        if (!state.authenticated || !state.user) {
          navigate('/login?error=session-expired', { replace: true });
          return;
        }
        setUser(state.user);
      })
      .catch((reason) => {
        if (active) setError(recoveryAuthMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleLogout = async () => {
    setLoggingOut(true);
    setError('');
    try {
      await signOutRecovery();
      navigate('/login', { replace: true });
    } catch (reason) {
      setError(recoveryAuthMessage(reason));
      setLoggingOut(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#F8FAFC] px-4 py-10">
      <section className="mx-auto w-full max-w-xl rounded-[28px] border border-[#E3E8F2] bg-white p-6 shadow-[0_18px_50px_rgba(13,27,62,0.09)] sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <ShieldCheck size={25} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700">Phiên Better Auth</p>
            <h1 className="text-2xl font-extrabold text-[#0D1B3E]">Tài khoản khôi phục</h1>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center text-[#64748B]">
            <Loader2 className="animate-spin" aria-label="Đang kiểm tra phiên đăng nhập" />
          </div>
        ) : user ? (
          <>
            <dl className="mt-6 space-y-4 rounded-2xl border border-[#E3E8F2] bg-[#F8FAFC] p-5">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Trạng thái</dt>
                <dd className="mt-1 font-extrabold text-emerald-700">Đã đăng nhập an toàn</dd>
              </div>
              {user.name && (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Tên hiển thị</dt>
                  <dd className="mt-1 font-semibold text-[#0D1B3E]">{user.name}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Email</dt>
                <dd className="mt-1 break-all font-semibold text-[#0D1B3E]">{user.email}</dd>
              </div>
            </dl>
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">
              Hồ sơ, lịch học, dữ liệu học tập và chức năng quản trị vẫn đang bảo trì trong giai đoạn khôi phục.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#003375] px-4 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {loggingOut ? <Loader2 className="animate-spin" size={19} /> : <LogOut size={19} />}
              Đăng xuất
            </button>
          </>
        ) : null}

        {error && <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <a href="/dashboard" className="mt-5 block text-center text-sm font-bold text-[#0052CC]">
          Về trang công khai
        </a>
      </section>
    </main>
  );
};
