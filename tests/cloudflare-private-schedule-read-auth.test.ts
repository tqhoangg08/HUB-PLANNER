import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from '../cloudflare/worker/src/index.ts';

const USER_A = 'd9428888-122b-4f0f-b88f-1c8f4f762b22';
const USER_B = '57768d5d-e2a7-49c3-92a5-3956cd05de69';
const COURSE_ID = '1368d47c-f0cb-47da-aa8a-cb650078b2e2';
const SCHEDULE_ID = 'f26257a2-f98b-4bf7-a7c3-54866cded95a';
const COOKIE = 'hubplanner_auth.session_token=opaque-session';

const identity = (
  userId = USER_A,
  role: 'user' | 'admin' | 'auditor' = 'user'
) => ({ userId, email: 'student@st.buh.edu.vn', role });

const scheduleRow = {
  user_schedule_id: SCHEDULE_ID,
  schedule_course_id: COURSE_ID,
  schedule_semester: 'HK1_2026_2027',
  schedule_custom_data: JSON.stringify({ room: 'A.101' }),
  base_course_id: COURSE_ID,
  course_code: 'TEST101',
  subject_name: 'Môn kiểm thử',
};

const createDb = (options: {
  rowsForUser?: (userId: string) => unknown[];
  bindings?: unknown[][];
  calls?: string[];
} = {}) => ({
  prepare(sql: string) {
    options.calls?.push(sql);
    let values: unknown[] = [];
    const statement = {
      bind(...nextValues: unknown[]) {
        values = nextValues;
        options.bindings?.push(nextValues);
        return statement;
      },
      async first() {
        if (sql.includes('sync_metadata')) {
          return { synced_at: '2026-08-01T00:00:00Z' };
        }
        throw new Error('unexpected first query');
      },
      async all() {
        if (sql.includes('FROM user_schedule_revisions')) {
          return { results: [] };
        }
        if (!sql.includes('FROM user_schedules us')) {
          throw new Error('unexpected all query');
        }
        return { results: options.rowsForUser?.(String(values[0])) || [] };
      },
    };
    return statement;
  },
});

const createEnv = (
  authFetcher: (request: Request) => Promise<Response> | Response,
  db = createDb()
) => ({
  ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
  AUTH_SERVICE: { fetch: async (request: Request) => authFetcher(request) },
  DB: db,
}) as never;

const scheduleRequest = (options: {
  cookie?: string;
  headers?: HeadersInit;
  method?: string;
  query?: string;
} = {}) => {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set('Cookie', options.cookie);
  return new Request(
    `https://hotrosinhvienhub.id.vn/api/user/v1/schedules${options.query || ''}`,
    { method: options.method || 'GET', headers }
  );
};

test('Better Auth user reads only their own D1 schedule', async () => {
  const bindings: unknown[][] = [];
  const response = await worker.fetch(
    scheduleRequest({ cookie: COOKIE }),
    createEnv(
      () => Response.json(identity()),
      createDb({
        bindings,
        rowsForUser: (userId) => userId === USER_A ? [scheduleRow] : [],
      })
    ),
    {} as never
  );

  assert.equal(response.status, 200);
  const payload = await response.json() as {
    success: boolean;
    data: Array<Record<string, unknown>>;
  };
  assert.equal(payload.success, true);
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].id, COURSE_ID);
  assert.equal(payload.data[0].room, 'A.101');
  assert.equal(JSON.stringify(payload).includes(USER_A), false);
  assert.deepEqual(bindings.at(-1), [USER_A]);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.has('Set-Cookie'), false);
});

test('authenticated user with no schedule receives the stable empty array contract', async () => {
  const response = await worker.fetch(
    scheduleRequest({ cookie: COOKIE }),
    createEnv(
      () => Response.json(identity()),
      createDb({ rowsForUser: () => [] })
    ),
    {} as never
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: [], revisions: {} });
});

test('logged-out and bearer-only requests cannot authenticate schedule reads', async () => {
  for (const headers of [
    undefined,
    { Authorization: 'Bearer valid-looking-supabase-token' },
  ]) {
    let authCalls = 0;
    const dbCalls: string[] = [];
    const response = await worker.fetch(
      scheduleRequest({ headers }),
      createEnv(
        () => {
          authCalls += 1;
          return Response.json(identity());
        },
        createDb({ calls: dbCalls })
      ),
      {} as never
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('WWW-Authenticate'), null);
    assert.equal(authCalls, 0);
    assert.equal(dbCalls.length, 0);
  }
});

