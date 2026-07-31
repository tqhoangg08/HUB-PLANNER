import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSupabaseAdminEventsUrl,
  parseAdminEventQuery,
} from '../cloudflare/worker/src/admin-events.ts';

test('admin event sync requests every state and all migration columns', () => {
  const url = buildSupabaseAdminEventsUrl(
    'https://example.supabase.co/',
    500
  );
  assert.equal(url.pathname, '/rest/v1/events');
  assert.equal(url.searchParams.get('order'), 'id.asc');
  assert.equal(url.searchParams.get('limit'), '500');
  assert.equal(url.searchParams.get('offset'), '500');
  assert.equal(url.searchParams.get('status'), null);
  assert.equal(url.searchParams.get('is_deleted'), null);
  assert.match(url.searchParams.get('select') || '', /contributor_note/);
  assert.match(url.searchParams.get('select') || '', /registration_start_date/);
  assert.match(url.searchParams.get('select') || '', /image_url/);
});

test('admin event query clamps paging and accepts only known filters', () => {
  assert.deepEqual(parseAdminEventQuery(new URLSearchParams()), {
    limit: 50,
    offset: 0,
    search: '',
    state: 'all',
    criteria: 'all',
    scope: 'all',
    group: 'all',
    ids: null,
    sort: 'newest',
  });
  assert.deepEqual(
    parseAdminEventQuery(
      new URLSearchParams(
        'limit=999&offset=-3&search=  HUB, 100% &state=pending&sort=oldest'
      )
    ),
    {
      limit: 500,
      offset: 0,
      search: 'hub 100',
      state: 'pending',
      criteria: 'all',
      scope: 'all',
      group: 'all',
      ids: null,
      sort: 'oldest',
    }
  );
  assert.equal(
    parseAdminEventQuery(new URLSearchParams('state=unknown')).state,
    'all'
  );
  assert.equal(
    parseAdminEventQuery(new URLSearchParams('limit=2.8&offset=4.9')).limit,
    2
  );
  assert.equal(
    parseAdminEventQuery(new URLSearchParams('limit=2.8&offset=4.9')).offset,
    4
  );
  assert.equal(
    parseAdminEventQuery(
      new URLSearchParams(`search=${'a'.repeat(150)}`)
    ).search.length,
    120
  );
  assert.deepEqual(
    parseAdminEventQuery(
      new URLSearchParams(
        'criteria=III&scope=external&group=closed&ids=3,3,7&sort=expiring_soon'
      )
    ),
    {
      limit: 50,
      offset: 0,
      search: '',
      state: 'all',
      criteria: 'III',
      scope: 'external',
      group: 'closed',
      ids: [3, 7],
      sort: 'expiring_soon',
    }
  );
});
