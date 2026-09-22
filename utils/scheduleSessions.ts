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
}

export interface ScheduleSessionCatalogue {
  campuses: string[];
  roomsByCampus: Record<string, string[]>;
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
  catalogue?: ScheduleSessionCatalogue | null,
) => {
  const errors: string[] = [];
  const maxWeek = getSemesterMaxWeek(semester);
  const validWeeks = session.weeks.length > 0
    && session.weeks.every((week) => Number.isInteger(week) && week >= 1 && week <= maxWeek);
  if (!validWeeks) errors.push('Chọn ít nhất một tuần học hợp lệ.');
  if (!Number.isInteger(session.dayOfWeek) || Number(session.dayOfWeek) < 2 || Number(session.dayOfWeek) > 8) {
    errors.push('Chọn thứ học.');
  }
  if (!SCHEDULE_SHIFT_OPTIONS.some((option) => option.value === session.shift)) {
    errors.push('Chọn ca học.');
  }
  if (catalogue) {
    const campus = session.campus.trim();
    const room = session.room.trim();
    if (campus && !catalogue.campuses.includes(campus)) errors.push('Cơ sở không còn trong danh mục.');
    if (room && (!campus || !(catalogue.roomsByCampus[campus] || []).includes(room))) {
      errors.push('Phòng học không thuộc cơ sở đã chọn.');
    }
  }
  return errors;
};

export const scheduleSessionsAreValid = (
  sessions: StructuredScheduleSession[],
  semester: string,
  catalogue?: ScheduleSessionCatalogue | null,
) => sessions.length > 0 && sessions.every((session) => getScheduleSessionErrors(session, semester, catalogue).length === 0);

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
    return {
      weeks: parsedWeeks,
      dayOfWeek: Number.isInteger(day) && day >= 2 && day <= 8 ? day : null,
      shift: SCHEDULE_SHIFT_OPTIONS.some((option) => option.value === shift) ? shift as ScheduleShiftCode : '',
      campus: campuses[index] || campuses[0] || '',
      room: rooms[index] || rooms[0] || '',
    };
  });
};

export const serializeScheduleSessions = (sessions: StructuredScheduleSession[]) => ({
  weeks: sessions.map((session) => [...new Set(session.weeks)].sort((a, b) => a - b).join(',')).join('\n'),
  day_of_week: sessions.map((session) => String(session.dayOfWeek || '')).join('\n'),
  shift: sessions.map((session) => session.shift).join('\n'),
  campus: sessions.map((session) => session.campus.trim()).join('\n'),
  room: sessions.map((session) => session.room.trim()).join('\n'),
});

export const formatScheduleSession = (session: StructuredScheduleSession) => {
  const day = SCHEDULE_DAY_OPTIONS.find((option) => option.value === session.dayOfWeek)?.label || 'Chưa xác định thứ';
  const shift = SCHEDULE_SHIFT_OPTIONS.find((option) => option.value === session.shift)?.label || 'Chưa xác định ca';
  const weeks = session.weeks.length ? `Tuần ${[...new Set(session.weeks)].sort((a, b) => a - b).join(', ')}` : 'Chưa xác định tuần';
  return [weeks, day, shift, session.campus || 'Chưa xác định cơ sở', session.room || 'Chưa xác định phòng'];
};
