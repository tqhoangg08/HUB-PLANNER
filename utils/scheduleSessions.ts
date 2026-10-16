import {
  getSemesterHolidayWeeks,
  getSemesterMaxWeek,
  getWeekDatesForSemester,
} from './academicCalendar.ts';

export type ScheduleShiftCode = 'S' | 'C';

export interface StructuredScheduleSession {
  weeks: number[];
  dayOfWeek: number | null;
  shift: ScheduleShiftCode | '';
  campus: string;
  room: string;
  startTime?: string;
  endTime?: string;
  isEstimated?: boolean;
}

export const SCHEDULE_SHIFT_OPTIONS: ReadonlyArray<{ value: ScheduleShiftCode; label: string }> = [
  { value: 'S', label: 'Ca sáng (07:00 – 11:05)' },
  { value: 'C', label: 'Ca chiều (13:00 – 17:05)' },
];

export const SCHEDULE_DAY_OPTIONS = [
  { value: 2, label: 'Thứ 2' },
  { value: 3, label: 'Thứ 3' },
  { value: 4, label: 'Thứ 4' },
  { value: 5, label: 'Thứ 5' },
  { value: 6, label: 'Thứ 6' },
  { value: 7, label: 'Thứ 7' },
  { value: 8, label: 'Chủ nhật' },
] as const;

export const createEmptyScheduleSession = (): StructuredScheduleSession => ({
  weeks: [],
  dayOfWeek: null,
  shift: '',
  campus: '',
  room: '',
});

const formatDate = (value: Date) => `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}`;

const timeMinutes = (value: unknown) => {
  const match = typeof value === 'string' && value.match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

export const inferScheduleShift = (startTime: unknown, endTime: unknown): ScheduleShiftCode | '' => {
  const start = timeMinutes(startTime);
  const end = timeMinutes(endTime);
  if (start === null || end === null || start >= end) return '';
  if (start >= 420 && end <= 665) return 'S';
  if (start >= 780 && end <= 1025) return 'C';
  return '';
};

export const parseScheduleTimeRange = (value: unknown) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):([0-5]\d)\s*[-–—]\s*(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const startTime = `${match[1].padStart(2, '0')}:${match[2]}`;
  const endTime = `${match[3].padStart(2, '0')}:${match[4]}`;
  const start = timeMinutes(startTime);
  const end = timeMinutes(endTime);
  return start !== null && end !== null && start < end ? { startTime, endTime } : null;
};

export const getScheduleSessionTimeRange = (session: StructuredScheduleSession) => {
  if (session.startTime !== undefined || session.endTime !== undefined) {
    const start = timeMinutes(session.startTime);
    const end = timeMinutes(session.endTime);
    return start !== null && end !== null && start < end ? { start, end } : null;
  }
  return session.shift === 'S' ? { start: 420, end: 665 }
    : session.shift === 'C' ? { start: 780, end: 1025 } : null;
};

export const scheduleSessionsOverlap = (left: StructuredScheduleSession, right: StructuredScheduleSession) => {
  if (left.dayOfWeek !== right.dayOfWeek || !left.weeks.some(week => right.weeks.includes(week))) return false;
  const a = getScheduleSessionTimeRange(left);
  const b = getScheduleSessionTimeRange(right);
  return Boolean(a && b && a.start < b.end && b.start < a.end);
};

/** Compare separate slot ranges rather than treating an entire S/C as occupied. Unknown legacy labels remain conservative. */
export const scheduleTimeLabelsOverlap = (left: string, right: string) => {
  const range = (label: string) => {
    const parsed = parseScheduleTimeRange(label);
    if (parsed) return { start: timeMinutes(parsed.startTime)!, end: timeMinutes(parsed.endTime)! };
    if (label.trim() === 'S') return { start: 420, end: 665 };
    if (label.trim() === 'C') return { start: 780, end: 1025 };
    return null;
  };
  return left.split(';').some(a => right.split(';').some(b => {
    const first = range(a), second = range(b);
    return !first || !second || (first.start < second.end && second.start < first.end);
  }));
};

export const getSemesterWeekOptions = (semester?: string) => {
  const holidays = new Set(getSemesterHolidayWeeks(semester));
  return Array.from({ length: getSemesterMaxWeek(semester) }, (_, index) => {
    const week = index + 1;
    const dates = getWeekDatesForSemester(week, semester);
    const start = dates[0];
    const end = dates.at(-1) || start;
    return {
      value: week,
      isHoliday: holidays.has(week),
      label: `Tuần ${week} (${formatDate(start)} - ${formatDate(end)})${holidays.has(week) ? ' · Tuần nghỉ' : ''}`,
    };
  });
};

