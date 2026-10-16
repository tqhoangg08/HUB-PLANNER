import assert from 'node:assert/strict';
import test from 'node:test';
import { inferScheduleShift, parseScheduleTimeRange, scheduleSessionsFromLegacyFields, scheduleSessionsAreValid, serializeScheduleSessions } from '../utils/scheduleSessions.ts';

test('HUB full and partial morning/afternoon ranges map without losing original times', () => {
  for (const [range, shift] of [['07:00-11:05', 'S'], ['07:00-09:15', 'S'], ['09:35-11:05', 'S'], ['13:00-17:05', 'C'], ['13:00-15:15', 'C'], ['15:50-17:05', 'C'], ['08:20-10:10', 'S'], ['14:10-16:20', 'C']]) {
    const parsed = parseScheduleTimeRange(range)!;
    assert.equal(inferScheduleShift(parsed.startTime, parsed.endTime), shift);
    const sessions = scheduleSessionsFromLegacyFields({ weeks: '7', day_of_week: '2', shift: range, room: 'A101' }, 'HK1_2026_2027');
    assert.equal(sessions[0].shift, shift);
    assert.equal(scheduleSessionsAreValid(sessions, 'HK1_2026_2027'), true);
    assert.equal(serializeScheduleSessions(sessions).shift, range);
  }
});

test('missing, reversed, malformed, outside-shift and cross-shift times never receive a guessed shift', () => {
  for (const [start, end] of [['', '11:05'], ['07:00', ''], ['25:00', '26:00'], ['13:70', '17:05'], ['13:00', '13:00'], ['17:05', '13:00'], ['06:59', '11:05'], ['07:00', '13:00'], ['11:00', '14:00'], ['13:00', '17:06']]) assert.equal(inferScheduleShift(start, end), '');
});
