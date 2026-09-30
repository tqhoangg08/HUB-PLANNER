import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from '../cloudflare/worker/src/index.ts';

const USER_A = 'd9428888-122b-4f0f-b88f-1c8f4f762b22';
const USER_B = '57768d5d-e2a7-49c3-92a5-3956cd05de69';
const SEMESTER = '2025-2026_HK1';
const EXACT_SEMESTER = '2025-2026_HK2';
const STUDENT_CODE = '012345678901';
const COOKIE = 'hubplanner_auth.session_token=opaque-session';

const rankingRow = (rank: number) => ({
  student_rank: rank,
  total_students: 100,
  rank_in_class: 2,
  total_in_class: 30,
  class_code: 'K27CNTT1',
  rank_in_major: 4,
  total_in_major: 50,
  major: 'Công nghệ thông tin',
});

const authIdentity = (
  userId = USER_A,
  role: 'user' | 'admin' | 'auditor' = 'user'
) => ({ userId, email: 'student@st.buh.edu.vn', role });

const createDb = (options: {
  rowForUser?: (userId: string) => ReturnType<typeof rankingRow> | null;
  exactRow?: Record<string, unknown> | null;
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
        if (sql.includes('semester_exact_ranking_datasets')) {
          return values[0] === EXACT_SEMESTER
            ? { semester: EXACT_SEMESTER, total_students: 10478 } : null;
        }
        if (sql.includes('FROM user_profiles')) {
          return values[0] === USER_A ? { student_code: STUDENT_CODE } : null;
        }
        if (sql.includes('FROM semester_exact_rankings')) {
          return values[1] === STUDENT_CODE ? options.exactRow ?? null : null;
        }
        if (sql.includes('benchmark_ranking_semesters')) {
          return { semester: values[0] };
        }
        if (sql.includes('benchmark_ranking_users')) {
          return options.rowForUser?.(String(values[0])) ?? null;
        }
        throw new Error('unexpected test query');
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
  AUTH_SERVICE: {
    fetch: async (request: Request) => authFetcher(request),
  },
  DB: db,
}) as never;

const exactRankingRequest = (
  options: {
    cookie?: string;
    headers?: HeadersInit;
    method?: string;
    query?: string;
    semester?: string;
  } = {}
) => {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set('Cookie', options.cookie);
  return new Request(
    `https://hotrosinhvienhub.id.vn/api/user/v1/rankings/exact?semester=${options.semester || SEMESTER}${options.query || ''}`,
    { method: options.method || 'GET', headers }
  );
};

test('Better Auth user reads only their own exact ranking', async () => {
  const bindings: unknown[][] = [];
  const response = await worker.fetch(
    exactRankingRequest({ cookie: COOKIE }),
    createEnv(
      () => Response.json(authIdentity(USER_A)),
      createDb({
        bindings,
        rowForUser: (userId) => userId === USER_A ? rankingRow(9) : rankingRow(1),
      })
    ),
    {} as never
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: {
      studentRank: 9,
      totalStudents: 100,
      rankInClass: 2,
      totalInClass: 30,
      classCode: 'K27CNTT1',
      rankInMajor: 4,
      totalInMajor: 50,
      major: 'Công nghệ thông tin',
    },
  });
  assert.deepEqual(bindings.at(-1), [USER_A, SEMESTER]);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.has('Set-Cookie'), false);
});

test('authenticated user without a ranking receives the stable null contract', async () => {
  const response = await worker.fetch(
    exactRankingRequest({ cookie: COOKIE }),
    createEnv(
      () => Response.json(authIdentity()),
      createDb({ rowForUser: () => null })
    ),
    {} as never
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: null });
});

test('HK2 exact MSSV lookup is retired and never reads an official STT row', async () => {
  const calls: string[] = [];
  const response = await worker.fetch(
    exactRankingRequest({
      semester: EXACT_SEMESTER,
      cookie: COOKIE,
      query: '&student_code=999999999999&userId=other',
    }),
    createEnv(() => Response.json(authIdentity(USER_A)), createDb({ calls })),
    {} as never
  );
  assert.equal(response.status, 400);
  assert.equal(calls.some((sql) => /FROM user_profiles|FROM semester_exact_rankings/.test(sql)), false);
});

