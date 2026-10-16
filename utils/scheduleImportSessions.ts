import { getSemesterMaxWeek, getSemesterStartDate, getWeekNumberForDate } from './academicCalendar.ts';
import { parseVietnameseDate } from './scheduleImportUtils.ts';
import { inferScheduleShift, parseScheduleTimeRange, type StructuredScheduleSession } from './scheduleSessions.ts';
import type { ImportedScheduleMeeting } from './hubScheduleParser.ts';

export interface ImportedSessionFields {
  credits?: unknown;
  start_date?: string;
  end_date?: string;
  meetings?: ImportedScheduleMeeting[];
  day_of_week?: string;
  shift?: string;
  room?: string;
  campus?: string;
}

// The structured editor/worker currently support at most twelve sessions.
export const getImportedTargetSessionCount = (credits: unknown): number | null => {
  const value = typeof credits === 'number' || (typeof credits === 'string' && credits.trim()) ? Number(credits) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value * 3 : null;
};

const split = (value?: string) => String(value || '').split(/\r?\n/).map(part => part.trim());

export const generateImportedScheduleSessions = (course: ImportedSessionFields, semester: string) => {
  const sessions: StructuredScheduleSession[] = [];
  const warnings: string[] = [];
  const target = getImportedTargetSessionCount(course.credits);
  if (!target) return { sessions, warnings: ['Tín chỉ phải là số nguyên từ 1 đến 4. Vui lòng kiểm tra và hoàn tất các buổi học.'] };
  const start = parseVietnameseDate(course.start_date);
  const end = parseVietnameseDate(course.end_date);
  const maxWeek = getSemesterMaxWeek(semester);
  if (!start || !end || start > end || getWeekNumberForDate(start, semester) < 1 || getWeekNumberForDate(end, semester) > maxWeek) {
    return { sessions, warnings: ['Ngày bắt đầu/kết thúc thiếu, không hợp lệ hoặc ngoài học kỳ. Vui lòng kiểm tra và nhập các buổi học.'] };
  }

  const days = split(course.day_of_week), shifts = split(course.shift), rooms = split(course.room), campuses = split(course.campus);
  const rawMeetings = course.meetings?.length ? course.meetings : Array.from({ length: Math.max(days.length, shifts.length, rooms.length, campuses.length) }, (_, index) => ({
    day: days[index] || days[0], shift: shifts[index] || shifts[0], room: rooms[index] || rooms[0], campus: campuses[index] || campuses[0],
  }));
  const meetings = rawMeetings.map(meeting => {
    const range = 'startTime' in meeting && 'endTime' in meeting && (meeting.startTime || meeting.endTime)
      ? { startTime: String(meeting.startTime || ''), endTime: String(meeting.endTime || '') } : parseScheduleTimeRange(meeting.shift);
    return {
      dayOfWeek: Number(meeting.day),
      shift: range ? inferScheduleShift(range.startTime, range.endTime) : '',
      campus: meeting.campus || '', room: meeting.room || '', ...(range || {}),
    } satisfies Omit<StructuredScheduleSession, 'weeks'>;
  }).filter(meeting => Number.isInteger(meeting.dayOfWeek) && meeting.dayOfWeek >= 2 && meeting.dayOfWeek <= 8);
  if (!meetings.length) return { sessions, warnings: ['Không đọc được thứ học. Vui lòng nhập các buổi học.'] };
  if (meetings.some(meeting => !meeting.shift)) warnings.push('Giờ học thiếu, không hợp lệ hoặc trải qua hai ca. Vui lòng kiểm tra giờ và chọn ca.');

  type Candidate = { date: Date; session: StructuredScheduleSession };
  const seen = new Set<string>();
  const candidatesOn = (date: Date, isEstimated = false): Candidate[] => {
    const day = date.getDay() === 0 ? 8 : date.getDay() + 1;
    return meetings.filter(meeting => meeting.dayOfWeek === day).flatMap(meeting => {
      // Room changes never justify duplicating the same day/time.
      const key = `${date.getTime()}:${meeting.startTime || ''}:${meeting.endTime || ''}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ date: new Date(date), session: { ...meeting, weeks: [getWeekNumberForDate(date, semester)], ...(isEstimated ? { isEstimated: true } : {}) } }];
    });
  };
  const compare = (a: Candidate, b: Candidate) => a.date.getTime() - b.date.getTime()
    || String(a.session.startTime || '').localeCompare(String(b.session.startTime || ''))
    || String(a.session.endTime || '').localeCompare(String(b.session.endTime || ''));
  const available: Candidate[] = [];
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) available.push(...candidatesOn(day));
  available.sort(compare);
  let chosen: Candidate[];
  if (available.length >= target) {
    // Include the first/last valid PDF dates, then evenly spaced positions in one chronological sequence.
    chosen = Array.from({ length: target }, (_, index) => available[Math.round(index * (available.length - 1) / (target - 1))]);
  } else {
    chosen = [...available];
    const semesterStart = getSemesterStartDate(semester);
    const semesterEnd = new Date(semesterStart);
    semesterEnd.setDate(semesterEnd.getDate() + maxWeek * 7 - 1);
    // Extend only using declared weekdays/time ranges and mark every extra session.
    for (const day = new Date(end); chosen.length < target && day < semesterEnd;) {
      day.setDate(day.getDate() + 1);
      chosen.push(...candidatesOn(day, true).slice(0, target - chosen.length));
    }
    for (const day = new Date(start); chosen.length < target && day > semesterStart;) {
      day.setDate(day.getDate() - 1);
      chosen.push(...candidatesOn(day, true).slice(0, target - chosen.length));
    }
    if (chosen.some(item => item.session.isEstimated)) warnings.push('Lịch dự kiến — vui lòng kiểm tra. Có buổi ước lượng ngoài khoảng ngày PDF để đủ số buổi theo tín chỉ.');
    if (chosen.length < target) warnings.push(`Chỉ có ${chosen.length}/${target} buổi khả dụng trong học kỳ. Vui lòng kiểm tra lịch.`);
  }
  return { sessions: chosen.sort(compare).map(item => item.session), warnings };
};
