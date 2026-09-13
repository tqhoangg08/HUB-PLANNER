import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  handleCtvRegistration,
  handleModeratorNotification,
  handleProtectedSubmission,
  UserSubmissionError,
} from '../cloudflare/worker/src/user-submissions.ts';
import { handleAdminLegacyData } from '../cloudflare/worker/src/admin-legacy-data.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const COOKIE = 'hubplanner_auth.session_token=opaque';
const makeEnv = (role: 'user' | 'auditor' | 'admin' = 'auditor') => {
  const sql = new DatabaseSync(':memory:');
  for (const migration of ['0008_create_admin_events.sql', '0023_create_event_push_deliveries.sql', '0024_create_native_push_runtime.sql', '0030_lost_found_moderator_notifications.sql', '0033_reduce_push_delivery_write_amplification.sql', '0036_protected_submissions_d1_authority.sql']) {
    sql.exec(readFileSync(`cloudflare/migrations/${migration}`, 'utf8'));
  }
  const prepare = (query: string) => {
    let bindings: unknown[] = [];
    const statement = {
      query, get bindings() { return bindings; }, bind(...values: unknown[]) { bindings = values; return statement; },
      async first<T>() { return (sql.prepare(query).get(...bindings) || null) as T | null; },
      async all<T>() { return { results: sql.prepare(query).all(...bindings) as T[] }; },
      async run() { const result = sql.prepare(query).run(...bindings); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
    };
    return statement;
  };
  return {
    DB: { prepare, async batch(statements: ReturnType<typeof prepare>[]) { return Promise.all(statements.map((statement) => statement.run())); } } as unknown as D1Database,
    TURNSTILE_SECRET_KEY: 'fixture-secret',
    AUTH_SERVICE: { fetch: async (input: RequestInfo | URL) => new URL(input instanceof Request ? input.url : String(input)).pathname === '/internal/auth/staff-list' ? Response.json({ userIds: [USER] }) : Response.json({ userId: USER, email: 'fixture@st.buh.edu.vn', role }) },
    __sql: sql,
  } as never;
};

test('browser submission clients stay same-origin and do not import Supabase', () => {
  for (const file of ['utils/protectedSubmit.ts', 'utils/moderatorNotifications.ts', 'components/CTVRegistrationForm.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /utils\/supabase|supabase\.(?:auth|from|rpc|storage)|functions\/v1/i);
  }
  assert.match(readFileSync('utils/protectedSubmit.ts', 'utf8'), /\/api\/submissions\/v1\/protected/);
});

test('auditor moderation is owner-safe and unchanged status does not rewrite', async () => {
  const env = makeEnv('auditor'); const now = '2026-09-13T00:00:00.000Z';
  env.__sql.prepare(`INSERT INTO protected_submissions (id,kind,user_id,status,payload_json,created_at,updated_at) VALUES (?,?,?,'pending','{}',?,?)`).run('33333333-3333-4333-8333-333333333333', 'ctv_requests', USER, now, now);
  const request = (role: 'auditor' | 'user', status: string) => new Request('https://x/api/admin/v1/reports?kind=ctv_requests', { method: 'PATCH', headers: { Cookie: COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '33333333-3333-4333-8333-333333333333', status }) });
  try {
    await handleAdminLegacyData(request('auditor', 'approved'), new URL(request('auditor', 'approved').url), env);
    const first = env.__sql.prepare('SELECT status,updated_at FROM protected_submissions').get();
    await handleAdminLegacyData(request('auditor', 'approved'), new URL(request('auditor', 'approved').url), env);
    assert.equal(env.__sql.prepare('SELECT status,updated_at FROM protected_submissions').get().updated_at, first.updated_at);
    const denied = makeEnv('user');
    await assert.rejects(handleAdminLegacyData(request('user', 'rejected'), new URL(request('user', 'rejected').url), denied), /FORBIDDEN/);
    denied.__sql.close();
  } finally { env.__sql.close(); }
});

test('protected submissions are D1-only, owner-scoped, and verify Turnstile', async () => {
  const env = makeEnv(); const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ success: true })) as typeof fetch;
  try {
    const result = await handleProtectedSubmission(new Request('https://app.example/api/submissions/v1/protected', { method: 'POST', headers: { Cookie: COOKIE }, body: JSON.stringify({ action: 'feedback', turnstileToken: 'turnstile', payload: { content: 'Nội dung', user_id: '22222222-2222-4222-8222-222222222222' } }) }), env);
    assert.equal(result.success, true);
    assert.equal(env.__sql.prepare('SELECT user_id,kind FROM protected_submissions').get().user_id, USER);
    assert.equal(env.__sql.prepare('SELECT user_id,kind FROM protected_submissions').get().kind, 'feedback');
  } finally { globalThis.fetch = originalFetch; env.__sql.close(); }
});

test('CTV request is owner-scoped, duplicate-safe, and moderator notification is deduplicated', async () => {
  const env = makeEnv(); const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ success: true })) as typeof fetch;
  try {
    const request = () => new Request('https://app.example/api/submissions/v1/ctv-requests', { method: 'POST', headers: { Cookie: COOKIE }, body: JSON.stringify({ full_name: 'Sinh viên HUB', student_batch: 'K41', major: 'CNTT', contact_info: '0900' }) });
    const created = await handleCtvRegistration(request(), env);
    await assert.rejects(handleCtvRegistration(request(), env), (error: unknown) => error instanceof UserSubmissionError && error.status === 409);
    const notification = () => new Request('https://app.example/api/submissions/v1/moderator-notifications', { method: 'POST', headers: { Cookie: COOKIE }, body: JSON.stringify({ kind: 'ctv_request', recordId: created.id }) });
    assert.equal((await handleModeratorNotification(notification(), env)).notified, 1);
    assert.equal((await handleModeratorNotification(notification(), env)).notified, 0);
    assert.equal(env.__sql.prepare('SELECT COUNT(*) AS total FROM protected_submission_moderator_notifications').get().total, 1);
  } finally { globalThis.fetch = originalFetch; env.__sql.close(); }
});
