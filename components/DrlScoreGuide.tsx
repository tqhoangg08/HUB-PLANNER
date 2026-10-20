import { Overlay } from './Overlay';
import React, { useEffect, useId, useRef } from 'react';
import { DRL_APPENDIX_ROWS, DRL_NOTES, DRL_SECTIONS, DRL_SPECIAL_CASES } from '../utils/drlPolicy2026';

export const DrlScoreGuideModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  // Parent callbacks can change during filtering/refetching; focus belongs to
  // the open/close lifecycle, while Escape must still call the latest callback.
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,select,summary,[tabindex="0"]') || []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [isOpen]);
  if (!isOpen) return null;
  return <Overlay className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 p-2 sm:p-5" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog} tabIndex={-1}
      className="flex min-w-0 max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white text-slate-800 shadow-xl focus:outline-none" onClick={(event) => event.stopPropagation()}>
      <header className="flex shrink-0 items-center justify-between gap-3 bg-[#003375] p-4 text-white">
        <h2 id={titleId} className="min-w-0 flex-1 font-bold">Phụ lục Đánh giá Kết quả Rèn luyện</h2>
        <button type="button" aria-label="Đóng phụ lục" onClick={onClose} className="min-h-[44px] min-w-[64px] shrink-0 whitespace-nowrap rounded border border-white/50 px-3 py-1">Đóng</button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-6" tabIndex={0}>
          {DRL_SECTIONS.map((section) => {
            const start = DRL_APPENDIX_ROWS.findIndex((row) => row[0] === section.id);
            const next = DRL_APPENDIX_ROWS.findIndex((row, index) => index > start && (['I','II','III','IV','V','TỔNG ĐIỂM'] as string[]).includes(row[0]));
            return <section key={section.id} className="overflow-hidden rounded-lg border border-slate-300">
              <h3 className="bg-blue-50 p-3 font-bold">Mục {section.id} · {section.title}<span className="mt-1 block text-sm">0 → {section.max_points} điểm</span></h3>
              <table className="w-full text-sm">{section.id === 'V' && <caption className="bg-slate-50 p-3 text-left font-semibold">Điểm cộng · Phụ lục không quy định nhóm điểm trừ tại Mục V</caption>}<thead className="sr-only"><tr><th>Nội dung đánh giá</th><th>Mức điểm</th></tr></thead>
                <tbody>{DRL_APPENDIX_ROWS.slice(start + 1, next).map((row, index) => <tr key={index} className="border-t border-slate-200">
                  <td className={`p-3 ${!row[2] ? 'bg-slate-50 font-semibold' : ''}`}>{row[1]}</td>
                  <td className={`w-28 p-3 align-top font-semibold ${row[2]?.startsWith('-') ? 'text-red-700' : 'text-[#003375]'}`}>{row[2]}</td>
                </tr>)}</tbody></table>
            </section>;
          })}
          <p className="font-bold">TỔNG ĐIỂM TỐI ĐA: 100 · Giới hạn từng mục: 25 / 20 / 20 / 15 / 20</p>
          <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm"><strong>Ghi chú</strong>{DRL_NOTES.map((note) => <p key={note}>{note}</p>)}</div>
          <details className="rounded border p-3 text-sm"><summary className="cursor-pointer font-semibold">Điều 8 — Các trường hợp đặc thù</summary>{DRL_SPECIAL_CASES.map((text) => <p key={text} className="mt-2">{text}</p>)}</details>
      </div>
    </div>
  </Overlay>;
};
