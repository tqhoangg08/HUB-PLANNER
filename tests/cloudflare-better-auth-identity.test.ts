import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  requireBetterAuthStaff,
} from '../cloudflare/worker/src/better-auth-identity.ts';
import worker from '../cloudflare/worker/src/index.ts';

const USER_ID = 'b42a6f01-a58e-4046-b90c-73ffa2aeee26';
const COOKIE = 'hubplanner_auth.session_token=opaque-session';
const VERSION_OVERRIDE = 'hub-planner-public-dev-api="candidate-public", hub-planner-auth-production="candidate-auth"';

const gradeProfileDb = () => {
  const batches: Array<Array<{ sql: string; values: unknown[] }>> = [];
  let publicRow: Record<string, unknown> | null = null;
  let privateRow: Record<string, unknown> | null = null;
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            sql,
            values,
            async first() {
              if (sql.includes('FROM user_profile_private')) return privateRow;
              if (sql.includes('FROM user_profiles')) return publicRow;
              return null;
            },
          };
        },
      };
    },
    async batch(statements: Array<{ sql: string; values: unknown[] }>) {
      batches.push(statements);
      for (const statement of statements) {
        if (statement.sql.includes('INSERT INTO user_profiles')) {
          publicRow = {
            user_id: statement.values[0], student_code: statement.values[1],
            full_name: statement.values[2], avatar_url: statement.values[3],
            bio: statement.values[4], class_name: statement.values[5],
            class_name_overridden: statement.values[6], profile_tags_json: statement.values[7],
            public_profile_enabled: statement.values[8], show_profile_stats: statement.values[9],
            public_gpa: statement.values[10], public_completed_semesters: statement.values[11],
            public_credits: statement.values[12], created_at: statement.values[13],
            updated_at: statement.values[14], canonical_hash: statement.values[15],
          };
        }
        if (statement.sql.includes('INSERT INTO user_profile_private')) {
          privateRow = {
            user_id: statement.values[0], data_json: statement.values[1],
            student_name: statement.values[2], cohort: statement.values[3],
            major_name: statement.values[4], specialization_name: statement.values[5],
            program_name: statement.values[6], semesters_json: statement.values[7],
            target_gpa: statement.values[8], total_credits_required: statement.values[9],
            has_onboarded: statement.values[10], lookback_seen_json: statement.values[11],
            updated_at: statement.values[12], canonical_hash: statement.values[13],
          };
        }
      }
      return [];
    },
  };
  return { db: db as never, batches };
};

const identity = (role: 'user' | 'admin' | 'auditor' = 'user') => ({
  userId: USER_ID,
  email: 'student@st.buh.edu.vn',
  role,
});

const envWithAuthService = (
  fetcher: (request: Request) => Promise<Response> | Response
) => ({
  ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
  AUTH_SERVICE: { fetch: async (request: Request) => fetcher(request) },
}) as never;

const callMe = (
  fetcher: (request: Request) => Promise<Response> | Response,
  init: RequestInit = {},
  query = ''
) => worker.fetch(
  new Request(`https://hotrosinhvienhub.id.vn/api/private/v1/me${query}`, {
    ...init,
    headers: {
      Cookie: COOKIE,
      ...(init.headers || {}),
    },
  }),
  envWithAuthService(fetcher),
  {} as never
);

test('valid Better Auth cookie returns only authoritative minimal identity', async () => {
  let internalRequest: Request | undefined;
  const response = await callMe((request) => {
    internalRequest = request;
    return Response.json({
      ...identity(),
      sessionToken: 'must-not-leak',
      internalMetadata: { provider: 'credential' },
    });
  }, { headers: { 'Cloudflare-Workers-Version-Overrides': VERSION_OVERRIDE } });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), identity());
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.has('Set-Cookie'), false);
  assert.equal(internalRequest?.method, 'GET');
  assert.equal(new URL(internalRequest!.url).pathname, '/internal/auth/session');
  assert.equal(internalRequest?.headers.get('Cookie'), COOKIE);
  assert.equal(internalRequest?.headers.get('Cloudflare-Workers-Version-Overrides'), VERSION_OVERRIDE);
  assert.equal(internalRequest?.headers.get('Authorization'), null);
  assert.equal(internalRequest?.headers.get('x-user-id'), null);
  assert.equal(internalRequest?.headers.get('x-role'), null);
  assert.equal(internalRequest?.headers.get('x-email'), null);
});

