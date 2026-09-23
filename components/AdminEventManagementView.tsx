import React, { useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3, Eye, FileText, Loader2,
  Pencil, Plus, RefreshCw, RotateCcw, Search, ToggleLeft, ToggleRight, Trash2, Users,
} from 'lucide-react';
import { SEMESTER_OPTIONS } from '../utils/academicCalendar';
import {
  EVENT_SORT_OPTIONS, EVENT_STATUS_OPTIONS, getPresetDateRange,
  type EventFilters,
} from '../utils/eventFilters';
import {
  filterAdminEvents, getAdminEventSemester, getAdminEventStats, getAdminEventStatus,
  paginateAdminEvents, type AdminEventTab, type AdminManagementEvent,
} from '../utils/adminEventManagement';

interface Props<T extends AdminManagementEvent> {
  events: T[];
  filters: EventFilters;
  onFiltersChange: (filters: EventFilters) => void;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  onAdd: () => void;
  onRefresh: () => void;
  onPreview: () => void;
  onGuide: () => void;
  onView: (event: T) => void;
  onEdit: (event: T) => void;
  onToggleClose: (event: T) => void;
  onDelete: (id: string) => void;
}

const control = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#0052cc] focus:ring-2 focus:ring-blue-100';
const secondary = 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0052cc]';
const action = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition hover:border-slate-200 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc]';
const dateLabel = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const STATUS_STYLE = {
  pending: { label: 'Chờ duyệt', className: 'bg-amber-50 text-amber-700' },
  open: { label: 'Đang mở đăng ký', className: 'bg-emerald-50 text-emerald-700' },
  upcoming: { label: 'Sắp mở đăng ký', className: 'bg-blue-50 text-blue-700' },
  ongoing: { label: 'Đang diễn ra', className: 'bg-emerald-50 text-emerald-700' },
  closed: { label: 'Đã đóng', className: 'bg-slate-100 text-slate-600' },
  ended: { label: 'Đã kết thúc', className: 'bg-slate-100 text-slate-600' },
} as const;

