import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { handleAccountPasswordCompat } from '../cloudflare/worker/src/account-password-compat.ts';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const browserFiles = [
  'utils/api.ts',
  'hooks/useAccountPassword.ts',
  'hooks/useAccountProfileDraft.ts',
  'components/EventsBoard.tsx',
  'components/MobileEvents.tsx',
  'components/SchoolAnnouncements.jsx',
  'components/ScheduleBoard.tsx',
  'components/MobileSchedule.tsx',
];

test('production browser API helpers and migrated flows are Supabase-free', () => {
  for (const file of browserFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /supabase\.co|\/functions\/v1|VITE_SUPABASE|Bearer\s+\$\{.*(?:anon|supabase)/i, file);
  }
  assert.match(read('utils/api.ts'), /API_BASE_URL = '\/api'/);
  assert.match(read('hooks/useAccountPassword.ts'), /fetch\('\/api\/private\/v1\/account-password\/otp'/);
  assert.match(read('components/SchoolAnnouncements.jsx'), /fetch\('\/api\/public\/v1\/announcement-chat'/);
});

test('event UI leaves push delivery to the server queue', () => {
  for (const file of ['components/EventsBoard.tsx', 'components/MobileEvents.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /notifyAllUsersAboutEvent|resource=send|\/push\?resource=send/);
  }
  assert.match(read('cloudflare/worker/src/event-push.ts'), /event_push_deliveries/);
});

test('schedule and public event reads do not inherit legacy API headers', () => {
  for (const file of [
    'components/ScheduleBoard.tsx',
    'components/MobileSchedule.tsx',
    'components/EventsBoard.tsx',
    'components/MobileEvents.tsx',
  ]) {
    assert.doesNotMatch(read(file), /apiHeaders/);
  }
});

test('account password compatibility route requires Better Auth before upstream access', async () => {
  let upstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({});
  };
  try {
    await assert.rejects(
      () => handleAccountPasswordCompat(new Request('https://example.test/api/private/v1/account-password/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-otp', purpose: 'forgot_password', email: 'attacker@example.test' }),
      }), { SUPABASE_URL: 'https://source.example', SUPABASE_ANON_KEY: 'test-server-key' }),
      { name: 'BetterAuthIdentityError', status: 401 },
    );
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('account password compatibility route ignores browser email and forwards server identity', async () => {
  const requests: Request[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request.clone());
    if (request.url === 'https://auth-service.internal/internal/auth/session') {
      return Response.json({
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'canonical@st.buh.edu.vn',
        role: 'user',
      });
    }
    return Response.json({ retryAfterSeconds: 600, expiresInSeconds: 600 });
  };
  try {
    const result = await handleAccountPasswordCompat(new Request('https://example.test/api/private/v1/account-password/otp', {
      method: 'POST',
      headers: {
        Cookie: 'hubplanner_auth.session_token=opaque',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'send-otp',
        purpose: 'forgot_password',
        email: 'attacker@st.buh.edu.vn',
        turnstileToken: 'turnstile-token',
      }),
    }), {
      AUTH_SERVICE: { fetch: (input) => globalThis.fetch(input) },
      SUPABASE_URL: 'https://source.example',
      SUPABASE_ANON_KEY: 'test-server-key',
    });
    assert.equal(result.retryAfterSeconds, 600);
    const upstream = requests.find((request) => request.url === 'https://source.example/functions/v1/auth');
    assert.ok(upstream);
    const body = await upstream.json() as Record<string, unknown>;
    assert.equal(body.email, 'canonical@st.buh.edu.vn');
    assert.notEqual(body.email, 'attacker@st.buh.edu.vn');
    assert.equal(upstream.headers.get('authorization'), 'Bearer test-server-key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
