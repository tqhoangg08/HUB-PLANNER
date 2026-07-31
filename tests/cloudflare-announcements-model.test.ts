import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicCacheKey,
  buildSupabaseAnnouncementsUrl,
  formatPostgrestTimestamp,
  normalizeSearch,
  parseAnnouncementQuery,
} from '../cloudflare/worker/src/index.ts';
import {
  buildSupabaseCourseSyncUrl,
  canUseCourseMetadataCount,
  parseCourseGroupTokens,
  parseCourseListPaging,
} from '../cloudflare/worker/src/courses.ts';
import {
  buildSupabaseEventsUrl,
  normalizeEventSearch,
  parseEventIds,
  parseEventQuery,
} from '../cloudflare/worker/src/events.ts';
import {
  buildSupabaseLostFoundUrl,
  normalizeLostFoundSearch,
  parseLostFoundQuery,
} from '../cloudflare/worker/src/lost-found.ts';

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

test('public cache keys are stable across query ordering and isolated by origin', () => {
  const first = buildPublicCacheKey(new Request(
    'https://api.example.com/events?limit=10&resource=announcements',
    { headers: { Origin: 'https://hotrosinhvienhub.id.vn' } }
  ));
  const reordered = buildPublicCacheKey(new Request(
    'https://api.example.com/events?resource=announcements&limit=10&randomCacheBuster=ignored',
    { headers: { Origin: 'https://hotrosinhvienhub.id.vn' } }
  ));
  const localhost = buildPublicCacheKey(new Request(
    'https://api.example.com/events?resource=announcements&limit=10',
    { headers: { Origin: 'http://localhost:3000' } }
  ));
  assert.equal(first.url, reordered.url);
  assert.notEqual(first.url, localhost.url);
});

test('course list paging keeps suggestions small and disables their pagination', () => {
  assert.deepEqual(
    parseCourseListPaging(new URLSearchParams('suggestions=true&limit=50&offset=100')),
    { suggestions: true, limit: 10, offset: 0 }
  );
  assert.deepEqual(
    parseCourseListPaging(new URLSearchParams('limit=500&offset=25')),
    { suggestions: false, limit: 100, offset: 25 }
  );
});

test('course totals use metadata only when no real filters are active', () => {
  assert.equal(canUseCourseMetadataCount(new URLSearchParams()), true);
  assert.equal(canUseCourseMetadataCount(new URLSearchParams('phase=all')), true);
  assert.equal(canUseCourseMetadataCount(new URLSearchParams('semester=HK1')), false);
  assert.equal(canUseCourseMetadataCount(new URLSearchParams('isUserAdded=false')), false);
  assert.equal(canUseCourseMetadataCount(new URLSearchParams('search=toan')), false);
});

test('course group tokens expand compact follow-up group numbers', () => {
  assert.deepEqual(parseCourseGroupTokens('ABC_N01, 02, XYZ_N03'), [
    'ABC_N01',
    'ABC_N02',
    'XYZ_N03',
  ]);
});

test('course sync URL is incremental and has a bounded page size', () => {
  const url = buildSupabaseCourseSyncUrl('https://example.supabase.co/', {
    since: '2026-07-30T00:00:00.000Z',
    offset: 500,
  });
  assert.equal(url.pathname, '/rest/v1/course_schedules');
  assert.equal(url.searchParams.get('updated_at'), 'gte.2026-07-30T00:00:00.000Z');
  assert.equal(url.searchParams.get('order'), 'updated_at.asc,id.asc');
  assert.equal(url.searchParams.get('limit'), '500');
  assert.equal(url.searchParams.get('offset'), '500');
});

test('public event query matches current API defaults and clamps paging', () => {
  assert.deepEqual(parseEventQuery(new URLSearchParams()), {
    limit: 100,
    offset: 0,
    search: '',
    criteria: 'all',
    scope: 'all',
    sort: 'newest',
    group: 'all',
    ids: null,
  });
  assert.equal(parseEventQuery(new URLSearchParams('limit=999')).limit, 100);
  assert.equal(parseEventQuery(new URLSearchParams('limit=-2')).limit, 1);
  assert.equal(parseEventQuery(new URLSearchParams('offset=-5')).offset, 0);
});