test('Better Auth identity wins over malicious bearer, query and identity headers', async () => {
  const bindings: unknown[][] = [];
  let internalRequest: Request | undefined;
  const response = await worker.fetch(
    scheduleRequest({
      cookie: COOKIE,
      query: `?userId=${USER_B}&role=admin&mssv=client-value`,
      headers: {
        Authorization: 'Bearer token-for-user-b',
        'x-user-id': USER_B,
        'x-role': 'admin',
        'x-email': 'admin@example.com',
      },
    }),
    createEnv(
      (request) => {
        internalRequest = request;
        return Response.json(identity(USER_A));
      },
      createDb({
        bindings,
        rowsForUser: (userId) => userId === USER_A ? [scheduleRow] : [],
      })
    ),
    {} as never
  );

  assert.equal(response.status, 200);
  assert.deepEqual(bindings.at(-1), [USER_A]);
  assert.equal(internalRequest?.headers.get('Cookie'), COOKIE);
  assert.equal(internalRequest?.headers.get('Authorization'), null);
  assert.equal(internalRequest?.headers.get('x-user-id'), null);
  assert.equal(internalRequest?.headers.get('x-role'), null);
  assert.equal(internalRequest?.headers.get('x-email'), null);
  assert.equal(new URL(internalRequest!.url).search, '');
});

test('users and staff roles remain self-only on schedule reads', async () => {
  for (const role of ['user', 'admin', 'auditor'] as const) {
    const bindings: unknown[][] = [];
    const response = await worker.fetch(
      scheduleRequest({ cookie: COOKIE, query: `?userId=${USER_B}` }),
      createEnv(
        () => Response.json(identity(USER_A, role)),
        createDb({ bindings, rowsForUser: () => [scheduleRow] })
      ),
      {} as never
    );
    assert.equal(response.status, 200);
    assert.deepEqual(bindings.at(-1), [USER_A]);
  }
});

test('expired, malformed and unavailable Auth Service states fail closed', async () => {
  const cases: Array<{ fetcher: () => Response; status: number }> = [
    {
      fetcher: () => Response.json({ error: 'expired' }, { status: 401 }),
      status: 401,
    },
    {
      fetcher: () => Response.json({ ...identity(), role: 'owner' }),
      status: 503,
    },
    {
      fetcher: () => { throw new Error('private upstream detail'); },
      status: 503,
    },
  ];
  for (const entry of cases) {
    const dbCalls: string[] = [];
    const response = await worker.fetch(
      scheduleRequest({ cookie: COOKIE }),
      createEnv(entry.fetcher, createDb({ calls: dbCalls })),
      {} as never
    );
    assert.equal(response.status, entry.status);
    assert.equal(dbCalls.length, 0);
    assert.doesNotMatch(
      await response.text(),
      /expired|owner|private upstream detail/i
    );
  }
});

test('unsupported collection method fails before Auth Service and D1', async () => {
  let authCalls = 0;
  const dbCalls: string[] = [];
  const response = await worker.fetch(
    scheduleRequest({ cookie: COOKIE, method: 'POST' }),
    createEnv(
      () => {
        authCalls += 1;
        return Response.json(identity());
      },
      createDb({ calls: dbCalls })
    ),
    {} as never
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, OPTIONS');
  assert.equal(authCalls, 0);
  assert.equal(dbCalls.length, 0);
});

test('schedule reads and legacy writes use Better Auth while source authority stays server-side', () => {
  const source = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  const readStart = source.indexOf(
    "if (requestUrl.pathname === '/api/user/v1/schedules')"
  );
  const readEnd = source.indexOf(
    "if (requestUrl.pathname === '/health')",
    readStart
  );
  const readBlock = source.slice(readStart, readEnd);
  assert.match(readBlock, /requireBetterAuthSession\(request, env\)/);
  assert.match(readBlock, /listUserSchedules\(env, identity\.userId\)/);
  assert.doesNotMatch(
    readBlock,
    /requireAuthenticatedUser|readBearerToken|searchParams\.get\(['"]userId|supabase|localStorage|sessionStorage/i
  );

  const courseWriteStart = source.indexOf('const userScheduleCourseMatch');
  const readRouteStart = source.indexOf(
    "if (requestUrl.pathname === '/api/user/v1/schedules')",
    courseWriteStart
  );
  const writes = source.slice(courseWriteStart, readRouteStart);
  assert.match(writes, /requireBetterAuthSession\(request, env\)/);
  assert.doesNotMatch(writes, /requireAuthenticatedUser\(request, env\)|readBearerToken\(request\)/);
  assert.match(writes, /addUserScheduleForBetterAuth/);
  assert.match(writes, /deleteUserScheduleForBetterAuth/);
  assert.match(writes, /updateUserScheduleForBetterAuth/);
  assert.match(writes, /replaceUserScheduleImportForBetterAuth/);
  const d1Start = writes.indexOf("if (scheduleWriteMode === 'd1')");
  const legacyStart = writes.indexOf('addUserScheduleForBetterAuth', d1Start);
  const d1Branch = writes.slice(d1Start, legacyStart);
  const legacyBranch = writes.slice(legacyStart);
  assert.match(d1Branch, /requireBetterAuthSession/);
  assert.doesNotMatch(d1Branch, /readBearerToken|SUPABASE|serviceRole/i);
  assert.match(legacyBranch, /identity\.userId/);
  assert.doesNotMatch(legacyBranch, /readBearerToken|Authorization/);
});
