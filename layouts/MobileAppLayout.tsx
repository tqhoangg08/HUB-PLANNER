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

const getTabIndex = (path: string) => {
  if (path.includes('/dashboard') || path.includes('/mobile-home')) return 0;
  if (path.includes('/learning')) return 1;
  if (path.includes('/events')) return 2;
  if (path.includes('/lost-found')) return 3;
  if (path.includes('/profile')) return 4;
  return 0;
};

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
  session,
  children,
}) => {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const platform = usePlatform();

  const [slideDirection, setSlideDirection] = useState<'slide-left' | 'slide-right' | 'fade'>('fade');
  const [prevIndex, setPrevIndex] = useState(getTabIndex(location.pathname));

  const currentStudentId = session?.user?.email?.split('@')[0] || 'guest';

  const exactMainPaths = [
    '/dashboard',
    '/mobile-home',
    '/learning',
    '/events',
    '/lost-found',
    '/profile',
    `/profile/${currentStudentId}`,
  ];

  const currentPath = location.pathname.replace(/\/$/, '');
  const isProfileMainPath = /^\/profile\/[^/]+$/.test(currentPath);
  const showBottomNav = exactMainPaths.includes(currentPath) || isProfileMainPath;

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

  const navItems = [
    { id: 'home', path: '/mobile-home', match: ['/dashboard', '/mobile-home'], icon: LayoutDashboard, label: 'Trang chủ' },
    { id: 'learning', path: '/learning', match: ['/learning'], icon: Book, label: 'Học tập' },
    { id: 'events', path: '/events', match: ['/events'], icon: Calendar, label: 'Sự kiện' },
    { id: 'lost-found', path: '/lost-found', match: ['/lost-found'], icon: Search, label: 'Tìm đồ' },
    { id: 'profile', path: `/profile/${currentStudentId}`, match: ['/profile'], icon: User, label: 'Cá nhân' },
  ];

  const checkIsActive = (pathname: string, matchRules: string[]) => {
    return matchRules.some((rule) => pathname.includes(rule));
  };

  return (
    <div className={`mobile-app-root app-root platform-${platform} flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F8FAFC] pb-safe relative z-10`}>
      <style>{ANIMATION_STYLES}</style>

      <main ref={mainRef} className="mobile-main custom-scrollbar relative w-full flex-1 overflow-y-auto overflow-x-hidden bg-[#F8FAFC]">
        <div key={location.pathname} className={`flex min-h-full w-full flex-col animate-${slideDirection}`}>
          {children}
        </div>
      </main>

      {showBottomNav && (
        <nav className="mobile-bottom-nav absolute inset-x-0 bottom-0 z-50 flex border-t border-[#EEF2FF] bg-white px-1 pb-[calc(18px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_24px_rgba(13,27,62,0.06)]">
          {navItems.map((item) => {
            const isActive = checkIsActive(location.pathname, item.match);
            const Icon = item.icon;

            return (
              <NavLink
                key={item.id}
                to={item.path}
                onClick={playClick}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${isActive ? 'bg-[#EEF2FF] text-[#1A56FF]' : 'text-[#B0BCDA]'}`}>
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <span className={`text-[10px] font-bold ${isActive ? 'text-[#1A56FF]' : 'text-[#B0BCDA]'}`}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
};
