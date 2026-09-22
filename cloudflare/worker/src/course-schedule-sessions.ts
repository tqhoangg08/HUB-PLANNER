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

export const parseStructuredScheduleSessions = (value: unknown, semester: string): StructuredScheduleSession[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SESSIONS) throw new CourseScheduleSessionError('Cần có ít nhất một buổi học hợp lệ.');
  const maxWeek = getSemesterMaxWeek(semester);
  return value.map((raw) => {
    if (!isRecord(raw) || Object.keys(raw).some((key) => !SESSION_KEYS.has(key))) throw new CourseScheduleSessionError();
    if (!Array.isArray(raw.weeks) || raw.weeks.length < 1 || raw.weeks.length > maxWeek) throw new CourseScheduleSessionError();
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
      campus: cleanLocation(raw.campus),
      room: cleanLocation(raw.room),
    };
  });
};

export const assertScheduleSessionCatalogue = async (
  db: D1Database,
  semester: string,
  sessions: StructuredScheduleSession[],
) => {
  const [campusResult, roomResult] = await db.batch([
    db.prepare(`SELECT DISTINCT TRIM(campus) AS campus
      FROM course_schedules
      WHERE semester=? AND catalogue_visibility='published' AND campus IS NOT NULL AND TRIM(campus) <> ''
      ORDER BY TRIM(campus) COLLATE NOCASE LIMIT 100`).bind(semester),
    db.prepare(`SELECT DISTINCT TRIM(campus) AS campus, TRIM(room) AS room
      FROM course_schedules
      WHERE semester=? AND catalogue_visibility='published'
        AND campus IS NOT NULL AND TRIM(campus) <> ''
        AND room IS NOT NULL AND TRIM(room) <> ''
      ORDER BY TRIM(campus) COLLATE NOCASE, TRIM(room) COLLATE NOCASE LIMIT 500`).bind(semester),
  ]);
  const campusRows = (campusResult.results || []) as Array<{ campus?: unknown }>;
  const roomRows = (roomResult.results || []) as Array<{ campus?: unknown; room?: unknown }>;
  const campuses = new Set(campusRows.map((row) => String(row.campus || '')));
  const rooms = new Set(roomRows.map((row) => `${String(row.campus || '')}\u0000${String(row.room || '')}`));
  for (const session of sessions) {
    if (session.campus && !campuses.has(session.campus)) throw new CourseScheduleSessionError('Cơ sở học không thuộc danh mục hiện hành.');
    if (session.room && (!session.campus || !rooms.has(`${session.campus}\u0000${session.room}`))) {
      throw new CourseScheduleSessionError('Phòng học không thuộc cơ sở đã chọn.');
    }
  }
};

export const serializeStructuredScheduleSessions = (sessions: StructuredScheduleSession[]) => ({
  weeks: sessions.map((session) => session.weeks.join(',')).join('\n'),
  day_of_week: sessions.map((session) => String(session.dayOfWeek)).join('\n'),
  shift: sessions.map((session) => session.shift).join('\n'),
  campus: sessions.map((session) => session.campus).join('\n'),
  room: sessions.map((session) => session.room).join('\n'),
});

export const listScheduleSessionCatalogue = async (db: D1Database, semester: string) => {
  const [campusResult, roomResult] = await db.batch([
    db.prepare(`SELECT DISTINCT TRIM(campus) AS campus
      FROM course_schedules
      WHERE semester=? AND catalogue_visibility='published' AND campus IS NOT NULL AND TRIM(campus) <> ''
      ORDER BY TRIM(campus) COLLATE NOCASE LIMIT 100`).bind(semester),
    db.prepare(`SELECT DISTINCT TRIM(campus) AS campus, TRIM(room) AS room
      FROM course_schedules
      WHERE semester=? AND catalogue_visibility='published'
        AND campus IS NOT NULL AND TRIM(campus) <> ''
        AND room IS NOT NULL AND TRIM(room) <> ''
      ORDER BY TRIM(campus) COLLATE NOCASE, TRIM(room) COLLATE NOCASE LIMIT 500`).bind(semester),
  ]);
  const campusRows = (campusResult.results || []) as Array<{ campus?: unknown }>;
  const roomRows = (roomResult.results || []) as Array<{ campus?: unknown; room?: unknown }>;
  const campuses = campusRows.map((row) => String(row.campus || '')).filter(Boolean);
  const roomsByCampus: Record<string, string[]> = {};
  for (const row of roomRows) {
    const campus = String(row.campus || '');
    const room = String(row.room || '');
    if (!campus || !room) continue;
    (roomsByCampus[campus] ||= []).push(room);
  }
  return { campuses, roomsByCampus };
};
