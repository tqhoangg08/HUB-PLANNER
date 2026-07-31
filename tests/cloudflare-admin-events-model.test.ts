import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSupabaseAdminEventsUrl,
  parseAdminEventQuery,
} from '../cloudflare/worker/src/admin-events.ts';
import {
  AdminEventMutationError,
  assertAdminEventMutationAllowed,
  buildSupabaseAdminEventMutationUrl,
  mutateAdminEvent,
  readAdminEventIdempotencyKey,
  readAdminEventMutationPayload,
  validateAdminEventMutationPayload,
} from '../cloudflare/worker/src/admin-event-mutations.ts';

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

test('admin event mutation URL requests the written row only', () => {
  const createUrl = buildSupabaseAdminEventMutationUrl(
    'https://example.supabase.co/'
  );
  assert.equal(createUrl.pathname, '/rest/v1/events');
  assert.equal(createUrl.searchParams.get('id'), null);
  assert.match(createUrl.searchParams.get('select') || '', /created_at/);

  const updateUrl = buildSupabaseAdminEventMutationUrl(
    'https://example.supabase.co',
    42
  );
  assert.equal(updateUrl.searchParams.get('id'), 'eq.42');
});

test('admin event mutation accepts only bounded known fields', () => {
  assert.deepEqual(
    validateAdminEventMutationPayload(
      {
        title: '  Sự kiện mới  ',
        points: 5,
        deadline: '',
        event_time: '08:30',
        close_on_full: true,
      },
      'create'
    ),
    {
      title: 'Sự kiện mới',
      points: '5',
      deadline: null,
      event_time: '08:30',
      close_on_full: true,
    }
  );

  assert.throws(
    () =>
      validateAdminEventMutationPayload(
        { title: 'Sự kiện', unexpected: 'field' },
        'create'
      ),
    (error: unknown) =>
      error instanceof AdminEventMutationError && error.status === 400
  );
  assert.throws(
    () =>
      validateAdminEventMutationPayload(
        { title: 'Sự kiện', event_date: '2026-02-31' },
        'create'
      ),
    AdminEventMutationError
  );
  assert.throws(
    () => validateAdminEventMutationPayload({ status: 'Đang diễn ra' }, 'create'),
    AdminEventMutationError
  );
});

test('admin event mutation enforces delete role and JSON content type', async () => {
  assert.throws(
    () => assertAdminEventMutationAllowed({ is_deleted: true }, 'auditor'),
    (error: unknown) =>
      error instanceof AdminEventMutationError && error.status === 403
  );
  assert.doesNotThrow(() =>
    assertAdminEventMutationAllowed({ is_deleted: true }, 'admin')
  );

  const request = new Request('https://example.com/api/admin/v1/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ title: 'Sự kiện hợp lệ' }),
  });
  assert.deepEqual(await readAdminEventMutationPayload(request, 'create'), {
    title: 'Sự kiện hợp lệ',
  });

  await assert.rejects(
    () =>
      readAdminEventMutationPayload(
        new Request('https://example.com/api/admin/v1/events', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: '{}',
        }),
        'create'
      ),
    (error: unknown) =>
      error instanceof AdminEventMutationError && error.status === 415
  );
});

test('admin event create requires a UUID idempotency key', () => {
  const request = new Request('https://example.com/api/admin/v1/events', {
    headers: {
      'Idempotency-Key': 'f475fdb4-39e1-4a0c-a11f-f4c7e71652f3',
    },
  });
  assert.equal(
    readAdminEventIdempotencyKey(request),
    'f475fdb4-39e1-4a0c-a11f-f4c7e71652f3'
  );
  assert.throws(
    () =>
      readAdminEventIdempotencyKey(
        new Request('https://example.com/api/admin/v1/events')
      ),
    (error: unknown) =>
      error instanceof AdminEventMutationError && error.status === 400
  );
});

test('replaying a create mutation returns the first event without a second Supabase write', async () => {
  let storedMutation:
    | {
        user_id: string;
        status: 'pending' | 'completed';
        response_json: string | null;
      }
    | undefined;
  let supabaseWriteCount = 0;

  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        async run() {
          if (sql.includes('INSERT OR IGNORE INTO admin_event_mutations')) {
            if (storedMutation) return { meta: { changes: 0 } };
            storedMutation = {
              user_id: String(bindings[1]),
              status: 'pending',
              response_json: null,
            };
            return { meta: { changes: 1 } };
          }
          if (
            sql.includes('UPDATE admin_event_mutations') &&
            sql.includes("SET status = 'completed'")
          ) {
            storedMutation = {
              user_id: String(bindings[4]),
              status: 'completed',
              response_json: String(bindings[1]),
            };
            return { meta: { changes: 1 } };
          }
          if (
            sql.includes('UPDATE admin_event_mutations') &&
            sql.includes('SET response_json = ?') &&
            storedMutation
          ) {
            storedMutation.response_json = String(bindings[0]);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
        async first() {
          if (sql.includes('FROM admin_event_mutations')) {
            return storedMutation || null;
          }
          return {
            row_count: 1,
            max_created_at: '2026-07-31T00:00:00Z',
          };
        },
      };
      return statement;
    },
    async batch(statements: unknown[]) {
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };

  const row = {
    id: 321,
    title: 'Sự kiện không bị tạo trùng',
    organizer: null,
    category: null,
    criteria: 'III',
    points: '5',
    format: null,
    deadline: null,
    deadline_time: null,
    close_on_full: false,
    description: null,
    link: null,
    classification: null,
    location_type: 'Trong trường',
    status: 'Sắp diễn ra',
    is_manually_closed: false,
    is_deleted: false,
    created_at: '2026-07-31T00:00:00Z',
    event_date: null,
    event_time: null,
    registration_start_date: null,
    registration_start_time: null,
    image_url: null,
    contribution_link: null,
    contributor_note: null,
    section: null,
    score: null,
  };
  const fetcher: typeof fetch = async (_input, init) => {
    supabaseWriteCount += 1;
    assert.equal(init?.method, 'POST');
    return Response.json([row]);
  };
  const env = {
    DB: db,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  } as never;
  const createRequest = {
    mutationId: 'f475fdb4-39e1-4a0c-a11f-f4c7e71652f3',
    userId: 'd9428888-122b-4f0f-b88f-1c8f4f762b22',
  };

  const first = await mutateAdminEvent(
    env,
    'create',
    { title: row.title },
    undefined,
    fetcher,
    createRequest
  );
  const replay = await mutateAdminEvent(
    env,
    'create',
    { title: row.title },
    undefined,
    fetcher,
    createRequest
  );

  assert.equal(first.data[0].id, 321);
  assert.equal(replay.data[0].id, 321);
  assert.equal(replay.replayed, true);
  assert.equal(supabaseWriteCount, 1);
});
