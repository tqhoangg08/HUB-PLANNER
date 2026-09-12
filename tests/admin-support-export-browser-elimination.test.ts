import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { handleAdminExport } from '../cloudflare/worker/src/admin-export.ts';

const USER_ID = 'b42a6f01-a58e-4046-b90c-73ffa2aeee26';
const COOKIE = 'hubplanner_auth.session_token=opaque-session';
const IDENTITY = { userId: USER_ID, email: 'staff@example.test', role: 'admin' };

type OtpRow = {
  challenge_id: string;
  otp_hash: string;
  expires_at: string;
  attempt_count: number;
  consumed_at: string | null;
};

const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const digest = async (challenge: string, otp: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${challenge}:${USER_ID}:admin_excel_export:${otp}`))));

const exportEnv = (
  row: OtpRow | null,
  rows: Record<string, unknown>[] = [],
  identity: typeof IDENTITY = IDENTITY,
) => {
  const statements: string[] = [];
  const bindings: Array<{ query: string; values: unknown[] }> = [];
  const database = {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) { values = next; bindings.push({ query, values: next }); return statement; },
        async first() {
          if (/FROM admin_export_otps WHERE user_id = \?/i.test(query) && values[0] !== identity.userId) return null;
          return row && row.consumed_at === null ? { ...row } : null;
        },
        async run() {
          statements.push(query);
          if (/UPDATE admin_export_otps SET consumed_at/i.test(query) && row) row.consumed_at = String(values[0]);
          if (/attempt_count = attempt_count \+ 1/i.test(query) && row) row.attempt_count += 1;
          return { meta: { changes: 1 } };
        },
        async all() { return { results: rows }; },
      };
      return statement;
    },
    async batch(items: Array<{ run(): Promise<unknown> }>) { return Promise.all(items.map((item) => item.run())); },
  };
  const env = {
    DB: database,
    AUTH_SERVICE: {
      async fetch(request: Request) {
        const path = new URL(request.url).pathname;
        if (path === '/internal/auth/staff') return Response.json(identity);
        if (path === '/internal/admin-export/send-otp') return Response.json({ ok: true });
        return Response.json({ error: 'not found' }, { status: 404 });
      },
    },
  } as never;
  return { env, statements, bindings };
};

const request = (payload: Record<string, unknown>) => new Request('https://example.test/api/private/v1/admin/export', {
  method: 'POST', headers: { Cookie: COOKIE, 'content-type': 'application/json' }, body: JSON.stringify(payload),
});

test('Support and Excel browser adapters contain no browser Supabase dependency', () => {
  for (const path of [
    'utils/supportTicketsApi.ts',
    'utils/supportAttachmentsApi.ts',
    'components/AdminStudentExcelExportModal.tsx',
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /from ['"].*supabase/);
    assert.doesNotMatch(source, /\bsupabase\.(?:from|rpc|auth)\b/);
    assert.doesNotMatch(source, /getBrowserSupabase|createBrowserClient|HUB_BROWSER_SUPABASE/);
  }
  const support = readFileSync('utils/supportTicketsApi.ts', 'utf8');
  for (const action of ['list', 'get-ticket', 'messages', 'create-ticket', 'create-message', 'update-ticket', 'resolve-ticket', 'resolve-all-open-tickets', 'delete-ticket', 'staff']) assert.match(support, new RegExp(`['"]${action}['"]`));
  const attachments = readFileSync('utils/supportAttachmentsApi.ts', 'utf8');
  assert.match(attachments, /action:\s*`attachment:\$\{action\}`/);
  assert.match(attachments, /['"]create-upload-url['"]/);
  assert.match(readFileSync('utils/adminExportApi.ts', 'utf8'), /\/api\/private\/v1\/admin\/export/);
});

test('Excel OTP consumes a valid challenge and blocks reuse', async () => {
  const challenge = 'a42a6f01-a58e-4046-b90c-73ffa2aeee26';
  const row: OtpRow = { challenge_id: challenge, otp_hash: await digest(challenge, '123456'), expires_at: new Date(Date.now() + 60_000).toISOString(), attempt_count: 0, consumed_at: null };
  const { env, statements } = exportEnv(row, [{ user_id: 'profile-1', data_json: '{"semesters":[]}' }]);
  const result = await handleAdminExport(request({ action: 'excel', otp: '123456' }), env);
  assert.equal(result.success, true);
  assert.equal(Array.isArray((result as { rows?: unknown[] }).rows), true);
  assert.notEqual(row.consumed_at, null);
  assert.ok(statements.some((query) => /UPDATE admin_export_otps SET consumed_at/i.test(query)));
  await assert.rejects(() => handleAdminExport(request({ action: 'excel', otp: '123456' }), env), { status: 400 });
});

test('Excel OTP request creates only hashed server-side state and invokes the internal mail service', async () => {
  const { env, bindings } = exportEnv(null);
  const result = await handleAdminExport(request({ action: 'request-otp' }), env) as { success: boolean };
  assert.equal(result.success, true);
  const insert = bindings.find(({ query }) => /INSERT INTO admin_export_otps/i.test(query));
  assert.ok(insert);
  assert.equal(String(insert.values[1]), USER_ID);
  assert.equal(String(insert.values[2]), 'admin_excel_export');
  assert.match(String(insert.values[3]), /^[a-f0-9]{64}$/);
  assert.doesNotMatch(String(insert.values[3]), /^\d{6}$/);
});

test('Excel OTP rejects expiration, wrong-user state, and non-admin authorization', async () => {
  const challenge = 'c42a6f01-a58e-4046-b90c-73ffa2aeee26';
  const expired: OtpRow = { challenge_id: challenge, otp_hash: await digest(challenge, '123456'), expires_at: new Date(Date.now() - 1).toISOString(), attempt_count: 0, consumed_at: null };
  await assert.rejects(() => handleAdminExport(request({ action: 'verify-otp', otp: '123456' }), exportEnv(expired).env), { status: 400 });
  const differentUser = { ...IDENTITY, userId: 'e42a6f01-a58e-4046-b90c-73ffa2aeee26' };
  await assert.rejects(
    () => handleAdminExport(request({ action: 'verify-otp', otp: '123456' }), exportEnv(expired, [], differentUser).env),
    { status: 400 },
  );
  const { env } = exportEnv(null);
  env.AUTH_SERVICE.fetch = async (incoming: Request) => new URL(incoming.url).pathname === '/internal/auth/staff'
    ? Response.json({ ...IDENTITY, role: 'user' })
    : Response.json({ ok: true });
  await assert.rejects(() => handleAdminExport(request({ action: 'request-otp' }), env), { status: 403 });
  env.AUTH_SERVICE.fetch = async (incoming: Request) => new URL(incoming.url).pathname === '/internal/auth/staff'
    ? Response.json({ ...IDENTITY, role: 'auditor' })
    : Response.json({ ok: true });
  await assert.rejects(() => handleAdminExport(request({ action: 'request-otp' }), env), { status: 403 });
});

test('Support Worker authority is covered by the D1/R2 integration suite', () => {
  const source = readFileSync('cloudflare/worker/src/admin-support.ts', 'utf8');
  assert.doesNotMatch(source, /supabase|\/rest\/v1/i);
  assert.match(source, /requireBetterAuthSession/);
  assert.match(source, /support_tickets/);
  assert.match(source, /SUPPORT_ATTACHMENTS_BUCKET/);
});
