import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Eye, FileImage, FileText, Info, Loader2, Settings2, Trash2, Upload, X } from 'lucide-react';
import { useUserRole } from '../hooks/useUserRole';
import { createAdminEvent, uploadAdminEventBanner } from '../utils/eventsApi';
import { showToast } from '../utils/appNotifications';
import {
  buildAdminEventPayload, createEmptyAdminEventDraft, EVENT_CATEGORIES,
  EVENT_DRAFT_STATUS, EVENT_PUBLIC_STATUS, validateAdminEventDraft,
  type AdminEventFormValues,
} from '../utils/adminEventForm';
import { EventDetailView, type EventDetailData } from './EventDetailView';

const control = 'min-h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#0052cc] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
const secondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc]';
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#0052cc] px-4 py-2 text-sm font-bold text-white hover:bg-[#003d99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0052cc]';
const card = 'min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5';
const label = 'mb-1.5 block text-xs font-bold text-slate-700';
type Field = keyof AdminEventFormValues;

const previewEvent = (draft: AdminEventFormValues, imageUrl: string): EventDetailData => ({
  id: 'preview', name: draft.title.trim() || 'Tên sự kiện chưa nhập',
  category: draft.criteria, score: draft.points, location: draft.format,
  time: draft.event_time, deadlineDate: draft.deadline ? new Date(`${draft.deadline}T00:00:00`) : null,
  deadline_time: draft.deadline_time || null, close_on_full: draft.close_on_full,
  description: draft.description || null, link: draft.link, organizer: draft.organizer,
  type: draft.category, classification: draft.classification || '', scope: draft.location_type,
  status: draft.status, is_manually_closed: draft.is_manually_closed, is_deleted: false,
  created_at: new Date().toISOString(), event_date: draft.event_date || null,
  event_time: draft.event_time || null, registration_start_date: draft.registration_start_date || null,
  registration_start_time: draft.registration_start_time || null, image_url: imageUrl || null,
});

