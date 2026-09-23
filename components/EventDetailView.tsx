import React, { useEffect, useRef, useState } from 'react';
import { recordEventView } from '../utils/eventsApi';
import {
  ArrowLeft, Bookmark, BookmarkCheck, CalendarDays, CheckCircle2, Clock3,
  Copy, ExternalLink, FileText, Flag, ImageOff, Info, Link2, MapPin,
  Pencil, Tag, Users,
} from 'lucide-react';

export interface EventDetailData {
  id: string;
  name: string;
  category: string;
  score: string;
  location: string;
  time: string;
  deadlineDate: Date | null;
  deadline_time: string | null;
  close_on_full: boolean;
  description: string | null;
  link: string;
  organizer: string;
  type: string;
  classification: string;
  scope: string;
  status: string;
  is_manually_closed: boolean;
  is_deleted: boolean;
  created_at: string;
  event_date: string | null;
  event_time: string | null;
  registration_start_date: string | null;
  registration_start_time: string | null;
  image_url: string | null;
}

interface Props {
  event: EventDetailData;
  preview: boolean;
  canEdit: boolean;
  isRegistrationClosed: boolean;
  isParticipated: boolean;
  onBack: () => void;
  onEdit?: () => void;
  onCopy: () => void;
  onToggleParticipation?: () => void;
  onReport?: () => void;
  onViewsUpdated?: (eventId: string, views: number) => void;
}

export const safeEventLink = (value: string): string | null => {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
};

const dateLabel = (value: string | null): string => {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa cập nhật' : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const dateTimeLabel = (date: string | null, time: string | null): string =>
  date ? `${dateLabel(date)}${time ? ` · ${time.slice(0, 5)}` : ''}` : 'Chưa cập nhật';
const textOrFallback = (value: string | null | undefined) => value?.trim() || 'Chưa cập nhật';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0052cc]';