const importedRequest = (body: Record<string, unknown>, cookie = COOKIE) =>
  new Request('https://hotrosinhvienhub.id.vn/api/user/v1/rankings/benchmark', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('HK2 benchmark API uses Better Auth identity for class and major, never MSSV', async () => {
  const calls: string[] = [];
  const bindings: unknown[][] = [];
  const db = { prepare(sql: string) {
    calls.push(sql);
    let values: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) { values = args; bindings.push(args); return statement; },
      async first() {
        if (sql.includes('semester_exact_ranking_datasets')) {
          return { semester: EXACT_SEMESTER, total_students: 10478 };
        }
        if (sql.includes('FROM user_profiles')) {
          return values[0] === USER_A
            ? { class_name: 'K27CNTT1', major_name: 'Công nghệ thông tin' } : null;
        }
        if (sql.includes('FROM semester_exact_rankings')) {
          return sql.includes('class_code = ?')
            ? { total: 40, outranking: 2 }
            : sql.includes('major = ?')
              ? { total: 100, outranking: 11 }
              : { total: 10478, outranking: 324 };
        }
        throw new Error('unexpected test query');
      },
    };
    return statement;
  } };
  const response = await worker.fetch(
    importedRequest({ semester: EXACT_SEMESTER, gpa: 3.5, trainingScore: 90,
      credits: 18, student_code: '999999999999', classCode: 'OTHER', major: 'OTHER' }),
    createEnv(() => Response.json(authIdentity(USER_A)), db),
    {} as never
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as { data: Record<string, unknown> };
  assert.equal(payload.data.rankingMode, 'forecast');
  assert.equal(payload.data.rankingSource, 'imported');
  assert.equal(payload.data.rank, 325);
  assert.equal(payload.data.rankInClass, 3);
  assert.equal(payload.data.rankInMajor, 12);
  assert.equal(payload.data.classCode, 'K27CNTT1');
  assert.equal('studentCode' in payload.data, false);
  assert.equal('scholarshipStatus' in payload.data, false);
  assert.deepEqual(bindings[1], [USER_A]);
  assert.equal(calls.some((sql) => /student_code|\brank\b\s*[<>=]/i.test(sql)), false);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('HK2 missing personal metrics returns forecast no-data without MSSV lookup', async () => {
  const calls: string[] = [];
  const response = await worker.fetch(
    importedRequest({ semester: EXACT_SEMESTER, gpa: null, trainingScore: null, credits: 0 }),
    createEnv(() => Response.json(authIdentity(USER_A)), createDb({ calls })),
    {} as never
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: {
    semester: EXACT_SEMESTER, rankingMode: 'forecast', rankingSource: 'imported',
    found: false, totalStudents: 10478,
  } });
  assert.equal(calls.some((sql) => /FROM user_profiles|FROM semester_exact_rankings/.test(sql)), false);
});

test('no cookie and bearer-only requests cannot authenticate', async () => {
  for (const headers of [
    undefined,
    { Authorization: 'Bearer valid-looking-supabase-token' },
  ]) {
    let authCalls = 0;
    const dbCalls: string[] = [];
    const response = await worker.fetch(
      exactRankingRequest({ headers }),
      createEnv(
        () => {
          authCalls += 1;
          return Response.json(authIdentity());
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

test('HK2 benchmark request requires Better Auth and rejects bearer-only access', async () => {
  let dbCalls = 0;
  const request = new Request('https://hotrosinhvienhub.id.vn/api/user/v1/rankings/benchmark', {
    method: 'POST',
    headers: { Authorization: 'Bearer unrelated', 'Content-Type': 'application/json' },
    body: JSON.stringify({ semester: EXACT_SEMESTER, gpa: 3.6, trainingScore: 90, credits: 16 }),
  });
  const response = await worker.fetch(request, createEnv(() => Response.json(authIdentity()), {
    prepare() { dbCalls += 1; throw new Error('unexpected database access'); },
  }), {} as never);
  assert.equal(response.status, 401);
  assert.equal(dbCalls, 0);
});

test('Better Auth identity wins over malicious bearer, query and identity headers', async () => {
  const bindings: unknown[][] = [];
  let internalRequest: Request | undefined;
  const response = await worker.fetch(
    exactRankingRequest({
      cookie: COOKIE,
      headers: {
        Authorization: 'Bearer token-for-user-b',
        'x-user-id': USER_B,
        'x-role': 'admin',
        'x-email': 'admin@example.com',
      },
      query: `&userId=${USER_B}&role=admin`,
    }),
    createEnv(
      (request) => {
        internalRequest = request;
        return Response.json(authIdentity(USER_A));
      },
      createDb({
        bindings,
        rowForUser: (userId) => userId === USER_B ? rankingRow(1) : rankingRow(9),
      })
    ),
    {} as never
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json() as { data: { studentRank: number } }).data.studentRank, 9);
  assert.deepEqual(bindings.at(-1), [USER_A, SEMESTER]);
  assert.equal(internalRequest?.headers.get('Cookie'), COOKIE);
  assert.equal(internalRequest?.headers.get('Authorization'), null);
  assert.equal(internalRequest?.headers.get('x-user-id'), null);
  assert.equal(internalRequest?.headers.get('x-role'), null);
  assert.equal(new URL(internalRequest!.url).search, '');
});

test('admin and auditor remain self-only on exact rankings', async () => {
  for (const role of ['admin', 'auditor'] as const) {
    const bindings: unknown[][] = [];
    const response = await worker.fetch(
      exactRankingRequest({ cookie: COOKIE, query: `&userId=${USER_B}` }),
      createEnv(
        () => Response.json(authIdentity(USER_A, role)),
        createDb({ bindings, rowForUser: () => rankingRow(9) })
      ),
      {} as never
    );
    assert.equal(response.status, 200);
    assert.deepEqual(bindings.at(-1), [USER_A, SEMESTER]);
  }
});

test('expired, malformed and unavailable Auth Service states fail closed', async () => {
  const cases: Array<{
    fetcher: () => Response;
    expected: number;
  }> = [
    {
      fetcher: () => Response.json({ error: 'expired' }, { status: 401 }),
      expected: 401,
    },
    {
      fetcher: () => Response.json({ ...authIdentity(), role: 'owner' }),
      expected: 503,
    },
    {
      fetcher: () => { throw new Error('private service detail'); },
      expected: 503,
    },
  ];
  for (const entry of cases) {
    const dbCalls: string[] = [];
    const response = await worker.fetch(
      exactRankingRequest({ cookie: COOKIE }),
      createEnv(entry.fetcher, createDb({ calls: dbCalls })),
      {} as never
    );
    assert.equal(response.status, entry.expected);
    assert.equal(dbCalls.length, 0);
    const body = await response.text();
    assert.doesNotMatch(body, /expired|owner|private service detail/i);
  }
});

test('unsupported methods fail before Auth Service or D1 access', async () => {
  let authCalls = 0;
  const dbCalls: string[] = [];
  const response = await worker.fetch(
    exactRankingRequest({ cookie: COOKIE, method: 'POST' }),
    createEnv(
      () => {
        authCalls += 1;
        return Response.json(authIdentity());
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

test('exact-ranking route graph has only Better Auth and server-side D1 ownership', () => {
  const indexSource = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  const routeBlock = indexSource
    .split("if (requestUrl.pathname === '/api/user/v1/rankings/exact')")[1]
    ?.split('const participationDetailMatch')[0] || '';
  const rankingSource = readFileSync('cloudflare/worker/src/rankings.ts', 'utf8');
  const queryBlock = rankingSource.split('export const readOwnBenchmarkRanking')[1] || '';

  assert.match(routeBlock, /requireBetterAuthSession\(request, env\)/);
  assert.doesNotMatch(routeBlock, /requireAuthenticatedUser|readBearerToken|supabase/i);
  assert.doesNotMatch(routeBlock, /searchParams\.get\(['"]userId['"]\)/);
  assert.doesNotMatch(routeBlock, /x-user-id|x-role|localStorage|sessionStorage/);
  assert.match(queryBlock, /WHERE user_id = \?\s+AND semester = \?/);
  assert.match(queryBlock, /\.bind\(userId, semester\)/);
});