test('missing cookie and invalid or expired upstream sessions return 401', async () => {
  let serviceCalls = 0;
  const noCookie = await worker.fetch(
    new Request('https://hotrosinhvienhub.id.vn/api/private/v1/me'),
    envWithAuthService(() => {
      serviceCalls += 1;
      return Response.json(identity());
    }),
    {} as never
  );
  assert.equal(noCookie.status, 401);
  assert.equal(serviceCalls, 0);

  for (const status of [401, 401]) {
    const response = await callMe(() =>
      Response.json({ error: 'upstream detail' }, { status })
    );
    assert.equal(response.status, 401);
    assert.doesNotMatch(await response.text(), /upstream detail/i);
  }
});

test('service binding failures and malformed responses fail closed without leakage', async () => {
  const missingBinding = await worker.fetch(
    new Request('https://hotrosinhvienhub.id.vn/api/private/v1/me', {
      headers: { Cookie: COOKIE },
    }),
    { ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn' } as never,
    {} as never
  );
  assert.equal(missingBinding.status, 503);

  const unavailable = await callMe(() => {
    throw new Error('private infrastructure detail');
  });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /private infrastructure detail/i);

  const upstreamFailure = await callMe(() =>
    Response.json(
      { error: 'raw upstream failure detail' },
      { status: 500 }
    )
  );
  assert.equal(upstreamFailure.status, 503);
  assert.doesNotMatch(await upstreamFailure.text(), /raw upstream failure detail/i);

  for (const payload of [
    { ...identity(), role: 'owner' },
    { ...identity(), userId: 'not-a-uuid' },
    { ...identity(), email: null },
    { userId: USER_ID, email: 'student@st.buh.edu.vn' },
  ]) {
    const malformed = await callMe(() => Response.json(payload));
    assert.equal(malformed.status, 503);
    assert.deepEqual(await malformed.json(), {
      error: 'Dịch vụ xác thực tạm thời chưa sẵn sàng.',
    });
  }
});

test('client identity headers, query and body cannot influence Better Auth identity', async () => {
  let forwarded: Request | undefined;
  const response = await callMe(
    (request) => {
      forwarded = request;
      return Response.json(identity('user'));
    },
    {
      headers: {
        Authorization: 'Bearer fake-admin-token',
        'x-user-id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'x-role': 'admin',
        'x-email': 'admin@example.com',
      },
    },
    '?userId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&role=admin'
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), identity('user'));
  assert.equal(forwarded?.headers.get('Authorization'), null);
  assert.equal(forwarded?.headers.get('x-user-id'), null);
  assert.equal(forwarded?.headers.get('x-role'), null);
  assert.equal(forwarded?.headers.get('x-email'), null);
  assert.equal(new URL(forwarded!.url).search, '');

  let postForwarded = false;
  const post = await callMe(
    () => {
      postForwarded = true;
      return Response.json(identity('admin'));
    },
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, role: 'admin' }),
    }
  );
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, OPTIONS');
  assert.equal(postForwarded, false);
});

test('admin and auditor roles are preserved only from the Auth Worker', async () => {
  for (const role of ['admin', 'auditor'] as const) {
    const response = await callMe(() => Response.json(identity(role)));
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { role: string }).role, role);
  }
});

