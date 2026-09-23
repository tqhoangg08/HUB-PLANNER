import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCalendarExport,
  CalendarExportHandoffError,
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

test('exports the production D1 two-course, 15-session schedule shape', () => {
  const courses = [
    { ...baseCourse, id: 'prod-like-1', weeks: '2-3,5-9\n7-8', day_of_week: '6\n7', shift: '07:00-11:05\n07:00-11:05', room: 'B2.206\nB2.201' },
    { ...baseCourse, id: 'prod-like-2', weeks: '1-6', day_of_week: '6', shift: '07:00-11:05', room: 'B2.402' },
  ];
  const result = buildCalendarExport({ semester, courses });
  assert.equal(result.courseCount, 2);
  assert.equal(result.events.length, 15);
  assert.equal(result.issues.length, 0);
  assert.equal((result.ics.match(/BEGIN:VEVENT/g) || []).length, 15);
  assert.doesNotMatch(result.ics, /RRULE/);
  assert.match(result.ics, /DTSTART;TZID=Asia\/Ho_Chi_Minh:20260904T070000/);
  assert.match(result.ics, /LOCATION:B2\.201/);
});

test('recognizes observed production legacy shift shapes without guessing unknown times', () => {
  const known = buildCalendarExport({ semester, courses: [
    { ...baseCourse, id: 'range', shift: '13:00 - 17 : 05 ' },
    { ...baseCourse, id: 'periods', shift: '1-3 4-5', weeks: '2' },
    { ...baseCourse, id: 'full-morning', shift: '1-5', weeks: '3' },
    { ...baseCourse, id: 'full-afternoon', shift: '6-10', weeks: '4' },
    { ...baseCourse, id: 'comma', shift: '9-10,6-8', weeks: '5' },
  ] });
  assert.equal(known.events.length, 5);
  assert.equal(known.issues.length, 0);
  const unknown = buildCalendarExport({ semester, courses: [{ ...baseCourse, shift: '15:50-??' }] });
  assert.equal(unknown.events.length, 0);
  assert.deepEqual(unknown.issues.map(issue => issue.reason), ['unknown_shift']);
});

test('skips one malformed row, reports its position, and retains valid events', () => {
  const result = buildCalendarExport({ semester, courses: [{
    ...baseCourse,
    weeks: '1\n2\n3',
    day_of_week: '2\n9\n4',
    shift: 'S\nC\nS',
    room: 'A101\nA102\nA103',
  }] });
  assert.equal(result.events.length, 2);
  assert.equal((result.ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.deepEqual(result.issues, [{ courseIndex: 0, rowIndex: 1, reason: 'invalid_day' }]);
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

test('desktop capability failures and unsupported Web Share download safely', async () => {
  const file = { name: 'hub-planner.ics' } as File;
  let downloaded = 0;
  const download = () => { downloaded += 1; };
  assert.equal(await handoffCalendarFile(file, {}, download), 'download');
  assert.equal(await handoffCalendarFile(file, { share: async () => {}, canShare: () => false }, download), 'download');
  assert.equal(await handoffCalendarFile(file, { share: async () => {}, canShare: () => { throw new TypeError('unsupported'); } }, download), 'download');
  assert.equal(downloaded, 3);
});

test('download result is returned after the guide notification runs before browser download', async () => {
  const file = { name: 'hub-planner.ics' } as File;
  const order: string[] = [];
  const result = await handoffCalendarFile(file, {}, () => { order.push('download'); }, () => { order.push('guide'); });
  assert.equal(result, 'download');
  assert.deepEqual(order, ['guide', 'download']);
});

test('cancelled share is silent; platform share failure falls back to download', async () => {
  const file = { name: 'hub-planner.ics' } as File;
  let downloaded = 0;
  const canShare = () => true;
  const download = () => { downloaded += 1; };
  const cancelled = await handoffCalendarFile(file, { canShare, share: async () => { throw { name: 'AbortError' }; } }, download);
  assert.equal(cancelled, 'cancelled');
  assert.equal(downloaded, 0);
  const fallback = await handoffCalendarFile(file, { canShare, share: async () => { throw { name: 'NotAllowedError' }; } }, download);
  assert.equal(fallback, 'download-after-share-failure');
  assert.equal(downloaded, 1);
});

test('download failure is classified separately from ICS generation', async () => {
  const file = { name: 'hub-planner.ics' } as File;
  await assert.rejects(
    handoffCalendarFile(file, {}, () => { throw new Error('browser blocked download'); }),
    (error: unknown) => error instanceof CalendarExportHandoffError && error.reason === 'download_failed',
  );
});

test('empty or invalid schedules produce no events for a meaningful disabled state', () => {
  const result = buildCalendarExport({ semester, courses: [{ ...baseCourse, weeks: '', day_of_week: '', shift: '' }] });
  assert.equal(result.events.length, 0);
  const outOfRange = buildCalendarExport({ semester, courses: [{ ...baseCourse, weeks: '99' }] });
  assert.equal(outOfRange.events.length, 0);
});
