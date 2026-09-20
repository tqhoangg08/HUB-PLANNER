import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { privateApiRequest } from '../utils/privateApi';
import { showConfirm } from '../utils/appNotifications';
import { inspectPdfTextLayer, runPdfOcrInBrowser } from '../utils/aiDocumentOcr';

type AIDocument = {
  id: string;
  title: string;
  original_file_name: string;
  storage_path: string;
  file_size: number;
  category: string | null;
  academic_year: string | null;
  program_code: string | null;
  visibility: 'public' | 'program' | 'admin';
  indexing_status: string;
  indexing_error: string | null;
  ocr_status?: string;
  ocr_page_count?: number | null;
  ocr_used?: number;
  uploaded_by: string;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  pending: 'Chờ xử lý',
  uploading: 'Đang tải lên',
  processing: 'Đang lập chỉ mục',
  completed: 'Hoàn tất',
  failed: 'Thất bại',
  deleting: 'Đang xóa',
  deleted: 'Đã xóa',
};

const ocrStatusLabels: Record<string, string> = {
  not_checked: 'Chưa kiểm tra',
  not_applicable: 'Không cần OCR',
  processing: 'Đang nhận dạng',
  completed: 'OCR hoàn tất',
  failed: 'OCR lỗi',
};

export const AdminAIDocuments: React.FC = () => {
  const [items, setItems] = useState<AIDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Quy chế');
  const [academicYear, setAcademicYear] = useState('');
  const [programCode, setProgramCode] = useState('all');
  const [visibility, setVisibility] = useState<'public' | 'program' | 'admin'>('public');
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number; percent: number; stage: 'analyzing' | 'ocr' | 'upload' } | null>(null);
  const ocrAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      const response = await privateApiRequest(`/api/admin/v1/ai-documents?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Không tải được tài liệu.');
      setItems(payload.documents || []);
      setTotal(payload.total || 0);
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const active = items.filter((item) =>
      ['uploading', 'processing'].includes(item.indexing_status),
    );
    if (!active.length) return;
    const timer = setInterval(async () => {
      await Promise.all(
        active.map((item) =>
          privateApiRequest(`/api/admin/v1/ai-documents?id=${encodeURIComponent(item.id)}`),
        ),
      );
      load();
    }, 5000);
    return () => clearInterval(timer);
  }, [items, load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('Tài liệu tối đa 20 MB.');
      return;
    }

    const ocrAbort = new AbortController();
    ocrAbortRef.current = ocrAbort;
    setBusy(true);
    setError('');
    try {
      let ocr: { text: string; pageCount: number } | null = null;
      if (file.type === 'application/pdf') {
        setOcrProgress({ current: 0, total: 0, percent: 0, stage: 'analyzing' });
        const inspection = await inspectPdfTextLayer(file, ocrAbort.signal);
        if (!inspection.hasUsableText) {
          setOcrProgress({ current: 0, total: inspection.pageCount, percent: 0, stage: 'ocr' });
          const result = await runPdfOcrInBrowser(file, (current, total, percent) => {
            setOcrProgress({ current, total, percent, stage: 'ocr' });
          }, ocrAbort.signal);
          ocr = { text: result.text, pageCount: result.pageCount };
        }
      }
      setOcrProgress({ current: 0, total: 0, percent: 100, stage: 'upload' });
      const form = new FormData();
      form.set('file', file);
      form.set('title', title.trim() || file.name);
      form.set('category', category);
      form.set('academicYear', academicYear);
      form.set('programCode', programCode.trim() || 'all');
      form.set('visibility', visibility);
      if (ocr) {
        form.set('ocrText', ocr.text);
        form.set('ocrPageCount', String(ocr.pageCount));
        form.set('ocrUsed', 'true');
      }
      const response = await privateApiRequest('/api/admin/v1/ai-documents', {
        method: 'POST',
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Không thể lập chỉ mục.');
      setOpen(false);
      setFile(null);
      setTitle('');
      setPage(1);
      await load();
    } catch (cause: any) {
      setError(cause?.name === 'AbortError' ? 'Đã hủy nhận dạng văn bản trên thiết bị.' : cause.message);
    } finally {
      ocrAbortRef.current = null;
      setOcrProgress(null);
      setBusy(false);
    }
  };

  const mutate = async (item: AIDocument, action: 'retry' | 'delete') => {
    if (action === 'delete' && !(await showConfirm(`Xóa tài liệu “${item.title}”?`))) return;
    setError('');
    try {
      const response = await privateApiRequest(
        `/api/admin/v1/ai-documents${action === 'delete' ? `?id=${encodeURIComponent(item.id)}` : ''}`,
        {
          method: action === 'delete' ? 'DELETE' : 'POST',
          body: action === 'retry' ? JSON.stringify({ action: 'retry', id: item.id }) : undefined,
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Không thể thực hiện thao tác.');
      await load();
    } catch (cause: any) {
      setError(cause.message);
    }
  };

  const download = async (item: AIDocument) => {
    setError('');
    try {
      const response = await privateApiRequest(`/api/private/v1/ai-document-source/${encodeURIComponent(item.id)}`);
      const payload = await response.json() as { url?: string };
      if (!payload.url) throw new Error('Không thể mở tài liệu.');
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (cause: any) {
      setError(cause.message);
    }
  };

  const pages = Math.max(1, Math.ceil(total / 10));

  return (
    <div className="min-h-full bg-[#F7F9FC] p-4 sm:p-7">
      <div className="mx-auto max-w-[1480px]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-[#003375]">
              <BrainCircuit /> Kho tài liệu AI
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Quản lý tài liệu gốc riêng tư và trạng thái lập chỉ mục cho trợ lý HUB Planner.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex h-11 items-center gap-2 rounded-lg bg-[#0052CC] px-4 text-sm font-bold text-white"
          >
            <Upload size={17} /> Tải tài liệu
          </button>
        </div>

        <div className="mb-4 grid gap-3 rounded-xl border bg-white p-3 sm:grid-cols-[1fr_210px_auto]">
          <label className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm tên tài liệu..."
              className="h-11 w-full rounded-lg border pl-10 pr-3 text-sm outline-none focus:border-blue-500"
            />
          </label>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-lg border px-3 text-sm"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="completed">Hoàn tất</option>
            <option value="processing">Đang xử lý</option>
            <option value="failed">Thất bại</option>
          </select>
          <button
            onClick={load}
            title="Làm mới"
            aria-label="Làm mới danh sách tài liệu"
            className="h-11 rounded-lg border px-3"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b px-4 py-3 text-xs font-bold uppercase text-slate-500">
            {total} tài liệu
          </div>
          {loading ? (
            <div className="flex h-52 items-center justify-center">
              <Loader2 className="animate-spin text-blue-600" />
            </div>
          ) : !items.length ? (
            <div className="flex h-52 flex-col items-center justify-center text-sm text-slate-500">
              <FileText className="mb-2 text-slate-300" /> Chưa có tài liệu phù hợp.
            </div>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_170px_170px_130px_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-bold">{item.title}</div>
                    <div className="truncate text-xs text-slate-500">
                      {item.original_file_name} · {(item.file_size / 1024 / 1024).toFixed(1)} MB ·{' '}
                      {item.category || 'Chưa phân loại'}
                    </div>
                    {item.indexing_error && (
                      <div className="mt-1 text-xs text-red-600">{item.indexing_error}</div>
                    )}
                    {item.ocr_used === 1 && item.ocr_page_count && (
                      <div className="mt-1 text-xs text-slate-500">{item.ocr_page_count} trang · OCR tiếng Việt + Anh</div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {item.academic_year || 'Mọi năm'}
                    <br />
                    {item.program_code === 'all' ? 'Mọi ngành' : item.program_code}
                  </div>
                  <div className="text-xs text-slate-500">
                    {item.visibility === 'public'
                      ? 'Công khai'
                      : item.visibility === 'program'
                        ? 'Theo ngành'
                        : 'Chỉ admin'}
                    <br />
                    {new Date(item.created_at).toLocaleString('vi-VN')}
                    <br />
                    <span title={item.uploaded_by}>Người tải: {item.uploaded_by.slice(0, 8)}…</span>
                  </div>
                  <span
                    className={`w-fit rounded-full px-2 py-1 text-xs font-bold ${
                      item.indexing_status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : item.indexing_status === 'failed'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {statusLabels[item.indexing_status] || item.indexing_status}
                    {item.ocr_status && item.ocr_status !== 'not_applicable' && (
                      <span className="block pt-1 font-medium opacity-80">{ocrStatusLabels[item.ocr_status] || item.ocr_status}</span>
                    )}
                  </span>
                  <div className="flex">
                    <button
                      onClick={() => download(item)}
                      title="Tải file gốc"
                      aria-label={`Tải ${item.original_file_name}`}
                      className="p-2 text-slate-600 hover:text-blue-700"
                    >
                      <Download size={17} />
                    </button>
                    {item.indexing_status === 'failed' && (
                      <button
                        onClick={() => mutate(item, 'retry')}
                        title="Thử lại"
                        aria-label={`Thử lập chỉ mục lại ${item.title}`}
                        className="p-2 text-blue-600"
                      >
                        <RefreshCw size={17} />
                      </button>
                    )}
                    <button
                      onClick={() => mutate(item, 'delete')}
                      title="Xóa"
                      aria-label={`Xóa ${item.title}`}
                      className="p-2 text-red-600"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between border-t p-3 text-xs text-slate-500">
            <span>Trang {page}/{pages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                Trước
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-document-upload-title"
        >
          <form onSubmit={submit} className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
            <div className="flex justify-between border-b p-5">
              <div>
                <h2 id="ai-document-upload-title" className="font-black text-[#003375]">
                  Tải tài liệu vào kho AI
                </h2>
                <p className="text-xs text-slate-500">
                  PDF, DOC, DOCX, PPTX, XLSX, TXT, CSV · tối đa 20 MB
                </p>
              </div>
              <button type="button" onClick={() => { ocrAbortRef.current?.abort(); setOpen(false); }} aria-label="Đóng">
                <X />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <b>Chỉ tải lên tài liệu công khai hoặc được phép sử dụng.</b> Không tải bảng
                điểm chi tiết, CCCD, hồ sơ cá nhân hoặc dữ liệu nhạy cảm của sinh viên.
              </div>
              <label className="block text-sm font-bold">
                File
                <input
                  required
                  type="file"
                  accept=".pdf,.doc,.docx,.pptx,.xlsx,.txt,.csv"
                  onChange={(event) => {
                    const next = event.target.files?.[0] || null;
                    setFile(next);
                    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ''));
                  }}
                  className="mt-1 block w-full rounded-lg border p-3 font-normal"
                />
                {file?.type === 'application/pdf' && (
                  <small className="mt-2 block font-normal text-slate-500">
                    PDF scan sẽ được nhận dạng chữ trực tiếp trên thiết bị của quản trị viên trước khi tải lên.
                  </small>
                )}
              </label>
              <label className="block text-sm font-bold">
                Tiêu đề
                <input
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border px-3 font-normal"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  Danh mục
                  <input
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="mt-1 h-11 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Năm học
                  <input
                    value={academicYear}
                    onChange={(event) => setAcademicYear(event.target.value)}
                    placeholder="2026-2027"
                    className="mt-1 h-11 w-full rounded-lg border px-3 font-normal"
                  />
                </label>
              </div>
              <label className="block text-sm font-bold">
                Mã ngành áp dụng
                <input
                  value={programCode}
                  onChange={(event) => setProgramCode(event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border px-3 font-normal"
                />
                <small className="font-normal text-slate-500">Dùng “all” cho mọi ngành.</small>
              </label>
              <label className="block text-sm font-bold">
                Phạm vi tài liệu
                <select
                  value={visibility}
                  onChange={(event) =>
                    setVisibility(event.target.value as 'public' | 'program' | 'admin')
                  }
                  className="mt-1 h-11 w-full rounded-lg border px-3 font-normal"
                >
                  <option value="public">Công khai cho chatbot</option>
                  <option value="program">Chỉ sinh viên đúng ngành được mở file</option>
                  <option value="admin">Chỉ quản trị viên</option>
                </select>
                <small className="font-normal text-slate-500">
                  Phiên bản File Search hiện chỉ truy xuất tài liệu “Công khai cho chatbot”.
                </small>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t p-4">
              {ocrProgress && (
                <div className="mr-auto self-center text-xs text-slate-600" aria-live="polite">
                  {ocrProgress.stage === 'analyzing'
                    ? 'Đang phân tích PDF...'
                    : ocrProgress.stage === 'ocr'
                      ? `Đang OCR trang ${ocrProgress.current}/${ocrProgress.total} · ${ocrProgress.percent}%`
                      : 'Đang tải tài liệu và lập chỉ mục AI...'}
                </div>
              )}
              <button
                type="button"
                onClick={() => { ocrAbortRef.current?.abort(); setOpen(false); }}
                className="h-10 rounded-lg border px-4 font-bold"
              >
                {busy && ocrProgress?.stage === 'ocr' ? 'Hủy OCR' : 'Hủy'}
              </button>
              <button
                disabled={busy || !file}
                className="flex h-10 items-center gap-2 rounded-lg bg-[#0052CC] px-4 font-bold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="animate-spin" size={17} /> : <Upload size={17} />}
                Tải và lập chỉ mục
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminAIDocuments;
