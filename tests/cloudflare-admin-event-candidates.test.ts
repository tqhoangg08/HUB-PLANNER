import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker, { corsHeaders } from '../cloudflare/worker/src/index.ts';
import { EventCandidateError, handleAdminEventCandidates, handleEventCandidateIngest } from '../cloudflare/worker/src/event-candidates.ts';

const ORIGIN = 'https://hotrosinhvienhub.id.vn';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = 222;
const OFFICIAL_EXTENSION_ORIGIN = 'chrome-extension://bakbfjmgpjcmpicoehjadpakiogjikaa';

const makeEnv = (role: 'admin' | 'auditor' | 'user' = 'admin') => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE sync_metadata (
    resource TEXT PRIMARY KEY, source_row_count INTEGER, source_max_created_at TEXT,
    synced_at TEXT, visible_row_count INTEGER
  )`);
  for (const migration of [
    '0006_create_public_events.sql', '0008_create_admin_events.sql',
    '0009_create_admin_event_mutations.sql', '0023_create_event_push_deliveries.sql',
    '0026_core_events_d1_authority.sql', '0027_create_event_candidates.sql',
    '0028_event_candidate_ingest_dedupe.sql',
  ]) sql.exec(readFileSync(`cloudflare/migrations/${migration}`, 'utf8'));
  sql.exec('UPDATE core_event_id_sequence SET next_id = 991 WHERE singleton = 1');
  sql.exec('UPDATE event_candidate_id_sequence SET next_id = 223 WHERE singleton = 1');
  const prepare = (query: string) => {
    let bindings: unknown[] = [];
    const statement = {
      query,
      get bindings() { return bindings; },
      bind(...values: unknown[]) { bindings = values; return statement; },
      async first<T>() { return (sql.prepare(query).get(...bindings) || null) as T | null; },
      async all<T>() { return { results: sql.prepare(query).all(...bindings) as T[] }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...bindings).changes) } }; },
    };
    return statement;
  };
  const DB = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec('BEGIN');
      try {
        const results = statements.map((statement) => {
          if (/\bRETURNING\b/i.test(statement.query)) {
            const rows = sql.prepare(statement.query).all(...statement.bindings);
            return { results: rows, meta: { changes: rows.length } };
          }
          const result = sql.prepare(statement.query).run(...statement.bindings);
          return { results: [], meta: { changes: Number(result.changes) } };
        });
        sql.exec('COMMIT');
        return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  return {
    EVENT_CANDIDATE_INGEST_SECRET: 'fixture-ingest-secret',
    SUPABASE_URL: 'https://source.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    AUTH_SERVICE: { fetch: async () => Response.json({ userId: ADMIN_ID, email: 'staff@example.test', role }) },
    DB,
    __sql: sql,
  } as never;
};

const seedCandidate = (env: ReturnType<typeof makeEnv>, overrides: Record<string, unknown> = {}) => {
  const row = { id: CANDIDATE_ID, created_at: '2026-09-01T00:00:00.000000+00:00', source_name: 'fixture', post_url: 'https://example.test/post', raw_content: 'fixture', review_status: 'pending', ...overrides };
  env.__sql.prepare(`INSERT INTO event_candidates
    (id, created_at, source_name, post_url, raw_content, review_status)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.created_at, row.source_name, row.post_url, row.raw_content, row.review_status);
};

const actionRequest = (action: string, draft: Record<string, unknown> = { title: 'Sự kiện fixture' }) =>
  new Request(`${ORIGIN}/api/admin/v1/event-candidates`, {
    method: 'POST',
    headers: { Cookie: 'better-auth.session=opaque', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, id: CANDIDATE_ID, draft }),
  });

test('D1 is the sole Event Candidate runtime store', () => {
  const source = readFileSync('cloudflare/worker/src/event-candidates.ts', 'utf8');
  const bridge = readFileSync('cloudflare/worker/src/admin-legacy-data.ts', 'utf8');
  assert.doesNotMatch(source, /supabase|\/rest\/v1\/event_candidates/i);
  assert.doesNotMatch(bridge, /event_candidates|event-candidates/i);
});

