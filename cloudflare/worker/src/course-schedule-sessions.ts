import { getSemesterMaxWeek } from '../../../utils/academicCalendar.ts';
import { SCHEDULE_SHIFT_OPTIONS, type StructuredScheduleSession } from '../../../utils/scheduleSessions.ts';

const MAX_SESSIONS = 12;
const MAX_LOCATION_LENGTH = 120;
const SESSION_KEYS = new Set(['weeks', 'dayOfWeek', 'shift', 'campus', 'room']);

export class CourseScheduleSessionError extends Error {
  constructor(message = 'Chi tiết buổi học không hợp lệ.') {
    super(message);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cleanLocation = (value: unknown) => {
  if (typeof value !== 'string') throw new CourseScheduleSessionError();
  const text = value.trim();
  if (text.length > MAX_LOCATION_LENGTH) throw new CourseScheduleSessionError();
  return text;
};

export const parseStructuredScheduleSessions = (
  value: unknown,
  semester: string,
  options: { singleWeekPerSession?: boolean; preserveCampus?: boolean } = {},
): StructuredScheduleSession[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SESSIONS) throw new CourseScheduleSessionError('Cần có ít nhất một buổi học hợp lệ.');
  const maxWeek = getSemesterMaxWeek(semester);
  const singleWeekPerSession = options.singleWeekPerSession !== false;
  const seenWeeks = new Set<number>();
  return value.map((raw) => {
    if (!isRecord(raw) || Object.keys(raw).some((key) => !SESSION_KEYS.has(key))) throw new CourseScheduleSessionError();
    if (!Array.isArray(raw.weeks) || raw.weeks.length < 1 || (singleWeekPerSession && raw.weeks.length !== 1)) throw new CourseScheduleSessionError('Mỗi buổi cần chọn đúng một tuần học hợp lệ.');
    const weeks = [...new Set(raw.weeks.map((week) => {
      if (!Number.isInteger(week) || Number(week) < 1 || Number(week) > maxWeek) throw new CourseScheduleSessionError();
      return Number(week);
    }))].sort((left, right) => left - right);
    if (singleWeekPerSession) {
      if (seenWeeks.has(weeks[0])) throw new CourseScheduleSessionError('Tuần học không được trùng trong cùng một môn.');
      seenWeeks.add(weeks[0]);
    }
    if (!Number.isInteger(raw.dayOfWeek) || Number(raw.dayOfWeek) < 2 || Number(raw.dayOfWeek) > 8) throw new CourseScheduleSessionError();
    if (typeof raw.shift !== 'string' || !SCHEDULE_SHIFT_OPTIONS.some((option) => option.value === raw.shift)) throw new CourseScheduleSessionError();
    return {
      weeks,
      dayOfWeek: Number(raw.dayOfWeek),
      shift: raw.shift as StructuredScheduleSession['shift'],
      // New student flows no longer collect a campus. Retain it only while
      // approving a legacy request that already stored this compatibility field.
      campus: options.preserveCampus ? cleanLocation(raw.campus) : '',
      room: cleanLocation(raw.room),
    };
  });
};

export const serializeStructuredScheduleSessions = (sessions: StructuredScheduleSession[]) => ({
  weeks: sessions.map((session) => session.weeks.join(',')).join('\n'),
  day_of_week: sessions.map((session) => String(session.dayOfWeek)).join('\n'),
  shift: sessions.map((session) => session.shift).join('\n'),
  campus: sessions.map((session) => session.campus).join('\n'),
  room: sessions.map((session) => session.room).join('\n'),
});
