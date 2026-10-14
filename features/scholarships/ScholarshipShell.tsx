import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowLeft, Award, BookOpen, ChevronLeft, ChevronRight, GraduationCap, ListFilter, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useUserRole } from '../../hooks/useUserRole';
import './scholarship.css';

interface ScholarshipShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
}

export const ScholarshipShell: React.FC<ScholarshipShellProps> = ({ children, title, subtitle, headerActions }) => {
  const { isAdmin, session } = useUserRole();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const avatar = session?.user.user_metadata.avatar_url || session?.user.user_metadata.picture;
  const userName = session?.user.user_metadata.full_name || session?.user.user_metadata.name || session?.user.email || '';
  const navigation: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/scholarships', label: 'Danh sách & Tra cứu', icon: ListFilter },
    { to: '/scholarships/me', label: 'Học bổng của tôi', icon: GraduationCap },
    { to: '/scholarships/celebrate', label: 'Vinh danh cá nhân', icon: Award },
    { to: '/handbook/scholarships', label: 'Quy chế học bổng', icon: BookOpen },
    ...(isAdmin ? [{ to: '/admin/scholarships', label: 'Quản trị học bổng', icon: ShieldCheck }] : []),
  ];
  return (
    <div className={`scholarship-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <a className="scholarship-skip" href="#scholarship-content">Đến nội dung chính</a>
      <header className="scholarship-topbar">
        <div className="scholarship-topbar-brand"><Link to="/dashboard" className="scholarship-return">Trở về</Link><Link to="/dashboard" className="scholarship-logo"><img src="/logoapp.png" alt="HUB Planner" /><span>HUB PLANNER</span></Link></div>
        {session ? <Link to="/account" className="scholarship-user" aria-label={`Tài khoản ${userName}`}>{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="scholarship-avatar">{userName.slice(0, 1).toUpperCase()}</span>}</Link>
          : <Link to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} className="scholarship-return">Đăng nhập</Link>}
      </header>
      <div className="scholarship-body">
      <aside className="scholarship-sidebar">
        <button className="scholarship-menu scholarship-button" type="button" aria-expanded={menuOpen} aria-controls="scholarship-navigation" onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
        <nav id="scholarship-navigation" aria-label="Điều hướng học bổng" className={menuOpen ? 'is-open' : ''}>
          {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/scholarships'} aria-label={label} title={label} onClick={() => setMenuOpen(false)} className={({ isActive }) => `scholarship-nav-link${isActive ? ' is-active' : ''}`}><Icon size={16} aria-hidden="true" /><span className="scholarship-nav-label">{label}</span></NavLink>)}
          <Link to="/dashboard" className="scholarship-back" aria-label="Quay lại HUB Planner" title="Quay lại HUB Planner" onClick={() => setMenuOpen(false)}><ArrowLeft size={16} aria-hidden="true" /><span className="scholarship-nav-label">Quay lại HUB Planner</span></Link>
        </nav>
        <button type="button" className="scholarship-collapse scholarship-button" aria-expanded={!collapsed} aria-controls="scholarship-navigation" aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'} title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}<span className="scholarship-nav-label">Thu gọn</span></button>
      </aside>
      <main id="scholarship-content" className="scholarship-workspace" tabIndex={-1}>
        <div className="scholarship-workspace-inner">
          {(title || subtitle) && <header className="scholarship-heading">
            <div className="scholarship-heading-copy">
              {title && <h1>{title}</h1>}
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
