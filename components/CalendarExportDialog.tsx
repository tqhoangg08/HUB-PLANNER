import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, CheckCircle2, Clock3, FileDown, MapPin, UserRound, X } from 'lucide-react';
import {
  buildCalendarExport,
  handoffCalendarFile,
  type CalendarExportCourse,
  type CalendarReminderMinutes,
} from '../utils/calendarExport';
import { SEMESTER_OPTIONS } from '../utils/academicCalendar';

interface CalendarExportDialogProps {
  open: boolean;
  semester: string;
  courses: CalendarExportCourse[];
  onClose: () => void;
}

const REMINDER_OPTIONS: Array<{ value: CalendarReminderMinutes; label: string }> = [
  { value: 0, label: 'Không nhắc' },
  { value: 5, label: '5 phút' },
  { value: 10, label: '10 phút' },
  { value: 15, label: '15 phút' },
  { value: 30, label: '30 phút' },
  { value: 60, label: '1 giờ' },
];

export const CalendarExportDialog: React.FC<CalendarExportDialogProps> = ({ open, semester, courses, onClose }) => {
  const [reminderMinutes, setReminderMinutes] = useState<CalendarReminderMinutes>(10);
  const [includeRoom, setIncludeRoom] = useState(true);
  const [includeInstructor, setIncludeInstructor] = useState(true);
  const [resultMessage, setResultMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const preview = useMemo(() => buildCalendarExport({
    semester,
    courses,
    reminderMinutes,
    includeRoom,
    includeInstructor,
  }), [courses, includeInstructor, includeRoom, reminderMinutes, semester]);
  const semesterLabel = SEMESTER_OPTIONS.find(option => option.value === semester)?.label || semester.replaceAll('_', ' ');

  if (!open) return null;

  const handleClose = () => {
    setResultMessage('');
    setErrorMessage('');
    onClose();
  };

  const handleExport = async () => {
    setErrorMessage('');
    setResultMessage('');
    if (!preview.events.length) {
      setErrorMessage('Chưa có buổi học hợp lệ để thêm vào lịch cho học kỳ này.');
      return;
    }
    try {
      const file = new File([preview.ics], preview.filename, { type: 'text/calendar;charset=utf-8' });
      const method = await handoffCalendarFile(file);
      setResultMessage(method === 'share'
        ? `Đã chuẩn bị ${preview.events.length} buổi học. Chọn ứng dụng lịch trên thiết bị để hoàn tất.`
        : `Đã chuẩn bị ${preview.events.length} buổi học. Mở file .ics vừa tải xuống bằng ứng dụng lịch trên thiết bị để hoàn tất.`);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      setErrorMessage('Không thể chuẩn bị file lịch. Vui lòng thử lại.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4" onClick={handleClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-export-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div>
            <h2 id="calendar-export-title" className="flex items-center gap-2 text-base font-extrabold text-[#003375]"><CalendarPlus size={19} /> Thêm vào lịch thiết bị</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Xuất toàn bộ lịch học của học kỳ vào một file lịch.</p>
          </div>
          <button type="button" onClick={handleClose} aria-label="Đóng" className="rounded-full p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"><X size={19} /></button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs">
            <div><p className="font-semibold text-slate-500">Học kỳ</p><p className="mt-0.5 font-extrabold text-[#003375]">{semesterLabel}</p></div>
            <div><p className="font-semibold text-slate-500">Lịch sẽ thêm</p><p className="mt-0.5 font-extrabold text-[#003375]">{preview.courseCount} môn · {preview.events.length} buổi</p></div>
          </div>

          <label className="block text-sm font-bold text-slate-700">
            <span className="mb-1.5 flex items-center gap-2"><Clock3 size={15} className="text-[#0056C7]" /> Nhắc trước</span>
            <select value={reminderMinutes} onChange={event => setReminderMinutes(Number(event.target.value) as CalendarReminderMinutes)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[#0056C7]">
              {REMINDER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={includeRoom} onChange={event => setIncludeRoom(event.target.checked)} className="h-4 w-4 accent-[#0056C7]" /><MapPin size={15} className="text-slate-500" /> Bao gồm phòng học</label>
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={includeInstructor} onChange={event => setIncludeInstructor(event.target.checked)} className="h-4 w-4 accent-[#0056C7]" /><UserRound size={15} className="text-slate-500" /> Bao gồm giảng viên</label>
          </div>

          {errorMessage && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{errorMessage}</p>}
          {resultMessage && <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><CheckCircle2 size={16} className="mt-0.5 shrink-0" />{resultMessage}</p>}
          <p className="text-[11px] leading-5 text-slate-500">Lịch đã thêm vào ứng dụng lịch sẽ không tự cập nhật nếu thời khóa biểu trong HUB Planner thay đổi.</p>
        </div>

        <footer className="flex gap-3 border-t border-slate-100 bg-white px-5 py-4">
          <button type="button" onClick={handleClose} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Hủy</button>
          <button type="button" disabled={!preview.events.length} onClick={handleExport} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#003375] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#002855] disabled:cursor-not-allowed disabled:bg-slate-300"><FileDown size={16} /> Thêm toàn bộ vào lịch</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
};
