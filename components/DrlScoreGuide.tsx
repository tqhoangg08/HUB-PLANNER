import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DRL_APPENDIX_ROWS, DRL_NOTES, DRL_SECTIONS, DRL_SPECIAL_CASES } from '../utils/drlPolicy2026';
import { LEGACY_DRL_GUIDE } from '../utils/drlLegacyGuide';

export const DrlScoreGuideModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [legacy, setLegacy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,select,summary,[tabindex="0"]') || []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return createPortal(<div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 p-2 sm:p-5" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog} tabIndex={-1}
      className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white text-slate-800 shadow-xl focus:outline-none" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-3 bg-[#003375] p-4 text-white">
        <h2 id={titleId} className="font-bold">Phụ lục Đánh giá Kết quả Rèn luyện</h2>
        <button type="button" aria-label="Đóng phụ lục" onClick={onClose} className="rounded border border-white/50 px-3 py-1">Đóng</button>
      </header>
      <div className="space-y-4 overflow-y-auto p-3 sm:p-6" tabIndex={0}>
        <label className="block text-sm font-semibold">Phiên bản tra cứu
          <select className="mt-1 block w-full rounded border p-2" value={legacy ? 'legacy' : '2026'} onChange={(event) => setLegacy(event.target.value === 'legacy')}>
            <option value="2026">5549/QĐ-ĐHNH — từ năm học 2026–2027</option>
            <option value="legacy">Nội dung giao diện cũ — chưa xác minh nguồn quy chế</option>
          </select>
        </label>
        {legacy ? <>
          <p className="rounded bg-amber-50 p-3 text-sm">Bản lưu giao diện trước cập nhật, chỉ để đối chiếu lịch sử. Chưa xác minh quyết định và thời gian áp dụng.</p>
          {LEGACY_DRL_GUIDE.map((section) => <section key={section.id} className="rounded border p-3">
            <h3 className="font-bold">Mục {section.id} · {section.title} · {section.range}</h3>
            {section.content.map((row, index) => <p key={index} className="mt-2 text-sm">{row.text} {'points' in row ? row.points : ''}</p>)}
          </section>)}
        </> : <>
          <p className="text-sm">Quyết định 5549/QĐ-ĐHNH ngày 02/10/2026. Áp dụng từ năm học 2026–2027 (Điều 17). Nguồn: tệp Word chính thức do chủ dự án cung cấp, Phụ lục.</p>
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
          <p className="text-xs text-slate-600">Điểm cố định được giữ đúng cách ghi trong phụ lục. Việc chọn tiêu chí chưa phải xác nhận đủ điều kiện; cần duyệt cấp tổ chức, vai trò và minh chứng. Trường hợp đặc thù và quy trình phê duyệt thực hiện theo Điều 8–9 của Quy chế.</p>
        </>}
      </div>
    </div>
  </div>, document.body);
};
