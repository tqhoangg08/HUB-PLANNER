import React, { useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import {
  SCHEDULE_DAY_OPTIONS,
  SCHEDULE_SHIFT_OPTIONS,
  createEmptyScheduleSession,
  formatScheduleSession,
  getOverlappingSessionIndexes,
  inferScheduleShift,
  getScheduleSessionErrors,
  getSemesterWeekOptions,
  type StructuredScheduleSession,
} from '../utils/scheduleSessions';

interface ScheduleSessionsEditorProps {
  semester: string;
  value: StructuredScheduleSession[];
  onChange: (sessions: StructuredScheduleSession[]) => void;
  compact?: boolean;
  showSummary?: boolean;
}

const fieldClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#0056C7] focus:ring-1 focus:ring-[#0056C7]';

export const ScheduleSessionsEditor: React.FC<ScheduleSessionsEditorProps> = ({
  semester,
  value,
  onChange,
  compact = false,
  showSummary = false,
}) => {
  const weekOptions = useMemo(() => getSemesterWeekOptions(semester), [semester]);
  const overlaps = useMemo(() => getOverlappingSessionIndexes(value), [value]);
  const [bulkDay, setBulkDay] = useState('');
  const [bulkShift, setBulkShift] = useState('');
  const updateSession = (index: number, changes: Partial<StructuredScheduleSession>) => {
    onChange(value.map((session, current) => current === index ? { ...session, ...changes } : session));
  };
  const duplicateSession = (index: number) => {
    const source = value[index];
    onChange([...value.slice(0, index + 1), { ...source }, ...value.slice(index + 1)]);
  };
  const removeSession = (index: number) => onChange(value.filter((_, current) => current !== index));
  const applyDayToAll = () => {
    if (!bulkDay) return;
    onChange(value.map((session) => ({ ...session, dayOfWeek: Number(bulkDay) })));
  };
  const applyShiftToAll = () => {
    if (!bulkShift) return;
    onChange(value.map((session) => ({ ...session, ...shiftChanges(session, bulkShift as StructuredScheduleSession['shift']) })));
  };
  const shiftChanges = (session: StructuredScheduleSession, shift: StructuredScheduleSession['shift']) => ({
    shift,
    ...(session.startTime !== undefined && inferScheduleShift(session.startTime, session.endTime) !== shift
      ? { startTime: shift === 'S' ? '07:00' : shift === 'C' ? '13:00' : '', endTime: shift === 'S' ? '11:05' : shift === 'C' ? '17:05' : '' } : {}),
  });
  const timeFields = (session: StructuredScheduleSession, index: number) => (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
      <span>Giờ học:</span>
      <input type="time" aria-label={`Giờ bắt đầu buổi ${index + 1}`} value={session.startTime || ''} className="min-w-0 rounded border border-slate-200 px-2 py-1" onChange={event => updateSession(index, { startTime: event.target.value, endTime: session.endTime || '', shift: inferScheduleShift(event.target.value, session.endTime) })} />
      <span>–</span>
      <input type="time" aria-label={`Giờ kết thúc buổi ${index + 1}`} value={session.endTime || ''} className="min-w-0 rounded border border-slate-200 px-2 py-1" onChange={event => updateSession(index, { endTime: event.target.value, startTime: session.startTime || '', shift: inferScheduleShift(session.startTime, event.target.value) })} />
      {session.isEstimated && <span className="font-semibold text-amber-700">Lịch dự kiến — vui lòng kiểm tra</span>}
    </div>
  );

  const sessionFields = (session: StructuredScheduleSession, index: number, mobile = false) => {
    const errors = getScheduleSessionErrors(session, semester, overlaps.has(index));
    return <>
      <select aria-label={`Tuần học buổi ${index + 1}`} value={session.weeks[0] ?? ''} onChange={(event) => updateSession(index, { weeks: event.target.value ? [Number(event.target.value)] : [] })} className={fieldClass}>
        <option value="">Chọn tuần *</option>
        {weekOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select aria-label={`Thứ học buổi ${index + 1}`} value={session.dayOfWeek ?? ''} onChange={(event) => updateSession(index, { dayOfWeek: event.target.value ? Number(event.target.value) : null })} className={fieldClass}>
        <option value="">Chọn thứ *</option>
        {SCHEDULE_DAY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select aria-label={`Ca học buổi ${index + 1}`} value={session.shift} onChange={(event) => updateSession(index, shiftChanges(session, event.target.value as StructuredScheduleSession['shift']))} className={fieldClass}>
        <option value="">Chọn ca *</option>
        {SCHEDULE_SHIFT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <input aria-label={`Phòng học buổi ${index + 1}`} value={session.room} maxLength={120} onChange={(event) => updateSession(index, { room: event.target.value })} placeholder="Ví dụ: A101" className={fieldClass} />
      {mobile && errors.length > 0 && <p className="col-span-full text-[11px] font-semibold text-red-600" role="alert">{errors.join(' ')}</p>}
    </>;
  };

  const editor = <section className="min-w-0 space-y-3" aria-label="Các buổi học">
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <button type="button" onClick={() => onChange([...value, createEmptyScheduleSession()])} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#0056C7] px-2.5 text-xs font-bold text-white hover:bg-[#0047A5]"><Plus size={14} /> Thêm buổi</button>
      <span className="hidden h-5 w-px bg-slate-200 sm:block" />
      <select aria-label="Áp dụng thứ cho tất cả buổi" value={bulkDay} onChange={(event) => setBulkDay(event.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600"><option value="">Áp dụng thứ cho tất cả</option>{SCHEDULE_DAY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      <button type="button" onClick={applyDayToAll} disabled={!bulkDay || value.length === 0} className="h-8 rounded-md border border-slate-300 px-2 text-[11px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Áp dụng</button>
      <select aria-label="Áp dụng ca cho tất cả buổi" value={bulkShift} onChange={(event) => setBulkShift(event.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600"><option value="">Áp dụng ca cho tất cả</option>{SCHEDULE_SHIFT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      <button type="button" onClick={applyShiftToAll} disabled={!bulkShift || value.length === 0} className="h-8 rounded-md border border-slate-300 px-2 text-[11px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Áp dụng</button>
    </div>
    <div className="hidden overflow-hidden rounded-xl border border-slate-200 xl:block">
      <div className="grid grid-cols-[48px_minmax(185px,1.5fr)_110px_minmax(160px,1fr)_minmax(135px,1fr)_92px] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><span>Buổi</span><span>Tuần học</span><span>Thứ</span><span>Ca</span><span>Phòng</span><span>Thao tác</span></div>
      {value.map((session, index) => {
        const errors = getScheduleSessionErrors(session, semester, overlaps.has(index));
        return <div key={index} className="border-t border-slate-100 px-3 py-2"><div className="grid grid-cols-[48px_minmax(185px,1.5fr)_110px_minmax(160px,1fr)_minmax(135px,1fr)_92px] items-center gap-2"><span className="text-xs font-extrabold text-slate-700">{index + 1}</span>{sessionFields(session, index)}<div className="flex items-center gap-1"><button type="button" onClick={() => duplicateSession(index)} className="flex h-9 w-9 items-center justify-center rounded-md text-[#0056C7] hover:bg-blue-50" aria-label={`Nhân bản buổi ${index + 1}`} title="Nhân bản buổi"><Copy size={15} /></button><button type="button" onClick={() => removeSession(index)} disabled={value.length === 1} className="flex h-9 w-9 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-35" aria-label={`Xóa buổi ${index + 1}`} title="Xóa buổi"><Trash2 size={15} /></button></div></div>{timeFields(session, index)}{errors.length > 0 && <p className="ml-12 mt-1 text-[11px] font-semibold text-red-600" role="alert">{errors.join(' ')}</p>}</div>;
      })}
    </div>
    <div className="space-y-2 xl:hidden">{value.map((session, index) => <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-extrabold text-slate-800">Buổi {index + 1}</p><div className="flex gap-1"><button type="button" onClick={() => duplicateSession(index)} className="rounded-md p-1.5 text-[#0056C7] hover:bg-blue-50" aria-label={`Nhân bản buổi ${index + 1}`}><Copy size={15} /></button><button type="button" onClick={() => removeSession(index)} disabled={value.length === 1} className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30" aria-label={`Xóa buổi ${index + 1}`}><Trash2 size={15} /></button></div></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{sessionFields(session, index, true)}</div>{timeFields(session, index)}</div>)}</div>
  </section>;
  if (!showSummary || compact) return editor;
  return <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_225px]">{editor}<aside className="hidden rounded-xl border border-slate-200 bg-slate-50 p-3 xl:block"><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Tóm tắt lịch học</p><div className="mt-2 space-y-2">{value.map((session, index) => <div key={index} className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-5 text-slate-600"><p className="font-extrabold text-slate-800">Buổi {index + 1}</p>{formatScheduleSession(session).map((item, itemIndex) => <p key={itemIndex}>{item}</p>)}</div>)}</div></aside></div>;
};
