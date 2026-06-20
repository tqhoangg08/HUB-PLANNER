import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Book, Calendar, ChevronDown, ClipboardList, HelpCircle, LayoutDashboard, LogOut, RotateCcw, Search, User, UserPlus, Zap, Facebook, Phone, Users, Award, MessageSquarePlus, Heart, Info, Clock, RefreshCw, Download, Star, Menu, X, FileText, ShieldCheck, Sparkles } from 'lucide-react';
import { playClick } from '../utils/audio';
import NotificationBell from '../components/NotificationBell';
import { supabase } from '../utils/supabase';
import { getAvatarColorClass, isAllowedAvatarColor, isAvatarImageUrl } from '../utils/avatarColors';
import { setRuntimeStyleRule } from '../utils/runtimeStyles';

interface DesktopLayoutProps {
  session: any;
  isGuest: boolean;
  isAdmin: boolean;
  isAuditor?: boolean;
  viewingUser: any;
  displayName: string;
  studentId: string;
  avatarUrl: string;
  avatarSeed: string;
  adminSearchMssv: string;
  isSearchingUser: boolean;
    isMobileBrowser?: boolean;
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
  session, isGuest, isAdmin, isAuditor, viewingUser, displayName, studentId, avatarUrl, avatarSeed,
  isMobileBrowser = false,
  adminSearchMssv, isSearchingUser, setAdminSearchMssv, handleAdminSearchUser,
  handleRequestReset, handleLogout, setShowGuide, setShowActivityLog,
  setIsUserMenuOpen, isUserMenuOpen, handleMenuLogout, 
  handleExitAdminView, handleSyncDB, navigate, children,
  onInstallApp, showInstallButton
}) => {
  const location = useLocation();
  const isColorAvatar = isAllowedAvatarColor(avatarUrl);
  const isImageAvatar = isAvatarImageUrl(avatarUrl);
  const safeAvatarColorClass = getAvatarColorClass(avatarUrl);
  
  const [isHandbookMenuOpen, setIsHandbookMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileHandbookOpen, setIsMobileHandbookOpen] = useState(false);
  const handbookMenuRef = useRef<HTMLDivElement>(null);
  const profileSearchRef = useRef<HTMLFormElement>(null);
  const navContainerRef = useRef<HTMLElement>(null);
  const navRefs = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([]);
  const [navIndicator, setNavIndicator] = useState({ left: 0, width: 0, opacity: 0 });
  const [pendingReportCount, setPendingReportCount] = useState(0);
  const [pendingCandidateCount, setPendingCandidateCount] = useState(0);
  const [profileSearchMssv, setProfileSearchMssv] = useState('');
  const [isProfileSearchOpen, setIsProfileSearchOpen] = useState(false);
  const [profileSearchSuggestions, setProfileSearchSuggestions] = useState<any[]>([]);
  const [isLoadingProfileSuggestions, setIsLoadingProfileSuggestions] = useState(false);
  const [isSmallViewport, setIsSmallViewport] = useState(() => window.innerWidth < 640);

  const handleProfileSearch = (event: React.FormEvent) => {
      event.preventDefault();
      const keyword = profileSearchMssv.trim();
      if (!keyword) return;

      const studentCode = keyword.includes('@') ? keyword.split('@')[0] : keyword;
      navigate(`/profiles/search?q=${encodeURIComponent(studentCode)}`);
      setIsProfileSearchOpen(false);
      playClick();
  };

  const openProfile = (studentCode: string) => {
      if (!studentCode) return;
      navigate(`/profile/${encodeURIComponent(studentCode)}`);
      setProfileSearchMssv('');
      setProfileSearchSuggestions([]);
      setIsProfileSearchOpen(false);
      playClick();
  };

  useEffect(() => {
      if (!session || isGuest || isAdmin || isAuditor) {
          setProfileSearchSuggestions([]);
          return;
      }

      const keyword = profileSearchMssv.trim().replace(/[%,]/g, '').slice(0, 40);
      if (keyword.length < 2 || !isProfileSearchOpen) {
          setProfileSearchSuggestions([]);
          setIsLoadingProfileSuggestions(false);
          return;
      }

      let cancelled = false;
      setIsLoadingProfileSuggestions(true);

      const timer = window.setTimeout(async () => {
          try {
              const { data, error } = await supabase
                  .from('public_profiles')
                  .select('id, full_name, student_code, avatar_url, class_name')
                  .or(`student_code.ilike.%${keyword}%,full_name.ilike.%${keyword}%`)
                  .order('student_code', { ascending: true })
                  .limit(6);

              if (error) throw error;
              if (!cancelled) setProfileSearchSuggestions(data || []);
          } catch (error) {
              console.warn('Không thể tải gợi ý hồ sơ:', error);
              if (!cancelled) setProfileSearchSuggestions([]);
          } finally {
              if (!cancelled) setIsLoadingProfileSuggestions(false);
          }
      }, 180);

      return () => {
          cancelled = true;
          window.clearTimeout(timer);
      };
  }, [profileSearchMssv, isProfileSearchOpen, session, isGuest, isAdmin, isAuditor]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (handbookMenuRef.current && !handbookMenuRef.current.contains(event.target as Node)) {
              setIsHandbookMenuOpen(false);
          }
          if (profileSearchRef.current && !profileSearchRef.current.contains(event.target as Node)) {
              setIsProfileSearchOpen(false);
              setProfileSearchSuggestions([]);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
      const handleResize = () => setIsSmallViewport(window.innerWidth < 640);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
      if (isAdmin || isAuditor) return;

      const getActiveIndex = () => {
          if (location.pathname.includes('/dashboard')) return 0;
          if (location.pathname.includes('/schedule')) return 1;
          if (location.pathname.includes('/events')) return 2;
          if (location.pathname.includes('/lost-found')) return 3;
          if (location.pathname.includes('/handbook') || isHandbookMenuOpen || location.pathname.includes('/admin-reports')) return 4;
          return -1;
      };

      let frame = 0;
      const updateNavIndicator = () => {
          window.cancelAnimationFrame(frame);
          frame = window.requestAnimationFrame(() => {
              const nav = navContainerRef.current;
              const activeEl = navRefs.current[getActiveIndex()];
              if (!nav || !activeEl) {
                  setNavIndicator(prev => ({ ...prev, opacity: 0 }));
                  return;
              }

              const navRect = nav.getBoundingClientRect();
              const activeRect = activeEl.getBoundingClientRect();
              setNavIndicator({
                  left: activeRect.left - navRect.left + nav.scrollLeft,
                  width: activeRect.width,
                  opacity: 1,
              });
          });
      };

      updateNavIndicator();
      const resizeObserver = new ResizeObserver(updateNavIndicator);
      if (navContainerRef.current) resizeObserver.observe(navContainerRef.current);
      navRefs.current.forEach(el => {
          if (el) resizeObserver.observe(el);
      });
      window.addEventListener('resize', updateNavIndicator);

      return () => {
          window.cancelAnimationFrame(frame);
          resizeObserver.disconnect();
          window.removeEventListener('resize', updateNavIndicator);
      };
  }, [location.pathname, isHandbookMenuOpen, isAdmin, isAuditor, isProfileSearchOpen]);

  useEffect(() => {
      setRuntimeStyleRule('desktop-nav-indicator', '.desktop-nav-runtime .translate-tab-indicator', {
          opacity: navIndicator.opacity,
          transform: `translateX(${navIndicator.left}px)`,
          width: `${navIndicator.width}px`,
      });
  }, [navIndicator]);

  useEffect(() => {
      if (!isMobileMenuOpen) return;

      const html = document.documentElement;
      const body = document.body;
      const previousHtmlOverflow = html.style.overflow;
      const previousBodyOverflow = body.style.overflow;

      html.classList.add('mobile-menu-open');
      body.classList.add('mobile-menu-open');
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';

      return () => {
          html.classList.remove('mobile-menu-open');
          body.classList.remove('mobile-menu-open');
          html.style.overflow = previousHtmlOverflow;
          body.style.overflow = previousBodyOverflow;
      };
  }, [isMobileMenuOpen]);

  useEffect(() => {
      if (!(isAdmin || isAuditor)) {
          setPendingReportCount(0);
          setPendingCandidateCount(0);
          return;
      }

      let cancelled = false;
      const unresolvedStatuses = new Set(['ok', 'resolved']);
      const reportTables = ['course_reports', 'bug_reports', 'ctv_requests', 'event_reports', 'feedback'];

      const loadPendingCounts = async () => {
          try {
              const reportCounts = await Promise.all(reportTables.map(async (table) => {
                  const { data, error } = await supabase
                      .from(table)
                      .select('id,status');

                  if (error) {
                      console.warn(`Không thể tải số báo cáo chờ xử lý từ ${table}:`, error.message);
                      return 0;
                  }

                  return (data || []).filter((item: any) => {
                      const status = String(item?.status || '').toLowerCase();
                      return !unresolvedStatuses.has(status);
                  }).length;
              }));

              const { count: candidateCount, error: candidateError } = await supabase
                  .from('event_candidates')
                  .select('id', { count: 'exact', head: true })
                  .eq('review_status', 'pending');

              if (candidateError) {
                  console.warn('Không thể tải số candidate chờ duyệt:', candidateError.message);
              }

              if (!cancelled) {
                  setPendingReportCount(reportCounts.reduce((sum, value) => sum + value, 0));
                  setPendingCandidateCount(candidateError ? 0 : (candidateCount || 0));
              }
          } catch (error) {
              console.warn('Không thể tải badge sidebar:', error);
              if (!cancelled) {
                  setPendingReportCount(0);
                  setPendingCandidateCount(0);
              }
          }
      };

      loadPendingCounts();

      return () => {
          cancelled = true;
      };
  }, [isAdmin, isAuditor, location.pathname]);

  // ==============================================================================================
  // ✨ 1. GIAO DIỆN ADMIN & AUDITOR ✨
  // ==============================================================================================
  if (isAdmin || isAuditor) {
      return (
          <div className="flex h-[100dvh] w-full bg-[#F8FAFC] overflow-hidden font-sans text-gray-800">
              
              {/* Nền đen cho Mobile */}
              <div 
                  className={`fixed inset-0 bg-black/60 z-[100] transition-opacity duration-300 md:hidden ${
                      isMobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
              />

              {/* SIDEBAR BÊN TRÁI */}
              <aside className={`fixed md:relative top-0 left-0 h-full w-[260px] bg-white border-r border-gray-200 flex flex-col shrink-0 z-[101] shadow-2xl md:shadow-none transition-transform duration-300 ease-in-out md:translate-x-0 ${
                  isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
              }`}>
                  
                  {/* HEADER LOGO & NÚT X (CHỈ HIỆN TRÊN MOBILE) */}
                  <div className="md:hidden h-16 flex items-center justify-between px-6 border-b border-[#003375] shrink-0 bg-[#003375]">
                      <Link to="/dashboard" className="hub-brand flex items-center gap-3 transition-transform hover:scale-105" onClick={() => { playClick(); setIsMobileMenuOpen(false); }}>
                          <img src="/logo.png" alt="HUB Logo" className="h-8 w-8 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<div class="h-8 w-8 bg-white rounded flex items-center justify-center text-[#003375] font-bold text-xs">HUB</div>'; }} />
                          <div className="leading-tight">
                              <h1 className="hub-brand-title text-[16px] font-extrabold text-white tracking-tight">HUB PLANNER</h1>
                              <p className="hub-brand-subtitle text-[9px] text-blue-200 uppercase tracking-widest font-semibold">Hỗ trợ sinh viên</p>
                          </div>
                      </Link>
                      <button onClick={() => setIsMobileMenuOpen(false)} className="text-blue-200 hover:text-white hover:bg-white/20 p-1.5 rounded-md transition-colors active:scale-95 border border-transparent hover:border-blue-400">
                          <X size={20} />
                      </button>
                  </div>

                  {/* THÔNG TIN USER (HIỆN Ở TRÊN CÙNG SIDEBAR KHI MỞ TRÊN MOBILE) */}
                  <div className="md:hidden flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white">
                      <div className="h-12 w-12 rounded-full bg-[#0052cc] text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0 overflow-hidden border-2 border-white outline outline-1 outline-gray-200">
                          {isImageAvatar ? (
                              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                              <span className={`w-full h-full flex items-center justify-center ${safeAvatarColorClass}`}>
                                  {avatarSeed}
                              </span>
                          )}
                      </div>
                      <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-500 font-semibold mb-0.5">Xin chào,</p>
                          <div className="text-[15px] font-bold text-[#0052cc] truncate">{displayName}</div>
                      </div>
                  </div>

                  {/* HEADER LOGO CHO DESKTOP */}
                  <div className="hidden md:flex h-16 items-center justify-between px-6 border-b border-gray-100 shrink-0">
                      <Link to="/dashboard" className="hub-brand flex items-center gap-3 transition-transform hover:scale-105" onClick={() => { playClick(); setIsMobileMenuOpen(false); }}>
                          <img src="/logo.png" alt="HUB Logo" className="h-8 w-8 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<div class="h-8 w-8 bg-[#0052cc] rounded flex items-center justify-center text-white font-bold text-xs">HUB</div>'; }} />
                          <div className="leading-tight">
                              <h1 className="hub-brand-title text-[16px] font-extrabold text-[#003375] tracking-tight">HUB PLANNER</h1>
                              <p className="hub-brand-subtitle text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Hỗ trợ sinh viên</p>
                          </div>
                      </Link>
                  </div>

                  {/* DANH SÁCH CHỨC NĂNG */}
                  <div className="mobile-menu-scroll flex-1 overflow-y-auto py-6 flex flex-col gap-1.5 px-4 custom-scrollbar">
                      <div className="text-[11px] font-bold text-gray-400 mb-2 px-2 tracking-wider">CHỨC NĂNG</div>
                      
                      <NavLink to="/dashboard" onClick={() => { playClick(); setIsMobileMenuOpen(false); }} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                          <LayoutDashboard size={16} /> Tổng quan
                      </NavLink>
                      <NavLink to="/schedule" onClick={() => { playClick(); setIsMobileMenuOpen(false); }} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                          <Calendar size={16} /> Thời khóa biểu
                      </NavLink>
                      <NavLink to="/events" onClick={() => { playClick(); setIsMobileMenuOpen(false); }} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                          <Star size={16} /> Sự kiện ĐRL
                      </NavLink>
                      <NavLink to="/lost-found" onClick={() => { playClick(); setIsMobileMenuOpen(false); }} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                          <Search size={16} /> Tìm đồ thất lạc
                      </NavLink>
                      <NavLink to="/admin-reports" onClick={() => { playClick(); setIsMobileMenuOpen(false); }} className={({isActive}) => `flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${isActive ? 'bg-red-50 text-red-600' : 'text-gray-600 hover:bg-gray-50 hover:text-red-600'}`}>
                          <div className="flex items-center gap-3">
                              <ClipboardList size={16} /> Xử lý báo cáo
                          </div>
                          {pendingReportCount > 0 && (
                              <div className="w-2 h-2 rounded-full bg-red-500" title={`${pendingReportCount} mục chờ xử lý`}></div>
                          )}
                      </NavLink>
                      {isAdmin && (
                          <NavLink to="/admin/activity" onClick={() => { playClick(); setIsMobileMenuOpen(false); }} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-[#0052cc]'}`}>
                              <Clock size={16} /> Theo dõi hoạt động
                          </NavLink>
                      )}
                      <NavLink to="/admin/event-candidates" onClick={() => { playClick(); setIsMobileMenuOpen(false); }} className={({isActive}) => `flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc]' : 'text-gray-600 hover:bg-gray-50 hover:text-[#0052cc]'}`}>
                          <div className="flex items-center gap-3">
                              <Sparkles size={16} /> Event candidate
                          </div>
                          {pendingCandidateCount > 0 && (
                              <div className="w-2 h-2 rounded-full bg-red-500" title={`${pendingCandidateCount} candidate chờ duyệt`}></div>
                          )}
                      </NavLink>
                  </div>

                  {/* NÚT TRỢ GIÚP / ĐĂNG XUẤT MOBILE */}
                  <div className="p-4 border-t border-gray-100 flex flex-col gap-1.5 bg-gray-50/50">
                      <button onClick={() => { setIsMobileMenuOpen(false); setShowGuide(true); }} className="flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-colors">
                          <HelpCircle size={16} /> Trợ giúp
                      </button>
                      <button onClick={() => { setIsMobileMenuOpen(false); handleMenuLogout(); }} className="md:hidden flex items-center gap-3 px-3 py-2.5 text-[13px] font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                          <LogOut size={16} /> Đăng xuất
                      </button>
                  </div>

                  {/* AVATAR CHO DESKTOP (VẪN Ở DƯỚI) - ẨN TRÊN MOBILE */}
                  <div className="hidden md:flex mt-4 items-center gap-3 px-2 pt-3 border-t border-gray-200 relative group cursor-pointer" onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}>
                      <div className="h-10 w-10 rounded-full bg-[#0052cc] text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0 overflow-hidden">
                          {isImageAvatar ? (
                              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                              <span className={`w-full h-full flex items-center justify-center ${safeAvatarColorClass}`}>
                                  {avatarSeed}
                              </span>
                          )}
                      </div>
                      <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-gray-900 truncate">{displayName}</div>
                                  <span className="text-[10px] text-gray-400 font-medium leading-none mt-1">{studentId || (isAdmin ? 'Quản trị viên' : 'Kiểm duyệt viên')}</span>
                      </div>
                      {isUserMenuOpen && (
                          <div className="absolute bottom-full left-0 mb-3 w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fadeIn">
                              <button type="button" onClick={() => { setIsMobileMenuOpen(false); const myStudentId = session?.user?.email?.split('@')[0]; if (myStudentId) { navigate(`/profile/${myStudentId}`); } setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Hồ sơ cá nhân</button>
                              <button type="button" onClick={() => { setIsMobileMenuOpen(false); handleMenuLogout(); }} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                          </div>
                      )}
                  </div>
              </aside>

              <div className="flex-1 flex flex-col min-w-0 relative">
                  <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shrink-0 relative z-40">
                      
                      {/* BÊN TRÁI HEADER: LOGO HOẶC BREADCRUMB */}
                      <div className="flex items-center gap-2">
                          {/* Logo Mobile */}
                          <div className="hub-brand md:hidden flex items-center gap-2 shrink-0">
                              <Link to="/dashboard" className="h-7 w-7 relative flex-shrink-0 transition-transform duration-200 hover:scale-105 active:scale-95" onClick={playClick}>
                                  <img src="/logo.png" alt="HUB Logo" className="h-full w-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<div class="h-7 w-7 bg-[#0052cc] rounded flex items-center justify-center text-white font-bold text-xs">HUB</div>'; }} />
                              </Link>
                              <div className="leading-tight">
                                  <h1 className="hub-brand-title text-[14px] font-extrabold text-[#003375] tracking-tight">HUB PLANNER</h1>
                                  <p className="hub-brand-subtitle text-[8px] text-gray-500 uppercase tracking-widest font-semibold">Hỗ trợ sinh viên</p>
                              </div>
                          </div>

                          {/* Breadcrumb Desktop */}
                          <div className="hidden md:flex items-center gap-2 text-sm font-medium text-gray-400">
                              <span>HUB Planner</span>
                              <span className="opacity-50">/</span>
                              <span className="text-gray-900 font-bold truncate max-w-[150px] sm:max-w-full">
                                  {location.pathname.includes('admin/activity')
                                      ? 'Theo dõi hoạt động'
                                      : location.pathname.includes('admin/event-candidates')
                                      ? 'Event candidate'
                                      : location.pathname.includes('admin-reports')
                                          ? 'Xử lý báo cáo'
                                          : location.pathname.includes('dashboard')
                                              ? 'Quản lý Sinh viên'
                                              : 'Hệ thống'}
                              </span>
                          </div>
                      </div>

                      {/* BÊN PHẢI HEADER: TÌM KIẾM, CHUÔNG & HAMBURGER */}
                      <div className="flex items-center gap-3 lg:gap-4 ml-auto">
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
                                  className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-[#0052cc] font-bold text-sm px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors shadow-sm active:scale-95 whitespace-nowrap hidden sm:flex"
                              >
                                  <Download size={16} className="stroke-[2.5]" />
                                  <span>Tải App</span>
                              </button>
                          )}

                          {handleSyncDB && (
                              <button onClick={handleSyncDB} className="p-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200" title="Đồng bộ DB">
                                  <RefreshCw size={16} />
                              </button>
                          )}

                          <NotificationBell currentUserId={session?.user?.id} />

                          {/* AVATAR CHO DESKTOP BÊN PHẢI CÙNG HEADER */}
                          <div className="hidden md:flex relative items-center border-l border-gray-200 pl-2 lg:pl-3">
                              <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2 focus:outline-none transition-transform active:scale-95" title="Tài khoản HUB">
                                  {avatarUrl ? (
                                      isColorAvatar ? (
                                          <span className={`h-7 w-7 lg:h-8 lg:w-8 rounded-full flex items-center justify-center text-white text-xs lg:text-sm font-bold shadow-sm ${safeAvatarColorClass}`}>{avatarSeed}</span>
                                      ) : isImageAvatar ? (
                                          <img src={avatarUrl} alt="Avatar" className="h-7 w-7 lg:h-8 lg:w-8 rounded-full object-cover shadow-sm border border-gray-200" />
                                      ) : (
                                          <span className="h-7 w-7 lg:h-8 lg:w-8 rounded-full bg-[#0052cc] text-white flex items-center justify-center text-xs lg:text-sm font-bold shadow-sm">{avatarSeed}</span>
                                      )
                                  ) : (
                                      <span className="h-7 w-7 lg:h-8 lg:w-8 rounded-full bg-[#0052cc] text-white flex items-center justify-center text-xs lg:text-sm font-bold shadow-sm">{avatarSeed}</span>
                                  )}
                              </button>
                              
                              {isUserMenuOpen && (
                                  <div className="absolute right-0 top-full mt-3 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fadeIn">
                              <button type="button" onClick={() => { setIsMobileMenuOpen(false); const myStudentId = session?.user?.email?.split('@')[0]; if (myStudentId) { navigate(`/profile/${myStudentId}`); } setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Hồ sơ cá nhân</button>
                                      <button type="button" onClick={() => { setIsMobileMenuOpen(false); handleMenuLogout(); }} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                                  </div>
                              )}
                          </div>

                          {/* NÚT HAMBURGER CHO MOBILE ĐƯỢC ĐƯA SANG BÊN PHẢI */}
                          <button 
                              onClick={() => setIsMobileMenuOpen(true)} 
                              className="md:hidden p-1.5 text-gray-600 hover:text-[#0052cc] focus:outline-none transition-transform active:scale-95 bg-gray-50 rounded-md border border-gray-200 ml-1"
                          >
                              <Menu size={20} />
                          </button>
                      </div>
                  </header>

                  <main className="flex-1 overflow-y-auto custom-scrollbar">
                      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-4 pb-8 min-h-full flex flex-col">
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
  // ✨ 2. GIAO DIỆN USER BÌNH THƯỜNG ✨
  // ==============================================================================================
  const isEventCandidatesPage = location.pathname.startsWith('/admin/event-candidates');

  return (
    <>
      <header className="mobile-browser-header bg-white border-b border-gray-200 w-full z-40 shrink-0 h-auto sm:h-14 shadow-sm p-3 sm:p-0 sticky top-0 sm:relative">
          <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-8">
              <div className="w-full flex flex-row items-center justify-between sm:w-auto sm:gap-3 shrink-0">
                  
                  {/* LOGO CHUNG CHO MOBILE & DESKTOP NẰM BÊN TRÁI */}
                  <div className="hub-brand flex items-center gap-1.5 sm:gap-3 shrink-0">
                      <Link to="/dashboard" className="h-7 w-7 relative flex-shrink-0 transition-transform duration-200 hover:scale-105 active:scale-95" onClick={playClick}>
                          <img src="/logo.png" alt="HUB Logo" className="h-full w-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<div class="h-7 w-7 bg-[#0052cc] rounded flex items-center justify-center text-white font-bold text-xs">HUB</div>'; }} />
                      </Link>
                      <div className="leading-tight">
                          <h1 className="hub-brand-title text-[15px] font-extrabold text-[#003375] tracking-tight">HUB PLANNER</h1>
                              <p className="hub-brand-subtitle text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Hỗ trợ sinh viên</p>
                      </div>
                  </div>

                  {/* CÁC NÚT ĐIỀU KHIỂN &  HAMBURGER NẰM BÊN PHẢI TRÊN MOBILE */}
                  <div className="flex items-center justify-end flex-1 sm:hidden gap-2 shrink-0">
                      {showInstallButton && (
                          <button 
                              onClick={() => { playClick(); onInstallApp?.(); }}
                              className="flex items-center justify-center h-8 px-2.5 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow-sm active:scale-95 shrink-0"
                              title="Tải ứng dụng"
                          >
                              <Download size={16} className="stroke-[2.5]" />
                          </button>
                      )}
                      
                      {!isGuest && isSmallViewport && (
                          <NotificationBell currentUserId={session?.user?.id} />
                      )}
                      
                      <button 
                          onClick={() => setIsMobileMenuOpen(true)} 
                          className="p-1.5 text-gray-600 hover:text-[#0052cc] focus:outline-none transition-transform active:scale-95 bg-gray-50 rounded-md border border-gray-200 ml-1"
                      >
                          <Menu size={20} />
                      </button>
                  </div>
              </div>

              {/* DESKTOP TOP NAV */}
              <nav ref={navContainerRef} className="desktop-nav-runtime hidden sm:flex items-center justify-between sm:justify-start lg:justify-end flex-1 gap-1 sm:gap-2 lg:gap-6 sm:h-full p-1.5 sm:p-0 sm:px-2 bg-gray-50 sm:bg-transparent rounded-full sm:rounded-none border border-gray-100 sm:border-none w-full sm:w-auto overflow-x-auto sm:overflow-visible no-scrollbar sm:mask-edges relative">
                  
                  <NavLink to="/dashboard" ref={(el: any) => { navRefs.current[0] = el; }} onClick={playClick} className={({ isActive }) => `relative flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-colors whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#0052cc]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                      <LayoutDashboard size={20} className="sm:hidden" />
                      <span className="hidden sm:block">Tổng quan</span>
                  </NavLink>
                  <NavLink to="/schedule" ref={(el: any) => { navRefs.current[1] = el; }} onClick={playClick} className={({ isActive }) => `relative flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-colors whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#0052cc]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                      <Calendar size={20} className="sm:hidden" />
                      <span className="hidden sm:block">Thời khóa biểu</span>
                  </NavLink>
                  <NavLink to="/events" ref={(el: any) => { navRefs.current[2] = el; }} onClick={playClick} className={({ isActive }) => `relative flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-colors whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#0052cc]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                      <Zap size={20} className="sm:hidden" />
                      <span className="hidden sm:block">Sự kiện ĐRL</span>
                  </NavLink>
                  <NavLink to="/lost-found" ref={(el: any) => { navRefs.current[3] = el; }} onClick={playClick} className={({ isActive }) => `relative flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-colors whitespace-nowrap rounded-full sm:rounded-none z-10 ${isActive ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#0052cc]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                      <Search size={20} className="sm:hidden" />
                      <span className="hidden sm:block">Tìm đồ thất lạc</span>
                  </NavLink>
                  <div className="relative flex items-center justify-center sm:h-full shrink-0 z-10" ref={handbookMenuRef} onMouseEnter={() => window.innerWidth >= 640 && setIsHandbookMenuOpen(true)} onMouseLeave={() => window.innerWidth >= 640 && setIsHandbookMenuOpen(false)}>
                      <button ref={(el) => { navRefs.current[4] = el; }} onClick={(e) => { e.preventDefault(); playClick(); setIsHandbookMenuOpen(!isHandbookMenuOpen); }} className={`relative flex items-center justify-center sm:h-full px-3 py-1.5 sm:px-1 sm:py-0 text-sm font-semibold transition-colors whitespace-nowrap rounded-full sm:rounded-none ${location.pathname.includes('/handbook') || isHandbookMenuOpen ? 'bg-white sm:bg-transparent shadow-lg sm:shadow-none text-[#0052cc]' : 'text-gray-400 sm:text-gray-500 hover:text-gray-900'}`}>
                          <Book size={20} className="sm:hidden" />
                          <span className="hidden sm:flex items-center gap-1">Cẩm nang <ChevronDown size={14} className={`transition-transform duration-200 ml-1 ${isHandbookMenuOpen ? 'rotate-180' : ''}`}/></span>
                      </button>

                      {/* DROPDOWN CHỈ HIỂN THỊ CÁC MỤC GỐC + VỀ CHÚNG MÌNH TRÊN DESKTOP */}
                      {isHandbookMenuOpen && (
                          <div className="fixed sm:absolute top-[105px] sm:top-full right-4 sm:right-0 sm:pt-2 w-64 z-[999] animate-fadeIn">
                              <div className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
                                  <div className="p-2 flex flex-col gap-0.5">
                                      <Link to="/handbook/contacts" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-[#0052cc] rounded-lg transition-colors group">
                                          <div className="bg-[#0052cc]/10 p-1.5 rounded-lg text-[#0052cc] group-hover:bg-[#0052cc] group-hover:text-white transition-colors"><Phone size={16} /></div> Danh bạ & Khoa
                                      </Link>
                                      <Link to="/handbook/clubs" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-[#990000] rounded-lg transition-colors group">
                                          <div className="bg-[#990000]/10 p-1.5 rounded-lg text-[#990000] group-hover:bg-[#990000] group-hover:text-white transition-colors"><Users size={16} /></div> CLB - Đội - Nhóm
                                      </Link>
                                      <Link to="/handbook/scholarships" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-green-600 rounded-lg transition-colors group">
                                          <div className="bg-green-100 p-1.5 rounded-lg text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors"><Award size={16} /></div> Học bổng & Quy chế
                                      </Link>
                                      <div className="h-px bg-gray-100 my-1 mx-2"></div>
                                      <Link to="/handbook/faqs" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600 rounded-lg transition-colors group">
                                          <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><HelpCircle size={16} /></div> Trợ giúp
                                      </Link>
                                      <Link to="/handbook/plagiarism" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-violet-600 rounded-lg transition-colors group">
                                          <div className="bg-violet-100 p-1.5 rounded-lg text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition-colors"><ShieldCheck size={16} /></div> Check đạo văn Turnitin
                                      </Link>
                                      <Link to="/handbook/canva" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-600 rounded-lg transition-colors group">
                                          <div className="bg-sky-100 p-1.5 rounded-lg text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-colors"><Sparkles size={16} /></div> Canva Pro
                                      </Link>
                                      <Link to="/handbook/feedback" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-teal-600 rounded-lg transition-colors group">
                                          <div className="bg-teal-100 p-1.5 rounded-lg text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors"><MessageSquarePlus size={16} /></div> Góp ý
                                      </Link>
                                      <Link to="/handbook/donate" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-pink-600 rounded-lg transition-colors group">
                                          <div className="bg-pink-100 p-1.5 rounded-lg text-pink-600 group-hover:bg-pink-600 group-hover:text-white transition-colors"><Heart size={16} /></div> Ủng hộ & Tri ân
                                      </Link>
                                      
                                      <div className="h-px bg-gray-100 my-1 mx-2"></div>
                                      
                                      {/* LINK ĐẾN TRANG ABOUT TRONG HANDBOOK TRÊN DESKTOP */}
                                      <Link to="/handbook/about" onClick={() => { setIsHandbookMenuOpen(false); playClick(); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-800 rounded-lg transition-colors group">
                                          <div className="bg-gray-200 p-1.5 rounded-lg text-gray-600 group-hover:bg-gray-600 group-hover:text-white transition-colors"><Info size={16} /></div> Về chúng mình
                                      </Link>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
                  <div
                      className="hidden sm:block absolute left-0 bottom-0 h-[2px] bg-[#0052cc] transition-[transform,width,opacity] duration-200 ease-out z-20 rounded-t-full pointer-events-none translate-tab-indicator"
                  />
              </nav>

              {session && !isGuest && !(isAdmin || isAuditor) && (
                  <form
                      ref={profileSearchRef}
                      onSubmit={handleProfileSearch}
                      onMouseEnter={() => {
                          setIsProfileSearchOpen(true);
                          window.setTimeout(() => document.getElementById('profile-mssv-search')?.focus(), 0);
                      }}
                      className="hidden lg:flex items-center justify-end shrink-0 relative"
                  >
                      <div className={`relative flex items-center overflow-hidden rounded-lg border bg-white transition-all duration-200 ${
                          isProfileSearchOpen
                              ? 'w-56 border-blue-200 shadow-sm'
                              : 'w-9 border-gray-200 hover:border-blue-200 hover:bg-blue-50'
                      }`}>
                          <button
                              type="submit"
                              onClick={(event) => {
                                  if (!isProfileSearchOpen || !profileSearchMssv.trim()) {
                                      event.preventDefault();
                                      setIsProfileSearchOpen(true);
                                      window.setTimeout(() => document.getElementById('profile-mssv-search')?.focus(), 0);
                                  }
                              }}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-gray-500 transition-colors hover:text-[#0052cc]"
                              title="Tìm hồ sơ theo MSSV"
                          >
                              <Search size={16} />
                          </button>
                          <input
                              id="profile-mssv-search"
                              type="text"
                              value={profileSearchMssv}
                              onChange={(event) => setProfileSearchMssv(event.target.value)}
                              onFocus={() => setIsProfileSearchOpen(true)}
                              onClick={() => setIsProfileSearchOpen(true)}
                              placeholder="Tìm MSSV..."
                              className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-xs font-semibold text-gray-700 outline-none placeholder:text-gray-400"
                          />
                      </div>
                      {isProfileSearchOpen && profileSearchMssv.trim().length >= 2 && (
                          <div className="absolute right-0 top-[42px] z-50 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                              {isLoadingProfileSuggestions && (
                                  <div className="px-3 py-3 text-xs font-semibold text-gray-500">Đang tìm gợi ý...</div>
                              )}
                              {!isLoadingProfileSuggestions && profileSearchSuggestions.length === 0 && (
                                  <div className="px-3 py-3 text-xs font-semibold text-gray-500">Không có gợi ý gần giống.</div>
                              )}
                              {!isLoadingProfileSuggestions && profileSearchSuggestions.map((profile) => {
                                  const avatar = profile.avatar_url;
                                  const isImage = isAvatarImageUrl(avatar);
                                  const safeColorClass = getAvatarColorClass(avatar, '#003375');
                                  const initial = (profile.full_name || profile.student_code || 'S').trim().charAt(0).toUpperCase();

                                  return (
                                      <button
                                          key={profile.id}
                                          type="button"
                                          onMouseDown={(event) => {
                                              event.preventDefault();
                                              openProfile(profile.student_code);
                                          }}
                                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-blue-50 transition-colors"
                                      >
                                          <div
                                              className={`h-9 w-9 shrink-0 overflow-hidden rounded-full text-white flex items-center justify-center text-sm font-black ${safeColorClass}`}
                                          >
                                              {isImage ? <img src={avatar} alt={profile.full_name || profile.student_code} className="h-full w-full object-cover" /> : initial}
                                          </div>
                                          <div className="min-w-0">
                                              <div className="truncate text-sm font-bold text-gray-900">{profile.full_name || 'Chưa cập nhật tên'}</div>
                                              <div className="truncate text-xs font-semibold text-gray-500">#{profile.student_code}{profile.class_name ? ` • ${profile.class_name}` : ''}</div>
                                          </div>
                                      </button>
                                  );
                              })}
                              <button
                                  type="submit"
                                  className="w-full border-t border-gray-100 px-3 py-2 text-left text-xs font-bold text-[#003375] hover:bg-gray-50"
                              >
                                  Xem tất cả kết quả gần giống "{profileSearchMssv.trim()}"
                              </button>
                          </div>
                      )}
                  </form>
              )}

              {/* DESKTOP RIGHT AVATAR SECTION */}
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
                  
                  {!isGuest && !isSmallViewport && (
                      <NotificationBell currentUserId={session?.user?.id} />
                  )}
                  
                  {session ? (
                      <div className="relative flex items-center border-l border-gray-200 pl-2 lg:pl-3">
                          <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2 focus:outline-none transition-transform active:scale-95" title="Tài khoản HUB">
                              {avatarUrl ? (
                                  isColorAvatar ? (
                                      <span className={`h-7 w-7 lg:h-8 lg:w-8 rounded-full flex items-center justify-center text-white text-xs lg:text-sm font-bold shadow-sm ${safeAvatarColorClass}`}>{avatarSeed}</span>
                                  ) : isImageAvatar ? (
                                      <img src={avatarUrl} alt="Avatar" className="h-7 w-7 lg:h-8 lg:w-8 rounded-full object-cover shadow-sm border border-gray-200" />
                                  ) : (
                                      <span className="h-7 w-7 lg:h-8 lg:w-8 rounded-full bg-[#0052cc] text-white flex items-center justify-center text-xs lg:text-sm font-bold shadow-sm">{avatarSeed}</span>
                                  )
                              ) : (
                                  <span className="h-7 w-7 lg:h-8 lg:w-8 rounded-full bg-[#0052cc] text-white flex items-center justify-center text-xs lg:text-sm font-bold shadow-sm">{avatarSeed}</span>
                              )}
                          </button>
                          
                          {isUserMenuOpen && (
                              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fadeIn">
                              <button type="button" onClick={() => { setIsMobileMenuOpen(false); const myStudentId = session?.user?.email?.split('@')[0]; if (myStudentId) { navigate(`/profile/${myStudentId}`); } setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Hồ sơ cá nhân</button>
                                  <button type="button" onClick={() => { handleRequestReset(); setIsUserMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100">Làm mới dữ liệu</button>
                                  <button type="button" onClick={() => { handleMenuLogout(); setIsMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">Đăng xuất</button>
                              </div>
                          )}
                      </div>
                  ) : (
                      <div className="flex items-center gap-1.5 lg:gap-2 border-l border-gray-200 pl-1.5 lg:pl-3">
                          <button onClick={handleRequestReset} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors" title="Xóa dữ liệu dùng thử">
                              <RotateCcw size={14} className="lg:w-4 lg:h-4" />
                              <span className="text-[10px] lg:text-xs font-bold hidden md:block">Reset</span>
                          </button>
                          <Link to="/login" onClick={playClick} className="flex items-center gap-1 px-2 lg:px-4 py-1.5 bg-[#0052cc] text-white text-[10px] lg:text-sm font-bold rounded-lg hover:bg-[#0040a8] transition-colors shadow-sm whitespace-nowrap">
                              <User size={14} className="lg:w-4 lg:h-4" /> <span className="hidden md:block">Đăng nhập</span>
                          </Link>
                      </div>
                  )}
              </div>
          </div>
      </header>

            <div
          className={
        isMobileBrowser
            ? "desktop-page-scroll w-full overflow-visible overflow-x-hidden relative z-10"
            : "desktop-page-scroll flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar relative z-10"
    }
>
    <main
        className={
            isMobileBrowser
                          ? "desktop-page-main w-full max-w-[1600px] mx-auto px-2 sm:px-6 lg:px-8 pb-0 pt-2 min-h-0 flex flex-col"
                : isEventCandidatesPage
                ? "desktop-page-main w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-4 pt-0 sm:pt-1 min-h-full flex flex-col"
                : "desktop-page-main w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-6 pt-2 sm:pt-3 min-h-full flex flex-col"
        }
    >
        <div className="flex-1">
            {children}
        </div>

        <footer className={`text-center border-t border-gray-200 text-gray-500 bg-[#F8FAFC] ${
            isMobileBrowser
                ? 'mt-6 px-4 pt-5 pb-[calc(120px+env(safe-area-inset-bottom))]'
                : 'py-6 mt-10'
        }`}>
                <p className="text-xs font-medium tracking-wide mb-1 uppercase">Web designed by tqhoangg</p>
                <p className="text-[10px] opacity-80 px-4 mb-3">
                    HUB Planner là dự án độc lập, không trực thuộc/không đại diện Trường. Vui lòng đối chiếu nguồn chính thức.
                </p>
                <div className="text-xs flex items-center justify-center gap-3">
                    <Link to="/terms" className="hover:text-gray-900 transition-colors">Điều khoản sử dụng</Link>
                    <span className="opacity-50">•</span>
                    <Link to="/privacy" className="hover:text-gray-900 transition-colors">Chính sách bảo mật</Link>
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
      {/* KHỐI MENU TRƯỢT DÀNH CHO MOBILE */}
      {/* ======================================================================= */}
      
      {isMobileMenuOpen && (
      <div className="mobile-menu-layer fixed inset-0 z-[100] sm:hidden">
          <button
              type="button"
              aria-label="Đóng menu"
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsMobileMenuOpen(false)}
          />

          <aside className="mobile-menu-panel absolute inset-y-0 left-0 w-[85%] max-w-[320px] bg-white z-[101] flex flex-col shadow-2xl animate-slideInLeft">
          <div className="mobile-browser-drawer-header bg-[#003375] p-5 flex items-center justify-between shrink-0 shadow-md">
              <div className="hub-brand flex flex-col text-white">
                  <span className="hub-brand-title font-extrabold text-lg tracking-tight">HUB PLANNER</span>
                  <span className="hub-brand-subtitle text-xs font-medium opacity-90 mt-0.5">Hỗ trợ sinh viên</span>
              </div>
              <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                  <X size={22} />
              </button>
          </div>

          <div className="mobile-menu-scroll flex-1 min-h-0 overflow-y-scroll py-5 px-4 flex flex-col gap-1 custom-scrollbar bg-white">
              
              {/* Lời chào cá nhân hóa */}
              {!isGuest ? (
                  <div className="px-2 py-1 mb-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm border border-gray-200 shadow-sm overflow-hidden shrink-0">
                          {avatarUrl ? (
                              isColorAvatar ? (
                                  <span className={`h-full w-full flex items-center justify-center text-white ${safeAvatarColorClass}`}>{avatarSeed}</span>
                              ) : isImageAvatar ? (
                                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                              ) : (
                                  <span className="h-full w-full flex items-center justify-center bg-[#0052cc] text-white">{avatarSeed}</span>
                              )
                          ) : (
                              <span className="h-full w-full flex items-center justify-center bg-[#0052cc] text-white">{avatarSeed}</span>
                          )}
                      </div>
                      <div className="min-w-0">
                          <p className="text-[11px] text-gray-500 font-semibold mb-0.5">Xin chào,</p>
                          <p className="text-[14px] font-bold text-[#0052cc] truncate">{displayName}</p>
                      </div>
                  </div>
              ) : (
                  <div className="px-2 py-1 mb-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-sm border border-gray-200 shadow-sm shrink-0 text-gray-400">
                          <User size={20} />
                      </div>
                      <div>
                          <p className="text-[11px] text-gray-500 font-semibold mb-0.5">Xin chào,</p>
                          <p className="text-[14px] font-bold text-gray-700 truncate">Khách</p>
                      </div>
                  </div>
              )}

              {/* TÀI KHOẢN */}
              <div className="text-[11px] font-bold text-gray-400 mb-2 px-2 tracking-wider mt-2">TÀI KHOẢN</div>

              {isGuest ? (
                  <>
                      <Link 
                          to="/login" 
                          onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                          className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                          <User size={20} className="text-gray-500" />
                          <span>Đăng nhập</span>
                      </Link>
                      <button 
                          onClick={() => { setIsMobileMenuOpen(false); playClick(); alert('Chức năng đăng ký CTV đang được phát triển!'); }} 
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                          <UserPlus size={20} className="text-gray-500" />
                          <span>Đăng ký làm CTV</span>
                      </button>
                  </>
              ) : (
                  <>
                      <button 
                          onClick={() => { 
                              const myStudentId = session?.user?.email?.split('@')[0]; 
                              if (myStudentId) { navigate(`/profile/${myStudentId}`); } 
                              setIsMobileMenuOpen(false); 
                              playClick(); 
                          }} 
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                          <User size={20} className="text-gray-500" />
                          <span>Hồ sơ cá nhân</span>
                      </button>
                      <button 
                          onClick={() => { handleRequestReset(); setIsMobileMenuOpen(false); playClick(); }} 
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                          <RefreshCw size={20} className="text-gray-500" />
                          <span>Làm mới dữ liệu</span>
                      </button>
                      <button 
                          onClick={() => { handleMenuLogout(); setIsMobileMenuOpen(false); }} 
                          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-bold text-red-600 hover:bg-red-50 transition-colors"
                      >
                          <LogOut size={20} className="text-red-500" />
                          <span>Đăng xuất</span>
                      </button>
                  </>
              )}

              <div className="h-px bg-gray-100 w-full my-3"></div>

              {/* TÍNH NĂNG CHÍNH */}
              <div className="text-[11px] font-bold text-gray-400 mb-2 px-2 tracking-wider mt-1">TÍNH NĂNG CHÍNH</div>
              
              <NavLink 
                  to="/dashboard" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={({ isActive }) => `flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc] border border-blue-100' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  {({ isActive }) => (
                      <>
                          <LayoutDashboard size={20} className={isActive ? 'text-[#0052cc]' : 'text-gray-500'} /> 
                          <span className={isActive ? 'font-bold' : ''}>Tổng quan</span>
                      </>
                  )}
              </NavLink>
              
              <NavLink 
                  to="/schedule" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={({ isActive }) => `flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc] border border-blue-100' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  {({ isActive }) => (
                      <>
                          <Calendar size={20} className={isActive ? 'text-[#0052cc]' : 'text-gray-500'} /> 
                          <span className={isActive ? 'font-bold' : ''}>Thời khóa biểu</span>
                      </>
                  )}
              </NavLink>
              
              <NavLink 
                  to="/events" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={({ isActive }) => `flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc] border border-blue-100' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  {({ isActive }) => (
                      <>
                          <Zap size={20} className={isActive ? 'text-[#0052cc]' : 'text-gray-500'} /> 
                          <span className={isActive ? 'font-bold' : ''}>Sự kiện ĐRL</span>
                      </>
                  )}
              </NavLink>
              
              <NavLink 
                  to="/lost-found" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={({ isActive }) => `flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${isActive ? 'bg-blue-50 text-[#0052cc] border border-blue-100' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  {({ isActive }) => (
                      <>
                          <Search size={20} className={isActive ? 'text-[#0052cc]' : 'text-gray-500'} /> 
                          <span className={isActive ? 'font-bold' : ''}>Tìm đồ thất lạc</span>
                      </>
                  )}
              </NavLink>

              <div className="h-px bg-gray-100 w-full my-3"></div>
              
              {/* TIỆN ÍCH & HỖ TRỢ MỚI TRÊN MOBILE */}
              <div className="text-[11px] font-bold text-gray-400 mb-2 px-2 tracking-wider mt-1">TIỆN ÍCH & HỔ TRỢ</div>
              
              <div className="flex flex-col">
                  <button 
                      onClick={() => { playClick(); setIsMobileHandbookOpen(!isMobileHandbookOpen); }} 
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${location.pathname.includes('/handbook') && !location.pathname.includes('/handbook/about') ? 'bg-blue-50 text-[#0052cc] border border-blue-100 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                      <div className="flex items-center gap-3.5">
                          <Book size={20} className={location.pathname.includes('/handbook') && !location.pathname.includes('/handbook/about') ? 'text-[#0052cc]' : 'text-gray-500'} /> 
                          <span>Cẩm nang</span>
                      </div>
                      <ChevronDown size={16} className={`transition-transform duration-200 text-gray-500 ${isMobileHandbookOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isMobileHandbookOpen ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                      <div className="flex flex-col gap-1 pl-12 pr-4 pb-2 border-l-2 border-gray-100 ml-[26px]">
                          <Link to="/handbook/contacts" onClick={() => { setIsMobileMenuOpen(false); playClick(); }} className="flex items-center gap-3 py-2 text-[13px] font-medium text-gray-500 hover:text-[#0052cc] transition-colors">
                              <Phone size={14} /> Danh bạ & Khoa
                          </Link>
                          <Link to="/handbook/clubs" onClick={() => { setIsMobileMenuOpen(false); playClick(); }} className="flex items-center gap-3 py-2 text-[13px] font-medium text-gray-500 hover:text-[#990000] transition-colors">
                              <Users size={14} /> CLB - Đội - Nhóm
                          </Link>
                          <Link to="/handbook/scholarships" onClick={() => { setIsMobileMenuOpen(false); playClick(); }} className="flex items-center gap-3 py-2 text-[13px] font-medium text-gray-500 hover:text-green-600 transition-colors">
                              <Award size={14} /> Học bổng & Quy chế
                          </Link>
                          <Link to="/handbook/faqs" onClick={() => { setIsMobileMenuOpen(false); playClick(); }} className="flex items-center gap-3 py-2 text-[13px] font-medium text-gray-500 hover:text-indigo-600 transition-colors">
                              <HelpCircle size={14} /> FAQs
                          </Link>
                          <Link to="/handbook/plagiarism" onClick={() => { setIsMobileMenuOpen(false); playClick(); }} className="flex items-center gap-3 py-2 text-[13px] font-medium text-gray-500 hover:text-violet-600 transition-colors">
                              <ShieldCheck size={14} /> Check đạo văn Turnitin
                          </Link>
                          <Link to="/handbook/canva" onClick={() => { setIsMobileMenuOpen(false); playClick(); }} className="flex items-center gap-3 py-2 text-[13px] font-medium text-gray-500 hover:text-sky-600 transition-colors">
                              <Sparkles size={14} /> Canva Pro
                          </Link>
                          <Link to="/handbook/feedback" onClick={() => { setIsMobileMenuOpen(false); playClick(); }} className="flex items-center gap-3 py-2 text-[13px] font-medium text-gray-500 hover:text-teal-600 transition-colors">
                              <MessageSquarePlus size={14} /> Góp ý
                          </Link>
                          <Link to="/handbook/donate" onClick={() => { setIsMobileMenuOpen(false); playClick(); }} className="flex items-center gap-3 py-2 text-[13px] font-medium text-gray-500 hover:text-pink-600 transition-colors">
                              <Heart size={14} /> Ủng hộ & Tri ân
                          </Link>
                      </div>
                  </div>
              </div>

              <Link 
                  to="/handbook/about" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${location.pathname.includes('/handbook/about') ? 'bg-blue-50 text-[#0052cc] font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  <Info size={20} className={location.pathname.includes('/handbook/about') ? 'text-[#0052cc]' : 'text-gray-500'} />
                  <span>Về chúng mình</span>
              </Link>

              <button 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); setShowGuide(true); }} 
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                  <HelpCircle size={20} className="text-gray-500" />
                  <span>Hướng dẫn sử dụng</span>
              </button>

              <Link 
                  to="/terms" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${location.pathname === '/terms' ? 'bg-blue-50 text-[#0052cc] font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  <FileText size={20} className={location.pathname === '/terms' ? 'text-[#0052cc]' : 'text-gray-500'} />
                  <span>Điều khoản sử dụng</span>
              </Link>

              <Link 
                  to="/privacy" 
                  onClick={() => { setIsMobileMenuOpen(false); playClick(); }} 
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-colors ${location.pathname === '/privacy' ? 'bg-blue-50 text-[#0052cc] font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                  <ShieldCheck size={20} className={location.pathname === '/privacy' ? 'text-[#0052cc]' : 'text-gray-500'} />
                  <span>Chính sách bảo mật</span>
              </Link>
              <div className="mobile-menu-bottom-spacer shrink-0" aria-hidden="true" />
          </div>
          </aside>
      </div>
      )}
    </>
  );
};
