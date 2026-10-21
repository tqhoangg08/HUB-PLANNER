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


test('each registration status and category still filters the matching event only', () => {
  const common = { ...event, event_date: '2099-12-31', registration_start_date: '', deadlineDate: new Date('2099-12-30'), status: 'Sắp diễn ra' };
  const examples = [
    { ...common, status: 'Đang mở đăng ký' },
    { ...common, registration_start_date: '2099-12-01' },
    { ...common, status: 'Đã đóng đăng ký' },
    { ...common, status: 'Đang diễn ra' },
    { ...common, status: 'Đã kết thúc' },
  ];
  for (const [index, registrationStatus] of (['open', 'upcoming', 'closed', 'ongoing', 'ended'] as const).entries()) {
    assert.deepEqual(examples.filter(candidate => matchesEventFilters(candidate, { ...createDefaultEventFilters(), registrationStatus })), [examples[index]]);
  }
  for (const category of ['I', 'II', 'III', 'IV', 'V']) {
    assert.equal(matchesEventFilters({ ...common, category }, { ...createDefaultEventFilters(), trainingCategories: [category] }), true);
    assert.equal(matchesEventFilters({ ...common, category }, { ...createDefaultEventFilters(), trainingCategories: ['other'] }), false);
  }
});

test('all sort orders and inclusive date boundaries preserve their contract', () => {
  const earlier = { ...event, created_at: '2026-01-01', event_date: '2026-02-01', score: '1', deadlineDate: new Date('2026-01-30') };
  const later = { ...event, created_at: '2026-02-01', event_date: '2026-03-01', score: '5', deadlineDate: new Date('2026-02-28') };
  for (const sort of ['oldest', 'upcoming', 'registrationDeadline'] as const) assert.deepEqual([later, earlier].sort((a,b) => compareFilteredEvents(a,b,sort)), [earlier,later]);
  for (const sort of ['newest', 'highestScore'] as const) assert.deepEqual([earlier, later].sort((a,b) => compareFilteredEvents(a,b,sort)), [later,earlier]);
  const filters = { ...createDefaultEventFilters(), datePreset: 'custom' as const, dateFrom: '2026-02-01', dateTo: '2026-03-01' };
  assert.deepEqual([earlier,later].filter(candidate => matchesEventFilters(candidate,filters)),[earlier,later]);
  assert.equal(matchesEventFilters({...earlier,event_date:'2026-01-31'},filters),false);
  assert.equal(matchesEventFilters({...later,event_date:'2026-03-02'},filters),false);
});
