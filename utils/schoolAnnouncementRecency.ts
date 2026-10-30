const DAY_MS = 86_400_000;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

// Vietnam uses UTC+7 without daylight saving. Shift the instant before taking
// its UTC date so the browser's own timezone never changes the calendar day.
export const vietnamCalendarDate = (now = Date.now()): string =>
  new Date(now + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);

export const millisecondsUntilVietnamMidnight = (now = Date.now()): number =>
  DAY_MS - ((now + VIETNAM_OFFSET_MS) % DAY_MS + DAY_MS) % DAY_MS;

const calendarDay = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  // Reject normalized invalid dates such as February 30, as well as NaN.
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp / DAY_MS : null;
};

export const isRecentSchoolAnnouncement = (date: unknown, today = vietnamCalendarDate()): boolean => {
  const publishedDay = calendarDay(date);
  const todayDay = calendarDay(today);
  if (publishedDay === null || todayDay === null) return false;
  const age = todayDay - publishedDay;
  return age >= 0 && age <= 6;
};
