import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDefaultEventFilters } from '../utils/eventFilters.ts';
import {
  filterAdminEvents, getAdminEventSemester, getAdminEventStats, getAdminEventStatus,
  paginateAdminEvents, type AdminManagementEvent,
} from '../utils/adminEventManagement.ts';

const makeEvent = (id: string, overrides: Partial<AdminManagementEvent> = {}): AdminManagementEvent => ({
  id, name: `Sự kiện ${id}`, organizer: 'Đoàn trường', type: 'Hội thảo', category: 'I',
  scope: 'Trong trường', score: '5', status: 'Sắp diễn ra', created_at: '2026-09-01T00:00:00Z',
  event_date: '2026-09-30', event_time: '08:00', deadlineDate: new Date('2026-09-25'),
  deadline_time: null, registration_start_date: '2026-09-01', is_manually_closed: false,
  is_deleted: false, close_on_full: false, location: 'Offline', classification: '', ...overrides,
});
const now = new Date('2026-09-23T12:00:00+07:00');

test('stats use actual visible event rows and status precedence', () => {
  const events = [
    makeEvent('1'), makeEvent('2', { is_manually_closed: true }),
    makeEvent('3', { status: 'pending' }), makeEvent('4', { is_deleted: true }),
  ];
  assert.deepEqual(getAdminEventStats(events, now), { total: 3, open: 1, upcoming: 2, closed: 1 });
  assert.equal(getAdminEventStatus(events[2], now), 'pending');
});

test('management tabs, criteria, keyword, type, status, date and sort filter the same D1-backed list', () => {
  const events = [
    makeEvent('1', { name: 'Hội thảo học thuật', category: 'I' }),
    makeEvent('2', { name: 'Ngày hội tình nguyện', category: 'IV', is_manually_closed: true }),
    makeEvent('3', { name: 'Học bổng', category: 'II', status: 'pending' }),
  ];
  const defaults = createDefaultEventFilters();
  assert.deepEqual(filterAdminEvents(events, defaults, 'open', 'all', now).map(item => item.id), ['1']);
  assert.deepEqual(filterAdminEvents(events, defaults, 'upcoming', 'all', now).map(item => item.id), ['1', '2']);
  assert.deepEqual(filterAdminEvents(events, defaults, 'closed', 'all', now).map(item => item.id), ['2']);
  assert.deepEqual(filterAdminEvents(events, { ...defaults, trainingCategories: ['IV'] }, 'all', 'all', now).map(item => item.id), ['2']);
  assert.deepEqual(filterAdminEvents(events, { ...defaults, keyword: 'học thuật' }, 'all', 'all', now).map(item => item.id), ['1']);
  assert.deepEqual(filterAdminEvents(events, { ...defaults, eventType: 'Hội thảo', registrationStatus: 'ended' }, 'all', 'all', now).map(item => item.id), ['2']);
  assert.deepEqual(filterAdminEvents(events, { ...defaults, datePreset: 'custom', dateFrom: '2026-10-01' }, 'all', 'all', now), []);
});

test('semester facet is only inferred from an existing event date, not invented when absent', () => {
  assert.equal(getAdminEventSemester('2026-09-30'), 'HK1_2026_2027');
  assert.equal(getAdminEventSemester(null), null);
  assert.equal(getAdminEventSemester('2035-09-30'), null);
  const events = [makeEvent('1'), makeEvent('2', { event_date: null })];
  assert.deepEqual(filterAdminEvents(events, createDefaultEventFilters(), 'all', 'HK1_2026_2027', now).map(item => item.id), ['1']);
});

test('client pagination is bounded and clamps stale pages', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1);
  assert.deepEqual(paginateAdminEvents(rows, 2, 10), { page: 2, pageCount: 3, start: 10, end: 20, items: rows.slice(10, 20) });
  assert.equal(paginateAdminEvents(rows.slice(0, 1), 3, 10).page, 1);
});

test('only admin/auditor use the new management branch; student preview and CTV retain old UI', () => {
  const source = readFileSync('components/EventsBoard.tsx', 'utf8');
  assert.match(source, /showAdminManagementPage = \(isAdmin \|\| isAuditor\) && !isStudentPreview && !eventId/);
  assert.match(source, /showAdminManagementPage \? <AdminEventManagementView/);
  assert.match(source, /showManagementView \? \(/);
  assert.match(source, /DẠNG CARD LƯỚI CHO USER BÌNH THƯỜNG/);
});
