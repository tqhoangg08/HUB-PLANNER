import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Filter, HelpCircle, Image as ImageIcon, Loader2, MessageSquarePlus, MoreVertical, Paperclip, Plus, Send, Slash, StickyNote, Trash2, X } from 'lucide-react';
import { playClick } from '../utils/audio';
import { fetchStaffPublicProfileMap } from '../utils/staffProfilesApi';
import { useSupportTickets } from '../hooks/useSupportTickets';
import { useTicketMessages } from '../hooks/useTicketMessages';
import {
  createSupportTicket,
  deleteSupportTicketHard,
  isSupportTicketClosed,
  resolveSupportTicket,
  sendTicketMessage,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUS_LABELS,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../utils/supportTicketsApi';
import {
  createPendingSupportAttachments,
  createSupportDownloadUrl,
  formatAttachmentSize,
  linkSupportMessageAttachments,
  PendingSupportAttachment,
  uploadSupportAttachments,
} from '../utils/supportAttachmentsApi';
import { consumeSupportTicketDraft } from '../utils/supportTicketDraft';

const categories = Object.keys(SUPPORT_CATEGORY_LABELS) as SupportTicketCategory[];
const priorities = Object.keys(SUPPORT_PRIORITY_LABELS) as SupportTicketPriority[];
const statuses = Object.keys(SUPPORT_STATUS_LABELS) as SupportTicketStatus[];

const userIssueSuggestions: Array<{
  label: string;
  subject: string;
  category: SupportTicketCategory;
  message: string;
}> = [
  {
    label: 'Không nhập được bảng điểm',
    subject: 'Không nhập được bảng điểm',
    category: 'grades',
    message: 'Em không nhập được bảng điểm từ file PDF. Hệ thống báo lỗi khi tải lên, nhờ admin kiểm tra giúp em.',
  },
  {
    label: 'Mất dữ liệu bảng điểm',
    subject: 'Mất dữ liệu bảng điểm',
    category: 'grades',
    message: 'Em bị mất dữ liệu bảng điểm hoặc lộ trình sau khi đăng nhập lại. Nhờ admin hỗ trợ khôi phục hoặc kiểm tra giúp em.',
  },
  {
    label: 'Không thấy sự kiện',
    subject: 'Không thấy sự kiện ĐRL',
    category: 'events',
    message: 'Em không thấy sự kiện ĐRL mới hoặc thông tin sự kiện chưa cập nhật. Nhờ admin kiểm tra giúp em.',
  },
  {
    label: 'Lỗi thời khóa biểu',
    subject: 'Thời khóa biểu bị sai hoặc không hiển thị',
    category: 'schedule',
    message: 'Em không xem được thời khóa biểu hoặc lịch học hiển thị chưa đúng. Nhờ admin kiểm tra giúp em.',
  },
  {
    label: 'Lỗi tìm đồ thất lạc',
    subject: 'Lỗi tính năng tìm đồ thất lạc',
    category: 'lost_found',
    message: 'Em gặp lỗi khi dùng tính năng tìm đồ thất lạc. Nhờ admin hỗ trợ kiểm tra giúp em.',
  },
];

const staffQuickReplies = [
  'Xin chào, mình là admin hỗ trợ HUB Planner. Để có thể khắc phục lỗi nhanh nhất có thể, bạn có thể mô tả rõ hơn lỗi đang gặp không?',
  'Để tụi mình nhận diện được lỗi nha hơn, nhờ bạn gửi giúp mình ảnh hệ thống lỗi nhé.',
  'Mình đã ghi nhận vấn đề và sẽ kiểm tra lại thông tin giúp bạn. Bạn vui lòng chờ mình trong vài phút nhé, tụi mình sẽ sớm quay lại, cảm ơn bạn.',
  'Cảm ơn bạn đã yêu cầu hỗ trợ, nếu còn vấn đề nào khác phiền bạn tạo ticket mới giúp mình nhé ạ, cảm ơn bạn.',
  'Vấn đề bạn nhắc tới không liên quan đến chủ đề ticket hiện tại, phiền bạn đóng phiếu (nếu đã xử lý xong) và tạo lại phiếu mới giúp mình nhé, cảm ơn bạn.',
  'Vấn đề này đã được xử lý, nhờ bạn kiểm tra lại hệ thống giúp mình nhé ạ.',
];

const appendText = (current: string, next: string) => {
  const clean = current.trim();
  return clean ? `${clean}\n${next}` : next;
};

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

const statusClass: Record<SupportTicketStatus, string> = {
  open: 'border-blue-100 bg-blue-50 text-blue-700',
  pending: 'border-amber-100 bg-amber-50 text-amber-700',
  resolved: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  closed: 'border-slate-200 bg-slate-100 text-slate-600',
};

const AttachmentItem = ({ item, compact = false }: {
  item: { id: string; file_name: string; mime_type: string; size_bytes: number };
  compact?: boolean;
}) => {
  const isImage = item.mime_type.startsWith('image/');

  const openAttachment = async (attachmentId: string) => {
    try {
      const result = await createSupportDownloadUrl(attachmentId);
      window.open(result.download_url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(err?.message || 'Không thể mở file đính kèm.');
    }
  };

  return (
    <button
      type="button"
      onClick={() => openAttachment(item.id)}
      className={`flex max-w-full items-center gap-2 rounded-lg border border-white/20 bg-white/15 px-2 py-1.5 text-left transition hover:bg-white/25 ${compact ? 'text-[11px]' : 'text-xs'}`}
    >
      {isImage ? (
        <ImageIcon size={15} className="shrink-0" />
      ) : (
        <FileText size={15} className="shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate font-bold">{item.file_name}</span>
      <span className="shrink-0 opacity-75">{formatAttachmentSize(item.size_bytes)}</span>
    </button>
  );
};

const AttachmentList = ({ attachments, compact = false }: {
  attachments?: Array<{ id: string; file_name: string; mime_type: string; size_bytes: number }>;
  compact?: boolean;
}) => {
  if (!attachments?.length) return null;
  return (
    <div className={`mt-2 grid gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      {attachments.map((item) => <AttachmentItem key={item.id} item={item} compact={compact} />)}
    </div>
  );
};

const PendingAttachmentPreview = ({ files, onRemove }: {
  files: PendingSupportAttachment[];
  onRemove: (id: string) => void;
}) => {
  if (!files.length) return null;
  return (
    <div className="mx-auto mb-2 flex max-w-4xl gap-2 overflow-x-auto pb-1">
      {files.map((item) => (
        <div key={item.id} className="relative flex min-w-[170px] max-w-[220px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm">
          {item.previewUrl ? (
            <img src={item.previewUrl} alt="" className="h-9 w-9 rounded-md object-cover" />
          ) : (
            <div className="grid h-9 w-9 place-items-center rounded-md bg-red-50 text-red-600">
              <FileText size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-black text-slate-700">{item.name}</p>
            <p className="text-[11px] font-bold text-slate-400">{item.progress > 0 ? `${item.progress}%` : formatAttachmentSize(item.size)}</p>
          </div>
          <button type="button" onClick={() => onRemove(item.id)} className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

const EmptyState = ({ title, body }: { title: string; body: string }) => (
  <div className="grid min-h-[180px] place-items-center rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center">
    <div>
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#003375]">
        <HelpCircle size={22} />
      </div>
      <h3 className="text-sm font-black text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-500">{body}</p>
    </div>
  </div>
);

export const SupportTickets: React.FC = () => {
  const { ticketId } = useParams();
  const isCreateRoute = location.pathname.endsWith('/new');
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | 'all'>('all');
  const { tickets, loading, error } = useSupportTickets({ status: statusFilter });

  if (isCreateRoute) return <CreateTicketView />;
  if (ticketId) return <TicketDetailView ticketId={ticketId} />;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 py-2 sm:py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-[#0052cc]">Hỗ trợ</p>
          <h1 className="text-2xl font-black tracking-normal text-slate-950">Ticket của tôi</h1>
          <p className="mt-1 text-sm text-slate-500">Trao đổi 1-1 với đội ngũ hỗ trợ.</p>
        </div>
        <Link
          to="/support/new"
          onClick={playClick}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#003375] px-4 text-sm font-black text-white transition hover:bg-[#002855] active:scale-95"
        >
          <Plus size={17} /> Tạo ticket mới
        </Link>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-100 bg-white p-1.5">
        <Filter size={15} className="ml-1 shrink-0 text-slate-400" />
        <button onClick={() => setStatusFilter('all')} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black ${statusFilter === 'all' ? 'bg-[#003375] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          Tất cả
        </button>
        {statuses.map((status) => (
          <button key={status} onClick={() => setStatusFilter(status)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black ${statusFilter === status ? 'bg-[#003375] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            {SUPPORT_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-white" />)}
        </div>
      ) : error ? (
        <EmptyState title="Không thể tải ticket" body={error} />
      ) : tickets.length === 0 ? (
        <EmptyState title="Bạn chưa có ticket nào" body="Khi cần hỗ trợ trực tiếp, hãy tạo một yêu cầu mới." />
      ) : (
        <div className="grid gap-2">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              to={`/support/${ticket.id}`}
              onClick={playClick}
              className="group rounded-xl border border-slate-100 bg-white p-3 transition hover:border-blue-100 hover:bg-blue-50/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-slate-950 group-hover:text-[#003375]">{ticket.subject}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-500">
                    <span>{SUPPORT_CATEGORY_LABELS[ticket.category]}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span>{SUPPORT_PRIORITY_LABELS[ticket.priority]}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span>{formatDateTime(ticket.last_message_at || ticket.updated_at)}</span>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black ${statusClass[ticket.status]}`}>
                  {SUPPORT_STATUS_LABELS[ticket.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
};

const CreateTicketView = () => {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('login');
  const [priority, setPriority] = useState<SupportTicketPriority>('normal');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const draft = consumeSupportTicketDraft();
    if (!draft) return;
    setSubject(draft.subject);
    setCategory(draft.category);
    setPriority(draft.priority || 'normal');
    setMessage(draft.message);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await createSupportTicket({ subject, category, priority, message });
      playClick();
      navigate(`/support/${ticket.id}`);
    } catch (err: any) {
      setError(err?.message || 'Không thể gửi yêu cầu hỗ trợ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col py-2 sm:py-3">
      <button onClick={() => navigate('/support')} className="mb-3 inline-flex items-center gap-2 text-sm font-black text-slate-600 hover:text-[#003375]">
        <ArrowLeft size={17} /> Ticket của tôi
      </button>
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-100 bg-white p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-[11px] font-black uppercase tracking-wide text-[#0052cc]">Hỗ trợ</p>
          <h1 className="text-2xl font-black text-slate-950">Tạo yêu cầu hỗ trợ</h1>
        </div>

        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-2.5">
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-[#003375]">Gợi ý nhanh</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {userIssueSuggestions.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setSubject(item.subject);
                  setCategory(item.category);
                  setMessage(item.message);
                }}
                className="shrink-0 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-black text-[#003375] transition hover:bg-blue-100 active:scale-95"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-black text-slate-700">Tiêu đề</span>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-[#003375] focus:ring-4 focus:ring-blue-50" placeholder="Tóm tắt vấn đề bạn đang gặp" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-slate-700">Loại vấn đề</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as SupportTicketCategory)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#003375] focus:ring-4 focus:ring-blue-50">
                {categories.map((item) => <option key={item} value={item}>{SUPPORT_CATEGORY_LABELS[item]}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-slate-700">Mức ưu tiên</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as SupportTicketPriority)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#003375] focus:ring-4 focus:ring-blue-50">
                {priorities.map((item) => <option key={item} value={item}>{SUPPORT_PRIORITY_LABELS[item]}</option>)}
              </select>
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-black text-slate-700">Mô tả vấn đề</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} rows={5} className="resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-[#003375] focus:ring-4 focus:ring-blue-50" placeholder="Mô tả rõ lỗi, thời điểm xảy ra và thao tác bạn đã thử." />
          </label>
        </div>

        {error && <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div>}

        <div className="sticky bottom-0 mt-4 border-t border-slate-100 bg-white pt-3">
          <button disabled={submitting} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#003375] px-4 text-sm font-black text-white transition hover:bg-[#002855] disabled:opacity-60 sm:w-auto">
            {submitting ? <Loader2 size={17} className="animate-spin" /> : <MessageSquarePlus size={17} />}
            Gửi yêu cầu
          </button>
        </div>
      </form>
    </section>
  );
};

export const TicketDetailView = ({ ticketId, isStaff = false }: { ticketId: string; isStaff?: boolean }) => {
  const navigate = useNavigate();
  const { ticket, messages, loading, loadingOlder, hasOlder, error, reload, loadOlder, setMessages } = useTicketMessages(ticketId);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [ticketMenuOpen, setTicketMenuOpen] = useState(false);
  const [internalNoteMode, setInternalNoteMode] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingSupportAttachment[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [fileAccept, setFileAccept] = useState('image/jpeg,image/png,image/webp,application/pdf');
  const [resolvedByName, setResolvedByName] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef<PendingSupportAttachment[]>([]);
  const isClosed = isSupportTicketClosed(ticket?.status);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, loading]);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    if (!isStaff || !ticket?.resolved_at) {
      setResolvedByName('');
      return;
    }

    if (!ticket.resolved_by) {
      setResolvedByName('Hệ thống');
      return;
    }

    const fallbackName = ticket.resolved_by_role === 'user'
      ? 'Người dùng'
      : ticket.resolved_by_role === 'auditor'
        ? 'Auditor'
        : 'Nhân viên hỗ trợ';
    setResolvedByName(fallbackName);

    let cancelled = false;
    const loadResolverName = async () => {
      const profileMap = await fetchStaffPublicProfileMap([ticket.resolved_by!]);
      const data = profileMap[ticket.resolved_by!];
      if (cancelled) return;

      setResolvedByName(data?.full_name || fallbackName);
    };

    void loadResolverName();
    return () => {
      cancelled = true;
    };
  }, [isStaff, ticket?.resolved_at, ticket?.resolved_by, ticket?.resolved_by_role]);

  useEffect(() => () => {
    pendingFilesRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  const addFiles = (files: File[]) => {
    if (isClosed) {
      alert('Ticket đã đóng, không thể gửi thêm phản hồi.');
      return;
    }
    if (!files.length) return;
    try {
      const next = createPendingSupportAttachments(files, pendingFiles);
      setPendingFiles((current) => [...current, ...next]);
    } catch (err: any) {
      alert(err?.message || 'Không thể thêm file đính kèm.');
    }
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items || [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (!files.length) return;
    event.preventDefault();
    const timestamp = Date.now();
    addFiles(files.map((file, index) => {
      const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : 'png';
      return new File([file], `pasted-image-${timestamp}-${index + 1}.${ext}`, { type: file.type });
    }));
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isClosed) return;
    if (!reply.trim() && pendingFiles.length === 0) return;
    if (internalNoteMode && pendingFiles.length > 0) {
      alert('Tạm thời chưa hỗ trợ đính kèm trong ghi chú nội bộ.');
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = pendingFiles.length
        ? await uploadSupportAttachments(ticketId, pendingFiles, (id, progress) => {
          setPendingFiles((current) => current.map((item) => item.id === id ? { ...item, progress } : item));
        })
        : [];
      const message = await sendTicketMessage({
        ticketId,
        body: reply,
        senderRole: isStaff ? 'admin' : 'user',
        isInternalNote: isStaff && internalNoteMode,
        allowEmptyBody: uploaded.length > 0,
      });
      if (uploaded.length > 0) {
        await linkSupportMessageAttachments(ticketId, message.id, uploaded.map((item) => item.id));
      }
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        return [
          ...current,
          {
            ...message,
            attachments: uploaded,
          },
        ];
      });
      setReply('');
      setPendingFiles((current) => {
        current.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        return [];
      });
      if (internalNoteMode) setInternalNoteMode(false);
    } catch (err: any) {
      alert(err?.message || 'Không thể gửi phản hồi.');
    } finally {
      setSubmitting(false);
    }
  };

  const markResolved = async () => {
    const ok = window.confirm('Bạn chắc chắn muốn đánh dấu yêu cầu này là đã xử lý xong? Sau khi đóng, bạn sẽ không thể gửi thêm tin nhắn hoặc tệp đính kèm.');
    if (!ok) return;
    setSubmitting(true);
    try {
      await resolveSupportTicket(ticketId);
      await reload();
    } catch (err: any) {
      alert(err?.message || 'Không thể đánh dấu ticket đã xử lý xong.');
    } finally {
      setSubmitting(false);
      setTicketMenuOpen(false);
    }
  };

  const deleteTicket = async () => {
    const ok = window.confirm('Hành động này sẽ xóa vĩnh viễn ticket, toàn bộ tin nhắn và tệp đính kèm. Dữ liệu sẽ không thể khôi phục. Bạn chắc chắn muốn xóa?');
    if (!ok) return;
    const typed = window.prompt('Nhập XÓA để xác nhận xóa vĩnh viễn ticket này.');
    if (typed !== 'XÓA' && typed !== 'DELETE') return;
    setSubmitting(true);
    try {
      await deleteSupportTicketHard(ticketId);
      navigate('/support');
    } catch (err: any) {
      alert(err?.message || 'Không thể xóa cuộc trò chuyện.');
    } finally {
      setSubmitting(false);
      setTicketMenuOpen(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="animate-spin text-[#003375]" size={30} /></div>;
  }

  if (error || !ticket) {
    return <EmptyState title="Không thể mở ticket" body={error || 'Ticket không tồn tại hoặc bạn không có quyền truy cập.'} />;
  }

  return (
    <section
      className={`support-chat -mx-4 flex h-[calc(100dvh-92px)] flex-col bg-white sm:mx-auto sm:h-[calc(100dvh-132px)] sm:w-full sm:max-w-7xl sm:rounded-xl sm:border ${dropActive ? 'border-blue-300 ring-4 ring-blue-100' : 'sm:border-slate-100'}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isClosed) setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        if (isClosed) {
          alert('Ticket đã đóng, không thể gửi thêm phản hồi.');
          return;
        }
        addFiles(Array.from(event.dataTransfer.files || []));
      }}
    >
      <header className="shrink-0 border-b border-slate-100 bg-white px-3 py-2.5 sm:rounded-t-xl">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate(isStaff ? '/admin/support' : '/support')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-[#003375]">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-black text-slate-950">{ticket.subject}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <span>{SUPPORT_CATEGORY_LABELS[ticket.category]}</span>
              <span className={`rounded-full border px-2 py-0.5 ${statusClass[ticket.status]}`}>{SUPPORT_STATUS_LABELS[ticket.status]}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{SUPPORT_PRIORITY_LABELS[ticket.priority]}</span>
            </div>
          </div>
          <div className="relative shrink-0">
            <button type="button" onClick={() => setTicketMenuOpen((current) => !current)} className="grid h-8 w-8 place-items-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100" aria-label="Mở thao tác ticket">
              <MoreVertical size={17} />
            </button>
            {ticketMenuOpen && (
              <div className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-xl">
                {!isClosed && (
                  <button type="button" onClick={markResolved} className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-emerald-700 hover:bg-emerald-50">
                    <CheckCircle2 size={16} /> Đánh dấu đã xử lý xong
                  </button>
                )}
                {!isStaff && (
                  <button type="button" onClick={deleteTicket} className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-red-700 hover:bg-red-50">
                    <Trash2 size={16} /> Xóa cuộc trò chuyện
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#F8FAFC] px-2 py-3">
        <div className="flex w-full flex-col gap-2">
          {hasOlder && (
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="mx-auto mb-1 inline-flex h-8 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:border-blue-200 hover:text-[#003375] disabled:opacity-60"
            >
              {loadingOlder ? <Loader2 size={14} className="animate-spin" /> : null}
              Tải tin cũ hơn
            </button>
          )}
          {messages.length === 0 ? (
            <EmptyState title="Chưa có phản hồi" body="Tin nhắn sẽ xuất hiện tại đây theo thời gian." />
          ) : messages.map((message) => {
            const mine = isStaff ? message.sender_role !== 'user' : message.sender_role === 'user';
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-xl px-3 py-2 text-sm leading-6 ${mine ? 'rounded-br-sm bg-[#003375] text-white' : 'rounded-bl-sm border border-slate-100 bg-white text-slate-800'} ${message.is_internal_note ? 'border-amber-200 bg-amber-50 text-amber-900' : ''}`}>
                  {message.is_internal_note && <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-amber-700">Ghi chú nội bộ</p>}
                  {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                  <AttachmentList attachments={message.attachments} compact />
                  <p className={`mt-1 text-[11px] font-bold ${mine && !message.is_internal_note ? 'text-blue-100' : 'text-slate-400'}`}>
                    {message.sender_role === 'user' ? 'User' : 'Hỗ trợ'} · {formatDateTime(message.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
          {isStaff && isClosed && ticket.resolved_at && (
            <div className="my-2 flex w-full items-center gap-3 px-1">
              <span className="h-px flex-1 bg-emerald-200" />
              <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-700">
                <CheckCircle2 size={14} />
                <span>{resolvedByName} đã đánh dấu đã xử lý</span>
                <span className="font-bold text-emerald-600/70">· {formatDateTime(ticket.resolved_at)}</span>
              </div>
              <span className="h-px flex-1 bg-emerald-200" />
            </div>
          )}
        </div>
      </div>

      {isClosed ? (
        <div className="support-chat-input shrink-0 border-t border-slate-100 bg-white px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 sm:rounded-b-xl">
          <div className="mx-auto flex max-w-4xl flex-col gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
            <span>Ticket đã xử lý xong. Bạn không thể gửi thêm phản hồi.</span>
            {!isStaff && <Link to="/support/new" className="text-[#003375] hover:underline">Tạo ticket mới</Link>}
          </div>
        </div>
      ) : (
      <form onSubmit={handleSend} className={`support-chat-input relative shrink-0 border-t px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 sm:rounded-b-xl ${internalNoteMode ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white'}`}>
        <PendingAttachmentPreview files={pendingFiles} onRemove={removePendingFile} />
        {internalNoteMode && (
          <div className="mx-auto mb-2 flex max-w-4xl items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-black text-amber-700">
            <span>Đang gửi ghi chú nội bộ. User sẽ không nhìn thấy.</span>
            <button type="button" onClick={() => setInternalNoteMode(false)} className="text-amber-800 hover:underline">Tắt</button>
          </div>
        )}

        <div className="mx-auto flex max-w-4xl items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={fileAccept}
            className="hidden"
            onChange={(event) => {
              addFiles(Array.from(event.target.files || []));
              event.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => setFileMenuOpen((current) => !current)}
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-[#003375]"
            aria-label="Đính kèm file"
            title="Đính kèm ảnh hoặc PDF"
          >
            <Paperclip size={18} />
          </button>
          {fileMenuOpen && (
            <div className="absolute bottom-16 left-3 z-30 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-xl sm:left-auto">
              <button type="button" onClick={() => { setFileAccept('image/jpeg,image/png,image/webp'); setFileMenuOpen(false); window.setTimeout(() => fileInputRef.current?.click(), 0); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-slate-700 hover:bg-blue-50">
                <ImageIcon size={16} /> Gửi ảnh
              </button>
              <button type="button" onClick={() => { setFileAccept('application/pdf'); setFileMenuOpen(false); window.setTimeout(() => fileInputRef.current?.click(), 0); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-slate-700 hover:bg-blue-50">
                <FileText size={16} /> Gửi PDF
              </button>
            </div>
          )}
          {isStaff && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setQuickOpen((current) => !current)}
                className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-[#003375]"
                aria-label="Mở trả lời nhanh"
              >
                <Slash size={18} />
              </button>
              {quickOpen && (
                <div className="absolute bottom-12 left-0 z-20 w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500">Trả lời nhanh</div>
                  {staffQuickReplies.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setReply((current) => appendText(current, item));
                        setQuickOpen(false);
                      }}
                      className="block w-full border-b border-slate-50 px-3 py-2.5 text-left text-sm font-semibold leading-5 text-slate-700 last:border-b-0 hover:bg-blue-50 hover:text-[#003375]"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isStaff && (
            <button
              type="button"
              onClick={() => setInternalNoteMode((current) => !current)}
              className={`grid h-10 w-10 place-items-center rounded-full border ${internalNoteMode ? 'border-amber-300 bg-amber-100 text-amber-700' : 'border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:text-amber-700'}`}
              aria-label="Bật ghi chú nội bộ"
              title="Internal note"
            >
              <StickyNote size={18} />
            </button>
          )}

          <textarea
            value={reply}
            onChange={(event) => {
              const value = event.target.value;
              if (isStaff && value.endsWith('/')) {
                setReply(value.slice(0, -1));
                setQuickOpen(true);
                return;
              }
              setReply(value);
            }}
            onPaste={handlePaste}
            rows={1}
            maxLength={4000}
            placeholder={internalNoteMode ? 'Nhập ghi chú nội bộ, user sẽ không nhìn thấy...' : 'Nhập phản hồi hoặc dán ảnh vào đây...'}
            className="min-h-[44px] max-h-[120px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[#003375] focus:bg-white focus:ring-4 focus:ring-blue-50"
          />
          <button disabled={submitting || (!reply.trim() && pendingFiles.length === 0)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#003375] text-white transition active:scale-95 disabled:opacity-50">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
          </button>
        </div>
      </form>
      )}
    </section>
  );
};
