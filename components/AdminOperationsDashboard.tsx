import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, CalendarDays, ClipboardCheck, LifeBuoy, Loader2, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { fetchAdminEventCandidates, fetchAdminActivity, fetchAdminReports } from '../utils/adminLegacyDataApi';
import { fetchAdminSupportTickets } from '../utils/adminSupportApi';
import { fetchCloudflareHealth, type CloudflareHealthResult } from '../utils/cloudflareAdminApi';
import { fetchAdminStudentSummary, type AdminStudentSummary } from '../utils/adminStudentsApi';
import { fetchSchoolAnnouncements } from '../utils/announcementsApi';
import { fetchAdminEvents } from '../utils/eventsApi';
import type { SupportTicket } from '../utils/supportTicketsApi';

type StaffRole = 'admin' | 'auditor';
type EventRow = { id: string | number; title?: string; organizer?: string; event_date?: string | null; created_at?: string | null; view_count?: number };
type CandidateRow = { id: string | number; source_name?: string; created_at?: string | null };
type ReportRow = { id: string | number; status?: string; created_at?: string | null; event_name?: string | null; type?: string | null };
type ActivityRow = { id: string | number; action_label?: string | null; action?: string | null; user_email?: string | null; target_table?: string | null; created_at?: string | null };
type NoticeRow = { id: string | number; title: string; date?: string | null; link?: string | null; is_new?: boolean };

export type OperationsSnapshot = {
  eventTotal: number | null;
  openEvents: number | null;
  closedEvents: number | null;
  recentEvents: EventRow[];
  pendingCandidates: CandidateRow[] | null;
  eventReports: ReportRow[] | null;
  feedbackReports: ReportRow[] | null;
  openTickets: { total: number; rows: SupportTicket[] } | null;
  pendingTickets: { total: number; rows: SupportTicket[] } | null;
  notices: NoticeRow[] | null;
  activity: ActivityRow[] | null;
  health: CloudflareHealthResult | null;
  students: AdminStudentSummary | null;
};

const emptySnapshot = (): OperationsSnapshot => ({
  eventTotal: null, openEvents: null, closedEvents: null, recentEvents: [], pendingCandidates: null,
  eventReports: null, feedbackReports: null, openTickets: null, pendingTickets: null,
  notices: null, activity: null, health: null, students: null,
});

