import { getSemesterMaxWeek } from '../../../utils/academicCalendar.ts';
import { SCHEDULE_SHIFT_OPTIONS, getScheduleSessionErrors, getOverlappingSessionIndexes, serializeScheduleSessions, type StructuredScheduleSession } from '../../../utils/scheduleSessions.ts';

const MAX_SESSIONS = 12;
const MAX_LOCATION_LENGTH = 120;
const SESSION_KEYS = new Set(['weeks', 'dayOfWeek', 'shift', 'campus', 'room', 'startTime', 'endTime', 'isEstimated']);

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
  const sessions = value.map((raw): StructuredScheduleSession => {
    if (!isRecord(raw) || Object.keys(raw).some((key) => !SESSION_KEYS.has(key))) throw new CourseScheduleSessionError();
    if (!Array.isArray(raw.weeks) || raw.weeks.length < 1 || (singleWeekPerSession && raw.weeks.length !== 1)) throw new CourseScheduleSessionError('Mỗi buổi cần chọn đúng một tuần học hợp lệ.');
    const weeks = [...new Set(raw.weeks.map((week) => {
      if (!Number.isInteger(week) || Number(week) < 1 || Number(week) > maxWeek) throw new CourseScheduleSessionError();
      return Number(week);
    }))].sort((left, right) => left - right);
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
      ...(Object.hasOwn(raw, 'startTime') ? { startTime: raw.startTime as string } : {}),
      ...(Object.hasOwn(raw, 'endTime') ? { endTime: raw.endTime as string } : {}),
      ...(Object.hasOwn(raw, 'isEstimated') ? { isEstimated: raw.isEstimated as boolean } : {}),
    };
  });
  const overlaps = getOverlappingSessionIndexes(sessions);
  sessions.forEach((session, index) => {
    const errors = getScheduleSessionErrors({ ...session, weeks: [session.weeks[0]] }, semester, overlaps.has(index));
    if (errors.length) throw new CourseScheduleSessionError(errors.join(' '));
  });
  return sessions;
};

export const serializeStructuredScheduleSessions = serializeScheduleSessions;
