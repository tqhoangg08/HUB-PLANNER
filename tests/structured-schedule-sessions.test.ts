import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getScheduleSessionErrors,
  getSemesterWeekOptions,
  scheduleSessionsAreValid,
  serializeScheduleSessions,
  type ScheduleSessionCatalogue,
} from '../utils/scheduleSessions.ts';

const semester = 'HK1_2026_2027';
const catalogue: ScheduleSessionCatalogue = {
  campuses: ['Campus A', 'Campus B'],
  roomsByCampus: { 'Campus A': ['A.101'], 'Campus B': ['B.202'] },
};

test('semester week options are bounded and include semester dates', () => {
  const weeks = getSemesterWeekOptions(semester);
  assert.equal(weeks.length, 22);
  assert.match(weeks[0].label, /^Tuần 1 \(31\/08 - 06\/09\)$/);
});

test('structured sessions require canonical weeks, day, shift and matching campus room', () => {
  const session = { weeks: [1, 2, 3], dayOfWeek: 2, shift: 'S' as const, campus: 'Campus A', room: 'A.101' };
  assert.deepEqual(getScheduleSessionErrors(session, semester, catalogue), []);
  assert.equal(scheduleSessionsAreValid([session], semester, catalogue), true);
  assert.equal(scheduleSessionsAreValid([{ ...session, dayOfWeek: 9 }], semester, catalogue), false);
  assert.equal(scheduleSessionsAreValid([{ ...session, shift: '' }], semester, catalogue), false);
  assert.equal(scheduleSessionsAreValid([{ ...session, campus: 'Unknown' }], semester, catalogue), false);
  assert.equal(scheduleSessionsAreValid([{ ...session, room: 'B.202' }], semester, catalogue), false);
});

test('multiple sessions serialize to existing deterministic parallel schedule fields', () => {
  assert.deepEqual(serializeScheduleSessions([
    { weeks: [1, 2, 3], dayOfWeek: 2, shift: 'S', campus: 'Campus A', room: 'A.101' },
    { weeks: [6, 7], dayOfWeek: 4, shift: 'C', campus: 'Campus B', room: 'B.202' },
  ]), {
    weeks: '1,2,3\n6,7', day_of_week: '2\n4', shift: 'S\nC', campus: 'Campus A\nCampus B', room: 'A.101\nB.202',
  });
});
