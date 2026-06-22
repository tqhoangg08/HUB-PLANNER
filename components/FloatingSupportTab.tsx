import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, HelpCircle, Image as ImageIcon, Loader2, Maximize2, MessageCircle, MessageSquarePlus, MoreVertical, Paperclip, Plus, Send, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../utils/supportTicketsApi';
import { playClick } from '../utils/audio';
import {
  createPendingSupportAttachments,
  createSupportDownloadUrl,
  formatAttachmentSize,
  linkSupportMessageAttachments,
  PendingSupportAttachment,
  uploadSupportAttachments,
} from '../utils/supportAttachmentsApi';

type ViewMode = 'list' | 'create' | 'detail';

interface FloatingSupportTabProps {
  currentUserId?: string | null;
  isGuest?: boolean;
  isAdmin?: boolean;
  isAuditor?: boolean;
  isMobileLayout?: boolean;
}

const categories = Object.keys(SUPPORT_CATEGORY_LABELS) as SupportTicketCategory[];
const priorities = Object.keys(SUPPORT_PRIORITY_LABELS) as SupportTicketPriority[];
const statuses: SupportTicketStatus[] = ['open', 'pending', 'resolved', 'closed'];

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
    message: 'Mình không nhập được bảng điểm từ file PDF. Hệ thống báo lỗi khi tải lên, nhờ admin kiểm tra giúp mình.',
  },
  {
    label: 'Mất dữ liệu',
    subject: 'Mất dữ liệu bảng điểm',
    category: 'grades',
    message: 'Mình bị mất dữ liệu bảng điểm hoặc lộ trình sau khi đăng nhập lại. Nhờ admin hỗ trợ kiểm tra giúp mình.',
  },
  {
    label: 'Không thấy sự kiện',
    subject: 'Không thấy sự kiện ĐRL',
    category: 'events',
    message: 'Mình không thấy sự kiện ĐRL mới hoặc thông tin sự kiện chưa cập nhật. Nhờ admin kiểm tra giúp mình.',
  },
  {
    label: 'Lỗi thời khóa biểu',
    subject: 'Thời khóa biểu bị sai hoặc không hiển thị',
    category: 'schedule',
    message: 'Mình không xem được thời khóa biểu hoặc lịch học hiển thị chưa đúng. Nhờ admin kiểm tra giúp mình.',
  },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
};

const statusClass: Record<SupportTicketStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

