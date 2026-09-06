import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAdminLegacyData } from '../cloudflare/worker/src/admin-legacy-data.ts';
import { AdminLegacyDataError } from '../cloudflare/worker/src/admin-legacy-data.ts';

const ORIGIN = 'https://hotrosinhvienhub.id.vn';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';

const candidate = {
  id: CANDIDATE_ID,
  source_name: 'fixture',
  post_url: 'https://example.test/post',
  raw_content: 'fixture',
  review_status: 'pending',
  approved_event_id: null,
};

const env = (role: 'admin' | 'auditor' | 'user') => ({
  SUPABASE_URL: 'https://source.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only',
  GROQ_API_KEY: 'server-only-ai-key',
  AUTH_SERVICE: {
    fetch: async () => Response.json({ userId: ADMIN_ID, email: 'staff@example.test', role }),
  },
  DB: {
    prepare: (_sql: string) => ({
      first: async () => null,
      bind: (..._values: unknown[]) => ({
        run: async () => ({ meta: { changes: 1 } }),
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    }),
    batch: async () => [],
  },
}) as never;

const request = (roleAction: string, draft: Record<string, unknown> = { title: 'Sự kiện fixture' }) => new Request(`${ORIGIN}/api/admin/v1/event-candidates`, {
  method: 'POST',
  headers: { Cookie: 'better-auth.session=opaque', 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: roleAction, id: CANDIDATE_ID, draft }),
});

const listRequest = () => new Request(`${ORIGIN}/api/admin/v1/event-candidates?review_status=all`, {
  headers: { Cookie: 'better-auth.session=opaque' },
});

test('auditor capability does not authorize unrelated admin mutations', async () => {
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async () => { writes++; throw new Error('Unexpected external request'); };
  try {
    for (const path of ['/api/admin/v1/reports?kind=feedback', '/api/admin/v1/activity']) {
      const url = new URL(path, ORIGIN);
      await assert.rejects(
        handleAdminLegacyData(new Request(url, {method: 'DELETE', headers: {Cookie: 'fixture=opaque'}}), url, env('auditor')),
        (error: unknown) => error instanceof AdminLegacyDataError && error.status === 403,
      );
    }
    assert.equal(writes, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('event candidate approve validates against the authoritative event payload before creating a source event', async () => {
  await assert.rejects(
    () => handleAdminLegacyData(request('approve', { title: '' }), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('admin')),
    (error: unknown) => error instanceof AdminLegacyDataError
      && error.status === 400
      && error.message === 'Tên sự kiện không được để trống.',
  );
});

test('ordinary users are blocked before candidate approval mutation', async () => {
  await assert.rejects(
    () => handleAdminLegacyData(request('approve'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('user')),
    (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && (error as { status: number }).status === 403,
  );
});

test('auditor can read, approve, and reject through the Event Candidate capability', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    const method = init?.method || 'GET';
    if (requestUrl.pathname === '/rest/v1/event_candidates' && method === 'GET') return Response.json([candidate]);
    if (requestUrl.pathname === '/rest/v1/events' && method === 'POST') return Response.json([{ id: 993, title: 'Sự kiện fixture' }]);
    if (requestUrl.pathname === '/rest/v1/event_candidates' && method === 'PATCH') {
      return Response.json([{ ...candidate, review_status: 'approved', approved_event_id: 993 }]);
    }
    throw new Error(`unexpected source operation: ${method} ${requestUrl.pathname}`);
  }) as typeof fetch;
  try {
    const listed = await handleAdminLegacyData(listRequest(), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('auditor')) as { candidates: unknown[] };
    assert.equal(Array.isArray(listed.candidates), true);
    const detail = await handleAdminLegacyData(
      listRequest(),
      new URL(`${ORIGIN}/api/admin/v1/event-candidates?id=${CANDIDATE_ID}`),
      env('auditor'),
    ) as { candidates: Array<{ id: string }> };
    assert.equal(detail.candidates[0]?.id, CANDIDATE_ID);
    const approved = await handleAdminLegacyData(request('approve'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('auditor')) as { success: boolean };
    assert.equal(approved.success, true);
    const rejected = await handleAdminLegacyData(request('reject'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('auditor')) as { success: boolean };
    assert.equal(rejected.success, true);

    await assert.rejects(() => handleAdminLegacyData(request('approve'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('user')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auditor analysis uses the same Event Candidate capability and server-side AI provider', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (requestUrl.hostname === 'api.groq.com') {
      return Response.json({ choices: [{ message: { content: JSON.stringify({ is_event: true, confidence: 0.8, reason: 'fixture' }) } }] });
    }
    const method = init?.method || 'GET';
    if (requestUrl.pathname === '/rest/v1/event_candidates' && method === 'GET') return Response.json([candidate]);
    if (requestUrl.pathname === '/rest/v1/event_candidates' && method === 'PATCH') return Response.json([{ ...candidate, ai_is_event: true }]);
    throw new Error(`unexpected source operation: ${method} ${requestUrl.pathname}`);
  }) as typeof fetch;
  try {
    const result = await handleAdminLegacyData(request('analyze'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('auditor')) as { success: boolean };
    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin reject remains a single authorized candidate mutation', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (requestUrl.pathname === '/rest/v1/event_candidates' && init?.method === 'PATCH') {
      return Response.json([{ ...candidate, review_status: 'rejected' }]);
    }
    throw new Error('unexpected source operation');
  }) as typeof fetch;
  try {
    const result = await handleAdminLegacyData(request('reject'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('admin')) as { success: boolean; candidate: { review_status: string } };
    assert.equal(result.success, true);
    assert.equal(result.candidate.review_status, 'rejected');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin approval creates one event then links exactly one pending candidate', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; path: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    const method = init?.method || 'GET';
    calls.push({ method, path: requestUrl.pathname });
    if (requestUrl.pathname === '/rest/v1/event_candidates' && method === 'GET') return Response.json([candidate]);
    if (requestUrl.pathname === '/rest/v1/events' && method === 'POST') return Response.json([{ id: 991, title: 'Sự kiện fixture' }]);
    if (requestUrl.pathname === '/rest/v1/event_candidates' && method === 'PATCH') {
      return Response.json([{ ...candidate, review_status: 'approved', approved_event_id: 991 }]);
    }
    throw new Error(`unexpected source operation: ${method} ${requestUrl.pathname}`);
  }) as typeof fetch;
  try {
    const result = await handleAdminLegacyData(request('approve'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('admin')) as { success: boolean; candidate: typeof candidate; event: { id: number } };
    assert.equal(result.success, true);
    assert.equal(result.candidate.approved_event_id, 991);
    assert.equal(result.event.id, 991);
    assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
      'GET /rest/v1/event_candidates',
      'POST /rest/v1/events',
      'PATCH /rest/v1/event_candidates',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a failed candidate link compensates the just-created source event and leaves the candidate unchanged', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; path: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    const method = init?.method || 'GET';
    calls.push({ method, path: requestUrl.pathname });
    if (requestUrl.pathname === '/rest/v1/event_candidates' && method === 'GET') return Response.json([candidate]);
    if (requestUrl.pathname === '/rest/v1/events' && method === 'POST') return Response.json([{ id: 992, title: 'Sự kiện fixture' }]);
    if (requestUrl.pathname === '/rest/v1/event_candidates' && method === 'PATCH') return Response.json([]);
    if (requestUrl.pathname === '/rest/v1/events' && method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error(`unexpected source operation: ${method} ${requestUrl.pathname}`);
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => handleAdminLegacyData(request('approve'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env('admin')),
      (error: unknown) => error instanceof AdminLegacyDataError && error.status === 409,
    );
    assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
      'GET /rest/v1/event_candidates',
      'POST /rest/v1/events',
      'PATCH /rest/v1/event_candidates',
      'DELETE /rest/v1/events',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
