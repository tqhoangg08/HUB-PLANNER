import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Book, Calendar, LayoutDashboard, Search, User } from 'lucide-react';
import { playClick } from '../utils/audio';

interface MobileAppLayoutProps {
  session: any;
  displayName: string;
  studentId: string;
  avatarUrl: string;
  avatarSeed: string;
  isUserMenuOpen: boolean;
  setIsUserMenuOpen: (v: boolean) => void;
  setShowAccountSettings: (v: boolean) => void;
  handleRequestReset: () => void;
  handleMenuLogout: () => void;
  children: React.ReactNode;
  [key: string]: any; 
}

// 1. Hàm xác định vị trí của Tab
const getTabIndex = (path: string) => {
    if (path.includes('/dashboard') || path.includes('/mobile-home')) return 0;
    if (path.includes('/learning')) return 1;
    if (path.includes('/events')) return 2;
    if (path.includes('/lost-found')) return 3;
    if (path.includes('/profile')) return 4;
    return 0; // Default
};

export const MobileAppLayout: React.FC<MobileAppLayoutProps> = ({
  session, children
}) => {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  
  // State lưu lại hướng trượt và tab trước đó
  const [slideDirection, setSlideDirection] = useState<'slide-left' | 'slide-right' | 'fade'>('fade');
  const [prevIndex, setPrevIndex] = useState(getTabIndex(location.pathname));

  const currentStudentId = session?.user?.email?.split('@')[0] || 'guest';

  // 2. MA THUẬT TÍNH TOÁN HƯỚNG TRƯỢT KHI ĐỔI TRANG
  useEffect(() => {
      const currentIndex = getTabIndex(location.pathname);
      
      if (currentIndex > prevIndex) {
          setSlideDirection('slide-left'); // Tab ở bên phải -> Trượt từ phải sang trái
      } else if (currentIndex < prevIndex) {
          setSlideDirection('slide-right'); // Tab ở bên trái -> Trượt từ trái sang phải
      } else {
          setSlideDirection('fade'); // Cùng một tab (load lại) -> Chỉ làm mờ
      }
      
      setPrevIndex(currentIndex);

      // Cuộn lên đầu trang mượt mà
      if (mainRef.current) {
          mainRef.current.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      }
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-[100dvh] w-full relative pb-safe bg-white z-10 overflow-hidden">
      
      {/* Định nghĩa CSS Animation siêu mượt cho việc trượt */}
      <style>{`
        @keyframes slideLeftEnter {
            from { transform: translateX(40px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideRightEnter {
            from { transform: translateX(-40px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeEnter {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        .animate-slide-left { animation: slideLeftEnter 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .animate-slide-right { animation: slideRightEnter 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .animate-fade { animation: fadeEnter 0.3s ease-in forwards; }
      `}</style>

      {/* KHU VỰC HIỂN THỊ NỘI DUNG CÁC TRANG */}
      <main ref={mainRef} className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar relative bg-white">
          
          {/* Gắn class trượt tương ứng vào thẻ bọc nội dung */}
          <div key={location.pathname} className={`w-full min-h-full flex flex-col animate-${slideDirection}`}>
              {children}
              {/* Khoảng trống để nội dung không bị thanh nav che mất */}
              <div className="h-24 w-full shrink-0"></div>
          </div>

      </main>

      {/* THANH MENU DƯỚI ĐÁY (BOTTOM NAVIGATION) */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] z-50 pb-safe">
          <div className="flex justify-around items-center h-[65px] px-2">
              
              <NavLink to="/mobile-home" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1.5 transition-colors ${(isActive || location.pathname.includes('/dashboard')) ? 'text-[#003375]' : 'text-gray-400 hover:text-gray-600'}`} onClick={playClick}>
                  <LayoutDashboard size={24} className={(location.pathname === '/mobile-home' || location.pathname.includes('/dashboard')) ? 'text-[#003375] fill-current opacity-20 transition-all duration-300' : 'transition-all duration-300'} />
                  <span className="text-[10px] font-bold">Trang chủ</span>
              </NavLink>

              <NavLink to="/learning" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1.5 transition-colors ${location.pathname.includes('/learning') ? 'text-[#003375]' : 'text-gray-400 hover:text-gray-600'}`} onClick={playClick}>
                  <Book size={24} className={location.pathname.includes('/learning') ? 'text-[#003375] fill-current opacity-20 transition-all duration-300' : 'transition-all duration-300'} />
                  <span className="text-[10px] font-bold">Học tập</span>
              </NavLink>

              <NavLink to="/events" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1.5 transition-colors ${location.pathname.includes('/events') ? 'text-[#003375]' : 'text-gray-400 hover:text-gray-600'}`} onClick={playClick}>
                  <Calendar size={24} className={location.pathname.includes('/events') ? 'text-[#003375] fill-current opacity-20 transition-all duration-300' : 'transition-all duration-300'} />
                  <span className="text-[10px] font-bold">Sự kiện</span>
              </NavLink>

              <NavLink to="/lost-found" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1.5 transition-colors ${location.pathname.includes('/lost-found') ? 'text-[#003375]' : 'text-gray-400 hover:text-gray-600'}`} onClick={playClick}>
                  <Search size={24} className={location.pathname.includes('/lost-found') ? 'text-[#003375] stroke-[3px] transition-all duration-300' : 'transition-all duration-300'} />
                  <span className="text-[10px] font-bold">Tìm đồ</span>
              </NavLink>

              <NavLink to={`/profile/${currentStudentId}`} className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1.5 transition-colors ${location.pathname.includes('/profile') ? 'text-[#003375]' : 'text-gray-400 hover:text-gray-600'}`} onClick={playClick}>
                  <User size={24} className={location.pathname.includes('/profile') ? 'text-[#003375] fill-current opacity-20 transition-all duration-300' : 'transition-all duration-300'} />
                  <span className="text-[10px] font-bold">Cá nhân</span>
              </NavLink>

          </div>
      </div>

    </div>
  );
};