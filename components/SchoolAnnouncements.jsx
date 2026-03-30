import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../utils/supabase';
import { Bell, ExternalLink, Search, Calendar, X, ChevronLeft, ChevronRight, Filter, Building } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';

const ITEMS_PER_PAGE = 10;

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
  const [currentPage, setCurrentPage] = useState(1);
  const [inputPage, setInputPage] = useState("1"); 
  const [isLoadingModal, setIsLoadingModal] = useState(false);

  // Bộ lọc
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

  // 1. FETCH 10 TIN MỚI NHẤT CHO WIDGET BÊN NGOÀI
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const { data, error } = await supabase
          .from('school_announcements')
          .select('*')
          .or('is_hidden.eq.false,is_hidden.is.null') // ✨ ĐÃ THÊM: Chỉ lấy tin chưa bị ẩn
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
        .select('*', { count: 'exact' })
        .or('is_hidden.eq.false,is_hidden.is.null'); // ✨ ĐÃ THÊM: Chỉ lấy tin chưa bị ẩn

      if (searchQuery) query = query.ilike('title', `%${searchQuery}%`);
      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);

      query = query.order('date', { ascending: false }).order('created_at', { ascending: false });

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

  useEffect(() => {
    if (isModalOpen) fetchModalNews();
  }, [isModalOpen, currentPage, startDate, endDate]);

  useEffect(() => {
    if (isModalOpen) {
      const delayDebounceFn = setTimeout(() => {
        setCurrentPage(1); 
        fetchModalNews();
      }, 500); 
      return () => clearTimeout(delayDebounceFn);
    }
  }, [searchQuery]);

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

  return (
    <>
      <div className="bg-white min-h-full rounded-xl overflow-hidden border border-gray-100 shadow-sm flex flex-col"> 
        <div className="bg-[#003375] px-3 py-2 lg:px-4 lg:py-3 flex justify-between items-center z-20 shrink-0">
          <h3 className="text-white font-bold text-xs lg:text-sm flex items-center gap-1.5 lg:gap-2">
            <Bell className="w-3.5 h-3.5 lg:w-4 lg:h-4 animate-pulse"/> 
            <span className="truncate">THÔNG BÁO TỪ TRƯỜNG (HUB)</span>
          </h3>
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

      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 pt-16 lg:p-10" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-scaleIn border border-gray-100 flex flex-col max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            
            {/* Header Modal */}
            <div className="bg-gradient-to-r from-[#003375] to-blue-700 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg"><Bell size={20} /></div>
                <div>
                  <h2 className="font-bold text-base sm:text-lg leading-tight">Kho thông báo HUB</h2>
                  <p className="text-blue-200 text-[10px] sm:text-xs">Hệ thống tra cứu dữ liệu thông báo đa nền tảng</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all"><X size={20}/></button>
            </div>

            {/* Thanh Tìm kiếm & Lọc */}
            <div className="p-3 sm:p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-3 shrink-0">
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
              <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-3">
                <div className="relative w-full sm:w-36">
                  <input type="date" value={startDate} onChange={(e) => {setStartDate(e.target.value); setCurrentPage(1);}} className="w-full pl-7 pr-1 sm:pr-2 py-2 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-[11px] sm:text-xs text-gray-600 transition-all"/>
                  <Calendar className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
                </div>
                <div className="hidden sm:flex items-center text-gray-400">-</div>
                <div className="relative w-full sm:w-36">
                  <input type="date" value={endDate} onChange={(e) => {setEndDate(e.target.value); setCurrentPage(1);}} className="w-full pl-7 pr-1 sm:pr-2 py-2 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-[11px] sm:text-xs text-gray-600 transition-all"/>
                  <Calendar className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
                </div>
              </div>
            </div>

            {/* Danh sách Data Modal */}
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
                    const finalLink = processLinkData(item);
                    const deptName = getDepartmentName(finalLink);

                    return (
                      <a 
                        key={item.id} href={finalLink} target="_blank" rel="noreferrer"
                        className="p-3 sm:p-4 rounded-xl border border-gray-100 bg-white hover:border-blue-300 hover:shadow-md transition-all group flex flex-col justify-between h-full"
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
                        
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                          <div className="text-gray-500 text-[10px] sm:text-[11px] font-medium flex items-center gap-1.5">
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
            <div className="p-3 sm:p-4 border-t border-gray-100 bg-gray-50 shrink-0 flex flex-col sm:flex-row justify-between items-center gap-3">
              <p className="text-[11px] sm:text-xs text-gray-500 font-medium">
                Hiển thị <span className="font-bold text-gray-800">{totalCount === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-bold text-gray-800">{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}</span> trong tổng số <span className="font-bold text-gray-800">{totalCount}</span> thông báo
              </p>
              
              <div className="flex items-center gap-1 sm:gap-2">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || isLoadingModal}
                  className="p-1.5 sm:p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-[#003375] font-bold text-xs sm:text-sm transition-colors focus-within:ring-2 focus-within:ring-blue-300">
                  <input
                    type="number"
                    value={inputPage}
                    onChange={(e) => setInputPage(e.target.value)}
                    onBlur={handlePageSubmit}
                    onKeyDown={handlePageSubmit}
                    disabled={isLoadingModal}
                    className="w-8 sm:w-10 text-center bg-white border border-blue-200 rounded outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min="1"
                    max={totalPages}
                  />
                  <span className="whitespace-nowrap px-1">/ {totalPages}</span>
                </div>

                <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages || isLoadingModal}
                  className="p-1.5 sm:p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
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