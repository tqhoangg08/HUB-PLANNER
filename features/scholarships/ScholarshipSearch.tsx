import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  ChevronRight,
  Clock,
  FileCheck,
  FileSearch,
  Filter,
  GraduationCap,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react';
import { ScholarshipShell } from './ScholarshipShell';
import { ScholarshipBadge } from './ScholarshipBadge';
import { ScoreBadges, formatScoreValue } from './ScoreBadges';
import {
  fetchPublicCampaigns,
  searchCampaignRecipients,
  type Campaign,
  type Recipient,
  type ScoreColumn,
  ScholarshipApiError,
} from '../../utils/scholarshipApi';
import { playClick } from '../../utils/audio';

export const ScholarshipSearch: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(20);
  const [scoreColumns, setScoreColumns] = useState<ScoreColumn[]>([]);

  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(true);
  const [searching, setSearching] = useState<boolean>(false);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number>(60);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Load campaigns
  useEffect(() => {
    let active = true;
    setLoadingCampaigns(true);
    fetchPublicCampaigns({ limit: 50 })
      .then((data) => {
        if (!active) return;
        setCampaigns(data.campaigns);
        if (data.campaigns.length > 0) {
          setSelectedSlug(data.campaigns[0].slug);
          setScoreColumns(data.campaigns[0].scoreColumns || []);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ScholarshipApiError ? err.message : 'Không thể tải danh sách đợt học bổng.');
      })
      .finally(() => {
        if (active) setLoadingCampaigns(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // When campaign changes, update score columns & clear prior results
  useEffect(() => {
    if (!selectedSlug) return;
    const c = campaigns.find((x) => x.slug === selectedSlug);
    if (c) {
      setScoreColumns(c.scoreColumns || []);
    }
    if (debouncedQuery.trim().length >= 2) {
      void executeSearch(debouncedQuery.trim(), selectedSlug, 1);
    }
  }, [selectedSlug]);

  // Debounce query (400ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);

    return () => {
      clearTimeout(handler);
    };
  }, [query]);

  // Trigger search when debouncedQuery changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length >= 2 && selectedSlug) {
      void executeSearch(trimmed, selectedSlug, 1);
    } else if (trimmed.length === 0) {
      setRecipients([]);
      setTotal(0);
      setHasSearched(false);
      setError(null);
    }
  }, [debouncedQuery]);

  // Rate limit countdown timer
  useEffect(() => {
    if (!isRateLimited) return;
    const timer = setInterval(() => {
      setRateLimitSeconds((prev) => {
        if (prev <= 1) {
          setIsRateLimited(false);
          clearInterval(timer);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRateLimited]);

  const executeSearch = async (searchTerm: string, slug: string, p = 1) => {
    if (searchTerm.length < 2 || !slug) return;
    setSearching(true);
    setError(null);
    setIsRateLimited(false);
    setHasSearched(true);

    try {
      const data = await searchCampaignRecipients(slug, {
        q: searchTerm,
        page: p,
        limit,
      });
      setRecipients(data.recipients);
      setTotal(data.total);
      setPage(p);
      if (data.campaign) {
        setScoreColumns(data.campaign.scoreColumns || []);
      }
    } catch (err) {
      if (err instanceof ScholarshipApiError && err.status === 429) {
        setIsRateLimited(true);
        setRateLimitSeconds(60);
      } else {
        setError(err instanceof ScholarshipApiError ? err.message : 'Không thể thực hiện tìm kiếm.');
      }
      setRecipients([]);
      setTotal(0);
    } finally {
      setSearching(false);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError('Từ khóa tra cứu cần có ít nhất 2 ký tự.');
      return;
    }
    void executeSearch(trimmed, selectedSlug, 1);
    playClick();
  };

  const handleClear = () => {
    setQuery('');
    setDebouncedQuery('');
    setRecipients([]);
    setTotal(0);
    setHasSearched(false);
    setError(null);
    searchInputRef.current?.focus();
    playClick();
  };

  const activeCampaign = campaigns.find((c) => c.slug === selectedSlug);

  return (
    <ScholarshipShell
      activeTab="search"
      title="Tra cứu học bổng công khai"
      subtitle="Tìm kiếm theo họ tên (có dấu/không dấu) hoặc mã số sinh viên trong các đợt học bổng đã công bố."
    >
      {/* Loading state for campaigns */}
      {loadingCampaigns && (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-[#0052CC]" size={36} />
          <p className="text-sm font-semibold text-slate-600">Đang chuẩn bị công cụ tra cứu...</p>
        </div>
      )}

      {/* Empty State when zero campaigns published */}
      {!loadingCampaigns && campaigns.length === 0 && (
        <div className="max-w-xl mx-auto py-16 text-center bg-white rounded-3xl p-8 border border-slate-200 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 mx-auto flex items-center justify-center mb-4">
            <Trophy size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#003375]">Chưa có đợt học bổng để tra cứu</h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Hiện tại nhà trường chưa công bố danh sách học bổng chính thức. Tính năng tra cứu sẽ kích hoạt ngay khi có dữ liệu ban hành.
          </p>
        </div>
      )}

      {/* Main Search View */}
      {!loadingCampaigns && campaigns.length > 0 && activeCampaign && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Critical Disclaimer Banner */}
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-xs">
            <ShieldAlert size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Lưu ý quan trọng về tính pháp lý:</p>
              <p className="text-amber-800/90 leading-relaxed">
                Kết quả tra cứu công khai chỉ dùng để đối chiếu thông tin và <strong>KHÔNG</strong> được sử dụng làm bằng chứng pháp lý chứng minh quyền sở hữu học bổng hay xác nhận thành tích cá nhân.
                Để xem học bổng đã xác minh của chính bạn, vui lòng truy cập{' '}
                <Link to="/scholarships/me" className="font-bold underline text-[#003375] hover:text-[#0052CC]">
                  Học bổng của tôi
                </Link>.
              </p>
            </div>
          </div>

          {/* Search Input Box */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4">
            {/* Campaign Selection Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-[#0052CC]" />
                <span className="font-bold text-slate-700">Đợt học bổng:</span>
                <select
                  value={selectedSlug}
                  onChange={(e) => setSelectedSlug(e.target.value)}
                  className="bg-slate-50 border border-slate-200 font-bold text-slate-900 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-[#0052CC]"
                >
                  {campaigns.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.title} — {c.schoolYear} ({c.semester})
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <FileCheck size={13} className="text-emerald-600" />
                <span>Quyết định: <strong className="text-slate-700">{activeCampaign.sourceDocument}</strong></span>
              </div>
            </div>

            {/* Search Input Bar */}
            <form onSubmit={handleManualSearch} className="relative flex items-center">
              <div className="absolute left-4 text-slate-400 pointer-events-none">
                <Search size={20} />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập họ tên (VD: Văn Đạt, Nguyễn) hoặc MSSV (VD: 000000000001)..."
                className="w-full pl-12 pr-28 py-3.5 bg-slate-50 border border-slate-300 rounded-2xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-[#0052CC] focus:ring-2 focus:ring-[#0052CC]/20 outline-none transition-all"
                autoComplete="off"
                spellCheck="false"
              />

              <div className="absolute right-3 flex items-center gap-1.5">
                {query && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                    title="Xóa từ khóa"
                  >
                    <X size={16} />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={searching || query.trim().length < 2}
                  className="px-4 py-2 rounded-xl bg-[#0052CC] text-white text-xs font-bold hover:bg-[#0040a8] disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-2xs"
                >
                  {searching ? <Loader2 size={14} className="animate-spin" /> : 'Tra cứu'}
                </button>
              </div>
            </form>

            {/* Search Tips */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Hỗ trợ tìm kiếm tiếng Việt không dấu (VD: <em>van dat</em> sẽ tìm thấy <em>Nguyễn Văn Đạt</em>).</span>
              <span>Yêu cầu tối thiểu 2 ký tự.</span>
            </div>
          </div>

          {/* 429 Rate Limit State */}
          {isRateLimited && (
            <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-3">
              <Clock size={32} className="mx-auto text-amber-700 animate-pulse" />
              <h3 className="text-base font-bold text-amber-900">Giới hạn truy vấn tạm thời (HTTP 429)</h3>
              <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed">
                Để bảo vệ hệ thống khỏi các hành vi thu thập dữ liệu hàng loạt, hệ thống chỉ cho phép tối đa 60 yêu cầu tra cứu/phút.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-200/80 text-amber-900 text-xs font-mono font-bold">
                Thử lại sau {rateLimitSeconds} giây...
              </div>
            </div>
          )}

          {/* System Error */}
          {!isRateLimited && error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => executeSearch(query.trim(), selectedSlug, page)}
                className="inline-flex items-center gap-1 text-red-700 hover:underline"
              >
                <RefreshCw size={12} />
                <span>Thử lại</span>
              </button>
            </div>
          )}

          {/* Searching Loader */}
          {searching && (
            <div className="py-16 text-center bg-white rounded-3xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-3">
              <Loader2 className="animate-spin text-[#0052CC]" size={32} />
              <p className="text-xs font-semibold text-slate-500">Đang tra cứu cơ sở dữ liệu...</p>
            </div>
          )}

          {/* Not Found State */}
          {!searching && !isRateLimited && hasSearched && recipients.length === 0 && !error && (
            <div className="py-16 text-center bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-3">
              <FileSearch className="mx-auto text-slate-300" size={44} />
              <h3 className="text-base font-bold text-slate-800">Không tìm thấy kết quả</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Không tìm thấy sinh viên nào khớp với từ khóa <strong>"{debouncedQuery.trim()}"</strong> trong đợt học bổng {activeCampaign.title}.
              </p>
              <div className="pt-2 text-xs text-slate-600 flex flex-col items-center gap-1">
                <span>Gợi ý:</span>
                <span className="text-slate-500">• Thử tìm kiếm theo họ hoặc tên riêng</span>
                <span className="text-slate-500">• Kiểm tra lại mã số sinh viên (12 chữ số)</span>
                <span className="text-slate-500">• Chọn đúng học kỳ hoặc năm học của đợt khen thưởng</span>
              </div>
            </div>
          )}

          {/* Search Results Display */}
          {!searching && recipients.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>
                  Tìm thấy <strong>{total}</strong> kết quả phù hợp cho <strong>"{debouncedQuery.trim()}"</strong>
                </span>
                {total > 1 && (
                  <span className="text-amber-700 font-semibold flex items-center gap-1">
                    <Info size={13} />
                    <span>Lưu ý: Có nhiều ứng viên cùng tên / khớp từ khóa</span>
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {recipients.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-blue-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-extrabold text-[#003375] px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100">
                          {rec.studentCode}
                        </span>
                        <ScholarshipBadge awardType={rec.awardType} size="sm" />
                      </div>

                      <h4 className="text-base font-black text-slate-900 tracking-tight">
                        {rec.fullName}
                      </h4>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {rec.className && <span>Lớp: <strong className="text-slate-700">{rec.className}</strong></span>}
                        {rec.major && <span>Ngành: <strong className="text-slate-700">{rec.major}</strong></span>}
                        <span>Đợt: <strong className="text-slate-700">{activeCampaign.semester} ({activeCampaign.schoolYear})</strong></span>
                      </div>
                    </div>

                    {/* Approved Scores for this candidate */}
                    {scoreColumns.length > 0 && (
                      <div className="sm:border-l sm:border-slate-100 sm:pl-4 shrink-0">
                        <ScoreBadges scoreColumns={scoreColumns} scores={rec.scores} variant="compact" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Call to action for personal verification */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2 text-blue-900">
                  <UserCheck size={18} className="text-[#0052CC] shrink-0" />
                  <span>
                    Đây là thành tích của chính bạn? Hãy đăng nhập để xác thực và tạo thiệp vinh danh.
                  </span>
                </div>
                <Link
                  to="/scholarships/me"
                  onClick={playClick}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0052CC] text-white font-bold hover:bg-[#0040a8] transition-colors shadow-2xs"
                >
                  <span>Xác thực ngay</span>
                  <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </ScholarshipShell>
  );
};
