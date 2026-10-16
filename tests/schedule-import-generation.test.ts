import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateImportedScheduleSessions, getImportedTargetSessionCount } from '../utils/scheduleImportSessions.ts';
import { getWeekDatesForSemester } from '../utils/academicCalendar.ts';
import { parseHubScheduleLayout } from '../utils/hubScheduleParser.ts';
import { scheduleSessionsAreValid, type StructuredScheduleSession } from '../utils/scheduleSessions.ts';

const semester = 'HK1_2026_2027';
const course = { credits: 2, start_date: '12/10/2026', end_date: '28/10/2026', day_of_week: '2\n4', shift: '13:00-17:05\n13:00-17:05', room: 'A302\nB204', campus: 'TD\nQ1' };
const dateKey = (session: StructuredScheduleSession) => {
  const date = getWeekDatesForSemester(session.weeks[0], semester)[Number(session.dayOfWeek) - 2];
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

for (const credits of [1, 2, 3, 4]) test(`${credits} credits produce exactly ${credits * 3} sessions across all declared weekdays`, () => {
  const result = generateImportedScheduleSessions({ ...course, credits, end_date: '18/01/2027' }, semester);
  assert.equal(result.sessions.length, credits * 3);
  assert.equal(scheduleSessionsAreValid(result.sessions, semester), true);
  assert.equal(result.sessions[0].weeks[0], 7);
  assert.equal(dateKey(result.sessions.at(-1)!), '2027-01-18');
  assert.deepEqual(result, generateImportedScheduleSessions({ ...course, credits, end_date: '18/01/2027' }, semester));
});

test('standard six sessions retain both PDF endpoints, alternating weekdays, rooms and campus', () => {
  const { sessions, warnings } = generateImportedScheduleSessions(course, semester);
  assert.deepEqual(sessions.map(dateKey), ['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28']);
  assert.deepEqual(sessions.map(s => [s.room, s.campus]), Array.from({ length: 6 }, (_, i) => i % 2 ? ['B204', 'Q1'] : ['A302', 'TD']));
  assert.deepEqual(warnings, []);
});

test('ten Tuesdays produce nine sessions with endpoints and one gap in the middle', () => {
  const { sessions } = generateImportedScheduleSessions({ ...course, credits: 3, start_date: '17/11/2026', end_date: '19/01/2027', day_of_week: '3', shift: '13:00-17:05', room: 'A204' }, semester);
  assert.equal(sessions.length, 9);
  assert.equal(dateKey(sessions[0]), '2026-11-17');
  assert.equal(dateKey(sessions.at(-1)!), '2027-01-19');
  assert.equal(sessions.filter((s, i) => i && s.weeks[0] - sessions[i - 1].weeks[0] === 2).length, 1);
});

test('two declared times on the same date survive, identical meetings do not duplicate', () => {
  const meeting = { day: '2', shift: '13:00-15:15', startTime: '13:00', endTime: '15:15', room: 'San1', campus: 'TD' };
  const input = { ...course, credits: 1, end_date: '19/10/2026', meetings: [meeting, { ...meeting }, { ...meeting, shift: '15:50-17:05', startTime: '15:50', endTime: '17:05' }] };
  const { sessions } = generateImportedScheduleSessions(input, semester);
  assert.equal(sessions.length, 3);
  assert.ok(sessions.some(s => sessions.filter(other => dateKey(other) === dateKey(s)).length === 2));
  assert.deepEqual([...new Set(sessions.map(s => s.startTime))].sort(), ['13:00', '15:50']);
  assert.equal(new Set(sessions.map(s => `${dateKey(s)}:${s.startTime}:${s.endTime}`)).size, 3);
  assert.equal(scheduleSessionsAreValid(sessions, semester), true);
});

test('short ranges extend only declared slots, flag estimates and never duplicate exact dates/times', () => {
  const { sessions, warnings } = generateImportedScheduleSessions({ ...course, start_date: '12/10/2026', end_date: '12/10/2026' }, semester);
  assert.equal(sessions.length, 6);
  assert.equal(sessions.filter(s => s.isEstimated).length, 5);
  assert.match(warnings.join(' '), /Lịch dự kiến — vui lòng kiểm tra/);
  assert.equal(new Set(sessions.map(s => `${dateKey(s)}:${s.startTime}:${s.endTime}`)).size, 6);
});

test('estimation stays in the selected semester even when the PDF ends on its last day', () => {
  const { sessions } = generateImportedScheduleSessions({ ...course, start_date: '31/01/2027', end_date: '31/01/2027', day_of_week: '8' }, semester);
  assert.equal(sessions.length, 6);
  assert.equal(dateKey(sessions.at(-1)!), '2027-01-31');
  assert.ok(sessions.every(s => s.weeks[0] >= 1 && s.weeks[0] <= 22));
});

test('unsupported credits and invalid dates require review without guessed session counts', () => {
  for (const credits of [undefined, null, '', 0, -1, 1.5, 5, NaN, Infinity, 'two']) {
    assert.equal(getImportedTargetSessionCount(credits), null);
    const result = generateImportedScheduleSessions({ ...course, credits }, semester);
    assert.equal(result.sessions.length, 0);
    assert.match(result.warnings.join(' '), /Tín chỉ/);
  }
  for (const start_date of ['', '31/02/2026', '28/10/2027', '29/10/2026']) {
    const result = generateImportedScheduleSessions({ ...course, start_date }, semester);
    assert.equal(result.sessions.length, 0);
    assert.ok(result.warnings.length);
  }
});

test('an impossible target remains visibly incomplete instead of duplicating slots or leaving the semester', () => {
  const result = generateImportedScheduleSessions({ credits: 4, start_date: '19/07/2027', end_date: '06/09/2027', day_of_week: '2', shift: '07:00-11:05', room: 'A101' }, 'HKHE_2026_2027');
  // The end date is outside the seven supported weeks, so require manual review.
  assert.equal(result.sessions.length, 0);
  assert.ok(result.warnings.length);
  const bounded = generateImportedScheduleSessions({ credits: 4, start_date: '19/07/2027', end_date: '30/08/2027', day_of_week: '2', shift: '07:00-11:05', room: 'A101' }, 'HKHE_2026_2027');
  assert.equal(bounded.sessions.length, 7);
  assert.match(bounded.warnings.join(' '), /7\/12/);
  assert.equal(new Set(bounded.sessions.map(s => s.weeks[0])).size, 7);
});

test('invalid or missing meeting times are never silently assigned S/C', () => {
  for (const shift of ['', '07:00-17:05', '25:00-26:00', '13:00-12:00']) {
    const result = generateImportedScheduleSessions({ ...course, shift }, semester);
    assert.ok(result.warnings.length);
    assert.ok(result.sessions.every(s => s.shift === ''));
    assert.equal(scheduleSessionsAreValid(result.sessions, semester), false);
  }
});

test('all eleven PDF courses independently obey target counts, chronological order and stable generation', () => {
  const parsed = parseHubScheduleLayout(JSON.parse(readFileSync('tests/fixtures/hub-schedule-11.layout.json', 'utf8')));
  for (const input of parsed.courses) {
    const result = generateImportedScheduleSessions(input, semester);
    assert.equal(result.sessions.length, input.credits * 3, input.course_code);
    assert.equal(scheduleSessionsAreValid(result.sessions, semester), true, input.course_code);
    const keys = result.sessions.map(s => `${dateKey(s)}:${s.startTime}`);
    assert.deepEqual(keys, [...keys].sort());
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(result, generateImportedScheduleSessions(input, semester));
  }
});
