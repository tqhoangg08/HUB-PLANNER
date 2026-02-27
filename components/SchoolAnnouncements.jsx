import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { Bell, ExternalLink } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';

const SchoolAnnouncements = () => {
  const [news, setNews] = useState([]);

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

  return (
    <div className="bg-white min-h-full"> 
      {/* 👇 PHẦN TIÊU ĐỀ (HEADER) */}
      <div className="bg-[#003375] px-3 py-2 lg:px-4 lg:py-3 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <h3 className="text-white font-bold text-xs lg:text-sm flex items-center gap-1.5 lg:gap-2">
          <Bell className="w-3.5 h-3.5 lg:w-4 lg:h-4 animate-pulse"/> 
          <span className="truncate">THÔNG BÁO TỪ TRƯỜNG (HUB)</span>
        </h3>
        <a href="https://online.hub.edu.vn/" target="_blank" rel="noreferrer" className="text-[10px] lg:text-xs text-blue-200 hover:text-white underline shrink-0">
          Trang chủ
        </a>
      </div>
      
      {/* PHẦN DANH SÁCH TIN */}
      <div className="divide-y divide-gray-100 relative z-10">
        {news.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">Đang cập nhật dữ liệu...</div>
        ) : (
          news.map((item) => {
            // =================================================================
            // THUẬT TOÁN XỬ LÝ LINK THÔNG MINH & TỰ ĐỘNG VÁ LỖI CHO ADMIN
            // =================================================================
            let finalLink = 'https://online.hub.edu.vn/'; 
            let isCustomLink = false; 
            
            if (item.link && typeof item.link === 'string') {
                const linkStr = item.link.toLowerCase().trim(); // Lọc khoảng trắng thừa
                
                if (!linkStr.includes('javascript') && !linkStr.includes('dopostback')) {
                    // CƠ CHẾ MỚI: Tự động đắp thêm 'https://' nếu Admin quên gõ
                    if (!linkStr.startsWith('http://') && !linkStr.startsWith('https://')) {
                        finalLink = 'https://' + item.link.trim();
                    } else {
                        finalLink = item.link.trim();
                    }
                    isCustomLink = true;
                }
            }
            // =================================================================

            return (
              <a 
                key={item.id} 
                href={finalLink} 
                target="_blank" 
                rel="noreferrer"
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
  );
};

export default SchoolAnnouncements;