test('event candidate CORS permits only the configured official extension origin', async () => {
  const env = {
    ALLOWED_ORIGINS: ORIGIN,
    EVENT_CANDIDATE_EXTENSION_ORIGINS: OFFICIAL_EXTENSION_ORIGIN,
  } as never;
  const preflight = (origin: string) => worker.fetch(new Request(`${ORIGIN}/api/event-candidates`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  }), env);

  const official = await preflight(OFFICIAL_EXTENSION_ORIGIN);
  assert.equal(official.status, 204);
  assert.equal(official.headers.get('Access-Control-Allow-Origin'), OFFICIAL_EXTENSION_ORIGIN);
  assert.match(official.headers.get('Access-Control-Allow-Headers') || '', /Authorization/);
  assert.match(official.headers.get('Access-Control-Allow-Headers') || '', /Content-Type/);

  const productionSite = await preflight(ORIGIN);
  assert.equal(productionSite.status, 204);
  assert.equal(productionSite.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  for (const rejectedOrigin of [
    'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'chrome-extension://bakbfjmgpjcmpicoehjadpakiogjcmkd',
    'chrome-extension://bakbfjmgpjcmpicoehjadpakiogjikaa/path',
    'https://random.example',
  ]) {
    const response = await preflight(rejectedOrigin);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }

  assert.equal(corsHeaders(new Request(`${ORIGIN}/api/private/v1/me`, {
    headers: { Origin: OFFICIAL_EXTENSION_ORIGIN },
  }), env), null);
});

test('official extension CORS does not bypass candidate ingest authentication', async () => {
  const response = await worker.fetch(new Request(`${ORIGIN}/api/event-candidates`, {
    method: 'POST',
    headers: {
      Origin: OFFICIAL_EXTENSION_ORIGIN,
      Authorization: 'Bearer invalid-extension-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_name: 'fixture',
      post_url: 'https://facebook.example/post',
      raw_content: 'fixture',
    }),
  }), {
    ALLOWED_ORIGINS: ORIGIN,
    EVENT_CANDIDATE_EXTENSION_ORIGINS: OFFICIAL_EXTENSION_ORIGIN,
    EVENT_CANDIDATE_INGEST_SECRET: 'expected-secret',
  } as never);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), OFFICIAL_EXTENSION_ORIGIN);
});

