import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSupabaseAuthUserUrl,
  buildSupabaseStaffRoleUrl,
  readBearerToken,
  requireAuthenticatedUser,
  requireStaff,
  StaffAuthError,
  type StaffAuthEnv,
} from '../cloudflare/worker/src/auth.ts';
import worker from '../cloudflare/worker/src/index.ts';

const USER_ID = 'd9428888-122b-4f0f-b88f-1c8f4f762b22';
const AUTH_ENV: StaffAuthEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const assertAuthStatus = (status: number) => (error: unknown) =>
  error instanceof StaffAuthError && error.status === status;

test('reads only a well-formed bearer token', () => {
  assert.equal(
    readBearerToken(new Request('https://api.example.com', {
      headers: { Authorization: 'Bearer user-token' },
    })),
    'user-token'
  );
  assert.equal(
    readBearerToken(new Request('https://api.example.com', {
      headers: { Authorization: 'Basic user-token' },
    })),
    null
  );
  assert.equal(readBearerToken(new Request('https://api.example.com')), null);
});

test('builds bounded Supabase auth and role requests', () => {
  const authUrl = buildSupabaseAuthUserUrl('https://example.supabase.co/');
  assert.equal(authUrl.pathname, '/auth/v1/user');

  const roleUrl = buildSupabaseStaffRoleUrl(
    'https://example.supabase.co/',
    USER_ID,
    ['admin']
  );
  assert.equal(roleUrl.pathname, '/rest/v1/user_roles');
  assert.equal(roleUrl.searchParams.get('select'), 'role');
  assert.equal(
    roleUrl.searchParams.get('or'),
    `(id.eq.${USER_ID},user_id.eq.${USER_ID})`
  );
  assert.equal(roleUrl.searchParams.get('role'), 'in.(admin)');
  assert.equal(roleUrl.searchParams.get('limit'), '1');
});

test('rejects missing and invalid sessions with 401', async () => {
  await assert.rejects(
    () => requireStaff(new Request('https://api.example.com'), AUTH_ENV),
    assertAuthStatus(401)
  );

  const fetcher: typeof fetch = async () =>
    Response.json({ message: 'invalid token' }, { status: 401 });
  await assert.rejects(
    () => requireStaff(
      new Request('https://api.example.com', {
        headers: { Authorization: 'Bearer expired-token' },
      }),
      AUTH_ENV,
      { fetcher }
    ),
    assertAuthStatus(401)
  );
});

test('rejects a valid student session with 403', async () => {
  let requestCount = 0;
  const fetcher: typeof fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return Response.json({ id: USER_ID, email: 'student@st.buh.edu.vn' });
    }
    return Response.json([]);
  };

  await assert.rejects(
    () => requireStaff(
      new Request('https://api.example.com', {
        headers: { Authorization: 'Bearer student-token' },
      }),
      AUTH_ENV,
      { allowedRoles: ['admin'], fetcher }
    ),
    assertAuthStatus(403)
  );
  assert.equal(requestCount, 2);
});

test('accepts a valid student session without requiring a staff role', async () => {
  let requestCount = 0;
  const identity = await requireAuthenticatedUser(
    new Request('https://api.example.com', {
      headers: { Authorization: 'Bearer student-token' },
    }),
    AUTH_ENV,
    {
      fetcher: async () => {
        requestCount += 1;
        return Response.json({
          id: USER_ID,
          email: 'student@st.buh.edu.vn',
        });
      },
    }
  );

  assert.deepEqual(identity, {
    userId: USER_ID,
    email: 'student@st.buh.edu.vn',
  });
  assert.equal(requestCount, 1);
});

test('accepts admin and keeps the service key out of the user verification request', async () => {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, authorization: headers.get('Authorization') });
    if (url.includes('/auth/v1/user')) {
      return Response.json({ id: USER_ID, email: 'admin@st.buh.edu.vn' });
    }
    return Response.json([{ role: 'admin' }]);
  };

  const identity = await requireStaff(
    new Request('https://api.example.com', {
      headers: { Authorization: 'Bearer admin-token' },
    }),
    AUTH_ENV,
    { allowedRoles: ['admin'], fetcher }
  );

  assert.deepEqual(identity, {
    userId: USER_ID,
    email: 'admin@st.buh.edu.vn',
    role: 'admin',
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].authorization, 'Bearer admin-token');
  assert.equal(calls[1].authorization, 'Bearer service-role-key');
});

