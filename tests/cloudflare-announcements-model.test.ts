import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSupabaseAnnouncementsUrl,
  formatPostgrestTimestamp,
  normalizeSearch,
  parseAnnouncementQuery,
} from '../cloudflare/worker/src/index.ts';

test('announcement query uses safe defaults', () => {
  const query = parseAnnouncementQuery(new URLSearchParams());
  assert.deepEqual(query, {
    limit: 10,
    offset: 0,
    search: '',
    startDate: '',
    endDate: '',
  });
});

test('announcement query clamps limit and offset', () => {
  assert.equal(parseAnnouncementQuery(new URLSearchParams('limit=1000')).limit, 60);
  assert.equal(parseAnnouncementQuery(new URLSearchParams('limit=-5')).limit, 1);
  assert.equal(parseAnnouncementQuery(new URLSearchParams('offset=-10')).offset, 0);
});

test('announcement search normalization is stable for Vietnamese text', () => {
  assert.equal(normalizeSearch('  THÔNG   BÁO, 100%  '), 'thông báo 100');
});

test('D1 timestamps preserve time while matching PostgREST formatting', () => {
  assert.equal(
    formatPostgrestTimestamp('2026-07-17T07:15:32.107490+00:00'),
    '2026-07-17T07:15:32.10749+00:00'
  );
  assert.equal(
    formatPostgrestTimestamp('2026-07-17T07:15:32.000000+00:00'),
    '2026-07-17T07:15:32+00:00'
  );
  assert.equal(
    formatPostgrestTimestamp('2026-07-30T07:45:32.212512+00:00'),
    '2026-07-30T07:45:32.212512+00:00'
  );
});

test('incremental announcement sync only requests rows after the D1 cursor', () => {
  const url = buildSupabaseAnnouncementsUrl('https://example.supabase.co/', {
    afterId: 5505,
  });
  assert.equal(url.origin, 'https://example.supabase.co');
  assert.equal(url.pathname, '/rest/v1/school_announcements');
  assert.equal(url.searchParams.get('id'), 'gt.5505');
  assert.equal(url.searchParams.get('order'), 'id.asc');
  assert.equal(url.searchParams.get('limit'), '500');
  assert.match(url.searchParams.get('select') || '', /is_hidden/);
});

test('announcement sync refreshes a small recent window for flag changes', () => {
  const url = buildSupabaseAnnouncementsUrl('https://example.supabase.co', {
    latestLimit: 200,
  });
  assert.equal(url.searchParams.get('id'), null);
  assert.equal(url.searchParams.get('order'), 'id.desc');
  assert.equal(url.searchParams.get('limit'), '200');
});
