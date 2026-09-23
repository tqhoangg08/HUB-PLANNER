import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCalendarExport,
  escapeIcsText,
  foldIcsLine,
  getCalendarHandoffMethod,
  handoffCalendarFile,
} from '../utils/calendarExport.ts';

const semester = 'HK1_2026_2027';
const unfoldIcs = (value: string) => value.replace(/\r\n[ \t]/g, '');
const baseCourse = {
  id: 'course-opaque-id',
  course_code: 'ACC101',
  subject_name: 'Kế toán, căn bản',
  semester,
  weeks: '1',
  day_of_week: '2',
  shift: 'S',
  room: 'A101',
  instructor: 'Nguyễn Văn A',
};

test('exports one real session with canonical morning dates and details', () => {
  const result = buildCalendarExport({ semester, courses: [baseCourse], now: new Date('2026-01-01T00:00:00Z') });
  const ics = unfoldIcs(result.ics);
  assert.equal(result.events.length, 1);
  assert.match(ics, /DTSTART;TZID=Asia\/Ho_Chi_Minh:20260831T070000/);
  assert.match(ics, /DTEND;TZID=Asia\/Ho_Chi_Minh:20260831T110500/);
  assert.match(ics, /LOCATION:A101/);
  assert.match(ics, /Giảng viên: Nguyễn Văn A/);
  assert.match(ics, /Tuần học: 1/);
});

test('expands selected weeks, all courses, and skips calendar holiday weeks', () => {
  const manyWeeks = buildCalendarExport({ semester, courses: [{ ...baseCourse, weeks: '1,2,4' }] });
  assert.equal(manyWeeks.events.length, 3);

  const manyCourses = buildCalendarExport({ semester, courses: [baseCourse, { ...baseCourse, id: 'course-2', course_code: 'BUS102', weeks: '2', day_of_week: '4', shift: 'C' }] });
  assert.equal(manyCourses.events.length, 2);
  assert.equal((manyCourses.ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(manyCourses.ics, /DTSTART;TZID=Asia\/Ho_Chi_Minh:20260909T130000/);
  assert.match(manyCourses.ics, /DTEND;TZID=Asia\/Ho_Chi_Minh:20260909T170500/);

  const holidaySemester = buildCalendarExport({ semester: 'HK2_2025_2026', courses: [{ ...baseCourse, semester: 'HK2_2025_2026', weeks: '1,2' }] });
  assert.equal(holidaySemester.events.length, 1);
});

test('supports detailed and exact canonical shifts', () => {
  const result = buildCalendarExport({ semester, courses: [
    { ...baseCourse, id: 'detailed-1', shift: '1-3' },
    { ...baseCourse, id: 'detailed-2', weeks: '2', shift: '9-10' },
    { ...baseCourse, id: 'exact', weeks: '3', shift: '18:00-20:00' },
  ] });
  assert.match(result.ics, /20260831T070000/);
  assert.match(result.ics, /20260907T153500/);
  assert.match(result.ics, /20260914T180000/);
  assert.match(result.ics, /20260914T200000/);
});

test('uses UTF-8-safe escaping, optional fields, reminders, line folding, and stable opaque UIDs', () => {
  const course = { ...baseCourse, room: 'A;101, tầng 2\\nMới', instructor: 'GV\nNguyễn;A, B' };
  const first = buildCalendarExport({ semester, courses: [course], reminderMinutes: 15 });
  const second = buildCalendarExport({ semester, courses: [course], reminderMinutes: 15 });
  assert.equal(first.events[0].uid, second.events[0].uid);
  assert.match(first.ics, /LOCATION:A\\;101\\, tầng 2\\\\nMới/);
  assert.match(first.ics, /Giảng viên: GV\\nNguyễn\\;A\\, B/);
  assert.match(first.ics, /TRIGGER:-PT15M/);
  assert.match(first.ics, /SUMMARY:Kế toán\\, căn bản/);
  assert.equal(escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const folded = foldIcsLine(`SUMMARY:${'Tiếng Việt '.repeat(20)}`);
  assert.match(folded, /\r\n /);
  assert.ok(folded.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75));

  const withoutPrivateDetails = buildCalendarExport({ semester, courses: [course], includeRoom: false, includeInstructor: false });
  assert.doesNotMatch(withoutPrivateDetails.ics, /LOCATION:/);
  assert.doesNotMatch(withoutPrivateDetails.ics, /Giảng viên:/);
});

test('uses web share when supported and downloads one combined ICS when unsupported', async () => {
  const file = { name: 'hub-planner.ics' } as File;
  const shared: File[][] = [];
  const shareNavigator = {
    canShare: ({ files }: ShareData) => Array.isArray(files) && files.length === 1,
    share: async ({ files }: ShareData) => { shared.push(files || []); },
  };
  assert.equal(getCalendarHandoffMethod(shareNavigator, file), 'share');
  assert.equal(await handoffCalendarFile(file, shareNavigator), 'share');
  assert.equal(shared.length, 1);

  let downloaded = 0;
  const unsupportedNavigator = { canShare: () => false };
  assert.equal(getCalendarHandoffMethod(unsupportedNavigator, file), 'download');
  assert.equal(await handoffCalendarFile(file, unsupportedNavigator, () => { downloaded += 1; }), 'download');
  assert.equal(downloaded, 1);
});

test('empty or invalid schedules produce no events for a meaningful disabled state', () => {
  const result = buildCalendarExport({ semester, courses: [{ ...baseCourse, weeks: '', day_of_week: '', shift: '' }] });
  assert.equal(result.events.length, 0);
  const outOfRange = buildCalendarExport({ semester, courses: [{ ...baseCourse, weeks: '99' }] });
  assert.equal(outOfRange.events.length, 0);
});
