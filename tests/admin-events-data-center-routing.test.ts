import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from '../cloudflare/worker/src/index.ts';

const USER_ID = 'd9428888-122b-4f0f-b88f-1c8f4f762b22';

const authService = (role: 'admin' | 'auditor' | 'user') => ({
  async fetch() {
    if (role === 'user') {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    return Response.json({
      userId: USER_ID,
      email: `${role}@example.invalid`,
      role,
    });
  },
});

const db = {
  prepare(sql: string) {
    return {
      bind() { return this; },
      async all() {
        if (sql.includes('FROM sync_metadata')) {
          return {
            results: [{
              resource: 'events',
              source_row_count: 0,
              visible_row_count: 0,
              source_max_created_at: null,
              synced_at: '2026-08-29T00:00:00.000Z',
            }],
          };
        }
        return { results: [] };
      },
      async first() { return { total: 0 }; },
    };
  },
};

test('Events and Data Center private frontend calls remain same-origin', () => {
  const events = readFileSync('utils/eventsApi.ts', 'utf8');
  const mobileEvents = readFileSync('components/MobileEvents.tsx', 'utf8');
  const health = readFileSync('utils/cloudflareAdminApi.ts', 'utf8');
  assert.match(events, /fetch\(normalizedPath,/);
  assert.doesNotMatch(events, /VITE_CLOUDFLARE_PUBLIC_API_BASE_URL/);
  assert.doesNotMatch(mobileEvents, /supabase\.(?:auth|from|rpc)/);
  assert.doesNotMatch(mobileEvents, /from ['"]\.\.\/utils\/supabase['"]/);
  assert.match(health, /fetch\(\s*'\/api\/admin\/v1\/health'/);
  assert.doesNotMatch(health, /VITE_CLOUDFLARE_PUBLIC_API_BASE_URL/);
});

test('Events rejects missing Better Auth cookie with typed 401', async () => {
  const response = await worker.fetch(
    new Request('https://example.com/api/admin/v1/events'),
    { DB: db } as never,
    {} as never,
  );
  assert.equal(response.status, 401);
});

test('Events allows admin and auditor reads but blocks ordinary users', async () => {
  for (const role of ['admin', 'auditor'] as const) {
    const response = await worker.fetch(
      new Request('https://example.com/api/admin/v1/events', {
        headers: { Cookie: 'better-auth.session=opaque' },
      }),
      { DB: db, AUTH_SERVICE: authService(role) } as never,
      {} as never,
    );
    assert.equal(response.status, 200, role);
    const payload = await response.json() as { data?: unknown[]; total?: number };
    assert.deepEqual(payload.data, []);
    assert.equal(payload.total, 0);
  }

  const denied = await worker.fetch(
    new Request('https://example.com/api/admin/v1/events', {
      headers: { Cookie: 'better-auth.session=opaque' },
    }),
    { DB: db, AUTH_SERVICE: authService('user') } as never,
    {} as never,
  );
  assert.equal(denied.status, 403);
});

test('Data Center allows admin and auditor reads but blocks ordinary users', async () => {
  for (const role of ['admin', 'auditor'] as const) {
    const response = await worker.fetch(
      new Request('https://example.com/api/admin/v1/health', {
        headers: { Cookie: 'better-auth.session=opaque' },
      }),
      { DB: db, AUTH_SERVICE: authService(role) } as never,
      {} as never,
    );
    assert.equal(response.status, 200, role);
    const payload = await response.json() as { ok?: boolean };
    assert.equal(payload.ok, true);
  }

  const denied = await worker.fetch(
    new Request('https://example.com/api/admin/v1/health', {
      headers: { Cookie: 'better-auth.session=opaque' },
    }),
    { DB: db, AUTH_SERVICE: authService('user') } as never,
    {} as never,
  );
  assert.equal(denied.status, 403);
});