export const AdminEventManagementView = <T extends AdminManagementEvent>({
  events, filters, onFiltersChange, loading, error, isAdmin, onAdd, onRefresh, onPreview,
  onGuide, onView, onEdit, onToggleClose, onDelete,
}: Props<T>) => {
  const [tab, setTab] = useState<AdminEventTab>('all');
  const [semester, setSemester] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const now = new Date();
  const stats = useMemo(() => getAdminEventStats(events, now), [events]);
  const filtered = useMemo(() => filterAdminEvents(events, filters, tab, semester, now), [events, filters, tab, semester]);
  const pagination = paginateAdminEvents(filtered, page, pageSize);
  const semesters = useMemo(() => SEMESTER_OPTIONS.filter((option) => events.some((event) => getAdminEventSemester(event.event_date) === option.value)), [events]);
  const eventTypes = useMemo(() => [...new Set(events.map((event) => event.type.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [events]);
  const regions = useMemo(() => [...new Set(events.map((event) => event.scope.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [events]);
  const updateFilters = (next: EventFilters) => { onFiltersChange(next); setPage(1); };
  const selectTab = (next: AdminEventTab) => { setTab(next); setPage(1); };
  const selectDatePreset = (preset: EventFilters['datePreset']) => {
    updateFilters({ ...filters, datePreset: preset, ...(preset === 'all' || preset === 'thisMonth' || preset === 'nextMonth' ? getPresetDateRange(preset) : {}) });
  };
  const visiblePages = Array.from({ length: Math.min(5, pagination.pageCount) }, (_, index) =>
    Math.min(Math.max(1, pagination.page - 2), Math.max(1, pagination.pageCount - 4)) + index);

  return <section className="w-full min-w-0 space-y-5 animate-fadeIn" aria-labelledby="admin-events-title">
    <header className="border-b border-slate-200 pb-4">
      <h1 id="admin-events-title" className="text-[26px] font-black tracking-tight text-[#003375] sm:text-[28px]">Quản lý sự kiện</h1>
      <p className="mt-1 text-sm text-slate-500">Quản lý, cập nhật và theo dõi các sự kiện điểm rèn luyện.</p>
    </header>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Thống kê sự kiện">
      {([
        { label: 'Tổng sự kiện', value: stats.total, icon: CalendarDays, color: 'bg-blue-50 text-[#0052cc]' },
        { label: 'Đang mở đăng ký', value: stats.open, icon: Users, color: 'bg-emerald-50 text-emerald-700' },
        { label: 'Sắp diễn ra', value: stats.upcoming, icon: Clock3, color: 'bg-amber-50 text-amber-700' },
        { label: 'Đã đóng', value: stats.closed, icon: ToggleLeft, color: 'bg-slate-100 text-slate-600' },
      ]).map(({ label, value, icon: Icon, color }) => <div key={label} className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon size={22}/></span><span><span className="block text-xs font-semibold text-slate-500">{label}</span><strong className="mt-1 block text-2xl font-black text-[#003375]">{loading ? '—' : value}</strong></span></div>)}
    </div>

    <nav className="flex min-w-0 gap-5 overflow-x-auto border-b border-slate-200" aria-label="Trạng thái quản lý sự kiện">
      {([['all', 'Tất cả sự kiện'], ['open', 'Đang mở đăng ký'], ['upcoming', 'Sắp diễn ra'], ['closed', 'Đã đóng']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-current={tab === value ? 'page' : undefined} onClick={() => selectTab(value)} className={`shrink-0 border-b-[3px] px-1 pb-3 pt-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc] ${tab === value ? 'border-[#0052cc] text-[#0052cc]' : 'border-transparent text-slate-500 hover:text-[#003375]'}`}>{label}</button>)}
    </nav>

    <section aria-label="Bộ lọc sự kiện" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <label className="grid gap-1.5 2xl:col-span-2"><span className="text-xs font-bold text-slate-700">Tìm kiếm</span><span className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={filters.keyword} onChange={(event) => updateFilters({ ...filters, keyword: event.target.value })} placeholder="Tên sự kiện, BTC, loại hình..." className={`${control} pl-9`}/></span></label>
        <label className="grid gap-1.5"><span className="text-xs font-bold text-slate-700">Học kỳ (theo ngày diễn ra)</span><select value={semester} onChange={(event) => { setSemester(event.target.value); setPage(1); }} className={control}><option value="all">Tất cả học kỳ</option>{semesters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="grid gap-1.5"><span className="text-xs font-bold text-slate-700">Loại hình</span><select value={filters.eventType} onChange={(event) => updateFilters({ ...filters, eventType: event.target.value })} className={control}><option value="all">Tất cả loại hình</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="grid gap-1.5"><span className="text-xs font-bold text-slate-700">Mục ĐRL</span><select value={filters.trainingCategories.length === 1 ? filters.trainingCategories[0] : 'all'} onChange={(event) => updateFilters({ ...filters, trainingCategories: event.target.value === 'all' ? [] : [event.target.value] })} className={control}><option value="all">Tất cả mục</option>{['I','II','III','IV','V'].map((value) => <option key={value} value={value}>Mục {value}</option>)}</select></label>
        <label className="grid gap-1.5"><span className="text-xs font-bold text-slate-700">Trạng thái</span><select value={filters.registrationStatus} onChange={(event) => updateFilters({ ...filters, registrationStatus: event.target.value as EventFilters['registrationStatus'] })} className={control}>{EVENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="grid gap-1.5"><span className="text-xs font-bold text-slate-700">Khu vực</span><select value={filters.region} onChange={(event) => updateFilters({ ...filters, region: event.target.value })} className={control}><option value="all">Tất cả khu vực</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}</select></label>
        <label className="grid gap-1.5"><span className="text-xs font-bold text-slate-700">Sắp xếp</span><select value={filters.sortBy} onChange={(event) => updateFilters({ ...filters, sortBy: event.target.value as EventFilters['sortBy'] })} className={control}>{EVENT_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <fieldset className="grid gap-1.5 md:col-span-2 xl:col-span-1 2xl:col-span-2"><legend className="text-xs font-bold text-slate-700">Khoảng thời gian</legend><div className="flex gap-2"><input type="date" aria-label="Từ ngày" value={filters.dateFrom} onChange={(event) => updateFilters({ ...filters, datePreset: 'custom', dateFrom: event.target.value })} className={`${control} min-w-0 px-2 text-xs`}/><input type="date" aria-label="Đến ngày" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => updateFilters({ ...filters, datePreset: 'custom', dateTo: event.target.value })} className={`${control} min-w-0 px-2 text-xs`}/></div></fieldset>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-slate-500">Thời gian nhanh:</span>{([['all','Tất cả'],['thisMonth','Tháng này'],['nextMonth','Tháng tới']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => selectDatePreset(value)} className={`rounded-md border px-2.5 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc] ${filters.datePreset === value ? 'border-blue-200 bg-blue-50 text-[#0052cc]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div>
    </section>

    <div className="flex flex-wrap items-center gap-2" aria-label="Thao tác quản lý sự kiện">
      <button type="button" onClick={onAdd} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0052cc] px-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#003d99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0052cc]"><Plus size={17}/>Thêm sự kiện</button>
      <button type="button" onClick={onRefresh} disabled={loading} className={secondary}><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Làm mới</button>
      <button type="button" onClick={onGuide} className={secondary}><FileText size={16}/>Hướng dẫn ĐRL</button>
      <button type="button" onClick={onPreview} className={secondary}><RotateCcw size={16}/>Xem giao diện sinh viên</button>
    </div>

    <section aria-label="Danh sách sự kiện" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="max-w-full overflow-x-auto" tabIndex={0} aria-label="Cuộn ngang bảng sự kiện">
        <table className="w-full min-w-[1150px] border-collapse text-left text-[13px]"><thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-600"><tr>{['Mã','Tên sự kiện','Đơn vị tổ chức','Thời gian','Loại hình','ĐRL','Trạng thái','Hoạt động gần nhất','Thao tác'].map((column, index) => <th key={column} scope="col" className={`whitespace-nowrap border-b border-slate-200 px-3 py-3 ${index < 8 ? 'border-r border-slate-200/80' : 'sticky right-0 z-10 bg-slate-50 text-center'}`}>{column}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-200/80">
            {loading ? <tr><td colSpan={9} className="py-14 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin text-[#0052cc]"/>Đang tải danh sách sự kiện…</td></tr> : error ? <tr><td colSpan={9} role="alert" className="py-14 text-center text-red-700">{error}</td></tr> : !pagination.items.length ? <tr><td colSpan={9} className="py-14 text-center text-slate-500"><CalendarDays className="mx-auto mb-2 text-slate-300"/>Không có sự kiện phù hợp.</td></tr> : pagination.items.map((event) => {
              const status = STATUS_STYLE[getAdminEventStatus(event, now)];
              return <tr key={event.id} className="group transition hover:bg-blue-50/35">
                <td className="border-r border-slate-200/80 px-3 py-3 font-bold text-[#0052cc]">#{event.id}</td>
                <td className="max-w-[290px] border-r border-slate-200/80 px-3 py-3"><button type="button" onClick={() => onView(event)} title={event.name} className="line-clamp-2 text-left font-bold text-[#003375] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc]">{event.name}</button>{event.scope && <p className="mt-1 text-[11px] text-slate-500">{event.scope}</p>}</td>
                <td className="max-w-[170px] border-r border-slate-200/80 px-3 py-3 text-slate-700"><span className="line-clamp-2">{event.organizer || '—'}</span></td>
                <td className="whitespace-nowrap border-r border-slate-200/80 px-3 py-3 text-slate-600"><span className="block text-[10px] font-bold uppercase text-slate-400">Diễn ra</span><span className="font-semibold text-[#003375]">{dateLabel(event.event_date)}{event.event_time ? ` · ${event.event_time.slice(0,5)}` : ''}</span><span className="mt-1 block text-[11px]">Đăng ký: {dateLabel(event.registration_start_date)} → {event.close_on_full ? 'Đóng khi đủ SL' : dateLabel(event.deadlineDate?.toISOString() || null)}</span></td>
                <td className="border-r border-slate-200/80 px-3 py-3 text-slate-600">{event.type || '—'}</td>
                <td className="border-r border-slate-200/80 px-3 py-3"><span className="inline-flex rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-[#0052cc]">{event.score.startsWith('+') || event.score.startsWith('-') ? event.score : `+${event.score}`}</span><span className="mt-1 block text-[11px] text-slate-500">Mục {event.category}</span></td>
                <td className="border-r border-slate-200/80 px-3 py-3"><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-bold ${status.className}`}>{status.label}</span></td>
                <td className="whitespace-nowrap border-r border-slate-200/80 px-3 py-3 text-slate-600"><span className="text-[11px]">Tạo: {dateLabel(event.created_at)}</span></td>
                <td className="sticky right-0 z-[1] bg-white px-2 py-2.5 group-hover:bg-blue-50/35"><div className="flex justify-center gap-0.5"><button type="button" onClick={() => onView(event)} title="Xem sự kiện" aria-label={`Xem sự kiện #${event.id}`} className={`${action} text-slate-500`}><Eye size={15}/></button><button type="button" onClick={() => onEdit(event)} title="Sửa sự kiện" aria-label={`Sửa sự kiện #${event.id}`} className={`${action} text-[#0052cc]`}><Pencil size={15}/></button><button type="button" onClick={() => onToggleClose(event)} title={event.is_manually_closed ? 'Mở lại đăng ký' : 'Tạm đóng đăng ký'} aria-label={`${event.is_manually_closed ? 'Mở lại đăng ký' : 'Tạm đóng đăng ký'} sự kiện #${event.id}`} className={`${action} text-amber-700`}>{event.is_manually_closed ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}</button>{isAdmin && <button type="button" onClick={() => onDelete(event.id)} title="Ẩn/Xóa sự kiện" aria-label={`Ẩn/Xóa sự kiện #${event.id}`} className={`${action} text-red-600`}><Trash2 size={15}/></button>}</div></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-slate-500">Hiển thị {filtered.length ? pagination.start + 1 : 0}–{pagination.end} của {filtered.length} sự kiện</span><div className="flex flex-wrap items-center gap-2"><select aria-label="Số sự kiện mỗi trang" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"><option value={10}>10 / trang</option><option value={20}>20 / trang</option><option value={50}>50 / trang</option></select><button type="button" onClick={() => setPage(pagination.page - 1)} disabled={pagination.page <= 1} aria-label="Trang trước" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 disabled:opacity-40"><ChevronLeft size={16}/></button>{visiblePages.map((number) => <button key={number} type="button" onClick={() => setPage(number)} aria-label={`Trang ${number}`} aria-current={pagination.page === number ? 'page' : undefined} className={`h-8 min-w-8 rounded-md border px-2 text-xs font-bold ${pagination.page === number ? 'border-[#0052cc] bg-[#0052cc] text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}>{number}</button>)}<button type="button" onClick={() => setPage(pagination.page + 1)} disabled={pagination.page >= pagination.pageCount} aria-label="Trang sau" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 disabled:opacity-40"><ChevronRight size={16}/></button></div></footer>
    </section>
  </section>;
};
