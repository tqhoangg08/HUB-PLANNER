import { Overlay } from './Overlay';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Bell, ExternalLink, Search, Calendar, X, ChevronLeft, ChevronRight, Filter, Building, ChevronDown } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';
import { fetchSchoolAnnouncements } from '../utils/announcementsApi';
import './school-announcements-modal.css';

const ITEMS_PER_PAGE = 10;
const ANNOUNCEMENT_WIDGET_CACHE_KEY = 'hub_school_announcements_widget_v1';
const ANNOUNCEMENT_WIDGET_CACHE_TTL_MS = 5 * 60 * 1000;
let announcementWidgetMemoryCache = null;

const readAnnouncementWidgetCache = () => {
  const now = Date.now();
  if (announcementWidgetMemoryCache && now - announcementWidgetMemoryCache.cachedAt < ANNOUNCEMENT_WIDGET_CACHE_TTL_MS) {
    return announcementWidgetMemoryCache.rows;
  }

  try {
    const raw = sessionStorage.getItem(ANNOUNCEMENT_WIDGET_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.rows) || now - Number(parsed.cachedAt || 0) >= ANNOUNCEMENT_WIDGET_CACHE_TTL_MS) {
      sessionStorage.removeItem(ANNOUNCEMENT_WIDGET_CACHE_KEY);
      return null;
    }
    announcementWidgetMemoryCache = parsed;
    return parsed.rows;
  } catch {
    sessionStorage.removeItem(ANNOUNCEMENT_WIDGET_CACHE_KEY);
    return null;
  }
};

const writeAnnouncementWidgetCache = (rows) => {
  const cacheEntry = { rows, cachedAt: Date.now() };
  announcementWidgetMemoryCache = cacheEntry;
  try {
    sessionStorage.setItem(ANNOUNCEMENT_WIDGET_CACHE_KEY, JSON.stringify(cacheEntry));
  } catch {
    // Cache is best-effort only.
  }
};

// =================================================================
// HÀM HELPER: DỊCH URL SANG TÊN PHÒNG BAN CHUẨN XÁC
// =================================================================
const getDepartmentName = (link) => {
  if (!link) return 'HUB Portal';
  const l = link.toLowerCase();
  
  if (l.includes('phongktdbcl')) return 'Phòng Khảo thí và ĐBCL';
  if (l.includes('scc.hub.edu.vn')) return 'Trung tâm SV và QHDN'; 
  if (l.includes('clc.hub.edu.vn')) return 'Ban quản lý CLC';
  if (l.includes('phongdaotao')) return 'Phòng Đào tạo';
  if (l.includes('phongqlcntt')) return 'Phòng Quản lý CNTT';
  if (l.includes('phongtstt')) return 'Phòng Tuyển sinh TT';
  if (l.includes('phongtochuc')) return 'Phòng Tổ chức';
  if (l.includes('phongketoan')) return 'Phòng Kế toán';
  if (l.includes('online.hub.edu.vn')) return 'HUB Portal';
  
  if (l.includes('hub.edu.vn')) return 'HUB'; 
  
  return 'HUB';
};