test('fails closed when Worker auth secrets are missing', async () => {
  await assert.rejects(
    () => requireStaff(
      new Request('https://api.example.com', {
        headers: { Authorization: 'Bearer admin-token' },
      }),
      { SUPABASE_URL: 'https://example.supabase.co' }
    ),
    assertAuthStatus(503)
  );
});

test('admin event route rejects unauthenticated requests before reading D1', async () => {
  const response = await worker.fetch(
    new Request('https://api.example.com/api/admin/v1/events'),
    {
      ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
      SUPABASE_URL: 'https://example.supabase.co',
    } as never,
    {} as never
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
});

test('admin event collection route exposes only GET, POST and OPTIONS', async () => {
  const response = await worker.fetch(
    new Request('https://api.example.com/api/admin/v1/events', {
      method: 'DELETE',
    }),
    {
      ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
      SUPABASE_URL: 'https://example.supabase.co',
    } as never,
    {} as never
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, POST, OPTIONS');
});

test('admin event write routes reject unauthenticated requests before writes', async () => {
  const env = {
    ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
    SUPABASE_URL: 'https://example.supabase.co',
  } as never;
  const context = {} as never;
  const createResponse = await worker.fetch(
    new Request('https://api.example.com/api/admin/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Không được tạo' }),
    }),
    env,
    context
  );
  const updateResponse = await worker.fetch(
    new Request('https://api.example.com/api/admin/v1/events/42', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Đang diễn ra' }),
    }),
    env,
    context
  );

  assert.equal(createResponse.status, 401);
  assert.equal(updateResponse.status, 401);
  assert.equal(updateResponse.headers.get('WWW-Authenticate'), 'Bearer');
});

test('admin event sync route exposes only POST and OPTIONS', async () => {
  const response = await worker.fetch(
    new Request('https://api.example.com/api/admin/v1/events/sync'),
    {
      ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
      SUPABASE_URL: 'https://example.supabase.co',
    } as never,
    {} as never
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST, OPTIONS');
});

test('admin event sync rejects unauthenticated POST before syncing D1', async () => {
  const response = await worker.fetch(
    new Request('https://api.example.com/api/admin/v1/events/sync', {
      method: 'POST',
    }),
    {
      ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
      SUPABASE_URL: 'https://example.supabase.co',
    } as never,
    {} as never
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
});

test('event participation routes reject unauthenticated requests before reading or writing D1', async () => {
  const env = {
    ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
    SUPABASE_URL: 'https://example.supabase.co',
  } as never;
  const context = {} as never;
  const readResponse = await worker.fetch(
    new Request('https://api.example.com/api/user/v1/event-participations'),
    env,
    context
  );
  const writeResponse = await worker.fetch(
    new Request('https://api.example.com/api/user/v1/event-participations/42', {
      method: 'PUT',
    }),
    env,
    context
  );

  assert.equal(readResponse.status, 401);
  assert.equal(readResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal(readResponse.headers.get('WWW-Authenticate'), 'Bearer');
  assert.equal(writeResponse.status, 401);
  assert.equal(writeResponse.headers.get('Cache-Control'), 'no-store');
  assert.equal(writeResponse.headers.get('WWW-Authenticate'), 'Bearer');
});

test('event participation routes expose only their intended methods', async () => {
  const env = {
    ALLOWED_ORIGINS: 'https://hotrosinhvienhub.id.vn',
    SUPABASE_URL: 'https://example.supabase.co',
  } as never;
  const context = {} as never;
  const collectionResponse = await worker.fetch(
    new Request('https://api.example.com/api/user/v1/event-participations', {
      method: 'POST',
    }),
    env,
    context
  );
  const detailResponse = await worker.fetch(
    new Request('https://api.example.com/api/user/v1/event-participations/42', {
      method: 'PATCH',
    }),
    env,
    context
  );

  assert.equal(collectionResponse.status, 405);
  assert.equal(collectionResponse.headers.get('Allow'), 'GET, OPTIONS');
  assert.equal(detailResponse.status, 405);
  assert.equal(detailResponse.headers.get('Allow'), 'PUT, DELETE, OPTIONS');
});
