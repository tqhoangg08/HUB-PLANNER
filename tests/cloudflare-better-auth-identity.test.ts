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
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), identity());
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.has('Set-Cookie'), false);
  assert.equal(internalRequest?.method, 'GET');
  assert.equal(new URL(internalRequest!.url).pathname, '/internal/auth/session');
  assert.equal(internalRequest?.headers.get('Cookie'), COOKIE);
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
