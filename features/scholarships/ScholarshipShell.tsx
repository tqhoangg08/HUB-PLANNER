import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, GraduationCap, ListFilter, Menu, ShieldCheck, X, type LucideIcon } from 'lucide-react';
import { useUserRole } from '../../hooks/useUserRole';
import { useScholarshipMobile } from './useScholarshipMobile';
import './scholarship.css';

interface ScholarshipShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  mobileTitle?: string;
}

export const ScholarshipShell: React.FC<ScholarshipShellProps> = ({ children, title, mobileTitle, subtitle, headerActions }) => {
  const { isAdmin, session } = useUserRole();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobile = useScholarshipMobile();
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const drawerOpen = mobile && menuOpen;
  useEffect(() => { if (!mobile) setMenuOpen(false); }, [mobile]);
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => drawer.current?.querySelector<HTMLButtonElement>('.scholarship-drawer-close')?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(drawer.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') || [])
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      if (window.matchMedia('(max-width:780px)').matches && menuButton.current?.isConnected) menuButton.current.focus();
    };
  }, [drawerOpen]);
  const [collapsed, setCollapsed] = useState(() => {
    try { return sessionStorage.getItem('hub-scholarship-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.setItem('hub-scholarship-sidebar-collapsed', String(collapsed)); }
    catch {}
  }, [collapsed]);
  const avatar = session?.user.user_metadata.avatar_url || session?.user.user_metadata.picture;
  const userName = session?.user.user_metadata.full_name || session?.user.user_metadata.name || session?.user.email || '';
  const navigation: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/scholarships', label: 'Danh sách & Tra cứu', icon: ListFilter },
    { to: '/scholarships/me', label: 'Học bổng của tôi', icon: GraduationCap },
    { to: '/handbook/scholarships', label: 'Quy chế học bổng', icon: BookOpen },
    ...(isAdmin ? [{ to: '/admin/scholarships', label: 'Quản trị học bổng', icon: ShieldCheck }] : []),
  ];
  return (
    <div className={`scholarship-shell${collapsed ? ' sidebar-collapsed' : ''}${drawerOpen ? ' mobile-menu-open' : ''}`}>
      <a className="scholarship-skip" href="#scholarship-content" inert={drawerOpen}>Đến nội dung chính</a>
      <header className="scholarship-topbar" inert={drawerOpen}>
        <div className="scholarship-topbar-brand"><button ref={menuButton} className="scholarship-menu scholarship-icon-button" type="button" aria-label="Mở menu học bổng" aria-expanded={drawerOpen} aria-controls="scholarship-sidebar" onClick={() => setMenuOpen(true)}><Menu size={20} aria-hidden="true" /></button><Link to="/dashboard" className="scholarship-return scholarship-desktop-return">Trở về</Link><Link to="/dashboard" className="scholarship-logo"><img src="/logoapp.png" alt="HUB Planner" /><span>HUB PLANNER</span></Link></div>
        {session ? <Link to="/account" className="scholarship-user" aria-label={`Tài khoản ${userName}`}>{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="scholarship-avatar">{userName.slice(0, 1).toUpperCase()}</span>}</Link>
          : <Link to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} className="scholarship-return">Đăng nhập</Link>}
      </header>
      <button type="button" tabIndex={-1} aria-hidden="true" className="scholarship-drawer-backdrop" onClick={() => setMenuOpen(false)} />
      <div className="scholarship-body">
      <aside ref={drawer} id="scholarship-sidebar" className="scholarship-sidebar" role={mobile ? 'dialog' : undefined} aria-modal={drawerOpen || undefined} aria-label={mobile ? 'Điều hướng học bổng' : undefined} inert={mobile && !menuOpen} onTransitionEnd={event => { if (drawerOpen && event.target === event.currentTarget && event.propertyName === 'transform') drawer.current?.querySelector<HTMLButtonElement>('.scholarship-drawer-close')?.focus(); }}>
        <div className="scholarship-drawer-heading"><span>Học bổng</span><button type="button" className="scholarship-drawer-close scholarship-icon-button" aria-label="Đóng menu học bổng" onClick={() => setMenuOpen(false)}><X size={20} aria-hidden="true" /></button></div>
        <nav id="scholarship-navigation" aria-label="Điều hướng học bổng">
          {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/scholarships'} aria-label={label} title={label} onClick={() => setMenuOpen(false)} className={({ isActive }) => `scholarship-nav-link${isActive ? ' is-active' : ''}`}><Icon size={16} aria-hidden="true" /><span className="scholarship-nav-label">{label}</span></NavLink>)}
        </nav>
        <button type="button" className="scholarship-collapse scholarship-button" aria-expanded={!collapsed} aria-controls="scholarship-navigation" aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'} title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}<span className="scholarship-nav-label">Thu gọn</span></button>
      </aside>
      <main id="scholarship-content" className="scholarship-workspace" tabIndex={-1} inert={drawerOpen}>
        <div className="scholarship-workspace-inner">
          {(title || subtitle) && <header className="scholarship-heading">
            <div className="scholarship-heading-copy">
              {title && <h1>{mobileTitle ? <><span className="scholarship-desktop-text">{title}</span><span className="scholarship-mobile-text">{mobileTitle}</span></> : title}</h1>}
              {subtitle && <p className="scholarship-description">{subtitle}</p>}
            </div>
            {headerActions && <div className="scholarship-heading-actions">{headerActions}</div>}
          </header>}
          {children}
        </div>
      </main>
      </div>
    </div>
  );
};
