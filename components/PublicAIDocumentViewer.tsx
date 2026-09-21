import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, ExternalLink } from 'lucide-react';
import { aiDocumentCategoryLabel } from '../shared/ai-document-categories';

type PublicDocument = {
  id: string;
  title: string;
  category: string | null;
  academicYear: string | null;
  publicViewPolicy: 'local_rehost' | 'official_link';
  officialSourceUrl?: string;
  mimeType: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PdfCanvasViewer: React.FC<{ documentId: string; title: string }> = ({ documentId, title }) => {
  const canvasHost = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState('Đang tải tài liệu…');

  useEffect(() => {
    let disposed = false;
    let destroyPdf: (() => Promise<void> | void) | null = null;
    const render = async () => {
      try {
        const response = await fetch(`/api/public/v1/ai-documents/${encodeURIComponent(documentId)}/file`, {
          headers: { Accept: 'application/pdf' }, cache: 'no-store',
        });
        if (!response.ok) throw new Error('not-found');
        const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
          import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        GlobalWorkerOptions.workerSrc = workerModule.default;
        const loaded = await getDocument({ data: await response.arrayBuffer() }).promise;
        destroyPdf = () => loaded.destroy();
        const host = canvasHost.current;
        if (!host || disposed) return;
        host.replaceChildren();
        for (let pageNumber = 1; pageNumber <= loaded.numPages; pageNumber += 1) {
          if (disposed) return;
          setProgress(`Đang hiển thị trang ${pageNumber}/${loaded.numPages}…`);
          const page = await loaded.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.className = 'mx-auto max-w-full rounded-sm bg-white shadow-sm';
          const context = canvas.getContext('2d', { alpha: false });
          if (!context) throw new Error('canvas');
          await page.render({ canvasContext: context, viewport }).promise;
          if (disposed) return;
          host.append(canvas);
          page.cleanup();
        }
        if (!disposed) setState('ready');
      } catch {
        if (!disposed) setState('error');
      } finally {
        await destroyPdf?.();
      }
    };
    void render();
    return () => { disposed = true; };
  }, [documentId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 sm:p-5" aria-label={`Trình xem ${title}`}>
      {state === 'loading' && <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-600"><Loader2 className="animate-spin" size={18} />{progress}</div>}
      {state === 'error' && <p className="p-8 text-center text-sm text-slate-600">Không thể hiển thị tài liệu này.</p>}
      <div ref={canvasHost} className={state === 'ready' ? 'space-y-4' : 'hidden'} />
    </div>
  );
};

export const PublicAIDocumentViewer: React.FC = () => {
  const documentId = window.location.pathname.split('/').filter(Boolean).at(-1) || '';
  const [document, setDocument] = useState<PublicDocument | null>(null);
  const [state, setState] = useState<'loading' | 'not-found' | 'error'>('loading');

  useEffect(() => {
    if (!UUID.test(documentId)) { setState('not-found'); return; }
    let active = true;
    void fetch(`/api/public/v1/ai-documents/${encodeURIComponent(documentId)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? 'not-found' : 'error');
        return response.json() as Promise<PublicDocument>;
      })
      .then((payload) => { if (active) { setDocument(payload); setState('loading'); } })
      .catch((error) => { if (active) setState(error.message === 'not-found' ? 'not-found' : 'error'); });
    return () => { active = false; };
  }, [documentId]);

  if (!document) {
    const message = state === 'loading' ? 'Đang tải tài liệu…' : state === 'not-found' ? 'Không tìm thấy tài liệu.' : 'Không thể tải tài liệu lúc này.';
    return <main className="min-h-screen bg-[#F7F9FC] px-4 py-16"><div className="mx-auto max-w-3xl rounded-xl border bg-white p-8 text-center text-slate-600">{message}</div></main>;
  }
  const officialHost = document.officialSourceUrl ? new URL(document.officialSourceUrl).hostname : null;
  return (
    <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 sm:py-12">
      <article className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7">
        <header className="mb-6 border-b border-slate-200 pb-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0052CC]"><FileText size={18} /> Tài liệu tham khảo</div>
          <h1 className="text-xl font-black text-[#003375] sm:text-2xl">{document.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            {document.category && <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">{aiDocumentCategoryLabel(document.category)}</span>}
            {document.academicYear && <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">Năm học: {document.academicYear}</span>}
            {officialHost && <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">Nguồn: {officialHost}</span>}
          </div>
        </header>
        {document.publicViewPolicy === 'local_rehost' && document.mimeType === 'application/pdf' && <PdfCanvasViewer documentId={document.id} title={document.title} />}
        {document.publicViewPolicy === 'local_rehost' && document.mimeType !== 'application/pdf' && <p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-600">Trình xem trực tiếp hiện hỗ trợ định dạng PDF.</p>}
        {document.publicViewPolicy === 'official_link' && document.officialSourceUrl && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
            <p className="mb-4 text-sm text-slate-600">Tài liệu được cung cấp tại nguồn chính thức.</p>
            <a href={document.officialSourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-[#0052CC] px-4 py-2.5 text-sm font-bold text-white"><ExternalLink size={16} /> Xem tại nguồn chính thức</a>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-slate-500">Văn bản được cung cấp để tham khảo.</p>
      </article>
    </main>
  );
};

export default PublicAIDocumentViewer;
