import assert from 'node:assert/strict';
import test from 'node:test';
import { isRecentSchoolAnnouncement, millisecondsUntilVietnamMidnight, vietnamCalendarDate } from '../utils/schoolAnnouncementRecency.ts';

test('seven inclusive calendar days: today and day six qualify, day seven and future do not', () => {
  for (const [date, expected] of [['2026-10-31', true], ['2026-10-25', true], ['2026-10-24', false], ['2026-11-01', false]] as const) {
    assert.equal(isRecentSchoolAnnouncement(date, '2026-10-31'), expected, date);
  }
});

test('only valid YYYY-MM-DD dates qualify', () => {
  for (const date of [undefined, null, '', 20261031, '2026-10-3', '31/10/2026', '2026-10-31T00:00:00Z', '2026-02-30', '2026-13-01', '2026-00-01', '2026-10-00', '0000-01-01', '2026-02-29']) {
    assert.equal(isRecentSchoolAnnouncement(date, '2026-10-31'), false, String(date));
  }
  assert.equal(isRecentSchoolAnnouncement('2024-02-29', '2024-03-01'), true);
  assert.equal(isRecentSchoolAnnouncement('2026-10-31', 'invalid'), false);
});

test('month/year boundaries count calendar days without rollover parsing or local timezone offsets', () => {
  for (const [today, included, excluded] of [
    ['2026-11-01', '2026-10-26', '2026-10-25'],
    ['2027-01-01', '2026-12-26', '2026-12-25'],
    ['2024-03-01', '2024-02-24', '2024-02-23'],
  ]) {
    assert.equal(isRecentSchoolAnnouncement(included, today), true);
    assert.equal(isRecentSchoolAnnouncement(excluded, today), false);
  }
});

test('Vietnam midnight changes day at 17:00 UTC and schedules the next midnight', () => {
  const before = Date.parse('2026-10-31T16:59:59.999Z');
  assert.equal(vietnamCalendarDate(before), '2026-10-31');
  assert.equal(millisecondsUntilVietnamMidnight(before), 1);
  assert.equal(vietnamCalendarDate(before + 1), '2026-11-01');
  assert.equal(millisecondsUntilVietnamMidnight(before + 1), 86_400_000);
  assert.equal(vietnamCalendarDate(Date.parse('2026-12-31T17:00:00Z')), '2027-01-01');
});
