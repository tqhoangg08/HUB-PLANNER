import React, { useMemo } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import {
  SCHEDULE_DAY_OPTIONS,
  SCHEDULE_SHIFT_OPTIONS,
  createEmptyScheduleSession,
  getScheduleSessionErrors,
  getSemesterWeekOptions,
  type ScheduleSessionCatalogue,
  type StructuredScheduleSession,
} from '../utils/scheduleSessions';

interface ScheduleSessionsEditorProps {
  semester: string;
  value: StructuredScheduleSession[];
  onChange: (sessions: StructuredScheduleSession[]) => void;
  catalogue: ScheduleSessionCatalogue | null;
  catalogueLoading?: boolean;
  compact?: boolean;
}

export const ScheduleSessionsEditor: React.FC<ScheduleSessionsEditorProps> = ({
  semester,
  value,
  onChange,
  catalogue,
  catalogueLoading = false,
  compact = false,
}) => {
  const weekOptions = useMemo(() => getSemesterWeekOptions(semester), [semester]);
  const updateSession = (index: number, changes: Partial<StructuredScheduleSession>) => {
    onChange(value.map((session, current) => current === index ? { ...session, ...changes } : session));
  };
  const toggleWeek = (index: number, week: number) => {
    const current = value[index];
    const weeks = current.weeks.includes(week)
      ? current.weeks.filter((item) => item !== week)
      : [...current.weeks, week].sort((a, b) => a - b);
    updateSession(index, { weeks });
  };

  return (
    <section className="space-y-3" aria-label="Các buổi học">
      {value.map((session, index) => {
        const errors = getScheduleSessionErrors(session, semester, catalogue);
        const rooms = session.campus ? catalogue?.roomsByCampus[session.campus] || [] : [];
        return (
          <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold text-slate-800">Buổi {index + 1}</p>
              {value.length > 1 && (
                <button type="button" onClick={() => onChange(value.filter((_, current) => current !== index))} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700">
                  <Trash2 size={14} /> Xóa buổi
                </button>
              )}
            </div>
            <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-5'}`}>
              <details className="relative rounded-lg border border-slate-200 bg-white">
                <summary className="flex h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-semibold text-slate-700">
                  <span className="truncate">{session.weeks.length ? `${session.weeks.length} tuần đã chọn` : 'Chọn tuần *'}</span><ChevronDown size={14} />
                </summary>
                <div className="absolute z-20 mt-1 max-h-64 w-[min(20rem,calc(100vw-3rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  <div className="mb-2 flex gap-2 border-b border-slate-100 pb-2">
                    <button type="button" onClick={() => updateSession(index, { weeks: weekOptions.map((option) => option.value) })} className="text-[11px] font-bold text-[#0056C7]">Chọn tất cả</button>
                    <button type="button" onClick={() => updateSession(index, { weeks: [] })} className="text-[11px] font-bold text-slate-500">Bỏ chọn tất cả</button>
                  </div>
                  {weekOptions.map((option) => (
                    <label key={option.value} className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-xs ${option.isHoliday ? 'bg-amber-50 text-amber-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={session.weeks.includes(option.value)} onChange={() => toggleWeek(index, option.value)} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </details>
              <select aria-label={`Thứ học buổi ${index + 1}`} value={session.dayOfWeek ?? ''} onChange={(event) => updateSession(index, { dayOfWeek: event.target.value ? Number(event.target.value) : null })} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
                <option value="">Chọn thứ *</option>{SCHEDULE_DAY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select aria-label={`Ca học buổi ${index + 1}`} value={session.shift} onChange={(event) => updateSession(index, { shift: event.target.value as StructuredScheduleSession['shift'] })} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
                <option value="">Chọn ca *</option>{SCHEDULE_SHIFT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select aria-label={`Cơ sở buổi ${index + 1}`} value={session.campus} onChange={(event) => updateSession(index, { campus: event.target.value, room: '' })} disabled={catalogueLoading} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:bg-slate-100">
                <option value="">Chưa xác định</option>{catalogue?.campuses.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
              </select>
              <select aria-label={`Phòng học buổi ${index + 1}`} value={session.room} onChange={(event) => updateSession(index, { room: event.target.value })} disabled={!session.campus || catalogueLoading} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:bg-slate-100">
                <option value="">Chưa xác định</option>{rooms.map((room) => <option key={room} value={room}>{room}</option>)}
              </select>
            </div>
            {errors.length > 0 && <p className="mt-2 text-[11px] font-semibold text-red-600">{errors.join(' ')}</p>}
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...value, createEmptyScheduleSession()])} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#0056C7] px-3 text-xs font-bold text-[#0056C7] hover:bg-blue-50">
        <Plus size={14} /> Thêm buổi học
      </button>
    </section>
  );
};