const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('vi-VN').format(value);
const boundedCount = (rows: unknown[] | null, limit: number) => rows === null ? '—' : rows.length >= limit ? `${limit}+` : number(rows.length);
const dateLabel = (value?: string | null) => {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa cập nhật' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};
const safeOfficialUrl = (value?: string | null) => {
  try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};
const isReportClosed = (status?: string) => ['ok', 'resolved', 'contacted', 'approved', 'rejected'].includes(String(status || '').toLowerCase());
const shell = 'min-w-0 rounded-lg border border-gray-300 bg-white';
const linkStyle = 'inline-flex items-center gap-1 rounded-sm text-xs font-bold text-[#0052cc] hover:text-[#003375] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0052cc]';

const eventQuery = async (extra: Record<string, string>, limit: number) => {
  const params = new URLSearchParams({ state: 'published', sort: 'newest', limit: String(limit), ...extra });
  const response = await fetchAdminEvents(params);
  if (!response?.ok) throw new Error('event-unavailable');
  const payload = await response.json() as { data?: EventRow[]; total?: number };
  if (!Array.isArray(payload.data) || !Number.isFinite(payload.total)) throw new Error('event-invalid');
  return { rows: payload.data, total: Number(payload.total) };
};

const loadSnapshot = async (role: StaffRole): Promise<OperationsSnapshot> => {
  const snapshot = emptySnapshot();
  const tasks: Array<Promise<void>> = [];
  const collect = (task: Promise<void>) => { tasks.push(task.catch(() => undefined)); };
  collect(eventQuery({}, 10).then((value) => { snapshot.eventTotal = value.total; snapshot.recentEvents = value.rows; }));
  collect(eventQuery({ group: 'open' }, 1).then((value) => { snapshot.openEvents = value.total; }));
  collect(eventQuery({ group: 'closed' }, 1).then((value) => { snapshot.closedEvents = value.total; }));
  collect(fetchAdminEventCandidates('pending').then((value) => {
    if (!Array.isArray(value.candidates)) throw new Error('candidate-invalid');
    snapshot.pendingCandidates = value.candidates as CandidateRow[];
  }));
  for (const [kind, key] of [['event_reports', 'eventReports'], ['feedback', 'feedbackReports']] as const) {
    collect(fetchAdminReports(kind, 0, 20).then((value) => {
      if (!Array.isArray(value.data)) throw new Error('report-invalid');
      snapshot[key] = value.data as ReportRow[];
    }));
  }
  for (const [status, key] of [['open', 'openTickets'], ['pending', 'pendingTickets']] as const) {
    collect(fetchAdminSupportTickets({ status, pageSize: 5 }).then((value) => {
      if (!Array.isArray(value.data) || !Number.isFinite(value.total)) throw new Error('ticket-invalid');
      snapshot[key] = { total: value.total, rows: value.data };
    }));
  }
  collect(fetchSchoolAnnouncements('/events?resource=announcements&limit=5').then(async (response) => {
    if (!response.ok) throw new Error('notice-unavailable');
    const value = await response.json() as { data?: NoticeRow[] };
    if (!Array.isArray(value.data)) throw new Error('notice-invalid');
    snapshot.notices = value.data;
  }));
  if (role === 'admin') {
    collect(fetchAdminActivity(0, 8).then((value) => {
      if (!Array.isArray(value.data)) throw new Error('activity-invalid');
      snapshot.activity = value.data as ActivityRow[];
    }));
    collect(fetchCloudflareHealth().then((value) => { snapshot.health = value; }));
    collect(fetchAdminStudentSummary().then((value) => {
      if (!value.success) throw new Error('student-summary-invalid');
      snapshot.students = value;
    }));
  }
  await Promise.all(tasks);
  return snapshot;
};

const Section = ({ title, description, to, action, children, className = '' }: { title: string; description?: string; to?: string; action?: string; children: ReactNode; className?: string }) => (
  <section className={`${shell} ${className}`} aria-label={title}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-300 px-4 py-4 sm:px-5">
      <div><h2 className="text-base font-extrabold text-[#003375]">{title}</h2>{description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}</div>
      {to && <Link to={to} className={linkStyle}>{action || 'Xem tất cả'}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
    </header>
    <div className="px-4 py-4 sm:px-5">{children}</div>
  </section>
);
const Empty = ({ text = 'Chưa có dữ liệu cần hiển thị.' }: { text?: string }) => <p className="py-3 text-sm text-gray-500">{text}</p>;
const Metric = ({ label, value }: { label: string; value: number | null }) => (
  <div className="min-w-0 rounded-md border border-gray-300 p-3"><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 text-lg font-black text-[#003375]">{number(value)}</dd></div>
);

export const OperationsDashboardView = ({ role, snapshot, loading, onRefresh }: { role: StaffRole; snapshot: OperationsSnapshot; loading: boolean; onRefresh: () => void }) => {
  const admin = role === 'admin';
  const reportDataReady = snapshot.eventReports !== null && snapshot.feedbackReports !== null;
  const reports = [
    ...(snapshot.eventReports || []).map((row) => ({ ...row, kind: 'event' })),
    ...(snapshot.feedbackReports || []).map((row) => ({ ...row, kind: 'feedback' })),
  ].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const unresolved = reports.filter((item) => !isReportClosed(item.status));
  const resolved = reports.filter((item) => isReportClosed(item.status));
  const pendingItems = [
    ...(snapshot.pendingCandidates || []).slice(0, 3).map((item) => ({ key: `event-${item.id}`, title: item.source_name ? `Bài đăng từ ${item.source_name}` : `Sự kiện #${item.id}`, kind: 'Sự kiện chờ duyệt', date: item.created_at, status: 'Chờ duyệt', to: `/admin/event-candidates?id=${encodeURIComponent(String(item.id))}` })),
    ...unresolved.slice(0, 3).map((item) => ({ key: `report-${item.kind}-${item.id}`, title: item.event_name || (item.type ? `Phản hồi: ${item.type}` : 'Báo cáo mới'), kind: 'Báo cáo', date: item.created_at, status: item.status || 'Chưa xử lý', to: '/admin-reports' })),
    ...(snapshot.openTickets?.rows || []).slice(0, 3).map((item) => ({ key: `ticket-${item.id}`, title: item.subject, kind: 'Ticket hỗ trợ', date: item.last_message_at || item.created_at, status: 'Mới', to: `/admin/support/${encodeURIComponent(item.id)}` })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 7);
  const noticeCount = snapshot.notices === null ? null : snapshot.notices.filter((item) => item.is_new === true).length;
  const kpis = admin ? [
    { label: 'Hồ sơ sinh viên', value: number(snapshot.students?.total ?? null), icon: Users },
    { label: 'Sự kiện chưa đóng', value: number(snapshot.openEvents), icon: CalendarDays },
    { label: 'Sự kiện chờ duyệt', value: boundedCount(snapshot.pendingCandidates, 200), icon: ClipboardCheck },
    { label: 'Báo cáo cần xem', value: number(reportDataReady ? unresolved.length : null), icon: ShieldCheck },
    { label: 'Ticket mới', value: number(snapshot.openTickets?.total ?? null), icon: LifeBuoy },
    { label: 'Thông báo mới', value: number(noticeCount), icon: Bell },
  ] : [
    { label: 'Sự kiện chưa đóng', value: number(snapshot.openEvents), icon: CalendarDays },
    { label: 'Sự kiện chờ duyệt', value: boundedCount(snapshot.pendingCandidates, 200), icon: ClipboardCheck },
    { label: 'Báo cáo cần xem', value: number(reportDataReady ? unresolved.length : null), icon: ShieldCheck },
    { label: 'Ticket mới', value: number(snapshot.openTickets?.total ?? null), icon: LifeBuoy },
    { label: 'Thông báo mới', value: number(noticeCount), icon: Bell },
  ];
  const upcoming = snapshot.recentEvents.filter((event) => event.event_date && Date.parse(event.event_date) >= Date.now()).length;
  const viewed = [...snapshot.recentEvents].filter((event) => Number.isFinite(event.view_count)).sort((a, b) => Number(b.view_count) - Number(a.view_count))[0];
  const auditorActivity = pendingItems.slice(0, 5);
  const resources = snapshot.health?.snapshot.resources || {};
  const healthRows = [
    ['events', 'Sự kiện'], ['course_schedules', 'Môn học & lịch học'], ['school_announcements', 'Thông báo trường'],
  ] as const;
  const quickActions = [
    { to: '/admin/event-candidates', label: 'Duyệt sự kiện' },
    { to: '/events', label: 'Quản lý sự kiện' },
    { to: '/admin-reports', label: 'Xem báo cáo' },
    { to: '/admin/support', label: 'Xử lý ticket' },
    ...(admin ? [{ to: '/admin/students', label: 'Quản lý sinh viên' }, { to: '/admin/data', label: 'Trung tâm dữ liệu' }] : []),
  ];

  return <main className="w-full min-w-0 space-y-6 pb-8 text-slate-800 sm:space-y-7" aria-labelledby="operations-title">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-300 pb-5">
      <div><h1 id="operations-title" className="text-[26px] font-black tracking-tight text-[#003375] sm:text-[28px]">{admin ? 'Tổng quan vận hành' : 'Tổng quan kiểm duyệt'}</h1><p className="mt-1 text-sm text-gray-600">{admin ? 'Theo dõi hoạt động và các đầu việc cần xử lý tại HUB Planner.' : 'Theo dõi kiểm duyệt, báo cáo, sự kiện và hỗ trợ cần rà soát.'}</p></div>
      <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc] disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />Làm mới</button>
    </header>

    <section aria-label="Chỉ số vận hành" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {kpis.map(({ label, value, icon: Icon }) => <div key={label} className={`${shell} flex min-h-24 items-center gap-3 p-4`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[#0052cc]"><Icon size={19} aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold leading-snug text-gray-600">{label}</p><strong className="mt-1 block text-2xl font-black leading-none text-[#003375]" aria-label={`${label}: ${loading ? 'Đang tải' : value}`}>{loading ? '…' : value}</strong></div></div>)}
    </section>
    <p className="-mt-3 text-xs text-gray-500">Báo cáo: 20 mục gần nhất mỗi loại. Thông báo mới: trong 5 mục gần nhất.</p>

    <Section title="Công việc cần xử lý" description="Ưu tiên từ hàng đợi sự kiện, báo cáo và hỗ trợ." to="/admin/event-candidates" action="Mở hàng đợi">
      {loading ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" />Đang tải công việc…</p> : pendingItems.length ? <ul className="divide-y divide-gray-200">{pendingItems.map((item) => <li key={item.key} className="grid min-w-0 gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800" title={item.title}>{item.title}</p><p className="mt-1 text-xs text-gray-500">{item.kind} · {dateLabel(item.date)} · {item.status}</p></div><Link to={item.to} className={linkStyle}>Xem chi tiết<ArrowUpRight size={14} aria-hidden="true" /></Link></li>)}</ul> : <Empty text={snapshot.pendingCandidates === null && !reportDataReady && snapshot.openTickets === null ? 'Chưa tải được hàng đợi. Hãy thử làm mới.' : 'Hiện không có mục cần xử lý trong dữ liệu vừa tải.'} />}
    </Section>

    <nav aria-label="Thao tác nhanh" className={`${shell} flex flex-wrap items-center gap-2 p-4`}>
      <h2 className="mr-2 text-sm font-extrabold text-[#003375]">Thao tác nhanh</h2>
      {quickActions.map((item) => <Link key={item.label} to={item.to} className="inline-flex min-h-10 items-center rounded-md border border-gray-300 bg-white px-3 text-xs font-bold text-[#003375] hover:border-[#0052cc] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc]">{item.label}<ArrowUpRight size={14} className="ml-1" aria-hidden="true" /></Link>)}
    </nav>

    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <Section title="Sự kiện gần đây" description="Các sự kiện mới tạo và chỉ số trong 10 mục mới nhất." to="/events" action="Quản lý sự kiện">
        <dl className="grid grid-cols-2 gap-2 border-b border-gray-300 pb-4 sm:grid-cols-4">
          <div><dt className="text-xs text-gray-500">Sự kiện công khai</dt><dd className="mt-1 text-lg font-black text-[#003375]">{number(snapshot.eventTotal)}</dd></div>
          <div><dt className="text-xs text-gray-500">Chưa đóng</dt><dd className="mt-1 text-lg font-black text-[#003375]">{number(snapshot.openEvents)}</dd></div>
          <div><dt className="text-xs text-gray-500">Đã đóng</dt><dd className="mt-1 text-lg font-black text-[#003375]">{number(snapshot.closedEvents)}</dd></div>
          <div><dt className="text-xs text-gray-500">Sắp diễn ra*</dt><dd className="mt-1 text-lg font-black text-[#003375]">{snapshot.eventTotal === null ? '—' : number(upcoming)}</dd></div>
        </dl>
        <p className="mt-2 text-[11px] text-gray-500">*Trong 10 sự kiện mới nhất; “chưa đóng” không đồng nghĩa đang mở đăng ký.</p>
        {snapshot.recentEvents.length ? <ul className="divide-y divide-gray-200">{snapshot.recentEvents.slice(0, 5).map((event) => <li key={event.id} className="flex min-w-0 items-center justify-between gap-3 py-2.5"><div className="min-w-0"><Link to={`/events/${encodeURIComponent(String(event.id))}`} className="block truncate text-sm font-semibold text-[#003375] hover:underline" title={event.title || ''}>{event.title || `Sự kiện #${event.id}`}</Link><p className="text-xs text-gray-500">{event.organizer || 'Chưa cập nhật'} · {dateLabel(event.created_at || event.event_date)}</p></div><ArrowUpRight size={15} className="shrink-0 text-gray-400" aria-hidden="true" /></li>)}</ul> : <Empty text={snapshot.eventTotal === null ? 'Chưa tải được dữ liệu sự kiện.' : 'Chưa có sự kiện.'} />}
        {viewed && <p className="mt-2 border-t border-gray-300 pt-3 text-xs text-gray-600">Quan tâm cao trong danh sách gần đây: <span className="font-semibold">{viewed.title || `#${viewed.id}`}</span> · {number(Number(viewed.view_count))} lượt xem</p>}
        <Link to="/admin/event-candidates" className={`${linkStyle} mt-3`}>Duyệt sự kiện<ArrowUpRight size={14} aria-hidden="true" /></Link>
      </Section>

      <Section title="Kiểm duyệt & an toàn" description="Báo cáo trong 20 mục mới nhất mỗi loại." to="/admin-reports" action="Xem báo cáo">
        <dl className="grid grid-cols-2 gap-2 border-b border-gray-300 pb-4 sm:grid-cols-4">
          <div><dt className="text-xs text-gray-500">Cần xem</dt><dd className="mt-1 text-lg font-black text-[#003375]">{reportDataReady ? number(unresolved.length) : '—'}</dd></div>
          <div><dt className="text-xs text-gray-500">Đã xử lý</dt><dd className="mt-1 text-lg font-black text-[#003375]">{reportDataReady ? number(resolved.length) : '—'}</dd></div>
          <div><dt className="text-xs text-gray-500">Sự kiện chờ duyệt</dt><dd className="mt-1 text-lg font-black text-[#003375]">{boundedCount(snapshot.pendingCandidates, 200)}</dd></div>
          <div><dt className="text-xs text-gray-500">Nội dung gắn cờ</dt><dd className="mt-1 text-lg font-black text-[#003375]">—</dd></div>
        </dl>
        <p className="mt-2 text-[11px] text-gray-500">Chưa có nguồn tổng hợp riêng cho nội dung gắn cờ.</p>
        {unresolved.length ? <ul className="divide-y divide-gray-200">{unresolved.slice(0, 3).map((item) => <li key={`${item.kind}-${item.id}`} className="py-2.5"><p className="truncate text-sm font-semibold text-slate-800">{item.event_name || (item.type ? `Phản hồi: ${item.type}` : 'Báo cáo cần xem')}</p><p className="mt-0.5 text-xs text-gray-500">{dateLabel(item.created_at)} · {item.status || 'Chưa xử lý'}</p></li>)}</ul> : <Empty text={reportDataReady ? 'Không có báo cáo cần xem trong mẫu gần đây.' : 'Chưa tải được dữ liệu kiểm duyệt.'} />}
      </Section>
    </div>

    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <Section title="Hỗ trợ" description="Ticket theo trạng thái thật; chưa có thước đo quá hạn." to="/admin/support" action="Xử lý ticket">
        <dl className="grid grid-cols-2 gap-3"><Metric label="Mới" value={snapshot.openTickets?.total ?? null} /><Metric label="Đang xử lý" value={snapshot.pendingTickets?.total ?? null} /></dl>
        {(snapshot.openTickets?.rows.length || 0) > 0 ? <ul className="mt-3 divide-y divide-gray-200">{snapshot.openTickets!.rows.slice(0, 3).map((ticket) => <li key={ticket.id} className="flex min-w-0 items-center justify-between gap-2 py-2"><span className="min-w-0 truncate text-sm font-semibold">{ticket.subject}</span><Link to={`/admin/support/${encodeURIComponent(ticket.id)}`} className={linkStyle}>Mở<ArrowUpRight size={14} aria-hidden="true" /></Link></li>)}</ul> : <Empty text={snapshot.openTickets === null ? 'Chưa tải được ticket.' : 'Không có ticket mới.'} />}
      </Section>

      <Section title="Hoạt động hệ thống gần đây" description={admin ? 'Nhật ký thao tác quản trị gần nhất.' : 'Các thay đổi mới trong hàng đợi kiểm duyệt.'} to={admin ? '/admin/activity' : '/admin/event-candidates'} action="Xem thêm">
        {admin ? snapshot.activity?.length ? <ol className="divide-y divide-gray-200">{snapshot.activity.slice(0, 8).map((item) => <li key={item.id} className="py-2.5"><p className="text-sm font-semibold text-slate-800">{item.action_label || item.action || 'Thao tác quản trị'}</p><p className="mt-0.5 text-xs text-gray-500">{item.user_email || 'Người thực hiện chưa cập nhật'} · {item.target_table || 'Đối tượng chưa cập nhật'} · {dateLabel(item.created_at)}</p></li>)}</ol> : <Empty text={snapshot.activity === null ? 'Chưa tải được nhật ký hoạt động.' : 'Chưa có hoạt động gần đây.'} /> : auditorActivity.length ? <ol className="divide-y divide-gray-200">{auditorActivity.map((item) => <li key={item.key} className="py-2.5"><p className="truncate text-sm font-semibold text-slate-800">{item.title}</p><p className="mt-0.5 text-xs text-gray-500">{item.kind} · {dateLabel(item.date)} · {item.status}</p></li>)}</ol> : <Empty text="Chưa có hoạt động kiểm duyệt trong dữ liệu vừa tải." />}
      </Section>
    </div>

    {admin && <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <Section title="Sinh viên" description="Hồ sơ có mã sinh viên; hoàn tất theo các trường bắt buộc." to="/admin/students" action="Quản lý sinh viên">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Tổng hồ sơ" value={snapshot.students?.total ?? null} /><Metric label="Đã kích hoạt" value={snapshot.students?.onboarded ?? null} /><Metric label="Chưa hoàn tất" value={snapshot.students?.pending ?? null} /><Metric label="Mới 7 ngày" value={snapshot.students?.new_last_7_days ?? null} /></dl>
        {snapshot.students?.recent.length ? <ul className="mt-3 divide-y divide-gray-200">{snapshot.students.recent.map((student) => <li key={student.student_code} className="flex justify-between gap-2 py-2 text-sm"><span className="min-w-0 truncate font-semibold">{student.full_name || student.student_code}</span><span className="shrink-0 text-xs text-gray-500">{dateLabel(student.created_at)}</span></li>)}</ul> : <Empty text={snapshot.students === null ? 'Chưa tải được thống kê sinh viên.' : 'Chưa có hồ sơ sinh viên.'} />}
      </Section>
      <Section title="Dữ liệu & đồng bộ" description="Trạng thái nguồn dữ liệu theo thời điểm đồng bộ." to="/admin/data" action="Trung tâm dữ liệu">
        {snapshot.health ? <ul className="divide-y divide-gray-200">{healthRows.map(([key, label]) => {
          const resource = resources[key];
          const status = resource ? 'Có dữ liệu' : 'Chưa cập nhật';
          return <li key={key} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><span className="font-semibold">{label}</span><span className="text-xs text-gray-600">{status} · {dateLabel(resource?.synced_at)}</span></li>;
        })}</ul> : <Empty text="Chưa tải được trạng thái đồng bộ." />}
      </Section>
    </div>}

    <Section title="Thông báo trường" description="5 thông báo chính thức gần nhất.">
      {snapshot.notices?.length ? <ul className="divide-y divide-gray-200">{snapshot.notices.slice(0, 5).map((notice) => { const href = safeOfficialUrl(notice.link); return <li key={notice.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800" title={notice.title}>{notice.title}</p><p className="text-xs text-gray-500">{dateLabel(notice.date)}</p></div>{href && <a href={href} target="_blank" rel="noopener noreferrer" className={linkStyle}>Xem nguồn<ArrowUpRight size={14} aria-hidden="true" /></a>}</li>; })}</ul> : <Empty text={snapshot.notices === null ? 'Chưa tải được thông báo trường.' : 'Chưa có thông báo mới.'} />}
    </Section>
  </main>;
};

export const AdminOperationsDashboard = ({ isAdmin, isAuditor }: { isAdmin: boolean; isAuditor: boolean }) => {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const role: StaffRole = isAdmin ? 'admin' : 'auditor';
  useEffect(() => {
    if (!isAdmin && !isAuditor) return;
    let live = true;
    setLoading(true);
    void loadSnapshot(role).then((value) => { if (live) setSnapshot(value); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [role, isAdmin, isAuditor, refreshKey]);
  if (!isAdmin && !isAuditor) return null;
  return <OperationsDashboardView role={role} snapshot={snapshot} loading={loading} onRefresh={() => setRefreshKey((value) => value + 1)} />;
};