export const AdminEventEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, isAdmin, isAuditor, loading } = useUserRole();
  const [draft, setDraft] = useState<AdminEventFormValues>(createEmptyAdminEventDraft);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [localImageUrl, setLocalImageUrl] = useState('');
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { document.title = 'Thêm sự kiện | HUB Planner'; }, []);
  useEffect(() => {
    if (!file) { setLocalImageUrl(''); return; }
    const url = URL.createObjectURL(file);
    setLocalImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const imageUrl = localImageUrl || draft.image_url;
  const detail = useMemo(() => previewEvent(draft, imageUrl), [draft, imageUrl]);
  const creator = session?.user.user_metadata.full_name || session?.user.user_metadata.name || session?.user.email || 'Nhân sự HUB Planner';

  const setField = <K extends Field>(field: K, value: AdminEventFormValues[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const selectFile = (selected: File | null) => {
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setFileError('Chỉ nhận ảnh JPG, PNG hoặc WEBP.'); return;
    }
    if (!selected.size || selected.size > 2 * 1024 * 1024) {
      setFileError('Ảnh phải có dung lượng tối đa 2 MB.'); return;
    }
    setFileError('');
    setFile(selected);
    setField('image_url', '');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateAdminEventDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || fileError) return;
    setSubmitting(true);
    try {
      let image_url = draft.image_url;
      if (file) {
        image_url = await uploadAdminEventBanner(file);
        setFile(null);
        setDraft((current) => ({ ...current, image_url }));
      }
      await createAdminEvent(buildAdminEventPayload({ ...draft, image_url }));
      showToast({ message: 'Tạo sự kiện thành công.', variant: 'success' });
      navigate('/events');
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'Không thể tạo sự kiện.', variant: 'error' });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Đang kiểm tra quyền truy cập…</div>;
  if (!isAdmin && !isAuditor) return <div role="alert" className="p-8 text-sm text-red-700">Bạn không có quyền tạo sự kiện.</div>;

  const field = (name: Field, title: string, child: React.ReactNode, required = false) => <div className="min-w-0" key={name}>
    <label htmlFor={`event-${name}`} className={label}>{title}{required && <span className="ml-1 text-red-600">*</span>}</label>
    {child}
    {errors[name] && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{errors[name]}</p>}
  </div>;
  const text = (name: Field, title: string, required = false, placeholder = '') => field(name, title,
    <input id={`event-${name}`} className={control} value={String(draft[name])} onChange={(event) => setField(name, event.target.value)} placeholder={placeholder} maxLength={name === 'title' || name === 'organizer' ? 300 : name === 'category' || name === 'classification' ? 120 : name === 'points' ? 40 : undefined} />, required);
  const date = (name: 'registration_start_date' | 'deadline' | 'event_date', title: string, disabled = false) => field(name, title,
    <input id={`event-${name}`} type="date" className={control} disabled={disabled} value={draft[name]} onChange={(event) => setField(name, event.target.value)} />);
  const time = (name: 'registration_start_time' | 'deadline_time' | 'event_time', title: string, disabled = false) => field(name, title,
    <input id={`event-${name}`} type="time" className={control} disabled={disabled} value={draft[name]} onChange={(event) => setField(name, event.target.value)} />);

  return <div className="w-full min-w-0 space-y-5 pb-8 text-slate-800">
    <header className="flex min-w-0 flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0"><nav aria-label="Đường dẫn" className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500"><button type="button" onClick={() => navigate('/events')} className="text-[#0052cc] hover:underline">Sự kiện</button><span>/</span><span>Thêm sự kiện</span></nav><h1 className="text-2xl font-black text-[#003375] sm:text-[26px]">Thêm sự kiện</h1></div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Thao tác tạo sự kiện">
        <button type="button" onClick={() => navigate('/events')} className={secondary}>Hủy</button>
        <button type="button" onClick={() => setPreview(true)} className={secondary}><Eye size={16}/>Xem trước</button>
        <button type="submit" form="admin-event-create-form" disabled={submitting} className={`${primary} col-span-2 sm:col-span-1`}>{submitting ? <Loader2 size={16} className="animate-spin"/> : null}Tạo sự kiện</button>
      </div>
    </header>

    <form id="admin-event-create-form" onSubmit={submit} noValidate className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-w-0 space-y-4">
        <section className={card} aria-labelledby="basic-info-title"><h2 id="basic-info-title" className="mb-4 flex items-center gap-2 text-base font-black text-[#003375]"><FileText size={18}/>Thông tin cơ bản</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('title', 'Tên sự kiện', true, 'Nhập tên sự kiện')}
            {field('category', 'Loại hình', <><select id="event-category" className={control} value={EVENT_CATEGORIES.includes(draft.category as typeof EVENT_CATEGORIES[number]) ? draft.category : 'other'} onChange={(event) => setField('category', event.target.value === 'other' ? '' : event.target.value)}>{EVENT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}<option value="other">Khác (tự nhập)</option></select>{!EVENT_CATEGORIES.includes(draft.category as typeof EVENT_CATEGORIES[number]) && <input aria-label="Loại hình khác" className={`${control} mt-2`} value={draft.category} onChange={(event) => setField('category', event.target.value)} maxLength={120} placeholder="Nhập loại hình"/>}</>, true)}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {text('organizer', 'Đơn vị tổ chức', true)}
            {field('criteria', 'Mục ĐRL', <select id="event-criteria" className={control} value={draft.criteria} onChange={(event) => setField('criteria', event.target.value)}>{['I', 'II', 'III', 'IV', 'V', 'Chưa biết'].map((item) => <option key={item}>{item}</option>)}</select>, true)}
            {text('points', 'Điểm rèn luyện', true)}
            {field('format', 'Hình thức', <select id="event-format" className={control} value={draft.format} onChange={(event) => setField('format', event.target.value)}>{['Offline', 'Online', 'Hỗn hợp'].map((item) => <option key={item}>{item}</option>)}</select>, true)}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">{field('location_type', 'Khu vực', <select id="event-location_type" className={control} value={draft.location_type} onChange={(event) => setField('location_type', event.target.value)}><option>Trong trường</option><option>Ngoài trường</option></select>)}{text('classification', 'Phân loại')}</div>
        </section>

        <section className={card} aria-labelledby="time-title"><h2 id="time-title" className="mb-4 flex items-center gap-2 text-base font-black text-[#003375]"><CalendarDays size={18}/>Thời gian & đăng ký</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{date('registration_start_date', 'Ngày mở đăng ký')}{time('registration_start_time', 'Giờ mở đăng ký')}{date('deadline', 'Ngày đóng đăng ký', draft.close_on_full)}{time('deadline_time', 'Giờ đóng đăng ký', draft.close_on_full)}{date('event_date', 'Ngày diễn ra')}{time('event_time', 'Giờ diễn ra')}</div>
          <label className="mt-4 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0052cc]" checked={draft.close_on_full} onChange={(event) => setField('close_on_full', event.target.checked)}/><span><strong>Đóng khi đủ số lượng</strong>{draft.close_on_full && <span className="mt-0.5 block text-xs text-slate-500">Đăng ký sẽ được đóng thủ công khi đủ số lượng.</span>}</span></label>
        </section>

        <section className={card} aria-labelledby="content-title"><h2 id="content-title" className="mb-4 flex items-center gap-2 text-base font-black text-[#003375]"><FileText size={18}/>Nội dung sự kiện</h2>
          {field('description', 'Mô tả', <textarea id="event-description" className={`${control} min-h-36 resize-y`} maxLength={10_000} value={draft.description} onChange={(event) => setField('description', event.target.value)} placeholder="Thông tin chi tiết về sự kiện"/>)}
          <p className="mt-1 text-right text-xs text-slate-500">{draft.description.length.toLocaleString('vi-VN')} / 10.000 ký tự</p>
          <div className="mt-4">{field('link', 'Link gốc / Link đăng ký', <input id="event-link" type="url" className={control} maxLength={2_048} value={draft.link} onChange={(event) => setField('link', event.target.value)} placeholder="https://..." />)}</div>
        </section>

        <section className={card} aria-labelledby="banner-title"><h2 id="banner-title" className="mb-4 flex items-center gap-2 text-base font-black text-[#003375]"><FileImage size={18}/>Banner sự kiện</h2>
          <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="aspect-[1.91/1] min-w-0 overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50">{imageUrl ? <img src={imageUrl} alt="Xem trước banner sự kiện" className="h-full w-full object-cover"/> : <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-500"><FileImage size={30} className="text-slate-400"/>Chưa có banner sự kiện</div>}</div>
            <div className="flex flex-wrap gap-2 sm:flex-col"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Chọn ảnh banner" onChange={(event) => { selectFile(event.target.files?.[0] || null); event.target.value = ''; }}/><button type="button" onClick={() => fileInput.current?.click()} className={secondary}><Upload size={16}/>Tải ảnh lên</button><button type="button" disabled={!imageUrl} onClick={() => { setFile(null); setField('image_url', ''); setFileError(''); }} className={secondary}><Trash2 size={16}/>Xóa ảnh</button><p className="w-full text-xs leading-5 text-slate-500">JPG, PNG, WEBP · tối đa 2 MB<br/>Tỷ lệ gợi ý 1200 × 630 px.</p></div>
          </div>{fileError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{fileError}</p>}
        </section>
      </main>

      <aside className="min-w-0 space-y-4">
        <section className={card} aria-labelledby="settings-title"><h2 id="settings-title" className="mb-4 flex items-center gap-2 text-base font-black text-[#003375]"><Settings2 size={18}/>Thiết lập nhanh</h2>
          <fieldset><legend className={label}>Trạng thái xuất bản</legend><div className="space-y-2">{([[EVENT_DRAFT_STATUS, 'Bản nháp'], [EVENT_PUBLIC_STATUS, 'Công khai']] as const).map(([value, title]) => <label key={value} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm"><input type="radio" name="event-status" value={value} checked={draft.status === value} onChange={() => setField('status', value)} className="accent-[#0052cc]"/>{title}</label>)}</div></fieldset>
          <label className="mt-4 flex items-center gap-3 border-t border-slate-200 pt-4 text-sm"><input type="checkbox" checked={draft.is_manually_closed} onChange={(event) => setField('is_manually_closed', event.target.checked)} className="h-4 w-4 accent-[#0052cc]"/>Tạm đóng đăng ký</label>
        </section>
        <section className={card} aria-labelledby="post-info-title"><h2 id="post-info-title" className="mb-3 text-base font-black text-[#003375]">Thông tin bài đăng</h2><dl className="space-y-2 text-xs">{[['Mã sự kiện', 'Tự động tạo sau khi lưu'], ['Người tạo', creator], ['Ngày tạo', 'Tự động sau khi lưu'], ['Trạng thái', draft.status === EVENT_DRAFT_STATUS ? 'Bản nháp' : 'Công khai']].map(([title, value]) => <div key={title} className="flex min-w-0 justify-between gap-3 border-t border-slate-100 py-1"><dt className="shrink-0 text-slate-500">{title}</dt><dd className="min-w-0 break-words text-right font-semibold text-slate-700">{value}</dd></div>)}</dl></section>
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-[#003375]" aria-labelledby="event-note-title"><h2 id="event-note-title" className="flex items-center gap-2 font-black"><Info size={17}/>Lưu ý</h2><p className="mt-2 text-xs leading-5">Sự kiện sau khi công khai sẽ xuất hiện trong danh sách dành cho sinh viên. Hãy kiểm tra thời gian, điểm rèn luyện và đường dẫn trước khi tạo.</p></section>
      </aside>
    </form>
    {preview && <div role="dialog" aria-modal="true" aria-label="Xem trước sự kiện" className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/60 p-3 sm:p-6"><div className="mx-auto max-w-5xl rounded-lg bg-white p-4 sm:p-6"><div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3"><h2 className="font-black text-[#003375]">Xem trước bản nháp</h2><button type="button" onClick={() => setPreview(false)} className={secondary}><X size={16}/>Đóng</button></div><EventDetailView event={detail} preview canEdit={false} isRegistrationClosed={draft.is_manually_closed} isParticipated={false} onBack={() => setPreview(false)} recordView={false}/></div></div>}
  </div>;
};
