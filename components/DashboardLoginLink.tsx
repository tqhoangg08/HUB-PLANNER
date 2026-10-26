import React from 'react';
import { Link } from 'react-router-dom';
import { playClick } from '../utils/audio';

export function DashboardLoginLink() {
  return <Link to="/login" data-dashboard-login-link className="dashboard-login-link ui-meta" onClick={event => { event.stopPropagation(); playClick(); }}>
    <span>Cần đăng nhập</span>
  </Link>;
}
