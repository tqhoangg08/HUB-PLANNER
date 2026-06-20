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

export const MobileAppLayout: React.FC<MobileAppLayoutProps> = ({
  session,
  children,
}) => {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const platform = usePlatform();

  const [slideDirection, setSlideDirection] = useState<'slide-left' | 'slide-right' | 'fade'>('fade');
  const prevIndexRef = useRef(getTabIndex(location.pathname));
  const [navStretch, setNavStretch] = useState(1);
  const [previewNavIndex, setPreviewNavIndex] = useState<number | null>(null);
  const navDragRef = useRef({ startX: 0, lastIndex: getTabIndex(location.pathname), dragged: false, pressed: false });

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
  const isLearningPath = currentPath === '/learning';
  const isProfileMainPath = /^\/profile\/[^/]+$/.test(currentPath);
  const showBottomNav = exactMainPaths.includes(currentPath) || isProfileMainPath;

  useEffect(() => {
    const currentIndex = getTabIndex(location.pathname);
    const previousIndex = prevIndexRef.current;
    const distance = Math.abs(currentIndex - previousIndex);
    let stretchTimer: number | undefined;

    if (currentIndex > previousIndex) {
      setSlideDirection('slide-left');
    } else if (currentIndex < previousIndex) {
      setSlideDirection('slide-right');
    } else {
      setSlideDirection('fade');
    }

    if (distance > 0) {
      setNavStretch(Math.min(1.36, 1 + distance * 0.16));
      stretchTimer = window.setTimeout(() => setNavStretch(1), 420);
    } else {
      setNavStretch(1);
    }
    prevIndexRef.current = currentIndex;

    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }

    return () => {
      if (stretchTimer) {
        window.clearTimeout(stretchTimer);
      }
    };
  }, [location.pathname]);

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

  const activeNavIndex = navItems.findIndex((item) => checkIsActive(location.pathname, item.match));
  const safeActiveNavIndex = activeNavIndex >= 0 ? activeNavIndex : 0;
  const visualNavIndex = platform === 'ios' ? previewNavIndex ?? safeActiveNavIndex : safeActiveNavIndex;
  const visualDistance = Math.abs(visualNavIndex - safeActiveNavIndex);
  const visualStretch = previewNavIndex === null ? navStretch : Math.min(1.24, 1 + visualDistance * 0.08);

  const getIndexFromClientX = (clientX: number) => {
    const rect = navRef.current?.getBoundingClientRect();
    if (!rect) return safeActiveNavIndex;

    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width - 1);
    return Math.floor((x / rect.width) * navItems.length);
  };

  const previewNavAt = (clientX: number) => {
    if (platform !== 'ios') return;

    const index = getIndexFromClientX(clientX);
    navDragRef.current.lastIndex = index;
    setPreviewNavIndex(index);
  };

  const resetPreviewNav = () => {
    if (platform !== 'ios') return;

    window.setTimeout(() => {
      setPreviewNavIndex(null);
      navDragRef.current.dragged = false;
      navDragRef.current.pressed = false;
    }, 90);
  };

  return (
    <div className={`mobile-app-root app-root platform-${platform} ${isLearningPath ? 'mobile-route-learning' : ''} flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F8FAFC] pb-safe relative z-10`}>
      <main ref={mainRef} className="mobile-main custom-scrollbar relative w-full flex-1 overflow-y-auto overflow-x-hidden bg-[#F8FAFC]">
        <div key={location.pathname} className={`flex min-h-0 w-full flex-col animate-${slideDirection}`}>
          {children}
          <footer className="px-5 pb-[calc(126px+env(safe-area-inset-bottom))] pt-2 text-center text-[10px] font-medium leading-5 text-[#64748B]">
            HUB Planner là dự án độc lập, không trực thuộc/không đại diện Trường. Vui lòng đối chiếu nguồn chính thức.
          </footer>
        </div>
      </main>

      {showBottomNav && (
        <nav
          ref={navRef}
          className="mobile-bottom-nav"
          style={{
            '--active-index': visualNavIndex,
            '--active-center': `${((visualNavIndex + 0.5) / navItems.length) * 100}%`,
            '--indicator-x': `${visualNavIndex * 100}%`,
            '--liquid-stretch': visualStretch,
          } as React.CSSProperties}
          onPointerDown={(event) => {
            if (platform !== 'ios') return;

            navDragRef.current = {
              startX: event.clientX,
              lastIndex: visualNavIndex,
              dragged: false,
              pressed: true,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            previewNavAt(event.clientX);
          }}
          onPointerMove={(event) => {
            if (platform !== 'ios') return;

            if (navDragRef.current.pressed && Math.abs(event.clientX - navDragRef.current.startX) > 8) {
              navDragRef.current.dragged = true;
            }
            previewNavAt(event.clientX);
          }}
          onPointerUp={resetPreviewNav}
          onPointerCancel={resetPreviewNav}
          onPointerLeave={resetPreviewNav}
          onClickCapture={(event) => {
            if (platform === 'ios' && navDragRef.current.dragged) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          aria-label="Thanh điều hướng"
        >
          <span
            aria-hidden="true"
            className="mobile-bottom-nav__indicator"
          />
          {navItems.map((item) => {
            const isActive = checkIsActive(location.pathname, item.match);
            const Icon = item.icon;

            return (
              <NavLink
                key={item.id}
                to={item.path}
                onClick={playClick}
                className="mobile-bottom-nav__tab"
              >
                <span className={`mobile-bottom-nav__icon ${isActive ? 'text-[#1664F5]' : 'text-[#647592]'}`}>
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <span className={`mobile-bottom-nav__label ${isActive ? 'text-[#1664F5]' : 'text-[#647592]'}`}>
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
