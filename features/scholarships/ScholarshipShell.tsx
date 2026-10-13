import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Award,
  ChevronLeft,
  Crown,
  FileSearch,
  LayoutGrid,
  LogIn,
  Settings,
  Sparkles,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { useUserRole } from '../../hooks/useUserRole';
import { playClick } from '../../utils/audio';

interface ScholarshipShellProps {
  children: React.ReactNode;
  activeTab?: 'overview' | 'list' | 'search' | 'me' | 'celebrate' | 'admin';
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
}

export const ScholarshipShell: React.FC<ScholarshipShellProps> = ({
  children,
  title,
  subtitle,
  headerActions,
}) => {
  const location = useLocation();
  const { session, isAdmin, loading: authLoading } = useUserRole();

  const navItems = [
    { to: '/scholarships', label: 'Tổng quan', icon: LayoutGrid, end: true },
    { to: '/scholarships/list', label: 'Danh sách', icon: Award, end: false },
    { to: '/scholarships/search', label: 'Tra cứu', icon: FileSearch, end: false },
    { to: '/scholarships/me', label: 'Học bổng của tôi', icon: UserCheck, end: false, authHighlight: true },
    { to: '/scholarships/celebrate', label: 'Studio Vinh danh', icon: Sparkles, end: false, goldHighlight: true },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative selection:bg-amber-100 selection:text-amber-900">
      {/* Background Decorative Ambient Gradient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[420px] bg-gradient-to-b from-blue-100/40 via-amber-50/30 to-transparent blur-3xl opacity-70" />
        <div className="absolute top-[-120px] right-[-100px] w-[500px] h-[500px] rounded-full bg-amber-200/20 blur-[100px]" />
        <div className="absolute top-[200px] left-[-150px] w-[450px] h-[450px] rounded-full bg-blue-200/20 blur-[100px]" />
      </div>

      {/* Top Main Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Left: Brand & Return Link */}
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/dashboard"
                onClick={playClick}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Quay lại HUB Planner"
              >
                <ChevronLeft size={16} />
                <span>Dashboard</span>
              </Link>

              <div className="hidden sm:block h-4 w-[1px] bg-slate-200" />

              <Link
                to="/scholarships"
                onClick={playClick}
                className="flex items-center gap-2.5 group"
              >
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#003375] via-[#0052CC] to-blue-700 flex items-center justify-center text-white shadow-md shadow-blue-900/20 group-hover:scale-105 transition-transform">
                  <Crown size={19} className="text-amber-300 fill-amber-300/30" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black tracking-tight text-[#003375]">
                      HUB SCHOLARSHIP
                    </span>
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300/50">
                      Season
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 leading-none">
                    Vinh danh & Tra cứu học bổng
                  </p>
                </div>
              </Link>
            </div>

            {/* Center: Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/70">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={playClick}
                  className={({ isActive }) => {
                    if (isActive) {
                      return item.goldHighlight
                        ? 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 shadow-sm transition-all'
                        : 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-[#003375] shadow-xs transition-all';
                    }
                    return item.goldHighlight
                      ? 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-amber-700 hover:text-amber-900 hover:bg-amber-100/60 transition-colors'
                      : 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors';
                  }}
                >
                  <item.icon size={15} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Right: Auth Profile / Login / Admin Button */}
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Link
                  to="/admin/scholarships"
                  onClick={playClick}
                  className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    location.pathname.startsWith('/admin/scholarships')
                      ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  }`}
                  title="Quản trị học bổng"
                >
                  <Settings size={14} />
                  <span>Quản trị</span>
                </Link>
              )}

              {!authLoading && session ? (
                <Link
                  to="/scholarships/me"
                  onClick={playClick}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs"
                  title="Xem thành tích của bạn"
                >
                  <div className="h-6 w-6 rounded-full bg-[#0052CC] text-white flex items-center justify-center text-xs font-bold uppercase">
                    {session.user.email?.[0] || 'U'}
                  </div>
                  <span className="text-xs font-bold text-slate-700 truncate max-w-[120px]">
                    {session.user.user_metadata?.full_name || session.user.email?.split('@')[0]}
                  </span>
                </Link>
              ) : !authLoading ? (
                <Link
                  to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}
                  onClick={playClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0052CC] text-white text-xs font-bold hover:bg-[#0043a8] transition-colors shadow-sm"
                >
                  <LogIn size={14} />
                  <span>Đăng nhập</span>
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* Mobile Horizontal Scrollable Tab Bar */}
        <div className="md:hidden border-t border-slate-100 bg-white/95 px-3 py-1.5 overflow-x-auto scrollbar-none flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={playClick}
              className={({ isActive }) => {
                if (isActive) {
                  return item.goldHighlight
                    ? 'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400 text-amber-950 shrink-0 shadow-2xs'
                    : 'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#003375] text-white shrink-0 shadow-2xs';
                }
                return 'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 shrink-0';
              }}
            >
              <item.icon size={14} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/admin/scholarships"
              onClick={playClick}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white shrink-0'
                  : 'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 shrink-0'
              }
            >
              <Settings size={14} />
              <span>Admin</span>
            </NavLink>
          )}
        </div>
      </header>

      {/* Page Title & Subtitle Banner (if provided) */}
      {(title || subtitle) && (
        <section className="relative z-10 bg-gradient-to-b from-white via-white to-transparent border-b border-slate-200/50 pt-6 pb-6 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              {title && (
                <h1 className="text-2xl sm:text-3xl font-black text-[#003375] tracking-tight">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-slate-600 max-w-2xl font-normal leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
            {headerActions && <div className="shrink-0">{headerActions}</div>}
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200/80 bg-white/70 py-8 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto space-y-2">
          <div className="flex items-center justify-center gap-2 font-semibold text-slate-700">
            <Trophy size={15} className="text-amber-500" />
            <span>HUB Scholarship — Tôn vinh nỗ lực học tập xuất sắc</span>
          </div>
          <p className="text-[11px] text-slate-500 max-w-2xl mx-auto">
            HUB Planner là dự án hỗ trợ sinh viên độc lập, không trực thuộc và không đại diện cho Trường.
            Mọi số liệu học bổng được trích xuất nguyên bản từ văn bản quyết định chính thức đã qua phê duyệt công khai.
          </p>
          <div className="flex items-center justify-center gap-4 pt-2 text-[11px] font-medium text-slate-600">
            <Link to="/scholarships" className="hover:text-blue-700">Tổng quan</Link>
            <span>•</span>
            <Link to="/scholarships/list" className="hover:text-blue-700">Danh sách</Link>
            <span>•</span>
            <Link to="/scholarships/search" className="hover:text-blue-700">Tra cứu</Link>
            <span>•</span>
            <Link to="/scholarships/me" className="hover:text-blue-700">Cá nhân</Link>
            <span>•</span>
            <Link to="/privacy" className="hover:text-blue-700">Chính sách</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
