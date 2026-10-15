import React, { useEffect, useId, useMemo, useState } from 'react';
import { CURRENT_DRL_YEAR, DRL_POLICY_VERSION, LEGACY_DRL_POLICY, policyForAcademicYear } from '../utils/drlPolicy';
import { DRL_NOTES } from '../utils/drlPolicy2026';
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
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading');
  const fingerprint = useMemo(() => JSON.stringify({ title: draft.title.trim(), organizer: draft.organizer?.trim(),
    description: draft.description?.trim(), format: draft.format?.trim(),
    policy: draft.drl_policy_version, year: draft.drl_academic_year }),
  [draft.title, draft.organizer, draft.description, draft.format, draft.drl_policy_version, draft.drl_academic_year]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadEventDrlCatalog().then((catalog) => {
      if (!cancelled) { setRules(catalog.rules); setOrganizers(catalog.organizers); setCatalogState('ready'); }
    }).catch(() => { if (!cancelled) { setCatalogState('error'); setPredictionError(true); } });
    return () => { cancelled = true; };
  }, [enabled]);
  useEffect(() => {
    setPrediction(null);
    if (!enabled || !predict || draft.title.trim().length < 5) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void requestEventDrlPrediction(draft, controller.signal).then(({ prediction: next }) => {
        if (!controller.signal.aborted) { setPrediction(next); setPredictionError(false); }
      }).catch(() => { if (!controller.signal.aborted) setPredictionError(true); });
    }, 900);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled, predict, fingerprint, draft.title, draft.organizer, draft.description, draft.format]);
  return { rules, organizers, prediction, predictionError, catalogState };
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
  academicYear?: string;
  policyVersion?: string;
  onContextChange?: (context: { drl_policy_version: string; drl_academic_year: string }) => void;
  catalogState?: 'loading' | 'ready' | 'error';
}> = ({ rules, selectedRuleId, prediction, onSelect, academicYear, policyVersion, onContextChange, catalogState }) => {
  const id = useId();
  const [search, setSearch] = useState('');
  const [policy, setPolicy] = useState(policyVersion || DRL_POLICY_VERSION as string);
  const [year, setYear] = useState(academicYear || CURRENT_DRL_YEAR);
  const selected = rules.find((rule) => rule.rule_id === selectedRuleId) || null;
  useEffect(() => {
    if (selectedRuleId) {
      const version = selected?.policy_version || policyVersion || (selectedRuleId.startsWith(DRL_POLICY_VERSION) ? DRL_POLICY_VERSION : LEGACY_DRL_POLICY);
      setPolicy(version); setYear(academicYear || (version === DRL_POLICY_VERSION ? CURRENT_DRL_YEAR : ''));
    } else if (academicYear) {
      setYear(academicYear);
      if (policyVersion) setPolicy(policyVersion);
    }
  }, [selectedRuleId, selected?.policy_version, academicYear, policyVersion]);
  let validYear = false;
  try { validYear = policyForAcademicYear(year) === policy; } catch { /* Validation message below. */ }
  const eligible = rules.filter((rule) => rule.policy_version === policy && rule.active !== 0 && rule.event_suitable !== 0 && Number.isSafeInteger(rule.points));
  const choices = eligible.filter((rule) => [rule.content, rule.condition_text, rule.unit].join(' ').toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const suggested = !prediction?.stale && prediction?.policy_version === policy && prediction?.academic_year === year
    ? eligible.find((rule) => rule.rule_id === prediction?.rule_id) || null : null;
  const choose = (rule: EventDrlRule | null) => onSelect(rule ? { ...rule, academic_year: year } : null);
  return <div className="space-y-2">
    <label className="block text-xs font-bold text-slate-700">Phiên bản quy chế
      <select className={`${inputClass} mt-1`} value={policy} onChange={(event) => {
        const version = event.target.value, nextYear = version === DRL_POLICY_VERSION ? CURRENT_DRL_YEAR : '';
        setPolicy(version); setYear(nextYear); choose(null);
        onContextChange?.({ drl_policy_version: version, drl_academic_year: nextYear });
      }}><option value={DRL_POLICY_VERSION}>5549/QĐ-ĐHNH — từ 2026–2027</option><option value={LEGACY_DRL_POLICY}>Lịch sử — nguồn quy chế chưa xác minh</option></select>
    </label>
    <label className="block text-xs font-bold text-slate-700">Năm học áp dụng
      <input className={`${inputClass} mt-1`} placeholder="2026-2027" value={year} maxLength={9} onChange={(event) => {
        setYear(event.target.value); choose(null); onContextChange?.({ drl_policy_version: policy, drl_academic_year: event.target.value });
      }}/>
    </label>
    {!validYear && <p role="status" className="text-xs text-amber-800">Nhập năm học hợp lệ và khớp phiên bản; chưa thể chọn quy tắc mới. Dữ liệu đã lưu được giữ nguyên.</p>}
    <label className="block text-xs">Tìm tiêu chí, vai trò, cấp tổ chức<input className={`${inputClass} mt-1`} value={search} onChange={(event) => setSearch(event.target.value)}/></label>
    <label htmlFor={id} className="block text-xs font-bold text-slate-700">{policy === DRL_POLICY_VERSION ? 'Quy tắc ĐRL chính thức' : 'Quy tắc ĐRL lịch sử'}</label>
    {(catalogState === 'error' || !rules.length) && <p role="status" className="text-xs text-amber-800">{catalogState === 'error' ? 'Không tải được danh mục. Tải lại trang để thử lại; quy tắc đã lưu được giữ nguyên.' : 'Danh mục chưa sẵn sàng. Chưa thể chọn quy tắc.'}</p>}
    <select id={id} className={inputClass} value={selectedRuleId} disabled={!validYear || !rules.length} onChange={(event) =>
      choose(eligible.find((rule) => rule.rule_id === event.target.value) || null)}>
      <option value="">Chọn mục ĐRL</option>
      {selectedRuleId && !choices.some((rule) => rule.rule_id === selectedRuleId) && <option value={selectedRuleId}>Đã lưu: {selected?.content || selectedRuleId} — giữ nguyên</option>}
      {['I', 'II', 'III', 'IV', 'V'].map((section) => <optgroup key={section} label={`Mục ${section}`}>
        {choices.filter((rule) => rule.section === section).map((rule) => <option key={rule.rule_id} value={rule.rule_id}>
          {rule.content} · {rule.condition_text || ''} · {rule.points > 0 ? '+' : ''}{rule.points} · {rule.unit || 'điểm cố định'}
        </option>)}
      </optgroup>)}
    </select>
    {selected && <p className="text-xs text-slate-600">Mục {selected.section} · {selected.content} · {selected.condition_text} · {selected.points > 0 ? '+' : ''}{selected.points} · {selected.unit || 'điểm cố định'}{selected.active === 0 || selected.event_suitable === 0 ? ' · Không còn cho phép chọn mới; giữ bản đã lưu.' : ''}</p>}
    {selectedRuleId && !selected && <p role="status" className="text-xs text-amber-800">Quy tắc đã lưu không có trong danh mục hiện tại. Giữ nguyên mã và điểm lịch sử; cần kiểm tra trước khi đổi.</p>}
    <p className="text-xs text-slate-600">{DRL_NOTES[0]} {DRL_NOTES[1]} Cần duyệt thủ công vai trò, cấp tổ chức và điều kiện công nhận.</p>
    {prediction && <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-[#003375]">
      <strong>AI gợi ý ĐRL</strong>
      {suggested ? <><p className="mt-1">Mục {suggested.section} · {suggested.condition_text || suggested.content} · {suggested.points > 0 ? '+' : ''}{suggested.points} điểm · {prediction.confidence_label === 'high' ? 'Cao' : prediction.confidence_label === 'medium' ? 'Trung bình' : 'Thấp'}</p>
        <button type="button" disabled={!validYear} className="mt-2 rounded border border-blue-300 bg-white px-2 py-1 font-semibold" onClick={() => choose(suggested)}>Áp dụng sau khi kiểm tra</button></>
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
