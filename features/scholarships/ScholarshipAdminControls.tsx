import React, { useEffect, useRef } from 'react';

export function AdminErrorNotice({message, retry}: {message?: string | null; retry?: () => void}) {
  if (!message) return null;
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
    <p>{message}</p>{retry && <button type="button" onClick={retry} className="mt-2 underline">Thử lại</button>}
  </div>;
}
export function AdminPagination({label, page, total, loading, onPage}: {
  label: string; page: number; total: number; loading: boolean; onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 20));
  return <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 text-xs">
    <span>Tổng số: {total}</span><div className="flex items-center gap-2">
      <button type="button" className="scholarship-button" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Trước</button>
      <span aria-live="polite">Trang {page} / {pages}</span>
      <button type="button" className="scholarship-button" disabled={loading || page >= pages} onClick={() => onPage(page + 1)}>Sau</button>
    </div>
  </nav>;
}
export function AdminModal({title, busy, close, children}: {
  title: string; busy: boolean; close: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) close(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} tabIndex={-1}
      className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 text-xs shadow-xl"
      onKeyDown={e => {
        if (e.key === 'Escape' && !busy) { e.stopPropagation(); close(); }
        if (e.key === 'Tab') {
          const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || []);
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (!first) { e.preventDefault(); return; }
          if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
          if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
        }
      }}>
      <h2 className="text-base font-semibold">{title}</h2>{children}
    </div>
  </div>;
}
