import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { uploadAdminEventBanner } from '../utils/eventsApi';

interface Props {
  eventId: string;
  eventName: string;
  onClose: () => void;
  onReplace: (eventId: string, imageUrl: string) => Promise<void>;
}

const MAX_BANNER_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const AdminEventBannerUpload: React.FC<Props> = ({ eventId, eventName, onClose, onReplace }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Reuse the uploaded object if the event PATCH fails; do not upload it twice.
  const [uploadedUrl, setUploadedUrl] = useState('');

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selectFile = (next: File | undefined) => {
    setError('');
    setUploadedUrl('');
    setConfirmed(false);
    if (!next) { setFile(null); return; }
    if (!IMAGE_TYPES.has(next.type)) { setFile(null); setError('Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.'); return; }
    if (!next.size || next.size > MAX_BANNER_BYTES) { setFile(null); setError('Ảnh phải có dung lượng tối đa 2 MB.'); return; }
    setFile(next);
  };

  const save = async () => {
    if (!file || !confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      const imageUrl = uploadedUrl || await uploadAdminEventBanner(file);
      setUploadedUrl(imageUrl);
      await onReplace(eventId, imageUrl);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật banner. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="banner-upload-title" className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="banner-upload-title" className="text-lg font-black text-[#003375]">Bổ sung banner sự kiện #{eventId}</h2>
            <p className="mt-1 break-words text-sm text-slate-600">{eventName}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={20}/></button>
        </div>
        <p className="mt-4 text-sm text-slate-600">Chỉ chọn banner gốc đúng sự kiện mà bạn được phép sử dụng. Ảnh sẽ được lưu trên R2; đường dẫn cũ chỉ được thay sau khi tải ảnh thành công.</p>
        <label className="mt-4 block text-sm font-bold text-slate-700" htmlFor="event-banner-file">Ảnh banner (JPG, PNG, WEBP; tối đa 2 MB)</label>
        <input id="event-banner-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => selectFile(event.target.files?.[0])} className="mt-2 block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-bold file:text-[#0052cc]"/>
        {preview && <img src={preview} alt="Xem trước banner được chọn" className="mt-4 aspect-[1.91] w-full rounded-md border border-slate-200 object-contain"/>}
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={confirmed} disabled={!file || busy} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1"/><span>Tôi xác nhận đây là ảnh đúng sự kiện và có quyền sử dụng.</span></label>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Hủy</button>
          <button type="button" onClick={() => { void save(); }} disabled={!file || !confirmed || busy} className="inline-flex items-center gap-2 rounded-md bg-[#0052cc] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin"/> : <ImagePlus size={16}/>}Tải lên R2 và cập nhật</button>
        </div>
      </section>
    </div>, document.body,
  );
};
