import React, { useEffect, useState } from 'react';
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Filter,
  GraduationCap,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trophy,
} from 'lucide-react';
import { ScholarshipShell } from './ScholarshipShell';
import { ScholarshipBadge } from './ScholarshipBadge';
import { ScoreBadges, formatScoreValue } from './ScoreBadges';
import {
  fetchPublicCampaigns,
  fetchCampaignRecipients,
  fetchCampaignSummary,
  type Campaign,
  type Recipient,
  type ScoreColumn,
  ScholarshipApiError,
} from '../../utils/scholarshipApi';
import { playClick } from '../../utils/audio';

export const ScholarshipList: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [selectedAwardType, setSelectedAwardType] = useState<string>('');
  const [availableAwardTypes, setAvailableAwardTypes] = useState<string[]>([]);
  const [scoreColumns, setScoreColumns] = useState<ScoreColumn[]>([]);

  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(true);
  const [loadingRecipients, setLoadingRecipients] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

  // 2. When slug changes, load summary for award types & reset page/filters
  useEffect(() => {
    if (!selectedSlug) return;
    setPage(1);
    setSelectedAwardType('');

    const current = campaigns.find((c) => c.slug === selectedSlug);
    if (current) {
      setScoreColumns(current.scoreColumns || []);
    }

    fetchCampaignSummary(selectedSlug)
      .then((sum) => {
        setAvailableAwardTypes(sum.awards.map((a) => a.awardType));
      })
      .catch(() => {
        setAvailableAwardTypes([]);
      });
  }, [selectedSlug, campaigns]);

  // 3. Load recipients
  const loadRecipients = async (p = page, award = selectedAwardType) => {
    if (!selectedSlug) return;
    setLoadingRecipients(true);
    setError(null);

    try {
      const data = await fetchCampaignRecipients(selectedSlug, {
        page: p,
        limit,
        awardType: award || undefined,
      });
      setRecipients(data.recipients);
      setTotal(data.total);
      if (data.campaign) {
        setScoreColumns(data.campaign.scoreColumns || []);
      }
    } catch (err) {
      setError(err instanceof ScholarshipApiError ? err.message : 'Không thể tải danh sách người nhận học bổng.');
    } finally {
      setLoadingRecipients(false);
    }
  };

  useEffect(() => {
    if (selectedSlug) {
      void loadRecipients(page, selectedAwardType);
    }
  }, [selectedSlug, page, limit, selectedAwardType]);

  const activeCampaign = campaigns.find((c) => c.slug === selectedSlug);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    playClick();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <ScholarshipShell
      activeTab="list"
      title="Danh sách học bổng chính thức"
      subtitle="Danh sách người nhận học bổng từ các quyết định đã được nhà trường phê duyệt công khai."
    >
      {/* Loading state for campaigns */}
      {loadingCampaigns && (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-[#0052CC]" size={36} />
          <p className="text-sm font-semibold text-slate-600">Đang tải danh mục đợt học bổng...</p>
        </div>
      )}

      {/* Honest Empty State when zero campaigns published */}
      {!loadingCampaigns && campaigns.length === 0 && (
        <div className="max-w-xl mx-auto py-16 text-center bg-white rounded-3xl p-8 border border-slate-200 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 mx-auto flex items-center justify-center mb-4">
            <Trophy size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#003375]">Sắp công bố danh sách</h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Chưa có đợt học bổng nào được công bố chính thức. Khi nhà trường ban hành quyết định, danh sách đầy đủ sẽ xuất hiện tại đây.
          </p>
        </div>
      )}

      {/* Published Campaigns View */}
      {!loadingCampaigns && campaigns.length > 0 && activeCampaign && (
        <div className="space-y-6">
          {/* Top Control Bar: Campaign selector, Award Filter, Page size */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left: Campaign Dropdown */}
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="campaign-select" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Layers size={14} className="text-[#0052CC]" />
                <span>Đợt học bổng:</span>
              </label>
              <select
                id="campaign-select"
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-3 py-2 outline-none focus:border-[#0052CC] focus:ring-1 focus:ring-[#0052CC]"
              >
                {campaigns.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title} — {c.schoolYear} ({c.semester})
                  </option>
                ))}
              </select>
            </div>

            {/* Right: Award Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
                <Filter size={13} />
                <span>Loại:</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedAwardType('');
                  setPage(1);
                  playClick();
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  selectedAwardType === ''
                    ? 'bg-[#003375] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tất cả ({total})
              </button>
              {availableAwardTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedAwardType(type);
                    setPage(1);
                    playClick();
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedAwardType === type
                      ? 'bg-[#0052CC] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Error notice */}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void loadRecipients()}
                className="inline-flex items-center gap-1 text-red-700 hover:underline"
              >
                <RefreshCw size={12} />
                <span>Thử lại</span>
              </button>
            </div>
          )}

          {/* Results Summary & Pagination Header */}
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <div>
              Hiển thị <strong>{recipients.length}</strong> / <strong>{total}</strong> sinh viên
              {selectedAwardType && <span> ({selectedAwardType})</span>}
            </div>
            <div className="flex items-center gap-2">
              <span>Số dòng:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-white border border-slate-200 rounded-md px-2 py-0.5 text-xs font-bold"
              >
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* Loading Indicator */}
          {loadingRecipients ? (
            <div className="py-24 text-center bg-white rounded-3xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-3">
              <Loader2 className="animate-spin text-[#0052CC]" size={32} />
              <p className="text-xs font-semibold text-slate-500">Đang tải danh sách người nhận...</p>
            </div>
          ) : recipients.length === 0 ? (
            /* No recipients match filter */
            <div className="py-16 text-center bg-white rounded-3xl border border-slate-200 shadow-xs p-6">
              <Award className="mx-auto text-slate-300 mb-3" size={40} />
              <h3 className="text-base font-bold text-slate-800">Không có kết quả</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Không tìm thấy người nhận học bổng nào phù hợp với bộ lọc đã chọn.
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW */}
              <div className="hidden md:block overflow-hidden rounded-2xl bg-white border border-slate-200/90 shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3.5 px-4 w-12 text-center">STT</th>
                        <th className="py-3.5 px-4">MSSV</th>
                        <th className="py-3.5 px-4">Họ và tên</th>
                        <th className="py-3.5 px-4">Loại học bổng</th>
                        <th className="py-3.5 px-4">Lớp</th>
                        <th className="py-3.5 px-4">Ngành</th>
                        {/* Dynamic Approved Score Columns */}
                        {scoreColumns.map((col) => (
                          <th key={col.key} className="py-3.5 px-4 text-center whitespace-nowrap">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recipients.map((rec, index) => {
                        const stt = (page - 1) * limit + index + 1;
                        return (
                          <tr
                            key={rec.id}
                            className="hover:bg-blue-50/40 transition-colors"
                          >
                            <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                              {stt}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {rec.studentCode}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-900">
                              {rec.fullName}
                            </td>
                            <td className="py-3.5 px-4">
                              <ScholarshipBadge awardType={rec.awardType} size="sm" />
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 font-medium">
                              {rec.className || '—'}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 font-medium">
                              {rec.major || '—'}
                            </td>
                            {/* Dynamic Score Cells */}
                            {scoreColumns.map((col) => (
                              <td
                                key={col.key}
                                className="py-3.5 px-4 text-center font-bold text-[#003375] font-mono"
                              >
                                {formatScoreValue(rec.scores?.[col.key])}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MOBILE CARDS VIEW */}
              <div className="md:hidden space-y-3">
                {recipients.map((rec, index) => {
                  const stt = (page - 1) * limit + index + 1;
                  return (
                    <div
                      key={rec.id}
                      className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                            #{stt}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-700">
                            {rec.studentCode}
                          </span>
                        </div>
                        <ScholarshipBadge awardType={rec.awardType} size="sm" />
                      </div>

                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900">
                          {rec.fullName}
                        </h4>
                        {(rec.className || rec.major) && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {rec.className ? `Lớp ${rec.className}` : ''}
                            {rec.className && rec.major ? ' • ' : ''}
                            {rec.major || ''}
                          </p>
                        )}
                      </div>

                      {/* Approved Scores on Mobile */}
                      {scoreColumns.length > 0 && (
                        <div className="pt-2 border-t border-slate-100">
                          <ScoreBadges
                            scoreColumns={scoreColumns}
                            scores={rec.scores}
                            variant="chips"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronLeft size={16} />
                    <span>Trang trước</span>
                  </button>

                  <div className="text-xs font-bold text-slate-700">
                    Trang <span className="text-[#0052CC]">{page}</span> / {totalPages}
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <span>Trang sau</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </ScholarshipShell>
  );
};
