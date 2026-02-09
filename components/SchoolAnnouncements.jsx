import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { Bell, ExternalLink } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';

const SchoolAnnouncements = () => {
  const [news, setNews] = useState([]);

  useEffect(() => {
    const fetchNews = async () => {
      const { data } = await supabase
        .from('school_announcements')
        .select('*')
        .order('date', { ascending: false }) 
        .limit(10); // Lấy 10 tin
      
      if (data) setNews(data);
    };

    fetchNews();
  }, []);

  return (
    <div className="bg-white min-h-full"> 
      {/* 👇 PHẦN TIÊU ĐỀ (HEADER) 
          - Mobile: px-3 py-2, text-xs (nhỏ gọn)
          - Laptop (lg): px-4 py-3, text-sm (to thoáng)
      */}
      <div className="bg-[#003375] px-3 py-2 lg:px-4 lg:py-3 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <h3 className="text-white font-bold text-xs lg:text-sm flex items-center gap-1.5 lg:gap-2">
          {/* Icon chuông cũng thu nhỏ trên mobile */}
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
            const isFakeLink = item.link && (item.link.includes('javascript') || item.link.includes('doPostBack'));
            const finalLink = isFakeLink ? 'https://online.hub.edu.vn/' : item.link;

            return (
              <a 
                key={item.id} 
                href={finalLink} 
                target="_blank" 
                rel="noreferrer"
                // 👇 Mobile: p-2 | Laptop: p-3
                className="block p-2 lg:p-3 hover:bg-blue-50 transition-colors group"
                title={isFakeLink ? "Bấm để truy cập trang tin tức của trường" : item.title}
              >
                <div className="flex justify-between items-start gap-2">
                  {/* 👇 Mobile: text-xs | Laptop: text-sm */}
                  <p className="text-xs lg:text-sm text-gray-700 font-medium group-hover:text-[#003375] line-clamp-2 leading-snug">
                    {item.title}
                  </p>
                  {/* Badge MỚI cũng thu nhỏ */}
                  {item.is_new && <span className="bg-red-500 text-white text-[8px] lg:text-[9px] px-1 lg:px-1.5 py-0.5 rounded font-bold shrink-0">MỚI</span>}
                </div>
                
                <div className="flex justify-between items-center mt-1.5 lg:mt-1">
                  {/* 👇 Mobile: text-[9px] | Laptop: text-[10px] */}
                  <span className="text-[9px] lg:text-[10px] text-gray-400 flex items-center gap-1">
                    {formatDate(item.date)}
                  </span>
                  <ExternalLink className="text-gray-300 group-hover:text-blue-400 w-3 h-3 lg:w-3 lg:h-3"/>
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