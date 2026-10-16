import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { ScholarshipShell } from './ScholarshipShell';
import { ScholarshipBadge } from './ScholarshipBadge';
import { useUserRole } from '../../hooks/useUserRole';
import {
  fetchMyScholarships,
  type OwnAward,
  ScholarshipApiError,
  formatScoreValue,
} from '../../utils/scholarshipApi';
import { playClick } from '../../utils/audio';

export const ScholarshipMe: React.FC = () => {
  const location = useLocation();
  const { session, loading: authLoading, bootstrapUnavailable } = useUserRole();

  const [verified, setVerified] = useState<boolean | null>(null);
  const [awards, setAwards] = useState<OwnAward[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const loadMyAwards = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setAwards([]); setVerified(null);
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchMyScholarships(controller.signal);
      if (controller.signal.aborted) return;
      setVerified(data.verified);
      setAwards(data.awards);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ScholarshipApiError) {
        if (err.status === 401) {
          setError('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Không thể kết nối đến hệ thống xác thực học bổng.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      void loadMyAwards();
    }
    return () => requestRef.current?.abort();
  }, [session, authLoading]);

  return (
    <ScholarshipShell
      title="Học bổng của tôi"
      subtitle="Thành tích học bổng chính thức gắn với tài khoản sinh viên HUB đã xác thực."
    >
      {bootstrapUnavailable && <p role="alert" className="scholarship-status">Chưa thể kết nối hệ thống xác thực. Vui lòng thử lại sau.</p>}

      <div className="max-w-3xl mx-auto space-y-6">
        {/* State 1: Chưa đăng nhập */}
        {!authLoading && !bootstrapUnavailable && !session && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 text-center space-y-4 shadow-xs">

            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-gray-900">Yêu cầu đăng nhập tài khoản sinh viên</h2>
              <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                Để bảo vệ quyền riêng tư và xác thực chính xác người nhận học bổng, vui lòng đăng nhập bằng email sinh viên trường HUB.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
                onClick={playClick}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#0052cc] text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-xs"
              >

                <span>Đăng nhập với email HUB</span>
              </Link>
            </div>
          </div>
        )}

        {/* Loading State */}
        {(authLoading || loading) && session && (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-gray-500">Đang đối chiếu dữ liệu học bổng của bạn...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadMyAwards()}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-900 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-md transition-colors"
            >
              <RefreshCw size={13} />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* State 2: Authenticated but email unverified (verified === false) */}
        {!loading && !error && session && verified === false && (
          <div className="bg-white border border-amber-200 rounded-lg p-6 sm:p-8 space-y-4 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-gray-900">Email sinh viên chưa được xác minh</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Tài khoản của bạn chưa được liên kết hoặc chưa xác minh địa chỉ email sinh viên chính thức (dạng <strong>[MSSV]@st.buh.edu.vn</strong>).
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-md bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-1.5">
              <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                <HelpCircle size={14} className="text-[#0052cc]" />
                <span>Hướng dẫn kích hoạt:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-gray-600 pl-1">
                <li>Đăng xuất và đăng nhập lại bằng tùy chọn <strong>Google (Email @st.buh.edu.vn)</strong>.</li>
                <li>Hoặc liên kết email trường và hoàn tất xác thực OTP tại trang Cài đặt tài khoản.</li>
              </ul>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void loadMyAwards()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
              >
                <RefreshCw size={14} />
                <span>Kiểm tra lại</span>
              </button>
              <Link
                to="/account"
                onClick={playClick}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#0052cc] text-white text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                <span>Cài đặt tài khoản</span>
              </Link>
            </div>
          </div>
        )}

        {/* State 3: Verified email but no awards (verified === true, awards.length === 0) */}
        {!loading && !error && session && verified === true && awards.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 text-center space-y-4 shadow-xs">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
              <ShieldCheck size={14} />
              <span>Email sinh viên đã xác thực ({session.user.email})</span>
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-gray-900">Không tìm thấy hồ sơ học bổng</h2>
              <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                Hệ thống chưa tìm thấy hồ sơ học bổng nào thuộc mã sinh viên của bạn trong các đợt đã công bố chính thức.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => void loadMyAwards()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
              >

                <span>Làm mới dữ liệu</span>
              </button>
              <Link
                to="/scholarships"
                onClick={playClick}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#0052cc] text-white text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                <span>Tra cứu danh sách chung</span>
              </Link>
            </div>
          </div>
        )}

        {/* State 4: Verified with Awards! */}
        {!loading && !error && session && verified === true && awards.length > 0 && (
          <div className="space-y-4">
            {/* Header notification card */}
            <div className="bg-white border border-gray-200 border-l-4 border-l-[#0052cc] rounded-lg p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
                    <ShieldCheck size={13} />
                    <span>Đã xác thực chính chủ</span>
                  </span>
                  <span className="text-xs text-gray-500 ">
                    {session.user.email}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {awards[0]?.fullName || session.user.user_metadata?.full_name}
                </h2>
                <p className="text-xs text-gray-600">
                  Bạn có <strong>{awards.length}</strong> kết quả học bổng trong các đợt đã công bố.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    void loadMyAwards();
                    playClick();
                  }}
                  className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md border border-gray-200 transition-colors"
                  title="Làm mới xác minh"
                  aria-label="Làm mới xác minh"
                >
                  <RefreshCw size={16} />
                </button>
                <Link
                  to={`/scholarships/celebrate?awardId=${awards[0].id}`}
                  onClick={playClick}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#0052cc] text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs"
                >
                  <Sparkles size={14} />
                  <span>Mở Studio Vinh danh</span>
                </Link>
              </div>
            </div>

            {/* List of Awards */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-1">
                Chi tiết học bổng ({awards.length})
              </h3>

              {awards.map((award) => (
                <div
                  key={award.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 shadow-xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ScholarshipBadge awardType={award.awardType} size="sm" />
                        <span className="text-xs text-gray-600">MSSV: {award.studentCode}</span>
                        <span className="text-xs text-gray-500">
                          Học kỳ {award.semester} • {award.schoolYear}
                        </span>
                      </div>
                      <h4 className="text-base font-semibold text-gray-900 pt-0.5">
                        {award.campaignTitle}
                      </h4>
                      <div className="text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-0.5">
                        {award.className && <span>Lớp: <strong>{award.className}</strong></span>}
                        {award.major && <span>Ngành: <strong>{award.major}</strong></span>}
                      </div>
                    </div>

                    <Link
                      to={`/scholarships/celebrate?awardId=${award.id}`}
                      onClick={playClick}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#0052cc] hover:underline shrink-0"
                    >
                      <span>Tạo ảnh vinh danh</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>

                  {/* Approved scores */}
                  {award.scores && Object.keys(award.scores).length > 0 && (
                    <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-2 text-xs">
                      {Object.entries(award.scores).map(([k, val]) => (
                        <span
                          key={k}
                          className="px-2 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-700 text-xs"
                        >
                          {k}: <strong>{formatScoreValue(val)}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScholarshipShell>
  );
};
