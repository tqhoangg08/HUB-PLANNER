import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Book, Calendar, LayoutDashboard, Search, User } from 'lucide-react';
import { playClick } from '../utils/audio';
import { usePlatform } from '../hooks/usePlatform';

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

// 2. Định nghĩa CSS tĩnh bên ngoài để tránh re-render
const ANIMATION_STYLES = `
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
`;

export const MobileAppLayout: React.FC<MobileAppLayoutProps> = ({
  session, children
}) => {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  
  const [slideDirection, setSlideDirection] = useState<'slide-left' | 'slide-right' | 'fade'>('fade');
  const [prevIndex, setPrevIndex] = useState(getTabIndex(location.pathname));
  
  const platform = usePlatform();
  const isIOS = platform === 'ios';

  const currentStudentId = session?.user?.email?.split('@')[0] || 'guest';

  const EXACT_MAIN_PATHS = [
    '/dashboard',
    '/mobile-home',
    '/learning',
    '/events',
    '/lost-found',
    '/profile',
    `/profile/${currentStudentId}`
  ];

  const currentPath = location.pathname.replace(/\/$/, '');
  const showBottomNav = EXACT_MAIN_PATHS.includes(currentPath);
  // --------------------------------------------------------------

  // 3. Tính toán hướng trượt
  useEffect(() => {
    const currentIndex = getTabIndex(location.pathname);
    
    if (currentIndex > prevIndex) {
      setSlideDirection('slide-left');
    } else if (currentIndex < prevIndex) {
      setSlideDirection('slide-right');
    } else {
      setSlideDirection('fade');
    }
    
    setPrevIndex(currentIndex);

    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
  }, [location.pathname, prevIndex]);

  // 4. Cấu hình mảng điều hướng
  const NAV_ITEMS = [
    { 
      id: 'home', 
      path: '/mobile-home', 
      match: ['/dashboard', '/mobile-home'], 
      icon: LayoutDashboard, 
      label: 'Trang chủ', 
      iconActiveStyle: 'fill-current opacity-20' 
    },
    { 
      id: 'learning', 
      path: '/learning', 
      match: ['/learning'], 
      icon: Book, 
      label: 'Học tập', 
      iconActiveStyle: 'fill-current opacity-20' 
    },
    { 
      id: 'events', 
      path: '/events', 
      match: ['/events'], 
      icon: Calendar, 
      label: 'Sự kiện', 
      iconActiveStyle: 'fill-current opacity-20' 
    },
    { 
      id: 'lost-found', 
      path: '/lost-found', 
      match: ['/lost-found'], 
      icon: Search, 
      label: 'Tìm đồ', 
      iconActiveStyle: 'stroke-[3px]' 
    },
    { 
      id: 'profile', 
      path: `/profile/${currentStudentId}`, 
      match: ['/profile'], 
      icon: User, 
      label: 'Cá nhân', 
      iconActiveStyle: 'fill-current opacity-20' 
    },
  ];

  const checkIsActive = (pathname: string, matchRules: string[]) => {
    return matchRules.some(rule => pathname.includes(rule));
  };

  return (
    <div className={`mobile-app-root app-root platform-${platform} flex flex-col h-[100dvh] w-full relative pb-safe bg-[#F8FAFC] z-10 overflow-hidden`}>
      <style>{ANIMATION_STYLES}</style>

      {/* KHU VỰC HIỂN THỊ NỘI DUNG */}
      <main ref={mainRef} className="mobile-main flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar relative bg-[#F8FAFC]">
        <div key={location.pathname} className={`w-full min-h-full flex flex-col animate-${slideDirection}`}>
          {children}
          {/* Vì thanh iOS lơ lửng nên phải cộng thêm padding để không bị che nội dung */}
        </div>
      </main>

      {/* THANH MENU DƯỚI ĐÁY */}
      {showBottomNav && (
        isIOS ? (
          // ==========================================
          // GIAO DIỆN iOS: LIQUID GLASS 
          // ==========================================
          <div className="mobile-bottom-nav ios-bottom-nav absolute bottom-6 left-4 right-4 z-50 pb-safe">
            <div className="ios-bottom-nav-surface flex justify-around items-center h-[72px] px-2 bg-white/25 saturate-[200%] border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.1)] rounded-full">
              {NAV_ITEMS.map((item) => {
                const isActive = checkIsActive(location.pathname, item.match);
                const Icon = item.icon;

                return (
                  <NavLink 
                    key={item.id}
                    to={item.path} 
                    onClick={playClick}
                    className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300 ${
                      isActive ? 'text-[#003375]' : 'text-gray-500 hover:text-gray-700'
                    }`} 
                  >
                    {/* Bỏ viền nền lót, chỉ dùng hiệu ứng nảy (scale) và bóng đổ nhẹ cho icon */}
                    <div className={`transition-all duration-300 ${isActive ? 'scale-[1.15] drop-shadow-md' : 'scale-100'}`}>
                      <Icon 
                        size={24} 
                        className={`transition-all duration-300 ${isActive ? `text-[#003375] ${item.iconActiveStyle}` : ''}`} 
                      />
                    </div>
                    <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ) : (
          // ==========================================
          // GIAO DIỆN ANDROID: TRUYỀN THỐNG (Giữ nguyên)
          // ==========================================
          <div className="mobile-bottom-nav android-bottom-nav absolute bottom-0 left-0 right-0 bg-white/90 border-t border-gray-200 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] z-50 pb-safe">
            <div className="flex justify-around items-center h-[65px] px-2">
              {NAV_ITEMS.map((item) => {
                const isActive = checkIsActive(location.pathname, item.match);
                const Icon = item.icon;

                return (
                  <NavLink 
                    key={item.id}
                    to={item.path} 
                    onClick={playClick}
                    className={`flex flex-col items-center justify-center w-full h-full gap-1.5 transition-colors ${
                      isActive ? 'text-[#003375]' : 'text-gray-400 hover:text-gray-600'
                    }`} 
                  >
                    <Icon 
                      size={24} 
                      className={`transition-all duration-300 ${isActive ? `text-[#003375] ${item.iconActiveStyle}` : ''}`} 
                    />
                    <span className="text-[10px] font-bold">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
};
