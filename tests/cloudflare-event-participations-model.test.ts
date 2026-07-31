import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EventParticipationError,
  buildSupabaseParticipationMutationUrl,
  buildSupabaseParticipationsSyncUrl,
  listEventParticipations,
  mutateEventParticipation,
  parseParticipationEventId,
  parseParticipationUserId,
} from '../cloudflare/worker/src/event-participations.ts';

const USER_ID = 'd9428888-122b-4f0f-b88f-1c8f4f762b22';

test('participation identifiers and Supabase URLs are bounded', () => {
  assert.equal(parseParticipationEventId('42'), 42);
  assert.equal(parseParticipationUserId(USER_ID.toUpperCase()), USER_ID);
  assert.throws(
    () => parseParticipationEventId('0'),
    EventParticipationError
  );
  assert.throws(
    () => parseParticipationUserId('not-a-user'),
    EventParticipationError
  );

  const syncUrl = buildSupabaseParticipationsSyncUrl(
    'https://example.supabase.co/',
    1_000
  );
  assert.equal(syncUrl.pathname, '/rest/v1/user_participations');
  assert.equal(syncUrl.searchParams.get('limit'), '1000');
  assert.equal(syncUrl.searchParams.get('offset'), '1000');
  assert.equal(syncUrl.searchParams.get('order'), 'id.asc');

  const insertUrl = buildSupabaseParticipationMutationUrl(
    'https://example.supabase.co',
    USER_ID,
    42,
    true
  );
  assert.equal(insertUrl.searchParams.get('on_conflict'), 'user_id,event_id');
  assert.equal(insertUrl.searchParams.get('user_id'), null);

  const deleteUrl = buildSupabaseParticipationMutationUrl(
    'https://example.supabase.co',
    USER_ID,
    42,
    false
  );
  assert.equal(deleteUrl.searchParams.get('user_id'), `eq.${USER_ID}`);
  assert.equal(deleteUrl.searchParams.get('event_id'), 'eq.42');
});

test('participation reads fail closed before the private mirror is seeded', async () => {
  const db = {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          return null;
        },
      };
      return statement;
    },
  };

  await assert.rejects(
    () => listEventParticipations({ DB: db } as never, USER_ID),
    (error: unknown) =>
      error instanceof EventParticipationError && error.status === 503
  );
});

test('participation writes use the user token and target only one D1 row', async () => {
  const statements: string[] = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      const statement = {
        bind() {
          return statement;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(batch: unknown[]) {
      return batch.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    assert.equal(url.pathname, '/rest/v1/user_participations');
    assert.equal(init?.method, 'POST');
    assert.equal(headers.get('Authorization'), 'Bearer student-token');
    assert.equal(headers.get('apikey'), 'anon-key');
    assert.notEqual(headers.get('Authorization'), 'Bearer service-role-key');
    return Response.json([
      {
        user_id: USER_ID,
        event_id: 42,
        created_at: '2026-07-31T12:00:00Z',
      },
    ]);
  };

  const result = await mutateEventParticipation(
    {
      DB: db,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    } as never,
    'student-token',
    USER_ID,
    42,
    true,
    fetcher
  );

  assert.deepEqual(result, {
    success: true,
    eventId: 42,
    participated: true,
    mirrorSynced: true,
  });
  assert.equal(
    statements.some((sql) =>
      sql.includes('INSERT INTO user_event_participations')
    ),
    true
  );
});
