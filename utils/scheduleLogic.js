import { DEFAULT_SCHEDULE_SEMESTER, getSemesterHolidayWeeks, getSemesterStartDate } from './academicCalendar';

export function getShiftTime(shiftCode) {
  if (!shiftCode) return { text: 'Chua ro', time: '' };

  const code = shiftCode.toUpperCase().trim();
  if (code === 'S') {
    return { text: 'Sang', time: '07:00 - 11:05 (Tiet 1-5)' };
  }
  if (code === 'C') {
    return { text: 'Chieu', time: '13:00 - 17:05 (Tiet 6-10)' };
  }
  return { text: code, time: '' };
}

export function parseWeeks(weekString, semester = DEFAULT_SCHEDULE_SEMESTER) {
  if (!weekString) return [];
  const weeks = new Set();
  const parts = weekString.toString().replace(/\s/g, '').split(',');

  parts.forEach(part => {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (start && end) {
        for (let i = start; i <= end; i += 1) weeks.add(i);
      }
    } else {
      const week = parseInt(part, 10);
      if (!Number.isNaN(week)) weeks.add(week);
    }
  });

  const holidayWeeks = getSemesterHolidayWeeks(semester);
  return Array.from(weeks)
    .sort((a, b) => a - b)
    .filter(week => !holidayWeeks.includes(week));
}

export function calculateExactDates(weekString, dayOfWeekString, semester = DEFAULT_SCHEDULE_SEMESTER) {
  const weeks = parseWeeks(weekString, semester);
  if (weeks.length === 0 || !dayOfWeekString) return [];

  const rawDays = dayOfWeekString.toString().replace(/,/g, ' ').split(/\s+/);
  const days = rawDays.map(Number).filter(day => !Number.isNaN(day) && day >= 2 && day <= 8);

  const exactSchedule = [];

  weeks.forEach(week => {
    days.forEach(day => {
      const date = getSemesterStartDate(semester);
      date.setDate(date.getDate() + (week - 1) * 7);
      date.setDate(date.getDate() + (day - 2));

      exactSchedule.push({
        week,
        dayName: day === 8 ? 'Chu nhat' : `Thu ${day}`,
        dateStr: date.toLocaleDateString('vi-VN'),
        rawDate: date,
      });
    });
  });

  return exactSchedule.sort((a, b) => a.rawDate - b.rawDate);
}
