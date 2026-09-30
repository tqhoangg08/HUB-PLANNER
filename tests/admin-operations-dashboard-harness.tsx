import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { OperationsDashboardView, type OperationsSnapshot } from '../components/AdminOperationsDashboard';
import type { SupportTicket } from '../utils/supportTicketsApi';

const params = new URLSearchParams(location.search);
const empty = params.has('empty');
const ticket = { id: '123', subject: 'Không mở được lịch học', status: 'open', last_message_at: '2026-09-23T08:00:00Z', created_at: '2026-09-23T08:00:00Z' } as SupportTicket;
const snapshot: OperationsSnapshot = empty ? {
  eventTotal: null, openEvents: null, closedEvents: null, recentEvents: [], pendingCandidates: null,
  eventReports: null, feedbackReports: null, openTickets: null, pendingTickets: null, notices: null, activity: null, health: null, students: null,
} : {
  eventTotal: 38, openEvents: 12, closedEvents: 8,
  recentEvents: [{ id: 378, title: 'Ngày hội học thuật HUB', organizer: 'Đoàn trường', event_date: '2026-09-30', view_count: 856 }],
  pendingCandidates: [{ id: 7, source_name: 'Hội thảo học tập', created_at: '2026-09-23T08:00:00Z' }],
  eventReports: [{ id: 12, event_name: 'Ngày hội học thuật HUB', status: 'pending', created_at: '2026-09-23T07:00:00Z' }],
  feedbackReports: [], openTickets: { total: 4, rows: [ticket] }, pendingTickets: { total: 2, rows: [] },
  notices: [{ id: 3, title: 'Thông báo tuyển sinh', date: '2026-09-23', link: 'https://hub.edu.vn/notice', is_new: true }],
  activity: [{ id: 9, action_label: 'Đã duyệt sự kiện', user_email: 'admin@example.test', created_at: '2026-09-23T08:00:00Z' }],
  health: { snapshot: { ok: true, resources: { events: { resource: 'events', source_row_count: 38, visible_row_count: 36, source_max_created_at: null, synced_at: '2026-09-23T08:00:00Z' } } }, checkedAt: Date.now(), fromCache: false, stale: false },
  students: { success: true, total: 120, onboarded: 94, pending: 26, new_last_7_days: 3, recent: [{ student_code: '123456', full_name: 'Nguyễn Văn A', class_name: 'A1', created_at: '2026-09-22T00:00:00Z' }] },
};

createRoot(document.getElementById('root')!).render(<BrowserRouter><OperationsDashboardView role={params.get('role') === 'auditor' ? 'auditor' : 'admin'} snapshot={snapshot} loading={false} onRefresh={() => {}} /></BrowserRouter>);