const DrawerAttachmentItem = ({ item }: {
  item: { id: string; file_name: string; mime_type: string; size_bytes: number };
}) => {
  const isImage = item.mime_type.startsWith('image/');

  const openAttachment = async (id: string) => {
    try {
      const result = await createSupportDownloadUrl(id);
      window.open(result.download_url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(err?.message || 'Không thể mở file đính kèm.');
    }
  };

  return (
    <button type="button" onClick={() => openAttachment(item.id)} className="flex min-w-0 items-center gap-2 rounded-lg border border-white/20 bg-white/15 px-2 py-1.5 text-left text-[11px] font-bold hover:bg-white/25">
      {isImage ? <ImageIcon size={14} className="shrink-0" /> : <FileText size={14} className="shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{item.file_name}</span>
      <span className="shrink-0 opacity-75">{formatAttachmentSize(item.size_bytes)}</span>
    </button>
  );
};

const DrawerAttachments = ({ attachments }: {
  attachments?: Array<{ id: string; file_name: string; mime_type: string; size_bytes: number }>;
}) => {
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 grid gap-1.5">
      {attachments.map((item) => <DrawerAttachmentItem key={item.id} item={item} />)}
    </div>
  );
};

const DrawerPendingAttachments = ({ files, onRemove }: {
  files: PendingSupportAttachment[];
  onRemove: (id: string) => void;
}) => {
  if (!files.length) return null;
  return (
    <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
      {files.map((item) => (
        <div key={item.id} className="relative flex min-w-[150px] max-w-[210px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm">
          {item.previewUrl ? <img src={item.previewUrl} alt="" className="h-8 w-8 rounded-md object-cover" /> : <FileText size={18} className="shrink-0 text-red-600" />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-black text-slate-700">{item.name}</p>
            <p className="text-[11px] font-bold text-slate-400">{item.progress > 0 ? `${item.progress}%` : formatAttachmentSize(item.size)}</p>
          </div>
          <button type="button" onClick={() => onRemove(item.id)} className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-slate-500">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export const FloatingSupportTab: React.FC<FloatingSupportTabProps> = ({
  currentUserId,
  isGuest,
  isAdmin,
  isAuditor,
  isMobileLayout,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const hiddenRoute = location.pathname.startsWith('/support') || location.pathname.startsWith('/admin/support') || location.pathname.startsWith('/login');

  if (!currentUserId || isGuest || hiddenRoute || isAdmin || isAuditor) return null;

  const openPanel = () => {
    playClick();
    setIsOpen(true);
  };

  const closePanel = () => {
    playClick();
    setIsOpen(false);
  };

  const openTicket = (ticket: SupportTicket) => {
    playClick();
    setSelectedTicketId(ticket.id);
    setView('detail');
  };

  const goList = () => {
    playClick();
    setSelectedTicketId(null);
    setView('list');
  };

  const openFullPage = () => {
    playClick();
    const targetPath = selectedTicketId && view === 'detail' ? `/support/${selectedTicketId}` : '/support';
    setIsOpen(false);
    navigate(targetPath);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className={
          isMobileLayout
            ? 'fixed right-4 z-[55] grid h-14 w-14 place-items-center rounded-full border-2 border-white bg-[#003375] text-white shadow-2xl transition hover:bg-[#002855] active:scale-95 bottom-[calc(96px+env(safe-area-inset-bottom))]'
            : 'fixed right-[-14px] top-[58%] z-[55] flex -translate-y-1/2 items-center gap-2 rounded-l-2xl bg-[#003375] px-2.5 py-4 pr-5 text-white shadow-xl transition-all hover:right-0 hover:bg-[#002855] active:scale-[0.98]'
        }
        aria-label="Mở hỗ trợ"
      >
        {isMobileLayout ? (
          <MessageCircle size={24} />
        ) : (
          <span className="flex items-center gap-2 [writing-mode:vertical-rl]">
            <MessageCircle size={18} />
            <span className="text-sm font-black tracking-wide">Hỗ trợ</span>
          </span>
        )}
        {/* TODO: Hiển thị badge unread khi schema có read receipt/unread_count cho support_ticket_messages. */}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[70]">
          <button type="button" className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]" aria-label="Đóng hỗ trợ" onClick={closePanel} />
          <aside
            className={
              isMobileLayout
                ? 'absolute inset-0 flex flex-col bg-white animate-slideUp'
                : 'absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl animate-slideInRight'
            }
          >
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4">
              <div className="flex items-center gap-3">
                {view !== 'list' && (
                  <button type="button" onClick={goList} className="grid h-10 w-10 place-items-center rounded-full bg-slate-50 text-slate-600 active:scale-95">
                    <ArrowLeft size={20} />
                  </button>
                )}
                <div>
                  <h2 className="text-lg font-black text-slate-950">Hỗ trợ</h2>
                  <p className="text-xs font-bold text-slate-500">Ticket 1-1 với admin</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openFullPage}
                  className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-[#003375] hover:bg-blue-100 active:scale-95"
                  title="Mở trang hỗ trợ đầy đủ"
                  aria-label="Mở rộng hỗ trợ"
                >
                  <Maximize2 size={18} />
                </button>
                <button type="button" onClick={closePanel} className="grid h-10 w-10 place-items-center rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100 active:scale-95" aria-label="Đóng hỗ trợ">
                  <X size={20} />
                </button>
              </div>
            </header>

            {view === 'list' && (
              <SupportDrawerList
                onCreate={() => {
                  playClick();
                  setView('create');
                }}
                onOpenTicket={openTicket}
              />
            )}
            {view === 'create' && (
              <SupportDrawerCreate
                onCreated={(ticketId) => {
                  setSelectedTicketId(ticketId);
                  setView('detail');
                }}
              />
            )}
            {view === 'detail' && selectedTicketId && (
              <SupportDrawerDetail ticketId={selectedTicketId} onDeleted={goList} />
            )}
          </aside>
        </div>
      )}
    </>
  );
};

const SupportDrawerList = ({ onCreate, onOpenTicket }: {
  onCreate: () => void;
  onOpenTicket: (ticket: SupportTicket) => void;
}) => {
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | 'all'>('all');
  const { tickets, loading, error } = useSupportTickets({ status: statusFilter });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F8FAFC]">
      <div className="shrink-0 space-y-3 border-b border-slate-100 bg-white p-4">
        <button type="button" onClick={onCreate} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003375] text-sm font-black text-white shadow-sm transition hover:bg-[#002855] active:scale-95">
          <Plus size={18} /> Tạo yêu cầu hỗ trợ
        </button>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setStatusFilter('all')} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${statusFilter === 'all' ? 'bg-[#003375] text-white' : 'bg-slate-100 text-slate-600'}`}>
            Tất cả
          </button>
          {statuses.map((status) => (
            <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${statusFilter === status ? 'bg-[#003375] text-white' : 'bg-slate-100 text-slate-600'}`}>
              {SUPPORT_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-white" />)}
          </div>
        ) : error ? (
          <SupportEmpty title="Không thể tải ticket" body={error} />
        ) : tickets.length === 0 ? (
          <SupportEmpty title="Bạn chưa có ticket nào" body="Tạo yêu cầu hỗ trợ để trao đổi trực tiếp với admin." />
        ) : (
          <div className="grid gap-3">
            {tickets.map((ticket) => (
              <button key={ticket.id} type="button" onClick={() => onOpenTicket(ticket)} className="rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-100 hover:shadow-md active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black text-slate-950">{ticket.subject}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">{SUPPORT_CATEGORY_LABELS[ticket.category]}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass[ticket.status]}`}>
                    {SUPPORT_STATUS_LABELS[ticket.status]}
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold text-slate-400">Cập nhật {formatDateTime(ticket.last_message_at || ticket.updated_at)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const SupportDrawerCreate = ({ onCreated }: { onCreated: (ticketId: string) => void }) => {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('login');
  const [priority, setPriority] = useState<SupportTicketPriority>('normal');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await createSupportTicket({ subject, category, priority, message });
      onCreated(ticket.id);
    } catch (err: any) {
      setError(err?.message || 'Không thể tạo yêu cầu hỗ trợ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto bg-[#F8FAFC] p-4">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#003375]">Gợi ý nhanh</p>
        <div className="flex flex-wrap gap-2">
          {userIssueSuggestions.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setSubject(item.subject);
                setCategory(item.category);
                setMessage(item.message);
              }}
              className="rounded-full border border-blue-100 bg-white px-3 py-2 text-xs font-black text-[#003375] shadow-sm active:scale-95"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 rounded-2xl bg-white p-4 shadow-sm">
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-700">Tiêu đề</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#003375] focus:ring-4 focus:ring-blue-50" placeholder="Tóm tắt vấn đề" />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-700">Loại vấn đề</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as SupportTicketCategory)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#003375]">
            {categories.map((item) => <option key={item} value={item}>{SUPPORT_CATEGORY_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-700">Mức ưu tiên</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value as SupportTicketPriority)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#003375]">
            {priorities.map((item) => <option key={item} value={item}>{SUPPORT_PRIORITY_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-black text-slate-700">Mô tả vấn đề</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} rows={6} className="resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-[#003375] focus:ring-4 focus:ring-blue-50" placeholder="Mô tả vấn đề bạn đang gặp" />
        </label>
        {error && <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div>}
        <button disabled={submitting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#003375] text-sm font-black text-white disabled:opacity-60">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <MessageSquarePlus size={18} />}
          Gửi yêu cầu
        </button>
      </div>
    </form>
  );
};

const SupportDrawerDetail = ({ ticketId, onDeleted }: { ticketId: string; onDeleted: () => void }) => {
  const { ticket, messages, loading, loadingOlder, hasOlder, error, reload, loadOlder, setMessages } = useTicketMessages(ticketId);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingSupportAttachment[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [ticketMenuOpen, setTicketMenuOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [fileAccept, setFileAccept] = useState('image/jpeg,image/png,image/webp,application/pdf');
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
      setPendingFiles((current) => [...current, ...createPendingSupportAttachments(files, current)]);
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isClosed) return;
    if (!reply.trim() && pendingFiles.length === 0) return;
    setSubmitting(true);
    try {
      const uploaded = pendingFiles.length
        ? await uploadSupportAttachments(ticketId, pendingFiles, (id, progress) => {
          setPendingFiles((current) => current.map((item) => item.id === id ? { ...item, progress } : item));
        })
        : [];
      const message = await sendTicketMessage({ ticketId, body: reply, senderRole: 'user', allowEmptyBody: uploaded.length > 0 });
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
      onDeleted();
    } catch (err: any) {
      alert(err?.message || 'Không thể xóa cuộc trò chuyện.');
    } finally {
      setSubmitting(false);
      setTicketMenuOpen(false);
    }
  };

  if (loading) {
    return <div className="grid flex-1 place-items-center bg-[#F8FAFC]"><Loader2 className="animate-spin text-[#003375]" size={30} /></div>;
  }

  if (error || !ticket) {
    return <SupportEmpty title="Không thể mở ticket" body={error || 'Ticket không tồn tại hoặc bạn không có quyền truy cập.'} />;
  }

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col bg-[#F8FAFC] ${dropActive ? 'ring-4 ring-blue-100' : ''}`}
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
      <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-slate-950">{ticket.subject}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              <span>{SUPPORT_CATEGORY_LABELS[ticket.category]}</span>
              <span className={`rounded-full border px-2 py-0.5 ${statusClass[ticket.status]}`}>{SUPPORT_STATUS_LABELS[ticket.status]}</span>
            </div>
          </div>
          <div className="relative shrink-0">
            <button type="button" onClick={() => setTicketMenuOpen((current) => !current)} className="grid h-8 w-8 place-items-center rounded-full bg-slate-50 text-slate-600" aria-label="Mở thao tác ticket">
              <MoreVertical size={17} />
            </button>
            {ticketMenuOpen && (
              <div className="absolute right-0 top-10 z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-xl">
                {!isClosed && (
                  <button type="button" onClick={markResolved} className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-emerald-700 hover:bg-emerald-50">
                    <CheckCircle2 size={16} /> Đánh dấu đã xử lý xong
                  </button>
                )}
                <button type="button" onClick={deleteTicket} className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-red-700 hover:bg-red-50">
                  <Trash2 size={16} /> Xóa cuộc trò chuyện
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
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
            <SupportEmpty title="Chưa có phản hồi" body="Tin nhắn sẽ xuất hiện tại đây theo thời gian." />
          ) : messages.map((message) => {
            const mine = message.sender_role === 'user';
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${mine ? 'rounded-br-sm bg-[#003375] text-white' : 'rounded-bl-sm border border-slate-100 bg-white text-slate-800'}`}>
                  {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                  <DrawerAttachments attachments={message.attachments} />
                  <p className={`mt-2 text-[10px] font-bold ${mine ? 'text-blue-100' : 'text-slate-400'}`}>
                    {message.sender_role === 'user' ? 'Bạn' : 'Hỗ trợ'} · {formatDateTime(message.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isClosed ? (
        <div className="shrink-0 border-t border-slate-100 bg-white px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2.5">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
            Ticket đã xử lý xong. Bạn không thể gửi thêm phản hồi.
          </div>
        </div>
      ) : (
      <form onSubmit={submit} className="relative shrink-0 border-t border-slate-100 bg-white px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2.5">
        <DrawerPendingAttachments files={pendingFiles} onRemove={removePendingFile} />
        <div className="flex items-end gap-2">
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
          <button type="button" onClick={() => setFileMenuOpen((current) => !current)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700" aria-label="Đính kèm file">
            <Paperclip size={18} />
          </button>
          {fileMenuOpen && (
            <div className="absolute bottom-16 left-3 z-30 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-xl">
              <button type="button" onClick={() => { setFileAccept('image/jpeg,image/png,image/webp'); setFileMenuOpen(false); window.setTimeout(() => fileInputRef.current?.click(), 0); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-slate-700 hover:bg-blue-50">
                <ImageIcon size={16} /> Gửi ảnh
              </button>
              <button type="button" onClick={() => { setFileAccept('application/pdf'); setFileMenuOpen(false); window.setTimeout(() => fileInputRef.current?.click(), 0); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-bold text-slate-700 hover:bg-blue-50">
                <FileText size={16} /> Gửi PDF
              </button>
            </div>
          )}
          <textarea value={reply} onChange={(event) => setReply(event.target.value)} onPaste={handlePaste} rows={1} maxLength={4000} placeholder="Nhập phản hồi hoặc dán ảnh vào đây..." className="min-h-[44px] max-h-[120px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[#003375] focus:bg-white focus:ring-4 focus:ring-blue-50" />
          <button disabled={submitting || (!reply.trim() && pendingFiles.length === 0)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#003375] text-white shadow-sm disabled:opacity-50">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
          </button>
        </div>
      </form>
      )}
    </div>
  );
};

const SupportEmpty = ({ title, body }: { title: string; body: string }) => (
  <div className="grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
    <div>
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#003375]">
        <HelpCircle size={24} />
      </div>
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
    </div>
  </div>
);
