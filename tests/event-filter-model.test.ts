import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareFilteredEvents,
  createDefaultEventFilters,
  getEventFilterCount,
  getPresetDateRange,
  matchesEventFilters,
} from '../utils/eventFilters.ts';

const event = {
  name: 'Ngày hội sinh viên HUB',
  organizer: 'Đoàn trường',
  type: 'Tình nguyện',
  category: 'IV',
  scope: 'Trong trường',
  score: '5',
  status: 'Sắp diễn ra',
  created_at: '2026-07-30T08:00:00Z',
  event_date: '2026-08-12',
  deadlineDate: new Date('2026-08-10T23:59:59Z'),
  registration_start_date: '2026-08-01',
  is_manually_closed: false,
  is_deleted: false,
};

test('filter badge counts groups and ignores defaults and keyword', () => {
  const filters = createDefaultEventFilters();
  filters.keyword = 'HUB';
  filters.region = 'Trong trường';
  filters.trainingCategories = ['I', 'II', 'III'];
  assert.equal(getEventFilterCount(filters), 2);
});

test('event filtering combines keyword, region, type, date and category', () => {
  const filters = {
    ...createDefaultEventFilters(),
    keyword: 'đoàn trường',
    region: 'Trong trường',
    eventType: 'Tình nguyện',
    datePreset: 'custom' as const,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    trainingCategories: ['IV'],
  };
  assert.equal(matchesEventFilters(event, filters), true);
  assert.equal(matchesEventFilters(event, { ...filters, region: 'Ngoài trường' }), false);
});

test('month presets and score sorting are deterministic', () => {
  assert.deepEqual(getPresetDateRange('thisMonth', new Date(2026, 7, 15)), {
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
  });
  const lowerScore = { ...event, score: '3' };
  assert.ok(compareFilteredEvents(event, lowerScore, 'highestScore') < 0);
});
