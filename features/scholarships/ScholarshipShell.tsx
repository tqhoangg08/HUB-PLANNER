import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useUserRole } from '../../hooks/useUserRole';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/dm-sans/latin-ext-400.css';
import '@fontsource/dm-sans/latin-ext-700.css';
import './scholarship.css';

interface ScholarshipShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  headerActions?: React.ReactNode;
}

export const ScholarshipShell: React.FC<ScholarshipShellProps> = ({ children, title, subtitle, eyebrow, headerActions }) => {
  const { isAdmin } = useUserRole();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = [
    ['/scholarships', 'Danh sách & Tra cứu'],
    ['/scholarships/me', 'Học bổng của tôi'],
    ['/scholarships/celebrate', 'Vinh danh cá nhân'],
    ['/handbook/scholarships', 'Quy chế học bổng'],
    ...(isAdmin ? [['/admin/scholarships', 'Quản trị học bổng']] : []),
  ];
  return (
    <div className="scholarship-shell">
      <a className="scholarship-skip" href="#scholarship-content">Đến nội dung chính</a>
      <aside className="scholarship-sidebar">
        <div className="scholarship-brand">
          <div><p className="scholarship-eyebrow">HUB PLANNER</p><Link to="/scholarships" className="scholarship-brand-name">Học bổng</Link></div>
          <button className="scholarship-menu scholarship-button" type="button" aria-expanded={menuOpen} aria-controls="scholarship-navigation" onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
        </div>
        <nav id="scholarship-navigation" aria-label="Điều hướng học bổng" className={menuOpen ? 'is-open' : ''}>
          {navigation.map(([to, label]) => <NavLink key={to} to={to} end={to === '/scholarships'} onClick={() => setMenuOpen(false)} className={({ isActive }) => `scholarship-nav-link${isActive ? ' is-active' : ''}`}>{label}</NavLink>)}
          <Link to="/dashboard" className="scholarship-back" onClick={() => setMenuOpen(false)}>Quay lại HUB Planner</Link>
        </nav>
      </aside>
      <main id="scholarship-content" className="scholarship-workspace" tabIndex={-1}>
        <div className="scholarship-workspace-inner">
          {(title || subtitle) && <header className="scholarship-heading">
            {eyebrow && <p className="scholarship-eyebrow">{eyebrow}</p>}
            {title && <h1>{title}</h1>}
            {subtitle && <p className="scholarship-description">{subtitle}</p>}
            {headerActions}
          </header>}
          {children}
        </div>
      </main>
    </div>
  );
};