export const getScheduleSessionErrors = (
  session: StructuredScheduleSession,
  semester: string,
  hasOverlap = false,
) => {
  const errors: string[] = [];
  const maxWeek = getSemesterMaxWeek(semester);
  const validWeeks = session.weeks.length === 1
    && session.weeks.every((week) => Number.isInteger(week) && week >= 1 && week <= maxWeek);
  if (!validWeeks) errors.push('Mỗi buổi cần chọn đúng một tuần học hợp lệ.');
  if (hasOverlap) errors.push('Buổi học bị trùng ngày và giờ với một buổi khác.');
  if (!Number.isInteger(session.dayOfWeek) || Number(session.dayOfWeek) < 2 || Number(session.dayOfWeek) > 8) {
    errors.push('Chọn thứ học.');
  }
  if (!SCHEDULE_SHIFT_OPTIONS.some((option) => option.value === session.shift)) {
    errors.push('Chọn ca học.');
  }
  if ((session.startTime !== undefined || session.endTime !== undefined)
    && (!inferScheduleShift(session.startTime, session.endTime) || inferScheduleShift(session.startTime, session.endTime) !== session.shift)) {
    errors.push('Giờ bắt đầu/kết thúc phải hợp lệ và nằm trong ca đã chọn.');
  }
  if (session.isEstimated !== undefined && typeof session.isEstimated !== 'boolean') errors.push('Trạng thái lịch dự kiến không hợp lệ.');
  if (typeof session.campus !== 'string' || session.campus.trim().length > 120) errors.push('Cơ sở không hợp lệ.');
  if (typeof session.room !== 'string' || session.room.trim().length > 120) errors.push('Phòng học không hợp lệ.');
  return errors;
};

export const getOverlappingSessionIndexes = (sessions: StructuredScheduleSession[]) => {
  const overlaps = new Set<number>();
  sessions.forEach((session, index) => {
    for (let other = index + 1; other < sessions.length; other += 1) {
      if (scheduleSessionsOverlap(session, sessions[other])) { overlaps.add(index); overlaps.add(other); }
    }
  });
  return overlaps;
};

// Retain the old export for callers outside the import flow; semantics are now actual time overlap.
export const getDuplicateWeekSessionIndexes = getOverlappingSessionIndexes;

export const scheduleSessionsAreValid = (
  sessions: StructuredScheduleSession[],
  semester: string,
) => {
  const duplicates = getOverlappingSessionIndexes(sessions);
  return sessions.length > 0 && sessions.length <= 12 && sessions.every((session, index) => getScheduleSessionErrors(session, semester, duplicates.has(index)).length === 0);
};

const splitValues = (value: unknown) => String(value || '').split(/\r?\n/).map((item) => item.trim());

export const scheduleSessionsFromLegacyFields = (
  fields: { weeks?: unknown; day_of_week?: unknown; shift?: unknown; campus?: unknown; room?: unknown },
  semester: string,
): StructuredScheduleSession[] => {
  const weeks = splitValues(fields.weeks);
  const days = splitValues(fields.day_of_week);
  const shifts = splitValues(fields.shift);
  const campuses = splitValues(fields.campus);
  const rooms = splitValues(fields.room);
  const count = Math.max(weeks.length, days.length, shifts.length, campuses.length, rooms.length, 1);
  const maxWeek = getSemesterMaxWeek(semester);

  return Array.from({ length: count }, (_, index) => {
    const parsedWeeks = [...new Set((weeks[index] || weeks[0] || '')
      .split(',')
      .flatMap((part) => {
        const [start, end] = part.trim().split('-').map(Number);
        if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start) {
          return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
        }
        return Number.isInteger(start) ? [start] : [];
      })
      .filter((week) => week >= 1 && week <= maxWeek))].sort((a, b) => a - b);
    const day = Number(days[index] || days[0] || '');
    const shift = String(shifts[index] || shifts[0] || '').toUpperCase();
    const timeRange = parseScheduleTimeRange(shift);
    return parsedWeeks.map((week): StructuredScheduleSession => ({
      weeks: [week],
      dayOfWeek: Number.isInteger(day) && day >= 2 && day <= 8 ? day : null,
      shift: timeRange ? inferScheduleShift(timeRange.startTime, timeRange.endTime) : SCHEDULE_SHIFT_OPTIONS.some((option) => option.value === shift) ? shift as ScheduleShiftCode : '',
      campus: campuses[index] || campuses[0] || '',
      room: rooms[index] || rooms[0] || '',
      ...(timeRange || {}),
    }));
  }).flat();
};

export const serializeScheduleSessions = (sessions: StructuredScheduleSession[]) => ({
  weeks: sessions.map((session) => [...new Set(session.weeks)].sort((a, b) => a - b).join(',')).join('\n'),
  day_of_week: sessions.map((session) => String(session.dayOfWeek || '')).join('\n'),
  shift: sessions.map((session) => session.startTime && session.endTime ? `${session.startTime}-${session.endTime}` : session.shift).join('\n'),
  campus: sessions.map((session) => session.campus.trim()).join('\n'),
  room: sessions.map((session) => session.room.trim()).join('\n'),
});

export const formatScheduleSession = (session: StructuredScheduleSession) => {
  const day = SCHEDULE_DAY_OPTIONS.find((option) => option.value === session.dayOfWeek)?.label || 'Chưa xác định thứ';
  const shift = SCHEDULE_SHIFT_OPTIONS.find((option) => option.value === session.shift)?.label || 'Chưa xác định ca';
  const weeks = session.weeks.length ? `Tuần ${[...new Set(session.weeks)].sort((a, b) => a - b).join(', ')}` : 'Chưa xác định tuần';
  return [weeks, day, session.startTime && session.endTime ? `${shift} · ${session.startTime}–${session.endTime}` : shift, session.room ? `Phòng ${session.room}` : 'Chưa xác định phòng'];
};
