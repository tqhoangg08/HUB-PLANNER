import React, { useRef, useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Book, Calendar, ChevronDown, ClipboardList, HelpCircle, LayoutDashboard, LogOut, RotateCcw, Search, User, Zap, Facebook, Phone, Users, Award, MessageSquarePlus, Heart, Info, Clock, RefreshCw, Download, Star, Settings, Menu, X } from 'lucide-react';
import { playClick } from '../utils/audio';
import NotificationBell from '../components/NotificationBell';

interface DesktopLayoutProps {
  session: any;
  isGuest: boolean;
  isAdmin: boolean;
  viewingUser: any;
  displayName: string;
  studentId: string;
  avatarUrl: string;
  avatarSeed: string;
  adminSearchMssv: string;
  isSearchingUser: boolean;
  setAdminSearchMssv: (v: string) => void;
  handleAdminSearchUser: (e: React.FormEvent) => void;
  handleRequestReset: () => void;
  handleLogout: () => void;
  setShowGuide: (v: boolean) => void;
  setShowActivityLog: (v: boolean) => void;
  setIsUserMenuOpen: (v: boolean) => void;
  isUserMenuOpen: boolean;
  setShowAccountSettings: (v: boolean) => void;
  handleMenuLogout: () => void;
  handleExitAdminView?: () => void;
  handleSyncDB?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  navigate: (path: string) => void;
  children: React.ReactNode;
  onInstallApp?: () => void;
  showInstallButton?: boolean;
}

