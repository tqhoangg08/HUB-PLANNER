import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadEventDrlCatalog, requestEventDrlPrediction,
  type EventDrlDraft, type EventDrlPrediction, type EventDrlRule } from '../utils/eventDrlApi';

export const RECOGNITION_TYPES = [
  'Không có / Chưa xác định', 'Giấy chứng nhận', 'Giấy khen', 'Bằng khen',
  'Chứng nhận tham gia', 'Chứng nhận đạt giải', 'Khác',
] as const;
const inputClass = 'min-h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#0052cc] focus:outline-none focus:ring-2 focus:ring-blue-100';

export const useEventDrlAssistant = (draft: EventDrlDraft, enabled = true, predict = true) => {
  const [rules, setRules] = useState<EventDrlRule[]>([]);
  const [organizers, setOrganizers] = useState<string[]>([]);
  const [prediction, setPrediction] = useState<EventDrlPrediction | null>(null);
  const [predictionError, setPredictionError] = useState(false);
  const fingerprint = useMemo(() => JSON.stringify({ title: draft.title.trim(), organizer: draft.organizer?.trim(),
    description: draft.description?.trim(), format: draft.format?.trim() }),
  [draft.title, draft.organizer, draft.description, draft.format]);
  const lastRequested = useRef('');
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadEventDrlCatalog().then((catalog) => {
      if (!cancelled) { setRules(catalog.rules); setOrganizers(catalog.organizers); }
    }).catch(() => { if (!cancelled) setPredictionError(true); });
    return () => { cancelled = true; };
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !predict || draft.title.trim().length < 5 || lastRequested.current === fingerprint) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      lastRequested.current = fingerprint;
      void requestEventDrlPrediction(draft, controller.signal).then(({ prediction: next }) => {
        if (!controller.signal.aborted) { setPrediction(next); setPredictionError(false); }
      }).catch(() => { if (!controller.signal.aborted) setPredictionError(true); });
    }, 900);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled, predict, fingerprint, draft.title, draft.organizer, draft.description, draft.format]);
  return { rules, organizers, prediction, predictionError };
};

export const OrganizerPicker: React.FC<{
  value: string; onChange: (value: string) => void; organizers: string[]; id?: string;
}> = ({ value, onChange, organizers, id = 'event-organizer' }) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const choices = organizers.filter((name) => name.toLocaleLowerCase('vi-VN')
    .includes(value.toLocaleLowerCase('vi-VN'))).slice(0, 20);
  return <div className="relative min-w-0">
    <input id={id} className={inputClass} value={value} maxLength={300}
      onChange={(event) => { onChange(event.target.value); setOpen(!custom); }}
      onFocus={() => setOpen(!custom)} onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      placeholder={custom ? 'Nhập đơn vị tổ chức' : 'Tìm đơn vị tổ chức'}
      role="combobox" aria-expanded={open} aria-autocomplete="list" />
    {open && !custom && <div role="listbox" className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
      {choices.map((name) => <button type="button" role="option" aria-selected={name === value} key={name}
        className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50" onMouseDown={(event) => event.preventDefault()}
        onClick={() => { onChange(name); setOpen(false); }}>{name}</button>)}
      <button type="button" role="option" aria-selected={false}
        className="block w-full border-t border-slate-200 px-3 py-2 text-left text-sm font-semibold text-[#0052cc] hover:bg-blue-50"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setCustom(true); setOpen(false); onChange(''); }}>Không tìm thấy, thêm đơn vị khác</button>
    </div>}
  </div>;
};

export const EventDrlRulePicker: React.FC<{
  rules: EventDrlRule[]; selectedRuleId: string; prediction: EventDrlPrediction | null;
  onSelect: (rule: EventDrlRule | null) => void;
}> = ({ rules, selectedRuleId, prediction, onSelect }) => {
  const selected = rules.find((rule) => rule.rule_id === selectedRuleId) || null;
  const suggested = rules.find((rule) => rule.rule_id === prediction?.rule_id) || null;
  return <div className="space-y-2">
    <label htmlFor="event-drl-rule" className="block text-xs font-bold text-slate-700">Quy tắc ĐRL chính thức</label>
    <select id="event-drl-rule" className={inputClass} value={selectedRuleId} onChange={(event) =>
      onSelect(rules.find((rule) => rule.rule_id === event.target.value) || null)}>
      <option value="">Chọn mục ĐRL</option>
      {['I', 'II', 'III', 'IV', 'V'].map((section) => <optgroup key={section} label={`Mục ${section}`}>
        {rules.filter((rule) => rule.section === section).map((rule) => <option key={rule.rule_id} value={rule.rule_id}>
          {rule.content} · {rule.condition_text || 'Tham gia'} · {rule.points > 0 ? '+' : ''}{rule.points} điểm
        </option>)}
      </optgroup>)}
    </select>
    {selected && <p className="text-xs text-slate-600">Mục {selected.section} · {selected.condition_text || selected.content} · {selected.points > 0 ? '+' : ''}{selected.points} điểm</p>}
    {prediction && <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-[#003375]">
      <strong>AI gợi ý ĐRL</strong>
      {suggested ? <><p className="mt-1">Mục {suggested.section} · {suggested.condition_text || suggested.content} · {suggested.points > 0 ? '+' : ''}{suggested.points} điểm · {prediction.confidence_label === 'high' ? 'Cao' : prediction.confidence_label === 'medium' ? 'Trung bình' : 'Thấp'}</p>
        <button type="button" className="mt-2 rounded border border-blue-300 bg-white px-2 py-1 font-semibold" onClick={() => onSelect(suggested)}>Áp dụng</button></>
        : <p className="mt-1">Chưa đủ dữ liệu để xác định chắc chắn. Vui lòng chọn mục ĐRL.</p>}
    </div>}
  </div>;
};

export const RecognitionFields: React.FC<{
  type: string; note: string; onType: (value: string) => void; onNote: (value: string) => void;
}> = ({ type, note, onType, onNote }) => <div className="grid gap-3 sm:grid-cols-2">
  <div><label className="mb-1 block text-xs font-bold text-slate-700">Chứng nhận / Khen thưởng</label>
    <select className={inputClass} value={type} onChange={(event) => onType(event.target.value)}>
      {RECOGNITION_TYPES.map((entry) => <option key={entry}>{entry}</option>)}
    </select></div>
  <div><label className="mb-1 block text-xs font-bold text-slate-700">Chi tiết chứng nhận (tùy chọn)</label>
    <input className={inputClass} value={note} maxLength={500} onChange={(event) => onNote(event.target.value)}
      placeholder={type === 'Khác' ? 'Nhập loại chứng nhận khác và chi tiết' : 'Ví dụ: Giải Nhì'} /></div>
</div>;
