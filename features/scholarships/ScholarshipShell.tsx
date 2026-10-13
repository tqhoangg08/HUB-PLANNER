import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Settings,
  UserCheck,
} from 'lucide-react';
import { useUserRole } from '../../hooks/useUserRole';
import { playClick } from '../../utils/audio';

interface ScholarshipShellProps {
  children: React.ReactNode;
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
  const { isAdmin } = useUserRole();

  const isMeActive = location.pathname.startsWith('/scholarships/me') || location.pathname.startsWith('/scholarships/celebrate');

  return (
    <div className="min-h-screen bg-gray-50/60 text-gray-900 font-sans flex flex-col selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
            {/* Left: Return & Section Title */}
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                onClick={playClick}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-500 hover:text-gray-900 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
                title="Quay lại HUB Planner"
              >
                <ArrowLeft size={16} />
                <span className="hidden xs:inline">HUB Planner</span>
              </Link>

              <span className="h-4 w-[1px] bg-gray-200" aria-hidden="true" />

              <Link
                to="/scholarships"
                onClick={playClick}
                className="text-sm sm:text-base font-bold text-gray-900 hover:text-[#0052cc] transition-colors"
              >
                Học bổng
              </Link>
            </div>

            {/* Right: Personal Scholarships Link & Admin */}
            <div className="flex items-center gap-2">
              <NavLink
                to="/scholarships/me"
                onClick={playClick}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  isMeActive
                    ? 'bg-blue-50 text-[#0052cc] font-semibold border border-blue-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <UserCheck size={16} className={isMeActive ? 'text-[#0052cc]' : 'text-gray-500'} />
                <span>Học bổng của tôi</span>
              </NavLink>

              {isAdmin && (
                <Link
                  to="/admin/scholarships"
                  onClick={playClick}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    location.pathname.startsWith('/admin')
                      ? 'bg-purple-50 text-purple-700 border border-purple-200 font-semibold'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                  title="Quản trị học bổng"
                >
                  <Settings size={15} />
                  <span className="hidden sm:inline">Quản trị</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Optional Page Subheader */}
      {(title || subtitle) && (
        <section className="bg-white border-b border-gray-200 py-5 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              {title && (
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-gray-600 max-w-2xl font-normal leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
            {headerActions && <div className="shrink-0">{headerActions}</div>}
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>

      {/* Minimal Academic Footer */}
      <footer className="border-t border-gray-200 bg-white py-6 px-4 sm:px-6 text-center text-xs text-gray-500">
        <div className="max-w-6xl mx-auto space-y-1">
          <p className="font-medium text-gray-700">
            Cổng tra cứu học bổng sinh viên — Trường Đại học Ngân hàng TP.HCM (HUB)
          </p>
          <p className="text-[11px] text-gray-500">
            Dữ liệu được cập nhật từ các Quyết định cấp học bổng chính thức đã qua phê duyệt công khai.
          </p>
        </div>
      </footer>
    </div>
  );
};