test('profile grade writes are self-owned for user, auditor, and admin roles', async () => {
  const semesters = [{
    id: 'semester-1',
    name: 'Học kỳ 1 Năm học 2026-2027',
    subjects: [{ id: 'subject-1', name: 'Fixture', credits: 3, scoreFinal: 8 }],
    trainingScore: null,
  }];

  for (const role of ['user', 'auditor', 'admin'] as const) {
    const { db, batches } = gradeProfileDb();
    const env = {
      ...envWithAuthService(() => Response.json(identity(role))),
      DB: db,
      PROFILE_READ_AUTHORITY: 'd1',
      PROFILE_WRITE_AUTHORITY: 'd1',
    } as never;
    const save = await worker.fetch(new Request('https://hotrosinhvienhub.id.vn/api/user/v1/profile', {
      method: 'PATCH',
      headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ privateProfile: { data: { semesters } } }),
    }), env, {} as never);
    assert.equal(save.status, 200, `${role} must be allowed to save its own transcript`);
    assert.equal(batches.length, 1);
    assert.ok(batches[0].every((statement) => statement.values[0] === USER_ID));

    const reload = await worker.fetch(new Request('https://hotrosinhvienhub.id.vn/api/user/v1/profile', {
      headers: { Cookie: COOKIE },
    }), env, {} as never);
    assert.equal(reload.status, 200);
    const payload = await reload.json() as { privateProfile?: { data?: { semesters?: unknown[] } } };
    assert.deepEqual(payload.privateProfile?.data?.semesters, semesters);
  }
});

test('profile grade route rejects unauthenticated and caller-controlled cross-user writes', async () => {
  const noSessionDb = gradeProfileDb();
  const noSession = await worker.fetch(new Request('https://hotrosinhvienhub.id.vn/api/user/v1/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ privateProfile: { data: { semesters: [] } } }),
  }), {
    ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
    DB: noSessionDb.db,
    PROFILE_WRITE_AUTHORITY: 'd1',
  } as never, {} as never);
  assert.equal(noSession.status, 401);
  assert.equal(noSessionDb.batches.length, 0);

  const auditorDb = gradeProfileDb();
  const crossUser = await worker.fetch(new Request('https://hotrosinhvienhub.id.vn/api/user/v1/profile', {
    method: 'PATCH',
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      privateProfile: { data: { semesters: [] } },
    }),
  }), {
    ...envWithAuthService(() => Response.json(identity('auditor'))),
    DB: auditorDb.db,
    PROFILE_WRITE_AUTHORITY: 'd1',
  } as never, {} as never);
  assert.equal(crossUser.status, 400);
  assert.equal(auditorDb.batches.length, 0);
});

test('staff helper uses only the private staff endpoint and rejects a normal user', async () => {
  let path = '';
  const admin = await requireBetterAuthStaff(
    new Request('https://hotrosinhvienhub.id.vn/private', {
      headers: { Cookie: COOKIE, Authorization: 'Bearer ignored' },
    }),
    envWithAuthService((request) => {
      path = new URL(request.url).pathname;
      return Response.json(identity('admin'));
    })
  );
  assert.equal(path, '/internal/auth/staff');
  assert.equal(admin.role, 'admin');

  await assert.rejects(
    () => requireBetterAuthStaff(
      new Request('https://hotrosinhvienhub.id.vn/private', {
        headers: { Cookie: COOKIE },
      }),
      envWithAuthService(() => Response.json(identity('user')))
    ),
    (error: unknown) =>
      error instanceof BetterAuthIdentityError && error.status === 403
  );
});

test('new identity helper execution graph has no legacy browser auth authority', () => {
  const source = readFileSync(
    'cloudflare/worker/src/better-auth-identity.ts',
    'utf8'
  );
  assert.doesNotMatch(source, /from ['"].*auth\.ts['"]/);
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /readBearerToken|Bearer\s/);
  assert.doesNotMatch(source, /searchParams|request\.json\(|request\.text\(/);
});

test('existing public health route remains unchanged and does not call Auth Service', async () => {
  let authCalls = 0;
  const response = await worker.fetch(
    new Request('https://hotrosinhvienhub.id.vn/health'),
    envWithAuthService(() => {
      authCalls += 1;
      return Response.json(identity());
    }),
    {} as never
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(authCalls, 0);
});
