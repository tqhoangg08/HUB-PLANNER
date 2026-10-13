import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { ScholarshipShell } from './ScholarshipShell';
import { ScholarshipBadge } from './ScholarshipBadge';
import { ScoreBadges, formatScoreValue } from './ScoreBadges';
import {
  fetchPublicCampaigns,
  fetchCampaignRecipients,
  fetchCampaignSummary,
  searchCampaignRecipients,
  type Campaign,
  type Recipient,
  type ScoreColumn,
  ScholarshipApiError,
} from '../../utils/scholarshipApi';
import { playClick } from '../../utils/audio';

export const ScholarshipList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Search params sync
  const queryParam = searchParams.get('q') || '';
  const campaignParam = searchParams.get('campaign') || '';
  const categoryParam = searchParams.get('category') || '';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const limitParam = parseInt(searchParams.get('limit') || '20', 10);

  // Core state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(campaignParam);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Search input local state
  const [searchInput, setSearchInput] = useState<string>(queryParam);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(queryParam);

  // Filters & Pagination
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryParam);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [page, setPage] = useState<number>(Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1);
  const [limit, setLimit] = useState<number>([20, 30, 50].includes(limitParam) ? limitParam : 20);

  // Table Data
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [scoreColumns, setScoreColumns] = useState<ScoreColumn[]>([]);

  // Mobile expandable cards
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});

  // Loading & Error States
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(true);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null);

  const searchInputId = useId();
  const campaignSelectId = useId();
  const categorySelectId = useId();

  // Abort controller ref for cancelling previous in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sync debounced search / filters to URL params
  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (debouncedQuery) nextParams.set('q', debouncedQuery);
    if (selectedSlug) nextParams.set('campaign', selectedSlug);
    if (selectedCategory) nextParams.set('category', selectedCategory);
    if (page > 1) nextParams.set('page', String(page));
    if (limit !== 20) nextParams.set('limit', String(limit));

    // Only update if changed
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [debouncedQuery, selectedSlug, selectedCategory, page, limit, setSearchParams, searchParams]);

  // Rate limit countdown timer
  useEffect(() => {
    if (rateLimitCountdown === null || rateLimitCountdown <= 0) return;
    const interval = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimitCountdown]);

  // 1. Fetch public campaigns on mount
  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    setError(null);
    try {
      const data = await fetchPublicCampaigns({ limit: 50 });
      setCampaigns(data.campaigns);

      // Select campaign from URL param if valid, else pick first published campaign
      if (data.campaigns.length > 0) {
        const found = data.campaigns.find((c) => c.slug === campaignParam);
        const chosen = found || data.campaigns[0];
        setSelectedSlug(chosen.slug);
        setSelectedCampaign(chosen);
        setScoreColumns(chosen.scoreColumns || []);
      } else {
        setSelectedSlug('');
        setSelectedCampaign(null);
        setScoreColumns([]);
      }
    } catch (err) {
      if (err instanceof ScholarshipApiError) {
        // Sanitize technical messages for students
        if (err.status === 404 && err.message.toLowerCase().includes('not found')) {
          setError('Không thể kết nối đến hệ thống học bổng. Vui lòng thử lại sau.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Không thể tải danh sách học bổng. Vui lòng thử lại.');
      }
    } finally {
      setLoadingCampaigns(false);
    }
  }, [campaignParam]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  // 2. When selectedSlug changes, update campaign metadata & fetch categories
  useEffect(() => {
    if (!selectedSlug) return;
    const current = campaigns.find((c) => c.slug === selectedSlug);
    if (current) {
      setSelectedCampaign(current);
      setScoreColumns(current.scoreColumns || []);
    }

    // Fetch summary for award types
    fetchCampaignSummary(selectedSlug)
      .then((sum) => {
        setAvailableCategories(sum.awards.map((a) => a.awardType));
      })
      .catch(() => {
        setAvailableCategories([]);
      });
  }, [selectedSlug, campaigns]);

  // 3. Main Data Fetching (List or Search)
  const loadData = useCallback(async () => {
    if (!selectedSlug) return;

    // If query has exactly 1 char, backend requires >= 2 chars for search API
    // Don't send request yet, user is still typing
    if (debouncedQuery.length === 1) {
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    setLoadingData(true);
    setError(null);

    try {
      let result;
      if (debouncedQuery.length >= 2) {
        // Call search endpoint
        result = await searchCampaignRecipients(
          selectedSlug,
          {
            q: debouncedQuery,
            page,
            limit,
            awardType: selectedCategory || undefined,
          },
          abortCtrl.signal,
        );
      } else {
        // Call list endpoint
        result = await fetchCampaignRecipients(
          selectedSlug,
          {
            page,
            limit,
            awardType: selectedCategory || undefined,
          },
          abortCtrl.signal,
        );
      }

      setRecipients(result.recipients);
      setTotal(result.total);
    } catch (err: any) {
      if (err.name === 'AbortError') return;

      if (err instanceof ScholarshipApiError) {
        if (err.status === 429) {
          const retrySec = err.retryAfter || 5;
          setRateLimitCountdown(retrySec);
          setError(`Đã đạt giới hạn tra cứu. Vui lòng đợi ${retrySec} giây.`);
        } else if (err.status === 404) {
          setError('Đợt học bổng đã chọn hiện không khả dụng hoặc đã thay đổi.');
        } else {
          setError(err.message || 'Không thể tải danh sách. Vui lòng thử lại.');
        }
      } else {
        setError('Không thể tải danh sách. Vui lòng thử lại.');
      }
      setRecipients([]);
      setTotal(0);
    } finally {
      setLoadingData(false);
    }
  }, [selectedSlug, debouncedQuery, page, limit, selectedCategory]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Reset page when search or category changes
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setDebouncedQuery('');
    setPage(1);
  };

  const handleCampaignChange = (slug: string) => {
    playClick();
    setSelectedSlug(slug);
    setSelectedCategory('');
    setPage(1);
  };

  const handleCategoryChange = (cat: string) => {
    playClick();
    setSelectedCategory(cat);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    playClick();
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleExpandRow = (id: string) => {
    setExpandedRowIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <ScholarshipShell>
      <div className="space-y-6">
        {/* 1 & 2: Tiêu đề & Mô tả ngắn */}
        <section className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Danh sách học bổng
          </h1>
          <p className="text-sm sm:text-base text-gray-600 font-normal leading-relaxed">
            Tra cứu kết quả học bổng khuyến khích học tập và các danh hiệu khen thưởng sinh viên HUB theo từng đợt công bố.
          </p>
        </section>

        {/* 3: Ô tìm kiếm lớn, dễ nhận biết */}
        <section className="space-y-2">
          <div className="relative flex items-center">
            <label htmlFor={searchInputId} className="sr-only">
              Tìm theo họ tên hoặc mã sinh viên
            </label>
            <div className="absolute left-3.5 text-gray-400 pointer-events-none" aria-hidden="true">
              <Search size={19} />
            </div>
            <input
              id={searchInputId}
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Tìm theo họ tên hoặc mã sinh viên..."
              disabled={loadingCampaigns || campaigns.length === 0}
              className="w-full h-12 pl-11 pr-10 text-sm sm:text-base bg-white border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0052cc] focus:border-transparent transition-all shadow-xs disabled:bg-gray-100 disabled:text-gray-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 p-1 text-gray-400 hover:text-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
                title="Xóa tìm kiếm"
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <X size={17} />
              </button>
            )}
          </div>

          {/* Search helper hint if 1 char typed */}
          {searchInput.trim().length === 1 && (
            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
              Vui lòng nhập tối thiểu 2 ký tự để bắt đầu tìm kiếm.
            </p>
          )}

          {/* Rate Limit Alert */}
          {rateLimitCountdown !== null && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs sm:text-sm text-amber-800">
              <Clock size={16} className="text-amber-600 shrink-0" />
              <span>
                Bạn đã thực hiện nhiều lượt tra cứu. Vui lòng đợi <strong>{rateLimitCountdown}s</strong> trước khi tiếp tục.
              </span>
            </div>
          )}
        </section>

        {/* 4: Bộ lọc học kỳ, đợt học bổng và loại học bổng */}
        <section className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Đợt học bổng */}
            <div>
              <label htmlFor={campaignSelectId} className="block text-xs font-medium text-gray-700 mb-1">
                Đợt công bố
              </label>
              <select
                id={campaignSelectId}
                value={selectedSlug}
                onChange={(e) => handleCampaignChange(e.target.value)}
                disabled={loadingCampaigns || campaigns.length === 0}
                className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0052cc] focus:bg-white transition-all disabled:opacity-50"
              >
                {campaigns.length === 0 ? (
                  <option value="">Chưa có đợt học bổng</option>
                ) : (
                  campaigns.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.title} ({c.semester} - {c.schoolYear})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Loại học bổng */}
            <div>
              <label htmlFor={categorySelectId} className="block text-xs font-medium text-gray-700 mb-1">
                Loại học bổng
              </label>
              <select
                id={categorySelectId}
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                disabled={loadingCampaigns || campaigns.length === 0}
                className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0052cc] focus:bg-white transition-all disabled:opacity-50"
              >
                <option value="">Tất cả loại học bổng</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Số dòng trên trang */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="limit-select" className="block text-xs font-medium text-gray-700 mb-1">
                Hiển thị mỗi trang
              </label>
              <select
                id="limit-select"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                disabled={loadingCampaigns || campaigns.length === 0}
                className="w-full h-10 px-3 bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0052cc] focus:bg-white transition-all disabled:opacity-50"
              >
                <option value={20}>20 sinh viên / trang</option>
                <option value={30}>30 sinh viên / trang</option>
                <option value={50}>50 sinh viên / trang</option>
              </select>
            </div>
          </div>
        </section>

        {/* 5: Số lượng kết quả & Loading state */}
        <section className="flex items-center justify-between text-xs sm:text-sm text-gray-600 px-1">
          <div>
            {loadingData ? (
              <span className="inline-flex items-center gap-1.5 text-gray-500">
                <Loader2 size={14} className="animate-spin text-[#0052cc]" />
                Đang tải dữ liệu...
              </span>
            ) : total > 0 ? (
              <span>
                Tìm thấy <strong>{total.toLocaleString('vi-VN')}</strong> sinh viên
                {debouncedQuery ? ` phù hợp với "${debouncedQuery}"` : ''}
                {selectedCategory ? ` • ${selectedCategory}` : ''}
              </span>
            ) : (
              <span>0 sinh viên</span>
            )}
          </div>

          {selectedCampaign && (
            <div className="text-xs text-gray-500 hidden sm:block">
              Học kỳ {selectedCampaign.semester} • Năm học {selectedCampaign.schoolYear}
            </div>
          )}
        </section>

        {/* Error message banner */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-900 bg-red-100 hover:bg-red-200 px-2.5 py-1.5 rounded-md transition-colors"
            >
              <RefreshCw size={13} />
              Thử lại
            </button>
          </div>
        )}

        {/* 6: Bảng sinh viên và điểm công khai */}
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-xs">
          {/* A. Empty Launch State (Chưa công bố) */}
          {!loadingCampaigns && campaigns.length === 0 && (
            <div className="py-16 px-4 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                <FileText size={22} />
              </div>
              <h3 className="text-base font-semibold text-gray-800">
                Chưa có danh sách học bổng được công bố
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Hiện tại Nhà trường chưa ban hành danh sách học bổng chính thức nào trên hệ thống. Dữ liệu sẽ được cập nhật ngay khi có quyết định mới.
              </p>
            </div>
          )}

          {/* B. Loading Skeleton */}
          {loadingData && recipients.length === 0 && (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-md animate-pulse" />
              ))}
            </div>
          )}

          {/* C. Empty Results State (Không tìm thấy) */}
          {!loadingData && campaigns.length > 0 && recipients.length === 0 && !error && (
            <div className="py-14 px-4 text-center space-y-3">
              <div className="w-11 h-11 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                <Search size={20} />
              </div>
              <h3 className="text-base font-semibold text-gray-800">
                Không tìm thấy sinh viên phù hợp
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                {debouncedQuery
                  ? `Không có kết quả nào cho "${debouncedQuery}". Vui lòng kiểm tra lại họ tên có dấu hoặc mã sinh viên.`
                  : 'Không có dữ liệu trong bộ lọc đã chọn.'}
              </p>
              {debouncedQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <X size={14} />
                  Xóa từ khóa tìm kiếm
                </button>
              )}
            </div>
          )}

          {/* D. Data Table (Desktop View >= 768px) */}
          {recipients.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600">
                    <th scope="col" className="py-3 px-3 w-12 text-center">
                      STT
                    </th>
                    <th scope="col" className="py-3 px-3 font-semibold">
                      Mã SV
                    </th>
                    <th scope="col" className="py-3 px-3 font-semibold">
                      Họ và tên
                    </th>
                    <th scope="col" className="py-3 px-3 font-semibold">
                      Lớp
                    </th>
                    <th scope="col" className="py-3 px-3 font-semibold">
                      Loại học bổng
                    </th>
                    {scoreColumns.map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className="py-3 px-3 text-right font-semibold"
                        title={col.label}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recipients.map((r, idx) => {
                    const rowNumber = (page - 1) * limit + idx + 1;
                    return (
                      <tr
                        key={`${r.studentCode}-${r.awardType}-${idx}`}
                        className="hover:bg-gray-50/70 transition-colors"
                      >
                        <td className="py-3 px-3 text-center text-xs text-gray-400 font-mono">
                          {rowNumber}
                        </td>
                        <td className="py-3 px-3 font-mono text-gray-700 text-xs">
                          {r.studentCode || '—'}
                        </td>
                        <td className="py-3 px-3 font-medium text-gray-900">
                          {r.fullName}
                        </td>
                        <td className="py-3 px-3 text-gray-600 text-xs">
                          {r.className || '—'}
                        </td>
                        <td className="py-3 px-3">
                          <ScholarshipBadge awardType={r.awardType} size="sm" />
                        </td>
                        {scoreColumns.map((col) => {
                          const val = r.scores?.[col.key];
                          const display = formatScoreValue(val);
                          return (
                            <td
                              key={col.key}
                              className="py-3 px-3 text-right text-xs font-mono text-gray-700"
                            >
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* E. Mobile Card List (< 768px) */}
          {recipients.length > 0 && (
            <div className="md:hidden divide-y divide-gray-100">
              {recipients.map((r, idx) => {
                const rowId = `${r.studentCode}-${r.awardType}-${idx}`;
                const isExpanded = !!expandedRowIds[rowId];
                const rowNumber = (page - 1) * limit + idx + 1;
                const hasScores = scoreColumns.length > 0;

                return (
                  <div key={rowId} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono text-gray-400">#{rowNumber}</span>
                          <h4 className="text-sm font-semibold text-gray-900 truncate">
                            {r.fullName}
                          </h4>
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 font-mono">
                          MSSV: {r.studentCode || '—'} {r.className ? `• Lớp: ${r.className}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <ScholarshipBadge awardType={r.awardType} size="sm" />
                      </div>
                    </div>

                    {/* Expandable Scores section on mobile */}
                    {hasScores && (
                      <div>
                        <button
                          type="button"
                          onClick={() => handleToggleExpandRow(rowId)}
                          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 py-1"
                        >
                          <span>{isExpanded ? 'Ẩn điểm' : 'Xem điểm'}</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {isExpanded && (
                          <div className="mt-1.5 grid grid-cols-2 gap-1.5 p-2 bg-gray-50 rounded-md border border-gray-150 text-xs">
                            {scoreColumns.map((col) => {
                              const val = r.scores?.[col.key];
                              return (
                                <div key={col.key} className="flex justify-between items-center py-0.5 px-1">
                                  <span className="text-gray-500 truncate mr-1">{col.label}:</span>
                                  <span className="font-mono font-medium text-gray-800">
                                    {formatScoreValue(val)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 7: Phân trang (Pagination) */}
        {total > 0 && totalPages > 1 && (
          <section className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2">
            <div className="text-xs text-gray-500">
              Trang <strong>{page}</strong> trên <strong>{totalPages}</strong> (
              {(page - 1) * limit + 1}–{Math.min(page * limit, total)} trong tổng {total.toLocaleString('vi-VN')})
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1 || loadingData}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Trang trước"
              >
                <ChevronLeft size={15} />
                <span>Trước</span>
              </button>

              <div className="hidden xs:flex items-center gap-1 px-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }

                  const isCurrent = pageNum === page;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => handlePageChange(pageNum)}
                      disabled={loadingData}
                      className={`h-8 w-8 text-xs font-medium rounded-md transition-colors ${
                        isCurrent
                          ? 'bg-[#0052cc] text-white font-semibold'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages || loadingData}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Trang tiếp theo"
              >
                <span>Sau</span>
                <ChevronRight size={15} />
              </button>
            </div>
          </section>
        )}

        {/* 8: Nguồn công bố của trường */}
        {selectedCampaign && (
          <section className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-gray-800">
              <FileText size={15} className="text-[#0052cc]" />
              <span>Nguồn văn bản quyết định</span>
            </div>
            <p>
              {selectedCampaign.sourceDocument ? (
                <>
                  Căn cứ <strong>{selectedCampaign.sourceDocument}</strong>
                  {selectedCampaign.sourceTitle ? ` (${selectedCampaign.sourceTitle})` : ''} của Hiệu trưởng Trường Đại học Ngân hàng TP.HCM.
                </>
              ) : (
                'Số liệu được trích xuất từ văn bản phê duyệt danh sách học bổng chính thức của HUB.'
              )}
            </p>
            {selectedCampaign.sourceUrl && (
              <div className="pt-1">
                <a
                  href={selectedCampaign.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#0052cc] hover:underline font-medium"
                >
                  <span>Xem văn bản quyết định gốc</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
            <p className="text-[11px] text-gray-500 pt-1">
              * Lưu ý: Kết quả tra cứu công khai chỉ mang tính chất tham khảo. Văn bản quyết định chính thức và thông báo tài chính của Nhà trường là căn cứ pháp lý cao nhất.
            </p>
          </section>
        )}
      </div>
    </ScholarshipShell>
  );
};
