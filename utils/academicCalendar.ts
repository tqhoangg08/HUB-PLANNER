export type SemesterCalendar = {
  value: string;
  label: string;
  startDate: string;
  maxWeeks: number;
  holidayWeeks?: number[];
  monthStart: { year: number; month: number };
  monthEnd: { year: number; month: number };
};

export const DEFAULT_SCHEDULE_SEMESTER = 'HK1_2026_2027';

export const SEMESTER_CALENDARS: Record<string, SemesterCalendar> = {
  HK1_2026_2027: {
    value: 'HK1_2026_2027',
    label: 'HK1 (2026-2027)',
    startDate: '2026-08-31T00:00:00',
    maxWeeks: 22,
    holidayWeeks: [],
    monthStart: { year: 2026, month: 7 },
    monthEnd: { year: 2027, month: 1 },
  },
  HK2_2026_2027: {
    value: 'HK2_2026_2027',
    label: 'HK2 (2026-2027)',
    startDate: '2027-02-15T00:00:00',
    maxWeeks: 22,
    holidayWeeks: [],
    monthStart: { year: 2027, month: 1 },
    monthEnd: { year: 2027, month: 6 },
  },
  HKHE_2026_2027: {
    value: 'HKHE_2026_2027',
    label: 'Hè (2026-2027)',
    startDate: '2027-07-19T00:00:00',
    maxWeeks: 7,
    holidayWeeks: [],
    monthStart: { year: 2027, month: 6 },
    monthEnd: { year: 2027, month: 8 },
  },
  HK2_2025_2026: {
    value: 'HK2_2025_2026',
    label: 'HK2 (2025-2026)',
    startDate: '2026-02-02T00:00:00',
    maxWeeks: 24,
    holidayWeeks: [2, 3, 4],
    monthStart: { year: 2026, month: 1 },
    monthEnd: { year: 2026, month: 6 },
  },
  HK1_2025_2026: {
    value: 'HK1_2025_2026',
    label: 'HK1 (2025-2026)',
    startDate: '2025-08-11T00:00:00',
    maxWeeks: 24,
    holidayWeeks: [],
    monthStart: { year: 2025, month: 7 },
    monthEnd: { year: 2026, month: 0 },
  },
};

export const SEMESTER_OPTIONS = [
  SEMESTER_CALENDARS.HK1_2026_2027,
  SEMESTER_CALENDARS.HK2_2026_2027,
  SEMESTER_CALENDARS.HKHE_2026_2027,
  SEMESTER_CALENDARS.HK2_2025_2026,
  SEMESTER_CALENDARS.HK1_2025_2026,
];

const getSemesterCalendar = (semester?: string) => {
  return SEMESTER_CALENDARS[semester || ''] || SEMESTER_CALENDARS[DEFAULT_SCHEDULE_SEMESTER];
};

export const getSemesterStartDate = (semester?: string) => {
  return new Date(getSemesterCalendar(semester).startDate);
};

export const getSemesterMaxWeek = (semester?: string) => {
  return getSemesterCalendar(semester).maxWeeks;
};

export const getSemesterHolidayWeeks = (semester?: string) => {
  return getSemesterCalendar(semester).holidayWeeks || [];
};

export const isSemesterHolidayWeek = (semester: string | undefined, weekNum: number) => {
  return getSemesterHolidayWeeks(semester).includes(weekNum);
};

export const getWeekDatesForSemester = (weekNum: number, semester?: string) => {
  if (weekNum === 0) return ['', '', '', '', '', '', ''];

  const startDate = getSemesterStartDate(semester);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (weekNum - 1) * 7 + index);
    return date;
  });
};

export const getWeekNumberForDate = (date: Date, semester?: string) => {
  const startDate = getSemesterStartDate(semester);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const diffTime = target.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
};

export const getSemesterMonths = (semester?: string) => {
  const calendar = getSemesterCalendar(semester);
  const months: { year: number; month: number }[] = [];
  let year = calendar.monthStart.year;
  let month = calendar.monthStart.month;

  while (year < calendar.monthEnd.year || (year === calendar.monthEnd.year && month <= calendar.monthEnd.month)) {
    months.push({ year, month });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return months;
};

export const getSemesterMonth = (semester: string | undefined, monthIndex: number) => {
  const months = getSemesterMonths(semester);
  return months[Math.min(Math.max(monthIndex, 0), Math.max(months.length - 1, 0))] || months[0];
};

export const getInitialSemesterMonthIndex = (semester?: string, date = new Date()) => {
  const months = getSemesterMonths(semester);
  const currentIndex = months.findIndex(month => month.year === date.getFullYear() && month.month === date.getMonth());
  return currentIndex >= 0 ? currentIndex : 0;
};

export const getSemesterMonthLabel = (semester: string | undefined, monthIndex: number) => {
  const month = getSemesterMonth(semester, monthIndex);
  if (!month) return 'Tháng';
  return `Tháng ${month.month + 1}/${month.year}`;
};
