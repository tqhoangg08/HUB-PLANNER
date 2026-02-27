import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { createPortal } from 'react-dom';
import { Bell, ExternalLink, Search, Calendar, X, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';

const ITEMS_PER_PAGE = 10;

const SchoolAnnouncements = () => {
  // === STATE CHO WIDGET BÊN NGOÀI ===
  const [news, setNews] = useState([]);

  // === STATE CHO MODAL XEM TẤT CẢ ===
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalNews, setModalNews] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingModal, setIsLoadingModal] = useState(false);

  // Bộ lọc
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 1. FETCH 10 TIN MỚI NHẤT CHO WIDGET BÊN NGOÀI
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const { data, error } = await supabase
          .from('school_announcements')
          .select('*')
          .order('date', { ascending: false }) 
          .order('created_at', { ascending: false }) 
          .limit(10); 
        
        if (error) throw error;
        if (data) setNews(data);
      } catch (err) {
        console.error("Lỗi tải thông báo trường:", err);
      }
    };
    fetchNews();
  }, []);

  // 2. FETCH DATA CHO MODAL KHI MỞ HOẶC KHI ĐỔI TRANG/BỘ LỌC
  const fetchModalNews = async () => {
    setIsLoadingModal(true);
    try {
      let query = supabase
        .from('school_announcements')
        .select('*', { count: 'exact' }); // Lấy thêm tổng số lượng để làm phân trang

      // Áp dụng bộ lọc Tìm kiếm
      if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      // Áp dụng bộ lọc Ngày tháng
      if (startDate) {
        query = query.gte('date', startDate);
      }
      if (endDate) {
        query = query.lte('date', endDate);
      }

      // Sắp xếp
      query = query.order('date', { ascending: false }).order('created_at', { ascending: false });

      // Phân trang
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;
      if (data) {
        setModalNews(data);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error("Lỗi tải Modal thông báo:", err);
    } finally {
      setIsLoadingModal(false);
    }
  };

  // Kích hoạt fetch khi Modal mở hoặc các state thay đổi
  useEffect(() => {
    if (isModalOpen) {
      fetchModalNews();
    }
  }, [isModalOpen, currentPage, startDate, endDate]);

  // Nếu người dùng gõ tìm kiếm, phải delay 1 chút (debounce) để tránh gọi API liên tục
  useEffect(() => {
    if (isModalOpen) {
      const delayDebounceFn = setTimeout(() => {
        setCurrentPage(1); // Gõ tìm kiếm thì tự động về trang 1
        fetchModalNews();
      }, 500); // Đợi gõ xong 0.5s mới gọi API

      return () => clearTimeout(delayDebounceFn);
    }
  }, [searchQuery]);

  // Hàm tính tổng số trang
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // =================================================================
  // HÀM HELPER: XỬ LÝ LINK THÔNG MINH CHO CẢ WIDGET VÀ MODAL
  // =================================================================
  const processLinkData = (item) => {
    let finalLink = 'https://online.hub.edu.vn/'; 
    let isCustomLink = false; 
    if (item.link && typeof item.link === 'string') {
        const linkStr = item.link.toLowerCase().trim(); 
        if (!linkStr.includes('javascript') && !linkStr.includes('dopostback')) {
            if (!linkStr.startsWith('http://') && !linkStr.startsWith('https://')) {
                finalLink = 'https://' + item.link.trim();
            } else {
                finalLink = item.link.trim();
            }
            isCustomLink = true;
        }
    }
    return { finalLink, isCustomLink };
  };

  return (
    <>
      {/* =========================================================
          GIAO DIỆN WIDGET BÊN NGOÀI DASHBOARD
          ========================================================= */}
      <div className="bg-white min-h-full rounded-xl overflow-hidden border border-gray-100 shadow-sm flex flex-col"> 
        <div className="bg-[#003375] px-3 py-2 lg:px-4 lg:py-3 flex justify-between items-center z-20 shrink-0">
          <h3 className="text-white font-bold text-xs lg:text-sm flex items-center gap-1.5 lg:gap-2">
            <Bell className="w-3.5 h-3.5 lg:w-4 lg:h-4 animate-pulse"/> 
            <span className="truncate">THÔNG BÁO TỪ TRƯỜNG (HUB)</span>
          </h3>
          {/* ĐÃ SỬA: Đổi Trang chủ thành nút bật Modal */}
          <button 
            onClick={() => setIsModalOpen(true)}
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
              const { finalLink, isCustomLink } = processLinkData(item);
              return (
                <a 
                  key={item.id} href={finalLink} target="_blank" rel="noreferrer"
                  className="block p-2 lg:p-3 hover:bg-blue-50 transition-colors group relative"
                  title={isCustomLink ? item.title : "Bấm để truy cập trang tin tức của trường"}
                >
                  <div className="flex justify-between items-start gap-2">
                    <p className={`text-xs lg:text-sm font-medium line-clamp-2 leading-snug transition-colors ${isCustomLink ? 'text-[#003375] font-bold' : 'text-gray-700 group-hover:text-[#003375]'}`}>
                      {item.title}
                    </p>
                    {item.is_new && <span className="bg-red-500 text-white text-[8px] lg:text-[9px] px-1 lg:px-1.5 py-0.5 rounded font-bold shrink-0">MỚI</span>}
                  </div>
                  <div className="flex justify-between items-center mt-1.5 lg:mt-1">
                    <span className="text-[9px] lg:text-[10px] text-gray-400 flex items-center gap-1">
                      {formatDate(item.date)}
                      {isCustomLink && <span className="text-emerald-500 ml-1 font-semibold">• Đính kèm link</span>}
                    </span>
                    <ExternalLink className={`${isCustomLink ? 'text-emerald-500' : 'text-gray-300 group-hover:text-blue-400'} w-3 h-3 lg:w-3 lg:h-3 transition-colors`}/>
                  </div>
                </a>
              );
            })
          )}
        </div>
      </div>
{/* =========================================================
          MODAL XEM TẤT CẢ (FULL MÀN HÌNH) BẰNG PORTAL
          ========================================================= */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 pt-16 lg:p-10" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-scaleIn border border-gray-100 flex flex-col max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            
            {/* Header Modal */}
            <div className="bg-gradient-to-r from-[#003375] to-blue-700 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg"><Bell size={20} /></div>
                <div>
                  <h2 className="font-bold text-base sm:text-lg leading-tight">Kho thông báo HUB</h2>
                  <p className="text-blue-200 text-[10px] sm:text-xs">Hệ thống tra cứu dữ liệu thông báo</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all"><X size={20}/></button>
            </div>

            {/* Thanh Tìm kiếm & Lọc (Giữ nguyên) */}
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-3 shrink-0">
              <div className="relative flex-1">
                <input 
                  type="text" 
                  placeholder="Nhập tên thông báo cần tìm..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 focus:border-[#003375] focus:ring-2 focus:ring-blue-500/20 outline-none text-sm transition-all"
                />
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1 sm:w-36">
                  <input type="date" value={startDate} onChange={(e) => {setStartDate(e.target.value); setCurrentPage(1);}} className="w-full pl-8 pr-2 py-2 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-xs text-gray-600 transition-all"/>
                  <Calendar className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
                </div>
                <div className="flex items-center text-gray-400">-</div>
                <div className="relative flex-1 sm:w-36">
                  <input type="date" value={endDate} onChange={(e) => {setEndDate(e.target.value); setCurrentPage(1);}} className="w-full pl-8 pr-2 py-2 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-xs text-gray-600 transition-all"/>
                  <Calendar className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
                </div>
              </div>
            </div>

            {/* Danh sách Data Modal (Giữ nguyên) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-4 bg-white">
              {isLoadingModal ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <Filter size={30} className="animate-pulse" />
                  <p className="text-sm font-medium">Đang truy xuất dữ liệu...</p>
                </div>
              ) : modalNews.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <Search size={40} className="text-gray-200" />
                  <p className="text-sm font-medium text-gray-500">Không tìm thấy thông báo nào phù hợp.</p>
                  <button onClick={() => {setSearchQuery(''); setStartDate(''); setEndDate('');}} className="mt-2 text-xs text-[#003375] font-bold hover:underline">Xóa bộ lọc</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {modalNews.map((item) => {
                    const { finalLink, isCustomLink } = processLinkData(item);
                    return (
                      <a 
                        key={item.id} href={finalLink} target="_blank" rel="noreferrer"
                        className="p-3 sm:p-4 rounded-xl border border-gray-100 bg-white hover:border-blue-300 hover:shadow-md transition-all group flex flex-col justify-between h-full"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2 mb-2">
                            {item.is_new && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0">MỚI</span>}
                            <span className="text-[10px] text-gray-400 ml-auto flex items-center gap-1 font-medium bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                               <Calendar size={10}/> {formatDate(item.date)}
                            </span>
                          </div>
                          <p className={`text-sm font-bold line-clamp-3 leading-snug transition-colors ${isCustomLink ? 'text-[#003375]' : 'text-gray-800 group-hover:text-[#003375]'}`}>
                            {item.title}
                          </p>
                        </div>
                        
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                          {isCustomLink ? (
                             <span className="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-100">Đính kèm Link</span>
                          ) : (
                             <span className="text-gray-400 text-[10px] font-medium">Nguồn: online.hub.edu.vn</span>
                          )}
                          <div className="text-[#003375] text-[11px] font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                             Xem chi tiết <ChevronRight size={14}/>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Thanh Phân trang (Pagination) (Giữ nguyên) */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0 flex flex-col sm:flex-row justify-between items-center gap-3">
              <p className="text-xs text-gray-500 font-medium">
                Hiển thị <span className="font-bold text-gray-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-bold text-gray-800">{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}</span> trong tổng số <span className="font-bold text-gray-800">{totalCount}</span> thông báo
              </p>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || isLoadingModal}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                
                <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-[#003375] font-bold text-sm min-w-[80px] text-center">
                  {currentPage} / {totalPages || 1}
                </div>

                <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages || isLoadingModal}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body 
      )}
    </>
  );
};

export default SchoolAnnouncements;