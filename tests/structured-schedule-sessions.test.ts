import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getScheduleSessionErrors,
  getDuplicateWeekSessionIndexes,
  getSemesterWeekOptions,
  scheduleSessionsAreValid,
  serializeScheduleSessions,
} from '../utils/scheduleSessions.ts';

const semester = 'HK1_2026_2027';

test('semester week options are bounded and include semester dates', () => {
  const weeks = getSemesterWeekOptions(semester);
  assert.equal(weeks.length, 22);
  assert.match(weeks[0].label, /^Tuần 1 \(31\/08 - 06\/09\)$/);
});

test('structured sessions require exactly one canonical week, day, shift and bounded free-text room', () => {
  const session = { weeks: [1], dayOfWeek: 2, shift: 'S' as const, campus: '', room: 'A.101' };
  assert.deepEqual(getScheduleSessionErrors(session, semester), []);
  assert.equal(scheduleSessionsAreValid([session], semester), true);
  assert.equal(scheduleSessionsAreValid([{ ...session, weeks: [1, 2] }], semester), false);
  assert.equal(scheduleSessionsAreValid([{ ...session, dayOfWeek: 9 }], semester), false);
  assert.equal(scheduleSessionsAreValid([{ ...session, shift: '' }], semester), false);
  assert.equal(scheduleSessionsAreValid([{ ...session, room: 'X'.repeat(121) }], semester), false);
  assert.deepEqual([...getDuplicateWeekSessionIndexes([session, { ...session, room: 'B.202' }])], [0, 1]);
  assert.equal(scheduleSessionsAreValid([session, { ...session, room: 'B.202' }], semester), false);
});

test('multiple sessions serialize to existing deterministic parallel schedule fields', () => {
  assert.deepEqual(serializeScheduleSessions([
    { weeks: [1], dayOfWeek: 2, shift: 'S', campus: '', room: 'A.101' },
    { weeks: [6], dayOfWeek: 4, shift: 'C', campus: '', room: 'B.202' },
  ]), {
    weeks: '1\n6', day_of_week: '2\n4', shift: 'S\nC', campus: '\n', room: 'A.101\nB.202',
  });
});
