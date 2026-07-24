import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCheck, ChevronLeft, ChevronRight, Filter, Loader2, Search, ShieldCheck } from 'lucide-react';
import { useSupportTickets } from '../hooks/useSupportTickets';
import { useTicketMessages } from '../hooks/useTicketMessages';
import { showAlert, showConfirm } from '../utils/appNotifications';
import {
  fetchSupportStaff,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUS_LABELS,
  SupportStaffMember,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  isSupportTicketClosed,
  resolveAllOpenSupportTickets,
  resolveSupportTicket,
  updateSupportTicket,
} from '../utils/supportTicketsApi';
import { TicketDetailView } from './SupportTickets';

const categories = Object.keys(SUPPORT_CATEGORY_LABELS) as SupportTicketCategory[];
const priorities = Object.keys(SUPPORT_PRIORITY_LABELS) as SupportTicketPriority[];
const statuses = Object.keys(SUPPORT_STATUS_LABELS) as SupportTicketStatus[];
const SUPPORT_TICKET_PAGE_SIZE = 10;

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
};

export const AdminSupportTickets: React.FC = () => {
  const { ticketId } = useParams();

  if (ticketId) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-2 py-2">
        <AdminTicketControls ticketId={ticketId} />
        <TicketDetailView ticketId={ticketId} isStaff />
      </div>
    );
  }

  return <AdminTicketList />;
};

