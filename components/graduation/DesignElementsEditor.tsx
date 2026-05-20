import React from 'react';
import { ImagePlus, Trash2, Type, Upload } from 'lucide-react';
import { uploadImage } from './upload';
import { DesignElement, DesignElementEffect, DesignElementSection, InvitationProject } from './types';

interface DesignElementsEditorProps {
  project: InvitationProject;
  selectedElementId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (project: InvitationProject) => void;
}

const effects: DesignElementEffect[] = ['fadeInUp', 'fadeInLeft', 'fadeInRight', 'zoomIn', 'flipIn', 'float'];
const effectLabels: Record<DesignElementEffect, string> = {
  fadeInUp: 'Fade lên',
  fadeInLeft: 'Trượt từ trái',
  fadeInRight: 'Trượt từ phải',
  zoomIn: 'Phóng to',
  flipIn: 'Lật vào',
  float: 'Bay nhẹ',
};
const stickers = ['🎓', '📜', '🏅', '⭐', '✦', '✧', '🎉', '📘', '🎖️', '2026', 'Class', 'Honor'];
const sections: DesignElementSection[] = ['global', 'hero', 'eventInfo', 'message', 'graduateInfo', 'gallery', 'timeline', 'map', 'rsvp', 'footer'];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-[#003375]';

const newId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;

const defaultElement = (value: string, type: DesignElement['type']): DesignElement => ({
  id: newId(type),
  type,
  section: 'hero',
  label: type === 'image' ? 'Ảnh trang trí' : type === 'text' ? 'Text tự do' : `Sticker ${value}`,
  value,
  x: 292,
  y: 92,
  width: type === 'image' ? 96 : type === 'text' ? 168 : 58,
  height: type === 'image' ? 120 : type === 'text' ? 58 : 58,
  rotation: -8,
  opacity: 1,
  effect: 'float',
  zIndex: 20,
});

export const DesignElementsEditor = ({ project, selectedElementId, onSelect, onChange }: DesignElementsEditorProps) => {
  const elements = project.designElements || [];
  const selected = elements.find((item) => item.id === selectedElementId) || elements[0] || null;

  const setElements = (next: DesignElement[], nextSelectedId = selectedElementId) => {
    onChange({ ...project, designElements: next });
    onSelect(nextSelectedId || null);
  };

  const updateSelected = (patch: Partial<DesignElement>) => {
    if (!selected) return;
    const updated = { ...selected, ...patch };
    setElements(elements.map((item) => (item.id === selected.id ? updated : item)), updated.id);
  };

  const addSticker = (value: string) => {
    const next = defaultElement(value, 'sticker');
    setElements([...elements, next], next.id);
  };

  const addText = () => {
    const next = defaultElement('Class of 2026', 'text');
    next.x = 126;
    next.y = 150;
    next.effect = 'fadeInUp';
    setElements([...elements, next], next.id);
  };

  const addImage = async (file?: File) => {
    if (!file) return;
    const next = defaultElement(await uploadImage(file), 'image');
    next.label = file.name;
    setElements([...elements, next], next.id);
  };

  const removeSelected = () => {
    if (!selected) return;
    const next = elements.filter((item) => item.id !== selected.id);
    setElements(next, next[0]?.id || null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-black text-slate-950">Sticker & ảnh tự do</h3>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
          Chọn element rồi kéo trực tiếp trong preview. Dùng panel này để chỉnh rộng, cao, vị trí, xoay và hiệu ứng.
        </p>
      </div>

      <div className="rounded-2xl bg-slate-50 p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Thêm sticker</p>
        <div className="grid grid-cols-5 gap-2">
          {stickers.map((item) => (
            <button key={item} type="button" onClick={() => addSticker(item)} className="h-11 rounded-xl bg-white text-xl shadow-sm hover:bg-blue-50">
              {item}
            </button>
          ))}
        </div>
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-black text-slate-600">
          <ImagePlus size={15} /> Thêm ảnh trang trí
          <input type="file" accept="image/*" className="hidden" onChange={(event) => addImage(event.target.files?.[0])} />
        </label>
        <button type="button" onClick={addText} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#003375] px-3 py-3 text-xs font-black text-white">
          <Type size={15} /> Thêm text tự do
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Layer</p>
        <div className="max-h-44 space-y-2 overflow-y-auto">
          {elements.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-black ${selected?.id === item.id ? 'bg-[#003375] text-white' : 'bg-slate-50 text-slate-700'}`}
            >
              <span className="truncate">{item.type === 'sticker' ? item.value : item.type === 'text' ? 'Text' : 'Ảnh'} · {item.label}</span>
              <span className="opacity-70">{item.section}</span>
            </button>
          ))}
          {!elements.length && <p className="rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">Chưa có sticker/ảnh tự do.</p>}
        </div>
      </div>

      {selected && (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <b className="text-sm text-slate-900">Đang chỉnh: {selected.label}</b>
            <button type="button" onClick={removeSelected} className="rounded-xl bg-red-50 p-2 text-red-600"><Trash2 size={15} /></button>
          </div>

          <label className="block text-xs font-black text-slate-500">
            Tên layer
            <input value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} className={`${inputClass} mt-1`} />
          </label>

          {selected.type === 'sticker' || selected.type === 'text' ? (
            <label className="block text-xs font-black text-slate-500">
              Nội dung
              <input value={selected.value} onChange={(event) => updateSelected({ value: event.target.value })} className={`${inputClass} mt-1`} />
            </label>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs font-black text-slate-600">
              <Upload size={15} /> Thay ảnh
              <input type="file" accept="image/*" className="hidden" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) updateSelected({ value: await uploadImage(file), label: file.name });
              }} />
            </label>
          )}

          <label className="block text-xs font-black text-slate-500">
            Section hiển thị
            <select value={selected.section} onChange={(event) => updateSelected({ section: event.target.value as DesignElementSection })} className={`${inputClass} mt-1`}>
              {sections.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            {[
              ['x', 'X'],
              ['y', 'Y'],
              ['width', 'Rộng'],
              ['height', 'Cao'],
              ['rotation', 'Xoay'],
              ['zIndex', 'Layer'],
            ].map(([key, label]) => (
              <label key={key} className="block text-xs font-black text-slate-500">
                {label}
                <input type="number" value={(selected as any)[key]} onChange={(event) => updateSelected({ [key]: Number(event.target.value) } as any)} className={`${inputClass} mt-1`} />
              </label>
            ))}
          </div>

          <label className="block text-xs font-black text-slate-500">
            Độ trong suốt: {Math.round(selected.opacity * 100)}%
            <input type="range" min={0.1} max={1} step={0.05} value={selected.opacity} onChange={(event) => updateSelected({ opacity: Number(event.target.value) })} className="mt-2 w-full" />
          </label>

          <label className="block text-xs font-black text-slate-500">
            Hiệu ứng
            <select value={selected.effect} onChange={(event) => updateSelected({ effect: event.target.value as DesignElementEffect })} className={`${inputClass} mt-1`}>
              {effects.map((item) => <option key={item} value={item}>{effectLabels[item]}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
};