export const EventDetailView: React.FC<Props> = ({
  event, preview, canEdit, isRegistrationClosed, isParticipated,
  onBack, onEdit, onCopy, onToggleParticipation, onReport, onViewsUpdated,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const countedEventId = useRef<string | null>(null);
  useEffect(() => setImageFailed(false), [event.image_url]);
  useEffect(() => {
    if (countedEventId.current === event.id) return;
    countedEventId.current = event.id;
    void recordEventView(event.id, preview && event.status === 'pending')
      .then((views) => { if (views !== null) onViewsUpdated?.(event.id, views); })
      .catch(() => { /* An unavailable counter must not block event detail. */ });
  }, [event.id]);
  const sourceUrl = safeEventLink(event.link);
  const closed = isRegistrationClosed || event.is_deleted;
  const status = event.status === 'pending' ? 'Chờ duyệt'
    : closed ? 'Đã đóng'
      : event.status === 'Sắp diễn ra' ? 'Sắp diễn ra' : event.status || 'Đang mở đăng ký';
  const statusTone = event.status === 'pending' ? 'bg-amber-50 text-amber-700'
    : closed ? 'bg-slate-100 text-slate-700'
      : status === 'Sắp diễn ra' ? 'bg-blue-50 text-[#0052cc]' : 'bg-emerald-50 text-emerald-700';
  const score = event.score?.trim() || '0';
  const scoreLabel = /^[+-]/.test(score) ? score : `+${score}`;

  const miniCards = [
    { label: 'Mã sự kiện', value: `#${event.id}`, icon: FileText },
    { label: 'Loại hình', value: textOrFallback(event.type), icon: Tag },
    { label: 'Ngày đăng', value: dateLabel(event.created_at), icon: CalendarDays },
    { label: 'Phân loại', value: textOrFallback(event.classification), icon: Info },
  ];

  return <article className="w-full min-w-0 space-y-5 bg-white text-slate-700" aria-labelledby="event-detail-title">
    <header className="flex flex-col gap-3 border-b border-gray-300 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={onBack} title="Quay lại danh sách" aria-label="Quay lại danh sách sự kiện" className={`${button} self-start`}><ArrowLeft size={16}/>Quay lại</button>
      <div className="flex min-w-0 flex-wrap gap-2 sm:justify-end" aria-label="Thao tác sự kiện">
        {canEdit && onEdit && <button type="button" onClick={onEdit} title="Chỉnh sửa sự kiện" aria-label="Chỉnh sửa sự kiện" className={`${button} border-[#0052cc] bg-[#0052cc] text-white hover:bg-[#003d99]`}><Pencil size={16}/>Chỉnh sửa</button>}
        <button type="button" onClick={onCopy} title="Sao chép liên kết sự kiện" aria-label="Sao chép liên kết sự kiện" className={button}><Copy size={16}/>Sao chép liên kết</button>
      </div>
    </header>

    <section className="min-w-0 rounded-lg border border-gray-300 bg-white p-4 lg:p-5" aria-label="Thông tin chính của sự kiện">
      <div data-testid="event-hero-grid" className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="aspect-video min-w-0 self-start overflow-hidden rounded-lg border border-gray-300 bg-slate-50">
        {event.image_url && !imageFailed
          ? <img src={event.image_url} alt={`Ảnh sự kiện: ${event.name}`} loading="lazy" onError={() => setImageFailed(true)} className="h-full w-full object-cover"/>
          : <div className="flex h-full min-h-44 flex-col items-center justify-center gap-2 text-slate-400"><ImageOff size={36}/><span className="text-xs font-semibold">Chưa có ảnh sự kiện</span></div>}
      </div>
      <div className="min-w-0 space-y-4">
        <div><span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${statusTone}`}>{status}</span><h1 id="event-detail-title" className="mt-3 break-words text-xl font-black leading-snug text-[#003375] sm:text-2xl">{event.name}</h1></div>
        <dl className="space-y-3 text-sm">
          {([
            { label: 'Đơn vị tổ chức', value: textOrFallback(event.organizer), icon: Users },
            { label: 'Thời gian', value: dateTimeLabel(event.event_date, event.event_time), icon: CalendarDays },
            { label: 'Đăng ký', value: event.close_on_full ? 'Đóng khi đủ số lượng' : event.deadlineDate ? `${dateLabel(event.deadlineDate.toISOString())}${event.deadline_time ? ` · ${event.deadline_time.slice(0, 5)}` : ''}` : 'Chưa cập nhật', icon: Clock3 },
            { label: 'Địa điểm / phạm vi', value: textOrFallback(event.scope), icon: MapPin },
            { label: 'Hình thức', value: textOrFallback(event.location), icon: Info },
            { label: 'Điểm rèn luyện', value: `${scoreLabel} · Mục ${textOrFallback(event.category)}`, icon: CheckCircle2 },
          ]).map(({ label, value, icon: Icon }) => <div key={label} className="flex min-w-0 gap-3"><Icon size={16} className="mt-0.5 shrink-0 text-[#0052cc]" aria-hidden="true"/><div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="break-words font-semibold text-slate-800">{value}</dd></div></div>)}
        </dl>
      </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Thông tin bổ sung">{miniCards.map(({ label, value, icon: Icon }) => <div key={label} className="min-w-0 rounded-lg border border-gray-300 bg-white p-4"><Icon size={17} className="text-[#0052cc]" aria-hidden="true"/><p className="mt-2 text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-bold text-[#003375]">{value}</p></div>)}</section>

    <div className={`min-w-0 ${!preview ? 'grid items-start gap-4 lg:grid-cols-2' : ''}`}>
      <section className="min-w-0 rounded-lg border border-gray-300 bg-white p-4 sm:p-5" aria-labelledby="event-intro-title"><h2 id="event-intro-title" className="flex items-center gap-2 text-base font-black text-[#003375]"><FileText size={18}/>Giới thiệu sự kiện</h2><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{event.description?.trim() || 'Chưa có nội dung giới thiệu sự kiện.'}</p></section>
      {!preview && (onToggleParticipation || onReport || sourceUrl) && <section className="min-w-0 rounded-lg border border-gray-300 bg-white p-4 sm:p-5" aria-labelledby="event-actions-title">
        <h2 id="event-actions-title" className="flex items-center gap-2 text-base font-black text-[#003375]"><Users size={18}/>Tham gia sự kiện</h2>
        {sourceUrl && !closed && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0052cc] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#003d99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0052cc]"><ExternalLink size={16}/>Tham gia ngay</a>}
        {(onToggleParticipation || onReport) && <div className="mt-3 flex flex-wrap gap-2">
          {onToggleParticipation && <button type="button" onClick={onToggleParticipation} className={`${button} min-w-0 flex-1`}>
            {isParticipated ? <BookmarkCheck size={16}/> : <Bookmark size={16}/>} {isParticipated ? 'Đã lưu' : 'Lưu sự kiện'}
          </button>}
          {onReport && <button type="button" onClick={onReport} className={`${button} min-w-0 flex-1`}><Flag size={16}/>Báo lỗi</button>}
        </div>}
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" title="Xem bài đăng gốc" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#0052cc] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0052cc]"><Link2 size={14}/>Nguồn sự kiện<ExternalLink size={13}/></a>}
      </section>}
    </div>

    <aside className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-[#003375] sm:p-5" aria-label="Lưu ý sự kiện"><div className="flex gap-3"><Info size={19} className="mt-0.5 shrink-0"/><div><h2 className="font-black">Lưu ý cho sinh viên</h2><p className="mt-1 leading-6">Thông tin sự kiện có thể thay đổi. {sourceUrl ? 'Để kiểm tra nội dung và cập nhật mới nhất, vui lòng xem liên kết gốc của sự kiện.' : 'Vui lòng theo dõi thông báo từ đơn vị tổ chức để cập nhật mới nhất.'}</p></div></div></aside>
  </article>;
};