test('admin and auditor can list/detail while ordinary users are denied', async () => {
  for (const role of ['admin', 'auditor'] as const) {
    const env = makeEnv(role); seedCandidate(env);
    const listed = await handleAdminEventCandidates(new Request(`${ORIGIN}/api/admin/v1/event-candidates`, { headers: { Cookie: 'opaque=1' } }), new URL(`${ORIGIN}/api/admin/v1/event-candidates?review_status=all`), env);
    assert.equal(listed.candidates.length, 1);
    const detail = await handleAdminEventCandidates(new Request(`${ORIGIN}/api/admin/v1/event-candidates`, { headers: { Cookie: 'opaque=1' } }), new URL(`${ORIGIN}/api/admin/v1/event-candidates?id=${CANDIDATE_ID}`), env);
    assert.equal(detail.candidates[0]?.id, CANDIDATE_ID);
  }
  const env = makeEnv('user'); seedCandidate(env);
  await assert.rejects(
    handleAdminEventCandidates(new Request(`${ORIGIN}/api/admin/v1/event-candidates`, { headers: { Cookie: 'opaque=1' } }), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env),
    (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && (error as { status: number }).status === 403,
  );
});

test('candidate approval creates exactly one D1 event and replay is idempotent', async () => {
  const env = makeEnv('auditor'); seedCandidate(env);
  const first = await handleAdminEventCandidates(actionRequest('approve'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env);
  const second = await handleAdminEventCandidates(actionRequest('approve'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(second.replayed, true);
  assert.equal(env.__sql.prepare('SELECT COUNT(*) count FROM admin_events').get().count, 1);
  const stored = env.__sql.prepare('SELECT review_status, approved_event_id FROM event_candidates WHERE id = ?').get(CANDIDATE_ID) as Record<string, unknown>;
  assert.equal(stored.review_status, 'approved');
  assert.equal(stored.approved_event_id, 991);
});

test('admin and auditor can reject once and replay safely', async () => {
  for (const role of ['admin', 'auditor'] as const) {
    const env = makeEnv(role); seedCandidate(env);
    const first = await handleAdminEventCandidates(actionRequest('reject'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env);
    const second = await handleAdminEventCandidates(actionRequest('reject'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env);
    assert.equal(first.candidate.review_status, 'rejected');
    assert.equal(second.replayed, true);
  }
});

test('invalid approval draft is rejected before an event is created', async () => {
  const env = makeEnv(); seedCandidate(env);
  await assert.rejects(
    handleAdminEventCandidates(actionRequest('approve', { title: '' }), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env),
    (error: unknown) => error instanceof EventCandidateError && error.status === 400,
  );
  assert.equal(env.__sql.prepare('SELECT COUNT(*) count FROM admin_events').get().count, 0);
});

test('ingest is secret-scoped, strips caller ownership, persists once, and reloads', async () => {
  const env = makeEnv();
  const originalFetch = globalThis.fetch;
  const notificationRequests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/rest/v1/user_roles')) return Response.json([{ user_id: '33333333-3333-4333-8333-333333333333' }]);
    if (url.includes('/rest/v1/notifications')) {
      notificationRequests.push(url);
      return url.includes('select=receiver_id') ? Response.json([]) : new Response(null, { status: 204 });
    }
    throw new Error('AI unavailable in fixture');
  };
  const makeRequest = (secret: string, postUrl: string, owner = false) => new Request(`${ORIGIN}/api/event-candidates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_name: 'fixture source', post_url: postUrl, raw_content: 'fixture content', ...(owner ? { user_id: 'caller-controlled' } : {}) }),
  });
  try {
    await assert.rejects(handleEventCandidateIngest(makeRequest('wrong', 'https://example.test/a'), env));
    await assert.rejects(handleEventCandidateIngest(makeRequest('fixture-ingest-secret', 'https://example.test/b', true), env), (error: unknown) => error instanceof EventCandidateError && error.status === 400);
    const deferred: Promise<unknown>[] = [];
    const created = await handleEventCandidateIngest(
      makeRequest('fixture-ingest-secret', 'https://example.test/clean'),
      env,
      (task) => deferred.push(task),
    );
    await Promise.all(deferred);
    const replay = await handleEventCandidateIngest(makeRequest('fixture-ingest-secret', 'https://example.test/clean'), env);
    assert.equal(created.httpStatus, 201);
    assert.equal(replay.httpStatus, 200);
    assert.equal(env.__sql.prepare('SELECT COUNT(*) count FROM event_candidates').get().count, 1);
    assert.equal(env.__sql.prepare('SELECT submitter_user_id FROM event_candidates').get().submitter_user_id, null);
    assert.equal(notificationRequests.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('AI analysis writes only bounded server-produced fields to D1', async () => {
  const env = makeEnv('auditor'); seedCandidate(env); env.GROQ_API_KEY = 'fixture-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ is_event: true, confidence: 0.9, reason: 'fixture' }) } }] });
  try {
    const result = await handleAdminEventCandidates(actionRequest('analyze'), new URL(`${ORIGIN}/api/admin/v1/event-candidates`), env);
    assert.equal(result.candidate.ai_is_event, true);
    assert.equal(result.candidate.ai_confidence, 0.9);
  } finally { globalThis.fetch = originalFetch; }
});
