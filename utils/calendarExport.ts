import { getSemesterHolidayWeeks, getSemesterMaxWeek, getWeekDatesForSemester } from './academicCalendar.ts';

export type CalendarReminderMinutes = 0 | 5 | 10 | 15 | 30 | 60;

export interface CalendarExportCourse {
  id?: string;
  user_schedule_id?: string;
  course_code?: string;
  subject_name?: string;
  semester?: string;
  weeks?: string;
  day_of_week?: string;
  shift?: string;
  room?: string;
  instructor?: string;
}

export interface CalendarExportOptions {
  semester: string;
  courses: CalendarExportCourse[];
  includeRoom?: boolean;
  includeInstructor?: boolean;
  reminderMinutes?: CalendarReminderMinutes;
  now?: Date;
}

export interface CalendarExportEvent {
  uid: string;
  courseId: string;
  date: Date;
  start: string;
  end: string;
  week: number;
  dayOfWeek: number;
  shift: string;
  room: string;
}

export interface CalendarExportResult {
  ics: string;
  events: CalendarExportEvent[];
  courseCount: number;
  filename: string;
}

const CALENDAR_TIMEZONE = 'Asia/Ho_Chi_Minh';

const pad = (value: number) => String(value).padStart(2, '0');

const toIcsLocalDateTime = (date: Date, time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(hours)}${pad(minutes)}00`;
};

const toIcsUtcDateTime = (date: Date) => (
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
);

/** RFC 5545 TEXT escaping. Values are folded separately after escaping. */
export const escapeIcsText = (value: unknown) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r\n|\r|\n/g, '\\n');

/** Fold content lines at 75 UTF-8 octets without splitting a Unicode code point. */
export const foldIcsLine = (line: string) => {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    // Continuation lines start with one folding space, so their content has a
    // 74-octet budget to keep every physical line at or below 75 octets.
    const budget = chunks.length === 0 ? 75 : 74;
    if (current && currentBytes + characterBytes > budget) {
      chunks.push(current);
      current = character;
      currentBytes = characterBytes;
    } else {
      current += character;
      currentBytes += characterBytes;
    }
  }
  if (current || !chunks.length) chunks.push(current);
  return chunks.join('\r\n ');
};

const splitScheduleRows = (value: unknown) => {
  const raw = String(value || '').trim();
  return raw ? raw.split(/\r?\n/).map(item => item.trim()) : [];
};

const valueForRow = (values: string[], index: number) => values[index] ?? values[values.length - 1] ?? '';

const parseDays = (value: string) => (
  value.replace(/,/g, ' ').split(/\s+/).map(Number).filter(day => Number.isInteger(day) && day >= 2 && day <= 8)
);

const parseExportWeeks = (value: string, semester: string) => {
  const weeks = new Set<number>();
  value.replace(/\s/g, '').split(',').forEach(part => {
    const [first, last] = part.split('-').map(Number);
    if (Number.isInteger(first) && Number.isInteger(last) && first > 0 && last >= first) {
      for (let week = first; week <= last; week += 1) weeks.add(week);
    } else if (Number.isInteger(first) && first > 0) {
      weeks.add(first);
    }
  });
  const holidays = new Set(getSemesterHolidayWeeks(semester));
  const maxWeek = getSemesterMaxWeek(semester);
  return [...weeks]
    .filter(week => week <= maxWeek && !holidays.has(week))
    .sort((left, right) => left - right);
};

export const getCanonicalShiftTimeRange = (shift: unknown) => {
  const raw = String(shift || '').trim().toUpperCase();
  const exact = raw.match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/);
  if (exact) {
    return { start: `${pad(Number(exact[1]))}:${exact[2]}`, end: `${pad(Number(exact[3]))}:${exact[4]}` };
  }

  if (raw === 'S') return { start: '07:00', end: '11:05' };
  if (raw === 'C') return { start: '13:00', end: '17:05' };
  if (/(^|\D)1\s*[-–]\s*3(\D|$)/.test(raw)) return { start: '07:00', end: '09:15' };
  if (/(^|\D)4\s*[-–]\s*5(\D|$)/.test(raw)) return { start: '09:35', end: '11:05' };
  if (/(^|\D)6\s*[-–]\s*8(\D|$)/.test(raw)) return { start: '13:00', end: '15:15' };
  if (/(^|\D)9\s*[-–]\s*10(\D|$)/.test(raw)) return { start: '15:35', end: '17:05' };
  return null;
};

const hashOpaque = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const eventUid = (course: CalendarExportCourse, semester: string, week: number, day: number, shift: string, row: number) => {
  const stableSource = course.user_schedule_id || course.id || `${course.course_code || ''}:${course.subject_name || ''}`;
  return `hubplanner-${hashOpaque([stableSource, semester, week, day, shift, row].join('|'))}@hubplanner.local`;
};

const buildFilename = (semester: string) => `hub-planner-${semester.toLowerCase().replaceAll('_', '-')}.ics`;

export const buildCalendarExport = ({
  semester,
  courses,
  includeRoom = true,
  includeInstructor = true,
  reminderMinutes = 0,
  now = new Date(),
}: CalendarExportOptions): CalendarExportResult => {
  const events: Array<CalendarExportEvent & { course: CalendarExportCourse }> = [];

  courses.filter(course => course.semester === semester).forEach(course => {
    const weekRows = splitScheduleRows(course.weeks);
    const dayRows = splitScheduleRows(course.day_of_week);
    const shiftRows = splitScheduleRows(course.shift);
    const roomRows = splitScheduleRows(course.room);
    const count = Math.max(weekRows.length, dayRows.length, shiftRows.length, roomRows.length);

    for (let row = 0; row < count; row += 1) {
      const weekValue = valueForRow(weekRows, row);
      const dayValue = valueForRow(dayRows, row);
      const shiftValue = valueForRow(shiftRows, row);
      const timeRange = getCanonicalShiftTimeRange(shiftValue);
      if (!timeRange) continue;

      const weeks = parseExportWeeks(weekValue, semester);
      const days = parseDays(dayValue);
      for (const week of weeks) {
        const weekDates = getWeekDatesForSemester(week, semester);
        for (const dayOfWeek of days) {
          const date = weekDates[dayOfWeek - 2];
          if (!date) continue;
          events.push({
            uid: eventUid(course, semester, week, dayOfWeek, shiftValue, row),
            courseId: course.user_schedule_id || course.id || course.course_code || 'course',
            date,
            start: timeRange.start,
            end: timeRange.end,
            week,
            dayOfWeek,
            shift: shiftValue,
            room: valueForRow(roomRows, row),
            course,
          });
        }
      }
    }
  });

  events.sort((left, right) => (
    left.date.getTime() - right.date.getTime()
    || left.start.localeCompare(right.start)
    || left.uid.localeCompare(right.uid)
  ));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HUB Planner//Thoi khoa bieu//VI',
    'CALSCALE:GREGORIAN',
    `X-WR-TIMEZONE:${CALENDAR_TIMEZONE}`,
  ];

  events.forEach(event => {
    const description = [
      event.course.course_code ? `Mã học phần: ${event.course.course_code}` : '',
      includeInstructor && event.course.instructor ? `Giảng viên: ${event.course.instructor}` : '',
      `Tuần học: ${event.week}`,
      'HUB Planner',
    ].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${toIcsUtcDateTime(now)}`,
      `DTSTART;TZID=${CALENDAR_TIMEZONE}:${toIcsLocalDateTime(event.date, event.start)}`,
      `DTEND;TZID=${CALENDAR_TIMEZONE}:${toIcsLocalDateTime(event.date, event.end)}`,
      `SUMMARY:${escapeIcsText(event.course.subject_name || event.course.course_code || 'Lịch học HUB Planner')}`,
    );
    const room = includeRoom ? event.room.trim() : '';
    if (room) lines.push(`LOCATION:${escapeIcsText(room)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    if (reminderMinutes > 0) {
      lines.push(
        'BEGIN:VALARM',
        `TRIGGER:-PT${reminderMinutes}M`,
        'ACTION:DISPLAY',
        'DESCRIPTION:Nhắc lịch học HUB Planner',
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');

  return {
    ics: `${lines.map(foldIcsLine).join('\r\n')}\r\n`,
    events: events.map(({ course: _course, ...event }) => event),
    courseCount: new Set(events.map(event => event.courseId)).size,
    filename: buildFilename(semester),
  };
};

type NavigatorWithShare = Pick<Navigator, 'share' | 'canShare'>;

export const getCalendarHandoffMethod = (navigatorLike: Partial<NavigatorWithShare>, file: File) => (
  typeof navigatorLike.share === 'function'
    && typeof navigatorLike.canShare === 'function'
    && navigatorLike.canShare({ files: [file] })
    ? 'share'
    : 'download'
);

export const downloadCalendarFile = (file: File) => {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const handoffCalendarFile = async (
  file: File,
  navigatorLike: Partial<NavigatorWithShare> = navigator,
  download = downloadCalendarFile,
) => {
  if (getCalendarHandoffMethod(navigatorLike, file) === 'share') {
    await navigatorLike.share!({
      files: [file],
      title: 'Thời khóa biểu HUB Planner',
    });
    return 'share' as const;
  }
  download(file);
  return 'download' as const;
};