const SchoolAnnouncements = () => {
  // === STATE CHO WIDGET BÊN NGOÀI ===
  const [news, setNews] = useState([]);

  // === STATE CHO MODAL XEM TẤT CẢ ===
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalNews, setModalNews] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [request, setRequest] = useState({ page: 1, search: '', startDate: '', endDate: '' });
  const { page: currentPage, startDate, endDate } = request;
  const setCurrentPage = page => setRequest(previous => {
    const next = typeof page === 'function' ? page(previous.page) : page;
    return next === previous.page ? previous : { ...previous, page: next };
  });
  const [inputPage, setInputPage] = useState("1"); 
  const [isLoadingModal, setIsLoadingModal] = useState(false);

  // Bộ lọc
  const [searchQuery, setSearchQuery] = useState('');
  const [dateExpanded, setDateExpanded] = useState(false);
  const [modalError, setModalError] = useState('');
  const dialog = useRef(null);
  const opener = useRef(null);
  const titleId = useId();
  const datesId = useId();
  const closeModal = () => setIsModalOpen(false);
  const openModal = () => {
    setDateExpanded(window.matchMedia('(min-width: 640px)').matches);
    setRequest(previous => previous.search === searchQuery ? previous : { ...previous, search: searchQuery, page: 1 });
    setIsModalOpen(true);
  };
  const changeDate = (field, value) => setRequest(previous => ({ ...previous, [field]: value, page: 1 }));
  const clearFilters = () => {
    setSearchQuery('');
    setRequest({ page: 1, search: '', startDate: '', endDate: '' });
  };
  useEffect(() => {
    if (!isModalOpen) return;
    dialog.current?.focus({ preventScroll: true });
    const onKey = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closeModal(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')]
        .filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus({ preventScroll: true });
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, [isModalOpen]);

  // 1. FETCH 10 TIN MỚI NHẤT CHO WIDGET BÊN NGOÀI
  useEffect(() => {
    const cachedNews = readAnnouncementWidgetCache();
    if (cachedNews) {
      setNews(cachedNews);
      return;
    }

    const fetchNews = async () => {
      try {
        const response = await fetchSchoolAnnouncements('/events?resource=announcements&limit=10');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Không tải được thông báo trường.');
        const data = payload.data;
        if (data) {
          setNews(data);
          writeAnnouncementWidgetCache(data);
        }
      } catch (err) {
        console.error("Lỗi tải thông báo trường:", err);
      }
    };
    fetchNews();
  }, []);

  // One applied request owns pagination and filters. Debounce changes search and
  // page together; an obsolete/closed request cannot publish data or loading.
  useEffect(() => {
    if (!isModalOpen || searchQuery === request.search) return;
    const timer = setTimeout(() => setRequest(previous => ({ ...previous, search: searchQuery, page: 1 })), 500);
    return () => clearTimeout(timer);
  }, [isModalOpen, searchQuery, request.search]);

  useEffect(() => {
    if (!isModalOpen) return;
    let active = true;
    const controller = new AbortController();
    setIsLoadingModal(true);
    setModalError('');
    setModalNews([]);
    const params = new URLSearchParams({ resource: 'announcements', limit: String(ITEMS_PER_PAGE), offset: String((request.page - 1) * ITEMS_PER_PAGE) });
    for (const field of ['search', 'startDate', 'endDate']) if (request[field]) params.set(field, request[field]);
    (async () => {
      try {
        const response = await fetchSchoolAnnouncements('/events?' + params.toString(), { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Không tải được thông báo trường.');
        if (!active) return;
        setModalNews(payload.data || []);
        setTotalCount(payload.total || 0);
      } catch {
        if (!active) return;
        setModalNews([]);
        setTotalCount(0);
        setModalError('Không tải được thông báo trường. Vui lòng thử lại.');
      } finally {
        if (active) setIsLoadingModal(false);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [isModalOpen, request]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  useEffect(() => {
    setInputPage(currentPage.toString());
  }, [currentPage]);

  const handlePageSubmit = (e) => {
    if (e.key === 'Enter' || e.type === 'blur') {
      let newPage = parseInt(inputPage, 10);
      if (isNaN(newPage) || newPage < 1) newPage = 1;
      if (newPage > totalPages) newPage = totalPages;
      
      setCurrentPage(newPage);
      setInputPage(newPage.toString());
    }
  };

  const processLinkData = (item) => {
    let finalLink = 'https://online.hub.edu.vn/'; 
    if (item.link && typeof item.link === 'string') {
        const linkStr = item.link.toLowerCase().trim(); 
        if (!linkStr.includes('javascript') && !linkStr.includes('dopostback')) {
            if (!linkStr.startsWith('http://') && !linkStr.startsWith('https://')) {
                finalLink = 'https://' + item.link.trim();
            } else {
                finalLink = item.link.trim();
            }
        }
    }
    return finalLink;
  };

  /*
  const askNotificationAI = async () => {
    const question = aiQuestion.trim();
    if (!question || aiLoading) return;

    setAiLoading(true);
    setAiError('');
    setAiAnswer(null);

    try {
      const response = await fetch('/api/public/v1/announcement-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || 'Không thể hỏi AI thông báo.');
      setAiAnswer(payload);
    } catch (error) {
      setAiError(error.message || 'Không thể hỏi AI thông báo.');
    } finally {
      setAiLoading(false);
    }
  };

  */
  return (
    <>
      <div className="bg-white min-h-full rounded-xl overflow-hidden border border-gray-100 shadow-sm flex flex-col"> 
        <div className="bg-[#003375] px-3 py-2 lg:px-4 lg:py-3 flex justify-between items-center z-20 shrink-0">
          <h3 className="text-white font-bold text-xs lg:text-sm flex items-center gap-1.5 lg:gap-2">
            <Bell className="w-3.5 h-3.5 lg:w-4 lg:h-4 animate-pulse"/> 
            <span className="truncate">LINK THÔNG BÁO TỪ NGUỒN CHÍNH THỨC</span>
          </h3>
          <button 
            ref={opener}
            onClick={openModal}
            className="text-[10px] lg:text-xs text-blue-200 hover:text-white underline shrink-0 cursor-pointer font-medium"
          >
            Xem tất cả
          </button>
        </div>
        
        <div className="divide-y divide-gray-100 overflow-y-auto custom-scrollbar flex-1">
          {news.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">Đang cập nhật dữ liệu...</div>
          ) : (
            news.map((item) => {
              const finalLink = processLinkData(item);
              const deptName = getDepartmentName(finalLink);

              return (
                <a 
                  key={item.id} href={finalLink} target="_blank" rel="noreferrer"
                  className="block p-2 lg:p-3 hover:bg-blue-50 transition-colors group relative"
                  title={item.title}
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <p className="text-xs lg:text-sm font-medium text-gray-800 group-hover:text-[#003375] line-clamp-2 leading-snug transition-colors">
                      {item.title}
                    </p>
                    {item.is_new && <span className="bg-red-500 text-white text-[8px] lg:text-[9px] px-1 lg:px-1.5 py-0.5 rounded font-bold shrink-0">MỚI</span>}
                  </div>
                  
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] lg:text-[10px] text-gray-400 flex items-center gap-1">
                        {formatDate(item.date)}
                      </span>
                      <span className="text-[8px] lg:text-[9px] font-medium px-1.5 py-0.5 rounded border border-blue-100 bg-blue-50 text-blue-600/80 truncate max-w-[100px] sm:max-w-none">
                        {deptName}
                      </span>
                    </div>
                    <ExternalLink className="text-gray-300 group-hover:text-blue-400 w-3 h-3 lg:w-3 lg:h-3 transition-colors shrink-0"/>
                  </div>
                </a>
              );
            })
          )}
        </div>
      </div>

      {isModalOpen && (
        <Overlay className="announcements-overlay fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center" onClick={closeModal}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="announcements-panel bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            
            {/* Header Modal */}
            <div className="announcements-header bg-gradient-to-r from-[#003375] to-blue-700 text-white flex items-center justify-between shrink-0">
              <div className="flex min-w-0 items-center gap-2">
                <div className="hidden sm:block bg-white/20 p-2 rounded-lg"><Bell size={20} /></div>
                <div>
                  <h2 id={titleId} className="font-bold text-sm sm:text-lg leading-tight">Tra cứu link thông báo</h2>
                  <p className="text-blue-200 text-[10px] sm:text-xs">Dẫn về nguồn chính thức, không phải cổng thông báo của Nhà trường</p>
                </div>
              </div>
              <button type="button" aria-label="Đóng tra cứu thông báo" onClick={closeModal} className="announcements-touch shrink-0 text-white hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"><X size={20}/></button>
            </div>

            {/* Search stays visible; collapsing dates preserves the applied values. */}
            <div className="announcements-filters border-b border-gray-100 bg-gray-50 shrink-0">
              <div className="announcements-search-row flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <input type="search" aria-label="Tìm thông báo" placeholder="Nhập tên thông báo cần tìm..." value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    className="announcements-input w-full pl-9 pr-2 rounded-xl border border-gray-200 focus:border-[#003375] outline-none" />
                  <Search className="absolute left-3 top-3.5 text-gray-400 pointer-events-none" size={16} />
                </div>
                <button type="button" aria-expanded={dateExpanded} aria-controls={datesId} onClick={() => setDateExpanded(value => !value)}
                  className="announcements-touch flex shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#003375]">
                  Bộ lọc ngày{(startDate || endDate) && <span aria-label="Đang lọc ngày"> · {[startDate, endDate].filter(Boolean).length}</span>}
                  <ChevronDown size={16} className={dateExpanded ? 'rotate-180' : ''} />
                </button>
              </div>
              <div id={datesId} hidden={!dateExpanded} className="announcements-dates">
                <label className="min-w-0 text-xs text-gray-600">Từ ngày
                  <input type="date" aria-label="Từ ngày" value={startDate} onChange={event => changeDate('startDate', event.target.value)} className="announcements-input w-full min-w-0 rounded-lg border border-gray-200 px-2" />
                </label>
                <label className="min-w-0 text-xs text-gray-600">Đến ngày
                  <input type="date" aria-label="Đến ngày" value={endDate} onChange={event => changeDate('endDate', event.target.value)} className="announcements-input w-full min-w-0 rounded-lg border border-gray-200 px-2" />
                </label>
              </div>
              {(startDate || endDate) && <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-gray-600">
                <span className="truncate">{startDate || 'Từ đầu'} → {endDate || 'Hiện tại'}</span>
                <button type="button" className="min-h-[44px] shrink-0 px-2 font-semibold text-[#003375]" onClick={() => setRequest(previous => ({ ...previous, page: 1, startDate: '', endDate: '' }))}>Xóa ngày</button>
              </div>}
            </div>

            {/* Danh sách Data Modal */}
            {/*
            <div className="border-b border-gray-100 bg-white p-3 sm:p-4 shrink-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Sparkles size={16} className="text-[#003375]" />
                <h3 className="text-sm font-bold text-gray-800">Hỏi AI về thông báo</h3>
                <span className="text-[10px] text-gray-400">Ưu tiên tin mới, không tự bịa nếu thiếu dữ liệu</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(event) => setAiQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') askNotificationAI();
                  }}
                  placeholder="Ví dụ: Thông báo mới nhất về học phí HK2 là gì?"
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-[#003375] focus:ring-2 focus:ring-blue-500/20 outline-none text-sm transition-all"
                />
                <button
                  onClick={askNotificationAI}
                  disabled={aiLoading || !aiQuestion.trim()}
                  className="px-4 py-2 rounded-xl bg-[#003375] text-white text-sm font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Hỏi
                </button>
              </div>

              {(aiAnswer || aiError) && (
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  {aiError ? (
                    <p className="text-sm text-red-600 font-medium">{aiError}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{aiAnswer.reply}</p>
                      {aiAnswer.sources?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-blue-100">
                          <p className="text-[11px] font-bold text-gray-500 mb-2">Nguồn AI dùng để trả lời</p>
                          <div className="space-y-1.5">
                            {aiAnswer.sources.slice(0, 4).map((source, index) => (
                              <a
                                key={`${source.detail_url || source.pdf_url}-${index}`}
                                href={source.pdf_url || source.detail_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-xs text-[#003375] hover:underline"
                              >
                                {source.title || 'Thông báo HUB'}
                                {source.published_date ? ` (${source.published_date})` : ''}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            */}
            <div className="announcements-list min-h-0 flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-4 bg-white" tabIndex={0} aria-label="Danh sách thông báo" aria-busy={isLoadingModal}>
              {isLoadingModal ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <Filter size={30} className="animate-pulse" />
                  <p className="text-sm font-medium">Đang truy xuất dữ liệu...</p>
                </div>
              ) : modalError ? (
                <div role="alert" className="p-3 text-center text-sm text-gray-600">{modalError}<button type="button" className="announcements-touch block mx-auto font-semibold text-[#003375]" onClick={() => setRequest(previous => ({ ...previous }))}>Thử lại</button></div>
              ) : modalNews.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <Search size={40} className="text-gray-200" />
                  <p className="text-sm font-medium text-gray-500">Không tìm thấy thông báo nào phù hợp.</p>
                  <button onClick={clearFilters} className="mt-2 text-xs text-[#003375] font-bold hover:underline">Xóa bộ lọc</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {modalNews.map((item) => {
                    const finalLink = processLinkData(item);
                    const deptName = getDepartmentName(finalLink);

                    return (
                      <a 
                        key={item.id} href={finalLink} target="_blank" rel="noreferrer"
                        className="announcements-card min-w-0 p-2 sm:p-3 rounded-xl border border-gray-100 bg-white hover:border-blue-300 hover:shadow-md transition-all group flex flex-col justify-between h-full"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2 mb-2">
                            {item.is_new && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0">MỚI</span>}
                            <span className={`text-[10px] text-gray-400 flex items-center gap-1 font-medium bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100 ${!item.is_new ? 'ml-auto' : ''}`}>
                               <Calendar size={10}/> {formatDate(item.date)}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-gray-800 group-hover:text-[#003375] line-clamp-3 leading-snug transition-colors">
                            {item.title}
                          </p>
                        </div>
                        
                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-50">
                          <div className="min-w-0 text-gray-500 text-[10px] sm:text-[11px] font-medium flex items-center gap-1.5">
                            <Building size={12} className="text-blue-500/70"/> {deptName}
                          </div>
                          <div className="text-[#003375] text-[11px] font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform shrink-0">
                             Xem chi tiết <ChevronRight size={14}/>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Thanh Phân trang */}
            <div className="announcements-footer border-t border-gray-100 bg-gray-50 shrink-0 flex justify-between items-center gap-1">
              <p className="text-[11px] sm:text-xs text-gray-500 font-medium">
                <span className="font-bold text-gray-800">{totalCount === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-bold text-gray-800">{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}</span> / <span className="font-bold text-gray-800">{totalCount}</span> tin
              </p>
              
              <div className="flex items-center gap-1 sm:gap-2">
                <button 
                  aria-label="Trang trước"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || isLoadingModal}
                  className="announcements-touch rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                
                <div className="flex items-center gap-1 px-1 rounded-lg bg-blue-50 border border-blue-100 text-[#003375] font-bold text-xs sm:text-sm transition-colors focus-within:ring-2 focus-within:ring-blue-300">
                  <input
                    type="number"
                    aria-label="Trang thông báo"
                    inputMode="numeric"
                    value={inputPage}
                    onChange={(e) => setInputPage(e.target.value)}
                    onBlur={handlePageSubmit}
                    onKeyDown={handlePageSubmit}
                    disabled={isLoadingModal}
                    className="announcements-input w-10 text-center bg-white border border-blue-200 rounded outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min="1"
                    max={totalPages}
                  />
                  <span className="whitespace-nowrap px-1">/ {totalPages}</span>
                </div>

                <button 
                  aria-label="Trang sau"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages || isLoadingModal}
                  className="announcements-touch rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

          </div>
        </Overlay>
      )}
    </>
  );
};

export default SchoolAnnouncements;