test('public event filters normalize search and reject invalid ids', () => {
  assert.equal(normalizeEventSearch('  NGÀY   HỘI, 100% '), 'ngày hội 100');
  assert.deepEqual(parseEventIds('5,2,5,-1,abc,3.5'), [5, 2]);
  assert.deepEqual(
    parseEventQuery(new URLSearchParams('sort=invalid&group=invalid')),
    {
      limit: 100,
      offset: 0,
      search: '',
      criteria: 'all',
      scope: 'all',
      sort: 'newest',
      group: 'all',
      ids: null,
    }
  );
});

test('event sync URL requests only public list columns in bounded pages', () => {
  const url = buildSupabaseEventsUrl('https://example.supabase.co/', 500);
  assert.equal(url.pathname, '/rest/v1/events');
  assert.equal(url.searchParams.get('order'), 'id.asc');
  assert.equal(url.searchParams.get('limit'), '500');
  assert.equal(url.searchParams.get('offset'), '500');
  assert.equal(
    url.searchParams.get('or'),
    '(is_deleted.is.false,is_deleted.is.null)'
  );
  assert.equal(url.searchParams.get('status'), 'neq.pending');
  assert.match(url.searchParams.get('select') || '', /registration_start_date/);
  assert.doesNotMatch(url.searchParams.get('select') || '', /contributor_note/);
});

test('event and announcement cache keys cannot collide', () => {
  const events = buildPublicCacheKey(
    new Request('https://api.example.com/events?limit=10', {
      headers: { Origin: 'https://hotrosinhvienhub.id.vn' },
    })
  );
  const announcements = buildPublicCacheKey(
    new Request(
      'https://api.example.com/events?resource=announcements&limit=10',
      { headers: { Origin: 'https://hotrosinhvienhub.id.vn' } }
    )
  );
  assert.notEqual(events.url, announcements.url);
});

test('lost-found query validates type, paging and Vietnamese search', () => {
  assert.deepEqual(
    parseLostFoundQuery(
      new URLSearchParams('type=lost&limit=999&offset=-2&search=  ĐIỆN, THOẠI%  ')
    ),
    {
      limit: 50,
      offset: 0,
      type: 'LOST',
      search: 'điện thoại',
    }
  );
  assert.equal(normalizeLostFoundSearch('  KHU   A,  '), 'khu a');
  assert.equal(parseLostFoundQuery(new URLSearchParams('type=other')).type, null);
});

test('lost-found sync requests only published non-deleted rows', () => {
  const url = buildSupabaseLostFoundUrl(
    'https://example.supabase.co/',
    500
  );
  assert.equal(url.pathname, '/rest/v1/lost_found_items');
  assert.equal(url.searchParams.get('is_deleted'), 'eq.false');
  assert.equal(url.searchParams.get('status'), 'in.(approved,resolved)');
  assert.equal(url.searchParams.get('order'), 'id.asc');
  assert.equal(url.searchParams.get('limit'), '500');
  assert.equal(url.searchParams.get('offset'), '500');
});

test('lost-found cache keys ignore unrelated parameters and stay isolated', () => {
  const first = buildPublicCacheKey(
    new Request(
      'https://api.example.com/lost-found?type=LOST&limit=24&random=ignored',
      { headers: { Origin: 'https://hotrosinhvienhub.id.vn' } }
    )
  );
  const reordered = buildPublicCacheKey(
    new Request(
      'https://api.example.com/lost-found?limit=24&type=LOST',
      { headers: { Origin: 'https://hotrosinhvienhub.id.vn' } }
    )
  );
  const events = buildPublicCacheKey(
    new Request('https://api.example.com/events?limit=24', {
      headers: { Origin: 'https://hotrosinhvienhub.id.vn' },
    })
  );
  assert.equal(first.url, reordered.url);
  assert.notEqual(first.url, events.url);
});