const AdminTicketList = () => {
  const [status, setStatus] = useState<SupportTicketStatus | 'all'>('all');
  const [category, setCategory] = useState<SupportTicketCategory | 'all'>('all');
  const [priority, setPriority] = useState<SupportTicketPriority | 'all'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [resolvingAll, setResolvingAll] = useState(false);
  const [page, setPage] = useState(1);
  const { tickets, total, loading, error, reload } = useSupportTickets({
    isStaff: true,
    status,
    category,
    priority,
    search: debouncedSearch,
    page,
    pageSize: SUPPORT_TICKET_PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / SUPPORT_TICKET_PAGE_SIZE));
  const firstVisibleTicket = total === 0 ? 0 : (page - 1) * SUPPORT_TICKET_PAGE_SIZE + 1;
  const lastVisibleTicket = Math.min(page * SUPPORT_TICKET_PAGE_SIZE, total);
  const pageNumbers = Array.from(new Set([1, page - 1, page, page + 1, totalPages]))
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .sort((left, right) => left - right);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleResolveAll = async () => {
    const confirmed = await showConfirm({
      title: 'Đánh dấu đã xử lý tất cả ticket?',
      message: 'Toàn bộ ticket đang ở trạng thái Mới hoặc Đang xử lý sẽ được chuyển sang Đã giải quyết và đóng chat. Người dùng sẽ không thể gửi thêm tin nhắn trong các ticket này.',
      confirmText: 'Đã xử lý tất cả',
      cancelText: 'Hủy',
      variant: 'warning',
    });
    if (!confirmed) return;

    setResolvingAll(true);
    try {
      const result = await resolveAllOpenSupportTickets();
      await reload();
      await showAlert({
        title: 'Đã xử lý tất cả ticket',
        message: result.resolved_count > 0
          ? `Đã đóng ${result.resolved_count} ticket chưa xử lý.`
          : 'Hiện không còn ticket nào cần xử lý.',
        variant: 'success',
      });
    } catch (resolveError: any) {
      await showAlert({
        title: 'Không thể xử lý tất cả ticket',
        message: resolveError?.message || 'Vui lòng thử lại.',
        variant: 'warning',
      });
    } finally {
      setResolvingAll(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-2 py-2 sm:py-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="mb-1 text-2xl font-black leading-tight tracking-normal text-[#003375] sm:text-[28px]">
                    Hỗ trợ Sinh viên
                </h2>
          <p className="mt-1 text-sm text-slate-500">Quản lý ticket hỗ trợ 1-1 giữa user và admin/auditor.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleResolveAll}
            disabled={resolvingAll || loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {resolvingAll ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
            Đã xử lý tất cả
          </button>
          <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-sm font-black text-emerald-700">
            <ShieldCheck size={16} /> Staff mode
          </div>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-100 bg-white p-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#003375] focus:ring-4 focus:ring-blue-50" placeholder="Tìm theo tiêu đề, email, MSSV" />
        </label>
        <SelectFilter value={status} onChange={(value) => { setPage(1); setStatus(value as SupportTicketStatus | 'all'); }} items={statuses} labels={SUPPORT_STATUS_LABELS} allLabel="Tất cả trạng thái" />
        <SelectFilter value={category} onChange={(value) => { setPage(1); setCategory(value as SupportTicketCategory | 'all'); }} items={categories} labels={SUPPORT_CATEGORY_LABELS} allLabel="Tất cả loại vấn đề" />
        <SelectFilter value={priority} onChange={(value) => { setPage(1); setPriority(value as SupportTicketPriority | 'all'); }} items={priorities} labels={SUPPORT_PRIORITY_LABELS} allLabel="Tất cả ưu tiên" />
      </div>

      {loading ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-white" />)}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">Không có ticket phù hợp bộ lọc.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          <div>
            <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1fr] gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-slate-500 md:grid">
              <span>Ticket</span>
              <span>User</span>
              <span>Trạng thái</span>
              <span>Ưu tiên</span>
              <span>Cập nhật</span>
            </div>
            {tickets.map((ticket) => (
              <Link key={ticket.id} to={`/admin/support/${ticket.id}`} className="grid gap-2 border-b border-slate-100 px-3 py-3 transition hover:bg-blue-50/40 md:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1fr] md:items-center">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-slate-950">{ticket.subject}</h2>
                  <p className="mt-1 text-[11px] font-bold text-slate-500">{SUPPORT_CATEGORY_LABELS[ticket.category]}</p>
                </div>
                <div className="min-w-0 text-xs font-bold text-slate-600">
                  <p className="truncate">{ticket.user?.full_name || ticket.user?.email || 'User'}</p>
                  <p className="truncate text-slate-400">{ticket.user?.student_code || ticket.user?.email || ticket.user_id}</p>
                </div>
                <span className="w-fit rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">{SUPPORT_STATUS_LABELS[ticket.status]}</span>
                <span className="text-xs font-black text-slate-600">{SUPPORT_PRIORITY_LABELS[ticket.priority]}</span>
                <span className="text-xs font-bold text-slate-500">{formatDateTime(ticket.last_message_at || ticket.updated_at)}</span>
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-bold text-slate-500">
              Hiển thị {firstVisibleTicket}-{lastVisibleTicket} trong {total} ticket
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1 || loading}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:text-[#003375] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Trang trước"
              >
                <ChevronLeft size={16} />
              </button>
              {pageNumbers.map((pageNumber, index) => {
                const previousPageNumber = pageNumbers[index - 1];
                return (
                  <React.Fragment key={pageNumber}>
                    {previousPageNumber && pageNumber - previousPageNumber > 1 && (
                      <span className="px-1 text-xs font-black text-slate-400">…</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPage(pageNumber)}
                      disabled={loading}
                      className={`h-8 min-w-8 rounded-lg px-2 text-xs font-black transition ${
                        pageNumber === page
                          ? 'bg-[#003375] text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-[#003375]'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  </React.Fragment>
                );
              })}
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages || loading}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:text-[#003375] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Trang sau"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const SelectFilter = ({ value, onChange, items, labels, allLabel }: {
  value: string;
  onChange: (value: string) => void;
  items: string[];
  labels: Record<string, string>;
  allLabel: string;
}) => (
  <label className="relative">
    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold outline-none focus:border-[#003375] focus:ring-4 focus:ring-blue-50">
      <option value="all">{allLabel}</option>
      {items.map((item) => <option key={item} value={item}>{labels[item]}</option>)}
    </select>
  </label>
);

const AdminTicketControls = ({ ticketId }: { ticketId: string }) => {
  const { ticket, reload } = useTicketMessages(ticketId);
  const [staff, setStaff] = useState<SupportStaffMember[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSupportStaff().then(setStaff).catch(() => setStaff([]));
  }, []);

  const updateField = async (updates: Parameters<typeof updateSupportTicket>[1]) => {
    setSaving(true);
    try {
      await updateSupportTicket(ticketId, updates);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const markResolved = async () => {
    const ok = window.confirm('Bạn chắc chắn muốn đánh dấu yêu cầu này là đã xử lý xong? Sau khi đóng, bạn sẽ không thể gửi thêm tin nhắn hoặc tệp đính kèm.');
    if (!ok) return;
    setSaving(true);
    try {
      await resolveSupportTicket(ticketId);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  if (!ticket) return null;

  return (
    <section className="rounded-xl border border-slate-100 bg-white px-3 py-2">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1.4fr_auto]">
        <label className="grid gap-1">
          <span className="text-[11px] font-black uppercase text-slate-500">Trạng thái</span>
          <select disabled={saving} value={ticket.status} onChange={(event) => updateField({ status: event.target.value as SupportTicketStatus })} className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-bold">
            {statuses.map((item) => <option key={item} value={item}>{SUPPORT_STATUS_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-black uppercase text-slate-500">Ưu tiên</span>
          <select disabled={saving} value={ticket.priority} onChange={(event) => updateField({ priority: event.target.value as SupportTicketPriority })} className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-bold">
            {priorities.map((item) => <option key={item} value={item}>{SUPPORT_PRIORITY_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-black uppercase text-slate-500">Gán ticket</span>
          <select disabled={saving} value={ticket.assigned_to || ''} onChange={(event) => updateField({ assigned_to: event.target.value || null })} className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-bold">
            <option value="">Chưa gán</option>
            {staff.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email || member.id} ({member.role})</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={saving || isSupportTicketClosed(ticket.status)}
          onClick={markResolved}
          className="h-9 self-end rounded-lg bg-emerald-600 px-3 text-xs font-black text-white transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500"
        >
          Đánh dấu đã xử lý xong
        </button>
      </div>
    </section>
  );
};