export const DesktopLayout: React.FC<DesktopLayoutProps> = ({
  session, isGuest, isAdmin, viewingUser, displayName, studentId, avatarUrl, avatarSeed,
  adminSearchMssv, isSearchingUser, setAdminSearchMssv, handleAdminSearchUser,
  handleRequestReset, handleLogout, setShowGuide, setShowActivityLog,
  setIsUserMenuOpen, isUserMenuOpen, setShowAccountSettings, handleMenuLogout, 
  handleExitAdminView, handleSyncDB, navigate, children,
  onInstallApp, showInstallButton
}) => {
  const location = useLocation();
  const isColorAvatar = avatarUrl?.startsWith('#');
  
  const [isHandbookMenuOpen, setIsHandbookMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const handbookMenuRef = useRef<HTMLDivElement>(null);
  const navRefs = useRef<(HTMLAnchorElement | HTMLDivElement | null)[]>([]);
  const [navIndicator, setNavIndicator] = useState({ left: 0, width: 0, opacity: 0 });

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (handbookMenuRef.current && !handbookMenuRef.current.contains(event.target as Node)) {
              setIsHandbookMenuOpen(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
      if (isAdmin) return; 

      const updateNavIndicator = () => {
          let activeIndex = -1;
          if (location.pathname.includes('/dashboard')) activeIndex = 0;
          else if (location.pathname.includes('/schedule')) activeIndex = 1;
          else if (location.pathname.includes('/events')) activeIndex = 2;
          else if (location.pathname.includes('/lost-found')) activeIndex = 3;
          else if (location.pathname.includes('/handbook') || isHandbookMenuOpen || location.pathname.includes('/admin-reports')) activeIndex = 4;

          if (activeIndex !== -1 && navRefs.current[activeIndex]) {
              const el = navRefs.current[activeIndex];
              if (el) {
                  setNavIndicator({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
              }
          } else {
              setNavIndicator(prev => ({ ...prev, opacity: 0 }));
          }
      };

      updateNavIndicator();
      window.addEventListener('resize', updateNavIndicator);
      setTimeout(updateNavIndicator, 100); 
      return () => window.removeEventListener('resize', updateNavIndicator);
  }, [location.pathname, isHandbookMenuOpen, isAdmin]);


  // ==============================================================================================
  // ✨ 1. GIAO DIỆN ADMIN (SIDEBAR NẰM BÊN TRÁI) ✨
  // ==============================================================================================
  if (isAdmin) {
      return (
          <div className="flex h-[100dvh] w-full bg-[#F8FAFC] overflow-hidden font-sans text-gray-800">
              {/* SIDEBAR BÊN TRÁI */}
              <aside className="w-[260px] bg-white border-r border-gray-200 flex flex-col shrink-0 z-50">
                  {/* Khu vực Logo */}
                  <div className="h-16 flex items-center px-6 border-b border-gray-100 shrink-0">
                      <Link to="/dashboard" className="flex items-center gap-3 transition-transform hover:scale-105" onClick={playClick}>
                          <img src="logo.png" alt="HUB Logo" className="h-8 w-8 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<div class="h-8 w-8 bg-[#0052cc] rounded flex items-center justify-center text-white font-bold text-xs">HUB</div>'; }} />
                          <div className="leading-tight">
                              <h1 className="text-[16px] font-extrabold text-[#0052cc] tracking-tight">HUB PLANNER</h1>
                              <p className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Hỗ trợ sinh viên</p>
                          </div>
                      </Link>
                  </div>

                  {/* Menu Chức Năng */}
                  <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-1.5 px-4 custom-scrollbar">
                      <div className="text-[11px] font-bold text-gray-400 mb-2 px-2 tracking-wider">CHỨC NĂNG</div>
                      
                      <NavLink to="/dashboard" onClick={playClick} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                          <LayoutDashboard size={18} /> Tổng quan
                      </NavLink>
                      <NavLink to="/schedule" onClick={playClick} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                          <Calendar size={18} /> Thời khóa biểu
                      </NavLink>
                      <NavLink to="/events" onClick={playClick} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                          <Star size={18} /> Sự kiện ĐRL
                      </NavLink>
                      <NavLink to="/lost-found" onClick={playClick} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                          <Search size={18} /> Tìm đồ thất lạc
                      </NavLink>
                      <NavLink to="/admin-reports" onClick={playClick} className={({isActive}) => `flex items-center justify-between px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${isActive ? 'bg-red-50 text-red-600' : 'text-gray-600 hover:bg-gray-50 hover:text-red-600'}`}>
                          <div className="flex items-center gap-3">
                              <ClipboardList size={18} /> Xử lý báo cáo
                          </div>
                          <div className="w-2 h-2 rounded-full bg-red-500"></div>
                      </NavLink>
                  </div>

                  {/* Menu Footer (Cài đặt, Trợ giúp, Profile) */}
                  <div className="p-4 border-t border-gray-100 flex flex-col gap-1.5 bg-gray-50/50">
                      <button onClick={() => setShowAccountSettings(true)} className="flex items-center gap-3 px-3 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-colors">
                          <Settings size={18} /> Cài đặt
                      </button>
                      <button onClick={() => setShowGuide(true)} className="flex items-center gap-3 px-3 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-colors">
                          <HelpCircle size={18} /> Trợ giúp
                      </button>

                      <div className="mt-4 flex items-center gap-3 px-2 pt-3 border-t border-gray-200 relative group cursor-pointer" onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}>
                          <div className="h-10 w-10 rounded-full bg-[#0052cc] text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                              {avatarSeed || 'A'}
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-gray-900 truncate">{displayName || 'Admin'}</div>
                              <div className="text-[11px] text-gray-500 font-medium truncate">Quản trị viên</div>
                          </div>
                          {isUserMenuOpen && (
                              <div className="absolute bottom-full left-0 mb-3 w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50 animate-fadeIn">
                                  <button type="button" onClick={() => { const myStudentId = session?.user?.email?.split('@')[0]; if (myStudentId) { navigate(`/profile/${myStudentId}`); } setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Hồ sơ cá nhân</button>
                                  <button type="button" onClick={handleMenuLogout} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                              </div>
                          )}
                      </div>
                  </div>
              </aside>

              {/* KHU VỰC NỘI DUNG CHÍNH */}
              <div className="flex-1 flex flex-col min-w-0 relative">
                  {/* Top Header của Admin */}
                  <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 relative z-40">
                      {/* Breadcrumb bên trái */}
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-400">
                          <span>HUB Planner</span>
                          <span className="opacity-50">/</span>
                          <span className="text-gray-900 font-bold">{location.pathname.includes('admin-reports') ? 'Xử lý báo cáo' : location.pathname.includes('dashboard') ? 'Quản lý Sinh viên' : 'Hệ thống'}</span>
                      </div>

                      {/* Các nút công cụ bên phải */}
                      <div className="flex items-center gap-3 lg:gap-4">
                          {/* Thanh Search Admin */}
                          <form onSubmit={handleAdminSearchUser} className="relative hidden md:block">
                              <input 
                                  type="text" 
                                  placeholder="Tìm kiếm nhanh..." 
                                  value={adminSearchMssv}
                                  onChange={(e) => setAdminSearchMssv(e.target.value)}
                                  className="w-48 lg:w-64 pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:ring-1 focus:ring-[#0052cc] focus:bg-white transition-all text-gray-700"
                              />
                              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                              <button type="submit" className="hidden"></button>
                          </form>

                          {showInstallButton && (
                              <button 
                                  onClick={() => { playClick(); onInstallApp?.(); }}
                                  className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-[#0052cc] font-bold text-sm px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors shadow-sm active:scale-95"
                              >
                                  <Download size={16} /> Tải App
                              </button>
                          )}

                          {handleSyncDB && (
                              <button onClick={handleSyncDB} className="p-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200" title="Đồng bộ DB">
                                  <RefreshCw size={16} />
                              </button>
                          )}

                          <NotificationBell currentUserId={session?.user?.id} />
                      </div>
                  </header>

                  {/* Nội dung thay đổi (Children) */}
                  <main className="flex-1 overflow-y-auto custom-scrollbar">
                      <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 min-h-full flex flex-col">
                          <div className="flex-1">
                              {children}
                          </div>
                      </div>
                  </main>
              </div>
          </div>
      );
  }


  // ==============================================================================================
  // ✨ 2. GIAO DIỆN USER BÌNH THƯỜNG (CÓ TÍCH HỢP SLIDE-OVER MENU TRÊN MOBILE) ✨
  // ==============================================================================================
  return (
    <>
      <header className="bg-white border-b border-gray-200 w-full z-40 shrink-0 h-auto sm:h-14 shadow-sm p-3 sm:p-0 relative">
          <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-8">
              <div className="w-full flex flex-row items-center justify-between sm:w-auto sm:gap-3 shrink-0">
                  <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                      <Link to="/dashboard" className="h-7 w-7 relative flex-shrink-0 transition-transform duration-200 hover:scale-105 active:scale-95" onClick={playClick}>
                          <img src="logo.png" alt="HUB Logo" className="h-full w-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<div class="h-7 w-7 bg-[#003375] rounded flex items-center justify-center text-white font-bold text-xs">HUB</div>'; }} />
                      </Link>
                      <div className="leading-tight">
                          <h1 className="text-[15px] font-extrabold text-[#003375] tracking-tight">HUB PLANNER</h1>
                          <p className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Hỗ trợ sinh viên</p>
                      </div>
                  </div>
                  
                  {/* Mobile Header elements */}
                  <div className="flex items-center gap-2 sm:hidden shrink-0">
                      {showInstallButton && (
                          <button 
                              onClick={() => { playClick(); onInstallApp?.(); }}
                              className="flex items-center justify-center h-8 px-2.5 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow-sm active:scale-95 shrink-0"
                              title="Tải ứng dụng"
                          >
                              <Download size={16} className="stroke-[2.5]" />
                              <span className="text-[11px] font-bold ml-1">Tải App</span>
                          </button>
                      )}
                      
                      {!isGuest && (
                          <NotificationBell currentUserId={session?.user?.id} />
                      )}
                      
                      {isGuest && (
                          <div className="flex items-center gap-1.5">
                              <button onClick={handleRequestReset} className="p-1.5 bg-red-50 text-red-600 rounded-md border border-red-100" title="Reset dữ liệu"><RotateCcw size={16}/></button>
                              <Link to="/login" onClick={playClick} className="px-2 py-1.5 bg-[#003375] text-white rounded-md text-xs font-bold shadow-sm">Đăng nhập</Link>
                          </div>
                      )}

                      {!isGuest && (
                          <div className="relative">
                              <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center focus:outline-none transition-transform active:scale-95" title="Tài khoản HUB">
                                  {avatarUrl ? (
                                      isColorAvatar ? (
                                          <span className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm" style={{ backgroundColor: avatarUrl }}>{avatarSeed}</span>
                                      ) : (
                                          <img src={avatarUrl} alt="Avatar" className="h-8 w-8 rounded-full object-cover shadow-sm border border-gray-200" />
                                      )
                                  ) : (
                                      <span className="h-8 w-8 rounded-full bg-[#003375] text-white flex items-center justify-center text-sm font-bold shadow-sm">{avatarSeed}</span>
                                  )}
                              </button>

                              {isUserMenuOpen && (
                                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fadeIn">
                                      <button type="button" onClick={() => { const myStudentId = session?.user?.email?.split('@')[0]; if (myStudentId) { navigate(`/profile/${myStudentId}`); } setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Hồ sơ cá nhân</button>
                                      <button type="button" onClick={() => { setShowAccountSettings(true); setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Cài đặt thông tin</button>
                                      <button type="button" onClick={handleRequestReset} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Làm mới dữ liệu</button>
                                      <button type="button" onClick={handleMenuLogout} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                                  </div>
                              )}
                          </div>
                      )}

                      {/* NÚT HAMBURGER MENU MỞ SLIDE-OVER */}
                      <button 
                          onClick={() => setIsMobileMenuOpen(true)} 
                          className="p-1.5 text-gray-600 hover:text-[#003375] focus:outline-none transition-transform active:scale-95 bg-gray-50 rounded-md border border-gray-200 ml-1"
                      >
                          <Menu size={20} />
                      </button>
                  </div>
              </div>

              {/* THANH MENU ĐIỀU HƯỚNG MÀN HÌNH NGANG (Chỉ hiện trên Desktop) */}
              <nav className="hidden sm:flex items-center justify-between sm:justify-start lg:justify-end flex-1 gap-1 sm:gap-2 lg:gap-6 sm:h-full p-1.5 sm:p-0 sm:px-2 bg-gray-50 sm:bg-transparent rounded-full sm:rounded-none border border-gray-100 sm:border-none w-full sm:w-auto overflow-x-auto sm:overflow-visible no-scrollbar sm:mask-edges relative">
                  
                  {/* CÁC THẺ NAVLINK FIX LỖI TS TYPE */}
                  <NavLink to="/dashboard" ref={(el: any) => { navRefs.current[0] = el; }} onClick={playClick} className={({ isActive }) => `flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                      <LayoutDashboard size={20} className="sm:hidden" />
                      <span className="hidden sm:block">Tổng quan</span>
                  </NavLink>
                  <NavLink to="/schedule" ref={(el: any) => { navRefs.current[1] = el; }} onClick={playClick} className={({ isActive }) => `flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                      <Calendar size={20} className="sm:hidden" />
                      <span className="hidden sm:block">Thời khóa biểu</span>
                  </NavLink>
                  <NavLink to="/events" ref={(el: any) => { navRefs.current[2] = el; }} onClick={playClick} className={({ isActive }) => `flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                      <Zap size={20} className="sm:hidden" />
                      <span className="hidden sm:block">Sự kiện ĐRL</span>
                  </NavLink>
                  <NavLink to="/lost-found" ref={(el: any) => { navRefs.current[3] = el; }} onClick={playClick} className={({ isActive }) => `flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                      <Search size={20} className="sm:hidden" />
                      <span className="hidden sm:block">Tìm đồ thất lạc</span>
                  </NavLink>

                  <div className="relative flex items-center justify-center sm:h-full shrink-0 z-10" ref={(el: any) => { handbookMenuRef.current = el; navRefs.current[4] = el; }} onMouseEnter={() => window.innerWidth >= 640 && setIsHandbookMenuOpen(true)} onMouseLeave={() => window.innerWidth >= 640 && setIsHandbookMenuOpen(false)}>
                      <button onClick={(e) => { e.preventDefault(); playClick(); setIsHandbookMenuOpen(!isHandbookMenuOpen); }} className={`flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-all whitespace-nowrap rounded-full sm:rounded-none ${location.pathname.includes('/handbook') || isHandbookMenuOpen ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#003375]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                          <Book size={20} className="sm:hidden" />
                          <span className="hidden sm:flex items-center gap-1">Cẩm nang <ChevronDown size={14} className={`transition-transform duration-200 ${isHandbookMenuOpen ? 'rotate-180' : ''}`}/></span>
                      </button>

                      {isHandbookMenuOpen && (
                          <div className="fixed sm:absolute top-[105px] sm:top-full right-4 sm:right-0 sm:pt-2 w-64 z-[999] animate-fadeIn">
                              <div className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
                                  <div className="p-2 flex flex-col gap-0.5">
                                      <Link to="/handbook/contacts" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-[#003375] rounded-lg transition-colors group">
                                          <div className="bg-[#003375]/10 p-1.5 rounded-lg text-[#003375] group-hover:bg-[#003375] group-hover:text-white transition-colors"><Phone size={16} /></div> Danh bạ & Khoa
                                      </Link>
                                      <Link to="/handbook/clubs" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-[#990000] rounded-lg transition-colors group">
                                          <div className="bg-[#990000]/10 p-1.5 rounded-lg text-[#990000] group-hover:bg-[#990000] group-hover:text-white transition-colors"><Users size={16} /></div> CLB - Đội - Nhóm
                                      </Link>
                                      <Link to="/handbook/scholarships" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-green-600 rounded-lg transition-colors group">
                                          <div className="bg-green-100 p-1.5 rounded-lg text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors"><Award size={16} /></div> Học bổng & Quy chế
                                      </Link>
                                      <div className="h-px bg-gray-100 my-1 mx-2"></div>
                                      <Link to="/handbook/faqs" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600 rounded-lg transition-colors group">
                                          <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><HelpCircle size={16} /></div> FAQs
                                      </Link>
                                      <Link to="/handbook/feedback" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-teal-600 rounded-lg transition-colors group">
                                          <div className="bg-teal-100 p-1.5 rounded-lg text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors"><MessageSquarePlus size={16} /></div> Góp ý
                                      </Link>
                                      <Link to="/handbook/donate" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-pink-600 rounded-lg transition-colors group">
                                          <div className="bg-pink-100 p-1.5 rounded-lg text-pink-600 group-hover:bg-pink-600 group-hover:text-white transition-colors"><Heart size={16} /></div> Ủng hộ & Tri ân
                                      </Link>
                                      <Link to="/handbook/about" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-800 rounded-lg transition-colors group">
                                          <div className="bg-gray-200 p-1.5 rounded-lg text-gray-600 group-hover:bg-gray-600 group-hover:text-white transition-colors"><Info size={16} /></div> Về chúng mình
                                      </Link>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
                  <div className="hidden sm:block absolute bottom-0 h-[2px] bg-[#003375] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] z-20 rounded-t-full" style={{ left: `${navIndicator.left}px`, width: `${navIndicator.width}px`, opacity: navIndicator.opacity }} />
              </nav>

              {/* KHU VỰC CÔNG CỤ GÓC PHẢI */}
              <div className="hidden sm:flex items-center gap-1.5 lg:gap-3 shrink-0 pl-2 lg:pl-4 border-l border-gray-200">
                  {showInstallButton && (
                      <button 
                          onClick={() => { playClick(); onInstallApp?.(); }}
                          className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 font-bold text-xs px-2.5 py-1.5 rounded-lg hover:bg-green-100 hover:border-green-300 transition-colors shadow-sm active:scale-95 whitespace-nowrap"
                          title="Tải ứng dụng về máy"
                      >
                          <Download size={14} className="stroke-[2.5]" />
                          <span className="hidden lg:inline">Tải App</span>
                      </button>
                  )}

                  <button onClick={() => { playClick(); setShowGuide(true); }} className="text-gray-400 hover:text-gray-900 transition-colors hidden sm:block" title="Hướng dẫn">
                      <HelpCircle size={18} />
                  </button>
                  
                  {!isGuest && (
                      <NotificationBell currentUserId={session?.user?.id} />
                  )}
                  
                  {session ? (
                      <div className="relative flex items-center gap-2 lg:gap-3 border-l border-gray-200 pl-2 lg:pl-3">
                          <div className="hidden md:flex flex-col items-end justify-center">
                              <span className="text-[11px] lg:text-xs font-bold text-gray-700 uppercase tracking-wide leading-none truncate max-w-[100px] lg:max-w-[150px]">{displayName}</span>
                              <span className="text-[10px] text-gray-400 font-medium leading-none mt-1">{studentId}</span>
                          </div>
                          
                          <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2 focus:outline-none transition-transform active:scale-95" title="Tài khoản HUB">
                              {avatarUrl ? (
                                  isColorAvatar ? (
                                      <span className="h-7 w-7 lg:h-8 lg:w-8 rounded-full flex items-center justify-center text-white text-xs lg:text-sm font-bold shadow-sm" style={{ backgroundColor: avatarUrl }}>{avatarSeed}</span>
                                  ) : (
                                      <img src={avatarUrl} alt="Avatar" className="h-7 w-7 lg:h-8 lg:w-8 rounded-full object-cover shadow-sm border border-gray-200" />
                                  )
                              ) : (
                                  <span className="h-7 w-7 lg:h-8 lg:w-8 rounded-full bg-[#003375] text-white flex items-center justify-center text-xs lg:text-sm font-bold shadow-sm">{avatarSeed}</span>
                              )}
                          </button>
                          
                          {isUserMenuOpen && (
                              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fadeIn">
                                  <button type="button" onClick={() => { const myStudentId = session?.user?.email?.split('@')[0]; if (myStudentId) { navigate(`/profile/${myStudentId}`); } setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Hồ sơ cá nhân</button>
                                  <button type="button" onClick={() => { setShowAccountSettings(true); setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Cài đặt thông tin</button>
                                  <button type="button" onClick={handleRequestReset} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Làm mới dữ liệu</button>
                                  <button type="button" onClick={handleMenuLogout} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                              </div>
                          )}
                      </div>
                  ) : (
                      <div className="flex items-center gap-1.5 lg:gap-2 border-l border-gray-200 pl-1.5 lg:pl-3">
                          <button onClick={handleRequestReset} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors" title="Xóa dữ liệu dùng thử">
                              <RotateCcw size={14} className="lg:w-4 lg:h-4" />
                              <span className="text-[10px] lg:text-xs font-bold hidden md:block">Reset</span>
                          </button>
                          <Link to="/login" onClick={playClick} className="flex items-center gap-1 px-2 lg:px-4 py-1.5 bg-[#003375] text-white text-[10px] lg:text-sm font-bold rounded-lg hover:bg-[#002855] transition-colors shadow-sm whitespace-nowrap">
                              <User size={14} className="lg:w-4 lg:h-4" /> <span className="hidden md:block">Đăng nhập</span>
                          </Link>
                      </div>
                  )}
              </div>
          </div>
      </header>

      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar relative z-10">
          <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2 sm:pt-3 min-h-full flex flex-col">
              <div className="flex-1">
                  {children}
              </div>
              <footer className="text-center py-6 mt-10 border-t border-gray-200 text-gray-500 bg-[#F8FAFC]">
                  <p className="text-xs font-medium tracking-wide mb-1 uppercase">Web designed by tqhoangg</p>
                  <p className="text-[10px] opacity-80 px-4 mb-3">HUB Planner có thể mắc sai sót, vui lòng xác minh lại thông tin khi cần thiết.</p>
                  <div className="text-xs">
                      <Link to="/handbook/privacy" className="hover:text-gray-900 transition-colors">Chính sách bảo mật</Link>
                      <span className="mx-3 opacity-50">•</span>
                      <Link to="/handbook/terms" className="hover:text-gray-900 transition-colors">Điều khoản sử dụng</Link>
                  </div>
              </footer>
          </main>
      </div>

      <div className="fixed bottom-6 left-6 z-40 hidden md:flex flex-col gap-3">
          <a href="https://www.facebook.com/hubplannerr" target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full bg-white text-[#1877F2] flex items-center justify-center shadow-md border border-gray-200 hover:scale-110 transition-transform">
              <Facebook size={20} />
          </a>
      </div>

      {/* ======================================================================= */}
      {/* KHỐI SLIDE-OVER MENU DÀNH CHO MOBILE (Trượt từ trái sang giống PTIT) */}
      {/* ======================================================================= */}
      
      {/* Lớp phủ mờ (Overlay) */}
      <div 
          className={`fixed inset-0 bg-black/60 z-[100] transition-opacity duration-300 sm:hidden ${
              isMobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* Menu Drawer */}
      <div 
          className={`fixed top-0 left-0 h-[100dvh] w-[85%] max-w-[320px] bg-white z-[101] flex flex-col shadow-2xl transition-transform duration-300 ease-in-out sm:hidden ${
              isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
          {/* Header màu xanh của Drawer */}
          <div className="bg-[#003375] p-5 flex items-center justify-between shrink-0 shadow-md">
              <div className="flex flex-col text-white">
                  <span className="font-extrabold text-lg tracking-tight">HUB PLANNER</span>
                  <span className="text-xs font-medium opacity-90 mt-0.5">Hỗ trợ sinh viên</span>
              </div>
              <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                  <X size={22} />
              </button>
          </div>

          {/* Danh sách chức năng */}
          <div className="flex-1 overflow-y-auto py-5 px-4 flex flex-col gap-1 custom-scrollbar bg-white">
              
              <div className="text-[11px] font-bold text-gray-400 mb-2 px-2 tracking-wider">TÍNH NĂNG CHÍNH</div>
              
              <NavLink 
                  to="/dashboard" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={({ isActive }) => `flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${isActive ? 'bg-blue-50 text-[#003375] border border-blue-100' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  {({ isActive }) => (
                      <>
                          <LayoutDashboard size={20} className={isActive ? 'text-[#003375]' : 'text-gray-500'} /> 
                          <span className={isActive ? 'font-bold' : ''}>Tổng quan</span>
                      </>
                  )}
              </NavLink>
              
              <NavLink 
                  to="/schedule" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={({ isActive }) => `flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${isActive ? 'bg-blue-50 text-[#003375] border border-blue-100' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  {({ isActive }) => (
                      <>
                          <Calendar size={20} className={isActive ? 'text-[#003375]' : 'text-gray-500'} /> 
                          <span className={isActive ? 'font-bold' : ''}>Thời khóa biểu</span>
                      </>
                  )}
              </NavLink>
              
              <NavLink 
                  to="/events" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={({ isActive }) => `flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${isActive ? 'bg-blue-50 text-[#003375] border border-blue-100' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  {({ isActive }) => (
                      <>
                          <Zap size={20} className={isActive ? 'text-[#003375]' : 'text-gray-500'} /> 
                          <span className={isActive ? 'font-bold' : ''}>Sự kiện ĐRL</span>
                      </>
                  )}
              </NavLink>
              
              <NavLink 
                  to="/lost-found" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={({ isActive }) => `flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${isActive ? 'bg-blue-50 text-[#003375] border border-blue-100' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  {({ isActive }) => (
                      <>
                          <Search size={20} className={isActive ? 'text-[#003375]' : 'text-gray-500'} /> 
                          <span className={isActive ? 'font-bold' : ''}>Tìm đồ thất lạc</span>
                      </>
                  )}
              </NavLink>

              <div className="h-px bg-gray-100 w-full my-3"></div>
              
              <div className="text-[11px] font-bold text-gray-400 mb-2 px-2 tracking-wider mt-1">TIỆN ÍCH & HỖ TRỢ</div>
              
              <Link 
                  to="/handbook" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${location.pathname.includes('/handbook') ? 'bg-blue-50 text-[#003375] border border-blue-100 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  <Book size={20} className={location.pathname.includes('/handbook') ? 'text-[#003375]' : 'text-gray-500'} /> 
                  Cẩm nang
              </Link>
          </div>
      </div>
    </>
  );
};