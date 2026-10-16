import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleSessionsAreValid, scheduleSessionsFromLegacyFields, scheduleTimeLabelsOverlap } from '../utils/scheduleSessions.ts';
import { parseStructuredScheduleSessions } from '../cloudflare/worker/src/course-schedule-sessions.ts';

const semester = 'HK1_2026_2027';
const monday = { weeks: [7], dayOfWeek: 2, shift: 'C' as const, room: 'A302', campus: '' };

test('frontend and worker allow different weekdays in the same week', () => {
  const sessions = [monday, { ...monday, dayOfWeek: 4 }];
  assert.equal(scheduleSessionsAreValid(sessions, semester), true);
  assert.deepEqual(parseStructuredScheduleSessions(sessions, semester), sessions);
});

test('frontend and worker allow two non-overlapping declared time ranges on the same date', () => {
  const sessions = [
    { ...monday, startTime: '13:00', endTime: '15:15' },
    { ...monday, startTime: '15:50', endTime: '17:05' },
  ];
  assert.equal(scheduleSessionsAreValid(sessions, semester), true);
  assert.deepEqual(parseStructuredScheduleSessions(sessions, semester), sessions);
});

test('frontend and worker still reject actual overlapping sessions regardless of room', () => {
  const sessions = [monday, { ...monday, room: 'B101' }];
  assert.equal(scheduleSessionsAreValid(sessions, semester), false);
  assert.throws(() => parseStructuredScheduleSessions(sessions, semester));
});

test('legacy conversion infers shift from contained times and retains the original range', () => {
  const [session] = scheduleSessionsFromLegacyFields({ weeks: '7', day_of_week: '2', shift: '15:50-17:05', room: 'San1' }, semester);
  assert.equal(session.shift, 'C');
  assert.equal((session as any).startTime, '15:50');
  assert.equal((session as any).endTime, '17:05');
});

test('cross-course conflict detection uses exact intervals, including split slot labels', () => {
  assert.equal(scheduleTimeLabelsOverlap('13:00 - 15:15', '15:50 - 17:05'), false);
  assert.equal(scheduleTimeLabelsOverlap('13:00-15:15', '15:15-17:05'), false);
  assert.equal(scheduleTimeLabelsOverlap('13:00-15:15', '15:00-17:05'), true);
  assert.equal(scheduleTimeLabelsOverlap('07:00-09:15;10:00-11:05', '09:35-09:55'), false);
  assert.equal(scheduleTimeLabelsOverlap('C', '15:50-17:05'), true);
  assert.equal(scheduleTimeLabelsOverlap('unknown', 'S'), true);
});
