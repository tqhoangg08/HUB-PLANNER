import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileCheck,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { ScholarshipShell } from './ScholarshipShell';
import { ScholarshipBadge } from './ScholarshipBadge';
import {
  fetchPublicCampaigns,
  fetchCampaignSummary,
  type Campaign,
  type CampaignSummary,
  ScholarshipApiError,
} from '../../utils/scholarshipApi';
import { playClick } from '../../utils/audio';

export const ScholarshipLanding: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(true);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load published campaigns
  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    setError(null);
    try {
      const data = await fetchPublicCampaigns({ limit: 50 });
      setCampaigns(data.campaigns);
      if (data.campaigns.length > 0) {
        setSelectedSlug(data.campaigns[0].slug);
      }
    } catch (err) {
      console.error('Failed to load scholarship campaigns:', err);
      setError(err instanceof ScholarshipApiError ? err.message : 'Không thể kết nối đến máy chủ học bổng.');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  // When selectedSlug changes, fetch summary
  useEffect(() => {
    if (!selectedSlug) {
      setSummary(null);
      return;
    }

    let isMounted = true;
    setLoadingSummary(true);

    fetchCampaignSummary(selectedSlug)
      .then((data) => {
        if (isMounted) setSummary(data);
      })
      .catch((err) => {
        console.error('Failed to load campaign summary:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingSummary(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSlug]);

  const activeCampaign = campaigns.find((c) => c.slug === selectedSlug);

  return (
    <ScholarshipShell activeTab="overview">
      {/* Loading State */}
      {loadingCampaigns && (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-[#0052CC]" size={36} />
          <p className="text-sm font-semibold text-slate-600">Đang tải danh mục học bổng...</p>
        </div>
      )}

      {/* Error State */}
      {!loadingCampaigns && error && (
        <div className="max-w-xl mx-auto my-12 p-6 rounded-2xl bg-red-50 border border-red-200 text-center">
          <p className="text-sm font-bold text-red-800">{error}</p>
          <button
            type="button"
            onClick={() => void loadCampaigns()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
          >
            <RefreshCw size={14} />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* Empty State: HONEST "SẮP CÔNG BỐ" */}
      {!loadingCampaigns && !error && campaigns.length === 0 && (
        <div className="max-w-3xl mx-auto py-12 px-4 text-center">
          <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800 shadow-xl shadow-amber-500/10 mb-6 border border-amber-300/60">
            <Trophy size={48} className="text-amber-700 animate-bounce" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-[#003375] tracking-tight">
            Mùa Vinh Danh Học Bổng — Sắp công bố
          </h2>
          <p className="mt-4 text-base text-slate-600 max-w-xl mx-auto leading-relaxed">
            Hiện tại nhà trường chưa công bố danh sách học bổng chính thức cho học kỳ này.
            Dữ liệu sẽ được đồng bộ và xác thực minh bạch ngay khi có quyết định ban hành.
          </p>

          <div className="mt-8 p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm max-w-lg mx-auto text-left space-y-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <p className="text-xs text-slate-600">
                <strong className="text-slate-800">Dữ liệu chính thức:</strong> HUB Planner không suy đoán điểm số hay tạo thành tích giả. Mọi kết quả công bố đều được đối chiếu từ quyết định trao thưởng chính thống.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Bell className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <p className="text-xs text-slate-600">
                <strong className="text-slate-800">Thông báo tự động:</strong> Khi danh sách được duyệt công khai, bạn có thể tra cứu và tạo ảnh vinh danh ngay tại đây.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/handbook/scholarships"
              onClick={playClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <span>Xem quy chế học bổng</span>
              <ChevronRight size={15} />
            </Link>
            <Link
              to="/scholarships/me"
              onClick={playClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0052CC] text-white text-xs font-bold hover:bg-[#0040a8] transition-colors shadow-sm"
            >
              <span>Kiểm tra hồ sơ cá nhân</span>
              <ChevronRight size={15} />
            </Link>
          </div>
        </div>
      )}

      {/* Published State: Academic Celebration Hero & Dashboard */}
      {!loadingCampaigns && !error && campaigns.length > 0 && activeCampaign && (
        <div className="space-y-8 animate-fadeIn">
          {/* Hero Banner */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#002B66] via-[#003E8A] to-[#0A4EA3] text-white p-6 sm:p-10 shadow-xl shadow-blue-950/15 border border-blue-800/40">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-amber-400/15 via-blue-400/10 to-transparent rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative z-10 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-amber-300 text-xs font-extrabold mb-4 shadow-xs">
                <Sparkles size={14} />
                <span>CHÍNH THỨC CÔNG BỐ</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
                {activeCampaign.title}
              </h1>

              <p className="mt-3 text-sm sm:text-base text-blue-100/90 leading-relaxed max-w-2xl">
                Tuyên dương và vinh danh những gương mặt sinh viên HUB có thành tích học tập và rèn luyện xuất sắc trong năm học {activeCampaign.schoolYear} ({activeCampaign.semester}).
              </p>

              {/* Campaign Selector if multiple published */}
              {campaigns.length > 1 && (
                <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-blue-200 font-semibold">Chọn đợt học bổng:</span>
                  <select
                    value={selectedSlug}
                    onChange={(e) => setSelectedSlug(e.target.value)}
                    className="bg-white/15 text-white font-bold border border-white/30 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-300 transition-all cursor-pointer"
                  >
                    {campaigns.map((c) => (
                      <option key={c.slug} value={c.slug} className="text-slate-900">
                        {c.title} ({c.schoolYear})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Official Provenance Badge */}
            <div className="relative z-10 mt-8 pt-6 border-t border-white/15 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2 text-blue-200">
                <FileCheck size={16} className="text-emerald-400 shrink-0" />
                <span>Nguồn quyết định: <strong className="text-white">{activeCampaign.sourceTitle}</strong></span>
                <span className="opacity-50">•</span>
                <span className="font-mono text-[11px] text-amber-200">{activeCampaign.sourceDocument}</span>
              </div>

              {activeCampaign.sourceUrl && (
                <a
                  href={activeCampaign.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors border border-white/20"
                >
                  <span>Xem văn bản gốc</span>
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </section>

          {/* Quick Metrics Bar */}
          {summary && (
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Tổng lượt nhận</span>
                  <Award size={18} className="text-[#0052CC]" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#003375]">
                  {loadingSummary ? '...' : summary.totalRecipients.toLocaleString('vi-VN')}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Lượt trao tặng học bổng</p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Sinh viên đạt</span>
                  <Users size={18} className="text-emerald-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-800">
                  {loadingSummary ? '...' : summary.totalStudents.toLocaleString('vi-VN')}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Cá nhân xuất sắc</p>
              </div>

              <div className="col-span-2 p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Phân hạng học bổng</span>
                  <Trophy size={18} className="text-amber-500" />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {loadingSummary ? (
                    <span className="text-xs text-slate-400">Đang tải phân hạng...</span>
                  ) : summary.awards.length > 0 ? (
                    summary.awards.map((aw) => (
                      <div
                        key={aw.awardType}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-700"
                      >
                        <ScholarshipBadge awardType={aw.awardType} size="sm" />
                        <span className="text-slate-900 font-extrabold">{aw.count}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">Không có phân hạng</span>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Core Feature Pillars (3 Cards) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Tra cứu */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0052CC] flex items-center justify-center mb-4">
                  <FileSearch size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Tra cứu công khai</h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                  Tìm kiếm nhanh chóng theo họ tên (có dấu hoặc không dấu) hoặc mã số sinh viên (MSSV) để xem danh sách đạt thưởng.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <Link
                  to="/scholarships/search"
                  onClick={playClick}
                  className="w-full inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 text-[#0052CC] font-bold text-xs hover:bg-blue-100 transition-colors"
                >
                  <span>Mở trang tra cứu</span>
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>

            {/* 2. Danh sách đầy đủ */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
                  <Award size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Danh sách đầy đủ</h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                  Duyệt toàn bộ danh sách người nhận học bổng với phân trang chi tiết, bộ lọc theo phân hạng và các cột điểm đã duyệt.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <Link
                  to="/scholarships/list"
                  onClick={playClick}
                  className="w-full inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-800 font-bold text-xs hover:bg-emerald-100 transition-colors"
                >
                  <span>Xem danh sách đầy đủ</span>
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>

            {/* 3. Studio Vinh danh */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-50/70 via-white to-amber-100/30 border border-amber-200/70 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mb-4">
                  <Sparkles size={24} />
                </div>
                <h3 className="text-lg font-bold text-amber-950 flex items-center gap-2">
                  <span>Studio Vinh danh</span>
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-200/80 text-amber-900">
                    Hot
                  </span>
                </h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                  Dành riêng cho sinh viên đạt giải: Tải ảnh chân dung, tùy biến khung nghệ thuật và xuất thiệp vinh danh 1080p sang trọng chia sẻ Story/Feed.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-amber-200/50">
                <Link
                  to="/scholarships/celebrate"
                  onClick={playClick}
                  className="w-full inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 font-extrabold text-xs hover:brightness-105 transition-all shadow-xs"
                >
                  <span>Tạo thiệp vinh danh</span>
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          </section>

          {/* Trust & Transparency Section */}
          <section className="p-6 rounded-2xl bg-white border border-slate-200/80 text-xs text-slate-600 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <ShieldCheck className="text-blue-600" size={17} />
              <span>Tiêu chuẩn dữ liệu minh bạch</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <strong className="text-slate-800 block mb-1">Quyết định ban hành</strong>
                Mọi kết quả đều dẫn chiếu số hiệu quyết định và mã hash kiểm tra bảo toàn tính xác thực.
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <strong className="text-slate-800 block mb-1">Bảo vệ quyền riêng tư</strong>
                Chỉ hiển thị các cột điểm và thông tin đã được phê duyệt công khai.
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <strong className="text-slate-800 block mb-1">Xác thực chính chủ</strong>
                Studio vinh danh liên kết trực tiếp với tài khoản trường xác minh (@st.buh.edu.vn).
              </div>
            </div>
          </section>
        </div>
      )}
    </ScholarshipShell>
  );
};
