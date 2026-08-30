import { CalendarDays, GraduationCap, Home, Megaphone, Search, ShieldCheck, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AUTH_MAINTENANCE_MESSAGE } from '../utils/rescueMode';

const publicLinks = [
  { to: '/dashboard', label: 'Thông báo & tổng quan', icon: Megaphone },
  { to: '/schedule', label: 'Danh sách môn học', icon: GraduationCap },
  { to: '/events', label: 'Sự kiện công khai', icon: CalendarDays },
  { to: '/lost-found', label: 'Đồ thất lạc', icon: Search },
  { to: '/rankings', label: 'Xếp hạng công khai', icon: Trophy },
];

export const AuthMaintenanceScreen = () => (
  <main className="min-h-[100dvh] bg-[#F8FAFC] px-4 py-8 sm:px-6 sm:py-12">
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
      <Link to="/dashboard" className="mb-7 flex items-center gap-3 text-[#003375]" aria-label="Về trang công khai HUB Planner">
        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-[#DCE6F5] bg-white shadow-sm">
          <img src="/logo192.png" alt="" className="h-10 w-10 object-contain" />
        </span>
        <span className="hub-brand flex flex-col">
          <span className="hub-brand-title text-lg font-extrabold">HUB PLANNER</span>
          <span className="hub-brand-subtitle text-[10px] font-semibold uppercase text-[#64748B]">Hỗ trợ sinh viên</span>
        </span>
      </Link>

      <section className="w-full overflow-hidden rounded-[28px] border border-[#E3E8F2] bg-white shadow-[0_18px_50px_rgba(13,27,62,0.09)]">
        <div className="bg-gradient-to-br from-[#003375] to-[#1557A5] px-6 py-8 text-white sm:px-10 sm:py-10">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <ShieldCheck size={30} aria-hidden="true" />
          </div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-blue-100">Thông báo hệ thống</p>
          <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">Chức năng tài khoản đang bảo trì</h1>
          <p className="mt-4 max-w-2xl text-sm font-medium leading-7 text-blue-50 sm:text-base">
            {AUTH_MAINTENANCE_MESSAGE}
          </p>
        </div>

        <div className="px-5 py-6 sm:px-10 sm:py-8">
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#DCE6F5] bg-[#F4F8FF] p-4 text-[#334155]">
            <Home className="mt-0.5 shrink-0 text-[#0052CC]" size={20} aria-hidden="true" />
            <p className="text-sm font-medium leading-6">
              Cảm ơn bạn đã chờ đợi, chúc mình sẽ sớm quay trở lại!
            </p>
          </div>

          <nav aria-label="Các chức năng công khai" className="grid gap-3 sm:grid-cols-2">
            {publicLinks.map(({ to, label, icon: Icon }, index) => (
              <Link
                key={`${to}-${label}`}
                to={to}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border border-[#E3E8F2] bg-white px-4 py-3 text-sm font-bold text-[#0D1B3E] transition hover:border-[#9DB8DF] hover:bg-[#F8FBFF] focus:outline-none focus:ring-2 focus:ring-[#1A56FF]/30 ${index === publicLinks.length - 1 ? 'sm:col-span-2' : ''}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF4FF] text-[#0052CC]">
                  <Icon size={19} aria-hidden="true" />
                </span>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <p className="mt-6 text-center text-xs font-medium text-[#64748B]">
        HUB Planner sẽ cập nhật lại chức năng đăng nhập sau khi hoàn tất nâng cấp.
      </p>
    </div>
  </main>
);

