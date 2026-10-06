export type StaffSidebarRole = 'admin' | 'auditor';
export type StaffNavIcon = 'users' | 'calendar' | 'file' | 'star' | 'sparkles' | 'megaphone' | 'search' | 'shield' | 'clipboard' | 'support' | 'database' | 'brain' | 'clock';

export type StaffNavItem =
  | { kind: 'caption'; label: string }
  | { kind: 'link'; label: string; to: string; icon: StaffNavIcon; badge?: 'candidates' | 'reports' };

export interface StaffNavGroup {
  id: string;
  label: string;
  icon: StaffNavIcon;
  items: StaffNavItem[];
}

const schedule: StaffNavItem = { kind: 'link', label: 'Thời khóa biểu', to: '/schedule', icon: 'calendar' };
const content: StaffNavItem[] = [
  { kind: 'link', label: 'Sự kiện ĐRL', to: '/events', icon: 'star' },
  { kind: 'link', label: 'Duyệt sự kiện', to: '/admin/event-candidates', icon: 'sparkles', badge: 'candidates' },
  { kind: 'link', label: 'Thông báo trường', to: '/dashboard#announcements', icon: 'megaphone' },
  { kind: 'link', label: 'Đồ thất lạc', to: '/lost-found', icon: 'search' },
];
const reports: StaffNavItem = { kind: 'link', label: 'Báo cáo & vi phạm', to: '/admin-reports', icon: 'clipboard', badge: 'reports' };
const support: StaffNavItem = { kind: 'link', label: 'Ticket hỗ trợ', to: '/admin/support', icon: 'support' };

// Admin keeps its existing groups and nested captions. Auditor has its own IA.
export const adminNavGroups: StaffNavGroup[] = [
  { id: 'management', label: 'QUẢN LÝ', icon: 'users', items: [
    { kind: 'link', label: 'Sinh viên', to: '/admin/students', icon: 'users' },
    { kind: 'caption', label: 'HỌC TẬP' },
    schedule,
  ] },
  { id: 'content', label: 'NỘI DUNG & SỰ KIỆN', icon: 'file', items: content },
  { id: 'operations', label: 'VẬN HÀNH', icon: 'shield', items: [
    { kind: 'caption', label: 'KIỂM DUYỆT' }, reports,
    { kind: 'caption', label: 'HỖ TRỢ' }, support,
  ] },
  { id: 'data', label: 'DỮ LIỆU', icon: 'database', items: [
    { kind: 'link', label: 'Trung tâm dữ liệu', to: '/admin/data', icon: 'database' },
    { kind: 'link', label: 'Tri thức AI', to: '/admin/ai-documents', icon: 'brain' },
  ] },
  { id: 'system', label: 'HỆ THỐNG', icon: 'shield', items: [
    { kind: 'link', label: 'Tài khoản nội bộ', to: '/admin/internal-accounts', icon: 'users' },
    { kind: 'link', label: 'Nhật ký hoạt động', to: '/admin/activity', icon: 'clock' },
  ] },
];

export const auditorNavGroups: StaffNavGroup[] = [
  { id: 'study', label: 'HỌC TẬP', icon: 'calendar', items: [schedule] },
  { id: 'content', label: 'NỘI DUNG & SỰ KIỆN', icon: 'file', items: content },
  { id: 'moderation', label: 'KIỂM DUYỆT', icon: 'shield', items: [reports] },
  { id: 'support', label: 'HỖ TRỢ', icon: 'support', items: [support] },
];

export const staffGroupForPath = (pathname: string, role: StaffSidebarRole): string | null => {
  const groups = role === 'admin' ? adminNavGroups : auditorNavGroups;
  return groups.find(group => group.items.some(item => item.kind === 'link' &&
    (pathname === item.to || (item.to !== '/dashboard#announcements' && pathname.startsWith(`${item.to}/`)))))?.id ?? null;
};
