import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  HelpCircle,
  Lock,
  LogIn,
  MailCheck,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { ScholarshipShell } from './ScholarshipShell';
import { ScholarshipBadge } from './ScholarshipBadge';
import { ConfettiOverlay } from './ConfettiOverlay';
import { ScoreBadges } from './ScoreBadges';
import { useUserRole } from '../../hooks/useUserRole';
import {
  fetchMyScholarships,
  type OwnAward,
  ScholarshipApiError,
} from '../../utils/scholarshipApi';
import { playClick } from '../../utils/audio';

export const ScholarshipMe: React.FC = () => {
  const location = useLocation();
  const { session, loading: authLoading } = useUserRole();

  const [verified, setVerified] = useState<boolean | null>(null);
  const [awards, setAwards] = useState<OwnAward[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);

  const loadMyAwards = async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchMyScholarships();
      setVerified(data.verified);
      setAwards(data.awards);
      if (data.verified && data.awards.length > 0) {
        setShowConfetti(true);
      }
    } catch (err) {
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
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      void loadMyAwards();
    }
  }, [session, authLoading]);

  return (
    <ScholarshipShell
      activeTab="me"
      title="Học bổng của tôi"
      subtitle="Thành tích học bổng đã được hệ thống xác thực chính chủ gắn liền với tài khoản sinh viên HUB."
    >
      {showConfetti && <ConfettiOverlay onClose={() => setShowConfetti(false)} />}

      {/* State 1: Not Logged In */}
      {!authLoading && !session && (
        <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-white border border-slate-200 shadow-md text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#0052CC] mx-auto flex items-center justify-center">
            <Lock size={30} />
          </div>

          <h2 className="text-xl font-black text-[#003375]">Yêu cầu đăng nhập</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Để đảm bảo tính bảo mật và xác thực danh tính, bạn cần đăng nhập bằng tài khoản sinh viên trường (@st.buh.edu.vn) để kiểm tra quyền nhận học bổng.
          </p>

          <div className="pt-2">
            <Link
              to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}
              onClick={playClick}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#0052CC] text-white text-xs font-bold hover:bg-[#0040a8] transition-colors shadow-sm"
            >
              <LogIn size={15} />
              <span>Đăng nhập với email HUB</span>
            </Link>
          </div>
        </div>
      )}

      {/* Loading state */}
      {(authLoading || loading) && session && (
        <div className="py-24 text-center flex flex-col items-center justify-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-[#0052CC] animate-spin" />
            <Trophy size={18} className="absolute inset-0 m-auto text-[#0052CC]" />
          </div>
          <p className="text-xs font-semibold text-slate-600">Đang kiểm tra và đối chiếu hồ sơ học bổng...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="max-w-md mx-auto my-12 p-6 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-red-600" />
          <p className="text-sm font-bold text-red-900">{error}</p>
          <button
            type="button"
            onClick={() => void loadMyAwards()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
          >
            <RefreshCw size={14} />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* State 2: Authenticated but Unverified (verified === false) */}
      {!loading && !error && session && verified === false && (
        <div className="max-w-xl mx-auto my-8 p-8 rounded-3xl bg-white border border-amber-200 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 mx-auto flex items-center justify-center">
            <MailCheck size={32} />
          </div>

          <h2 className="text-xl font-bold text-amber-950">Chưa xác minh email sinh viên</h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
            Tài khoản hiện tại của bạn chưa được liên kết hoặc chưa xác minh email sinh viên chính thức của Trường Đại học Ngân hàng TP.HCM (dạng <strong>[12_chữ_số_MSSV]@st.buh.edu.vn</strong>).
          </p>

          <div className="p-4 rounded-xl bg-amber-50 text-left text-xs text-amber-900 space-y-2 border border-amber-100">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <HelpCircle size={15} />
              <span>Cách giải quyết:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-amber-900/90 pl-1">
              <li>Đăng xuất và đăng nhập lại bằng tùy chọn <strong>Google (Email @st.buh.edu.vn)</strong>.</li>
              <li>Hoặc liên kết email trường và hoàn tất xác thực OTP tại trang Cài đặt tài khoản.</li>
            </ul>
          </div>

          <div className="pt-2 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => void loadMyAwards()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
            >
              <RefreshCw size={14} />
              <span>Kiểm tra lại</span>
            </button>
            <Link
              to="/account"
              onClick={playClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0052CC] text-white text-xs font-bold hover:bg-[#0040a8] transition-colors"
            >
              <span>Cài đặt tài khoản</span>
            </Link>
          </div>
        </div>
      )}

      {/* State 3: Verified but No Awards (verified === true, awards.length === 0) */}
      {!loading && !error && session && verified === true && awards.length === 0 && (
        <div className="max-w-xl mx-auto my-8 p-8 rounded-3xl bg-white border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#0052CC] mx-auto flex items-center justify-center">
            <Trophy size={32} className="text-slate-400" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <ShieldCheck size={14} />
            <span>Email sinh viên đã xác minh ({session.user.email})</span>
          </div>

          <h2 className="text-xl font-bold text-slate-800">Chưa có học bổng trong danh sách công bố</h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
            Hệ thống không tìm thấy tên của bạn trong các đợt học bổng đã được công bố chính thức.
            Nếu bạn vừa đạt giải ở đợt khen thưởng mới nhất, vui lòng đợi đợt dữ liệu được ban giám hiệu phê duyệt và cập nhật.
          </p>

          <div className="pt-4 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void loadMyAwards()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
            >
              <RefreshCw size={14} />
              <span>Làm mới dữ liệu</span>
            </button>
            <Link
              to="/scholarships/search"
              onClick={playClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0052CC] text-white text-xs font-bold hover:bg-[#0040a8] transition-colors"
            >
              <span>Tra cứu danh sách công khai</span>
            </Link>
          </div>
        </div>
      )}

      {/* State 4: Verified with Awards! */}
      {!loading && !error && session && verified === true && awards.length > 0 && (
        <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn">
          {/* Celebratory Banner */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-amber-400 via-amber-300 to-yellow-500 text-amber-950 border border-amber-300 shadow-lg shadow-amber-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-900/10 text-amber-950 font-extrabold text-xs">
                <Sparkles size={14} />
                <span>CHÚC MỪNG THÀNH TÍCH XUẤT SẮC!</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                Xin chúc mừng, {awards[0]?.fullName || session.user.user_metadata?.full_name}!
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-amber-900/90 max-w-xl">
                Bạn đã được xác thực nhận <strong>{awards.length}</strong> giải thưởng học bổng chính thức tại Trường Đại học Ngân hàng TP.HCM.
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void loadMyAwards();
                  playClick();
                }}
                className="p-3 rounded-2xl bg-white/80 hover:bg-white text-amber-950 font-bold transition-all shadow-xs"
                title="Làm mới xác minh"
              >
                <RefreshCw size={18} />
              </button>
              <Link
                to={`/scholarships/celebrate?awardId=${awards[0].id}`}
                onClick={playClick}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#003375] hover:bg-[#00224f] text-white text-xs font-black shadow-md transition-all active:scale-95"
              >
                <Sparkles size={16} className="text-amber-300" />
                <span>Mở Studio Vinh danh</span>
              </Link>
            </div>
          </div>

          {/* List of Verified Awards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
              <span className="font-bold uppercase tracking-wider text-slate-700">
                Danh sách học bổng đã xác minh ({awards.length})
              </span>
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <ShieldCheck size={14} />
                <span>Đã xác thực chính chủ</span>
              </span>
            </div>

            {awards.map((award) => (
              <div
                key={award.id}
                className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs hover:border-amber-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-6"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ScholarshipBadge awardType={award.awardType} size="md" />
                    <span className="text-xs font-mono font-bold text-slate-500">
                      #{award.studentCode}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                      {award.semester} ({award.schoolYear})
                    </span>
                  </div>

                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    {award.campaignTitle}
                  </h3>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>Họ tên: <strong className="text-slate-900">{award.fullName}</strong></span>
                    {award.className && <span>Lớp: <strong className="text-slate-900">{award.className}</strong></span>}
                    {award.major && <span>Ngành: <strong className="text-slate-900">{award.major}</strong></span>}
                  </div>

                  {/* Render any approved scores */}
                  {award.scores && Object.keys(award.scores).length > 0 && (
                    <div className="pt-2 flex flex-wrap gap-2 text-xs">
                      {Object.entries(award.scores).map(([key, val]) => (
                        <span
                          key={key}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#003375] font-semibold text-[11px]"
                        >
                          {key}: <strong>{val !== null ? String(val) : '—'}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Celebrate CTA button for this specific award */}
                <div className="shrink-0 sm:border-l sm:border-slate-100 sm:pl-6 flex flex-col justify-center">
                  <Link
                    to={`/scholarships/celebrate?awardId=${award.id}`}
                    onClick={playClick}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 font-extrabold text-xs hover:brightness-105 transition-all shadow-2xs active:scale-95 whitespace-nowrap"
                  >
                    <Sparkles size={15} />
                    <span>Tạo ảnh vinh danh</span>
                    <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ScholarshipShell>
  );
};
