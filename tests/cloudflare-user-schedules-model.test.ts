import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UserScheduleError,
  addUserSchedule,
  assertOwnUserScheduleTarget,
  buildSupabaseUserSchedulesUrl,
  listUserSchedules,
  parseUserScheduleCourseIds,
  parseUserScheduleCustomData,
  parseUserScheduleId,
  parseUserScheduleSemester,
} from '../cloudflare/worker/src/user-schedules.ts';

const USER_ID = 'd9428888-122b-4f0f-b88f-1c8f4f762b22';
const COURSE_ID = '57768d5d-e2a7-49c3-92a5-3956cd05de69';
const SCHEDULE_ID = '1368d47c-f0cb-47da-aa8a-cb650078b2e2';

test('user schedule identifiers, semester and request size are bounded', () => {
  assert.equal(parseUserScheduleId(USER_ID.toUpperCase()), USER_ID);
  assert.equal(parseUserScheduleSemester('HK1_2026_2027'), 'HK1_2026_2027');
  assert.deepEqual(
    parseUserScheduleCourseIds([COURSE_ID, COURSE_ID]),
    [COURSE_ID]
  );
  assert.deepEqual(
    parseUserScheduleCustomData({ room: 'A.101' }),
    { room: 'A.101' }
  );
  assert.throws(
    () => parseUserScheduleId('not-a-uuid'),
    UserScheduleError
  );
  assert.throws(
    () => parseUserScheduleSemester('../invalid'),
    UserScheduleError
  );
  assert.throws(
    () => parseUserScheduleCustomData(['not-an-object']),
    UserScheduleError
  );

  const syncUrl = buildSupabaseUserSchedulesUrl(
    'https://example.supabase.co/',
    { offset: 1_000 }
  );
  assert.equal(syncUrl.pathname, '/rest/v1/user_schedules');
  assert.equal(syncUrl.searchParams.get('limit'), '1000');
  assert.equal(syncUrl.searchParams.get('offset'), '1000');
  assert.equal(syncUrl.searchParams.get('order'), 'id.asc');

  const mutationUrl = buildSupabaseUserSchedulesUrl(
    'https://example.supabase.co',
    { userId: USER_ID, courseId: COURSE_ID }
  );
  assert.equal(mutationUrl.searchParams.get('user_id'), `eq.${USER_ID}`);
  assert.equal(mutationUrl.searchParams.get('course_id'), `eq.${COURSE_ID}`);
});

test('user schedule reads are restricted to the authenticated owner', () => {
  assert.equal(assertOwnUserScheduleTarget(USER_ID, null), USER_ID);
  assert.equal(
    assertOwnUserScheduleTarget(USER_ID, USER_ID.toUpperCase()),
    USER_ID
  );
  assert.throws(
    () =>
      assertOwnUserScheduleTarget(
        USER_ID,
        'f26257a2-f98b-4bf7-a7c3-54866cded95a'
      ),
    (error: unknown) =>
      error instanceof UserScheduleError && error.status === 403
  );
});

test('user schedule reads fail closed before the private mirror is seeded', async () => {
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
    () => listUserSchedules({ DB: db } as never, USER_ID),
    (error: unknown) =>
      error instanceof UserScheduleError && error.status === 503
  );
});

test('user schedule reads fall back when a linked course is not mirrored yet', async () => {
  const db = {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          return { synced_at: '2026-07-31T12:00:00Z' };
        },
        async all() {
          assert.match(sql, /LEFT JOIN course_schedules/);
          return {
            results: [
              {
                user_schedule_id: SCHEDULE_ID,
                schedule_course_id: COURSE_ID,
                schedule_semester: 'HK1_2026_2027',
                schedule_custom_data: null,
                base_course_id: null,
              },
            ],
          };
        },
      };
      return statement;
    },
  };

  await assert.rejects(
    () => listUserSchedules({ DB: db } as never, USER_ID),
    (error: unknown) =>
      error instanceof UserScheduleError && error.status === 503
  );
});

test('user schedule responses do not expose the private owner identifier', async () => {
  const db = {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          return { synced_at: '2026-07-31T12:00:00Z' };
        },
        async all() {
          return {
            results: [
              {
                user_schedule_id: SCHEDULE_ID,
                schedule_course_id: COURSE_ID,
                schedule_semester: 'HK1_2026_2027',
                schedule_custom_data: JSON.stringify({ room: 'A.101' }),
                base_course_id: COURSE_ID,
                course_code: 'TEST101',
              },
            ],
          };
        },
      };
      return statement;
    },
  };

  const result = await listUserSchedules({ DB: db } as never, USER_ID);
  const serialized = JSON.stringify(result);

  assert.equal(result.data[0].id, COURSE_ID);
  assert.equal('user' in result.data[0], false);
  assert.equal(serialized.includes(USER_ID), false);
});

test('user schedule writes use the user token and mirror only the returned row', async () => {
  const statements: string[] = [];
  const requests: Array<{ method: string; authorization: string | null }> = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      const statement = {
        bind() {
          return statement;
        },
      };
      return statement;
    },
    async batch(batch: unknown[]) {
      return batch.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const fetcher: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      method: String(init?.method || 'GET'),
      authorization: headers.get('Authorization'),
    });
    assert.equal(headers.get('apikey'), 'anon-key');
    assert.notEqual(headers.get('Authorization'), 'Bearer service-role-key');

    if (init?.method === 'POST') {
      assert.equal(
        headers.get('Prefer'),
        'resolution=ignore-duplicates,return=minimal'
      );
      return new Response(null, { status: 201 });
    }
    return Response.json([
      {
        id: SCHEDULE_ID,
        user_id: USER_ID,
        course_id: COURSE_ID,
        semester: 'HK1_2026_2027',
        custom_data: null,
        created_at: '2026-07-31T12:00:00Z',
      },
    ]);
  };

  const result = await addUserSchedule(
    {
      DB: db,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    } as never,
    'student-token',
    USER_ID,
    COURSE_ID,
    'HK1_2026_2027',
    fetcher
  );

  assert.deepEqual(result, { success: true, mirrorSynced: true });
  assert.deepEqual(
    requests.map((request) => request.method),
    ['POST', 'GET']
  );
  assert.equal(
    requests.every(
      (request) => request.authorization === 'Bearer student-token'
    ),
    true
  );
  assert.equal(
    statements.some((sql) => sql.includes('INSERT INTO user_schedules')),
    true
  );
});
