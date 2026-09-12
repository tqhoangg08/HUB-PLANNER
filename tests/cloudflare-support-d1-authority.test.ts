import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleAdminSupport, handleAdminSupportAttachmentObject } from '../cloudflare/worker/src/admin-support.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const AUDITOR = '33333333-3333-4333-8333-333333333333';
const COOKIE = 'hubplanner_auth.session_token=opaque';

const makeEnv = (userId = USER, role: 'user' | 'admin' | 'auditor' = 'user') => {
  const identity = { userId, role };
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE user_profiles (user_id TEXT PRIMARY KEY, full_name TEXT, avatar_url TEXT, student_code TEXT);');
  sql.exec(readFileSync('cloudflare/migrations/0021_create_support_attachment_uploads.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0031_support_d1_r2_authority.sql', 'utf8'));
  for (const [id, name] of [[USER, 'User'], [ADMIN, 'Admin'], [AUDITOR, 'Auditor']]) {
    sql.prepare('INSERT INTO user_profiles VALUES (?,?,NULL,NULL)').run(id, name);
  }
  const prepare = (query: string) => {
    let bindings: unknown[] = [];
    const statement = {
      query, get bindings() { return bindings; },
      bind(...values: unknown[]) { bindings = values; return statement; },
      async first<T>() { return (sql.prepare(query).get(...bindings) || null) as T | null; },
      async all<T>() { return { results: sql.prepare(query).all(...bindings) as T[] }; },
      async run() { const result = sql.prepare(query).run(...bindings); return { meta: { changes: Number(result.changes) } }; },
    };
    return statement;
  };
  const DB = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec('BEGIN');
      try {
        const results = statements.map((statement) => {
          const result = sql.prepare(statement.query).run(...statement.bindings);
          return { meta: { changes: Number(result.changes) }, results: [] };
        });
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const bucket = {
    async put(key: string, value: ReadableStream | Uint8Array, options: { httpMetadata?: { contentType?: string } }) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, { bytes, type: options.httpMetadata?.contentType || 'application/octet-stream' });
    },
    async head(key: string) {
      const item = objects.get(key);
      return item ? { size: item.bytes.length, httpMetadata: { contentType: item.type } } : null;
    },
    async get(key: string) {
      const item = objects.get(key);
      return item ? { body: item.bytes } : null;
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
  };
  return {
    DB,
    SUPPORT_ATTACHMENTS_BUCKET: bucket,
    AUTH_SERVICE: {
      async fetch(input: RequestInfo | URL) {
        const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
        if (path === '/internal/auth/staff-list') {
          return Response.json({
            userIds: [ADMIN, AUDITOR],
            staff: [{ userId: ADMIN, role: 'admin' }, { userId: AUDITOR, role: 'auditor' }],
          });
        }
        if (path === '/internal/auth/staff' && identity.role === 'user') {
          return Response.json({ error: 'forbidden' }, { status: 403 });
        }
        return Response.json({ userId: identity.userId, email: identity.role + '@example.test', role: identity.role });
      },
    },
    __sql: sql,
    __objects: objects,
    __identity: identity,
  } as never;
};

const request = (action: string, payload: Record<string, unknown> = {}) => new Request(
  'https://hotrosinhvienhub.id.vn/api/private/v1/support',
  { method: 'POST', headers: { Cookie: COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) },
);
const invoke = (env: never, action: string, payload: Record<string, unknown> = {}) =>
  handleAdminSupport(request(action, payload), new URL('https://hotrosinhvienhub.id.vn/api/private/v1/support'), env);

test('D1 support owner flow persists create, reply, resolve and delete', async () => {
  const env = makeEnv();
  try {
    const created = await invoke(env, 'create-ticket', { subject: 'Ticket fixture', category: 'other', priority: 'normal', message: 'Need help' }) as { id: string };
    assert.equal((await invoke(env, 'list') as { data: unknown[] }).data.length, 1);
    await invoke(env, 'create-message', { ticket_id: created.id, body: 'More detail' });
    assert.equal((await invoke(env, 'messages', { ticket_id: created.id }) as { data: unknown[] }).data.length, 2);
    await invoke(env, 'resolve-ticket', { ticket_id: created.id });
    assert.equal(env.__sql.prepare('SELECT status FROM support_tickets WHERE id=?').get(created.id).status, 'resolved');
    await invoke(env, 'delete-ticket', { ticket_id: created.id });
    assert.equal(env.__sql.prepare('SELECT COUNT(*) count FROM support_tickets').get().count, 0);
  } finally { env.__sql.close(); }
});

test('admin can reply and update; auditor can read but cannot mutate', async () => {
  const env = makeEnv();
  try {
    const created = await invoke(env, 'create-ticket', { subject: 'Permission fixture', category: 'other', priority: 'normal', message: 'Need help' }) as { id: string };
    env.__identity.userId = ADMIN; env.__identity.role = 'admin';
    await invoke(env, 'create-message', { ticket_id: created.id, body: 'Staff reply' });
    await invoke(env, 'update-ticket', { ticket_id: created.id, updates: { priority: 'high' } });
    assert.equal(env.__sql.prepare('SELECT priority FROM support_tickets WHERE id=?').get(created.id).priority, 'high');
    env.__identity.userId = AUDITOR; env.__identity.role = 'auditor';
    assert.equal((await invoke(env, 'list') as { data: unknown[] }).data.length, 1);
    await assert.rejects(() => invoke(env, 'update-ticket', { ticket_id: created.id, updates: { priority: 'high' } }), { status: 403 });
    await assert.rejects(() => invoke(env, 'create-message', { ticket_id: created.id, body: 'Denied' }), { status: 403 });
    env.__identity.userId = '44444444-4444-4444-8444-444444444444'; env.__identity.role = 'user';
    await assert.rejects(() => invoke(env, 'get-ticket', { ticket_id: created.id }), { status: 403 });
  } finally { env.__sql.close(); }
});

test('R2 attachment upload, private read and owner delete use only safe object keys', async () => {
  const env = makeEnv();
  try {
    const created = await invoke(env, 'create-ticket', { subject: 'Attachment fixture', category: 'other', priority: 'normal', message: 'Need help' }) as { id: string; initial_message_id: string };
    const upload = await invoke(env, 'attachment:create-upload-url', { ticket_id: created.id, file_name: 'proof.png', mime_type: 'image/png', size: 8 }) as { upload_url: string; file_key: string };
    assert.match(upload.file_key, new RegExp('^support-tickets/' + created.id + '/[0-9a-f-]{36}\\.png$'));
    const put = new Request(new URL(upload.upload_url, 'https://hotrosinhvienhub.id.vn'), { method: 'PUT', headers: { Cookie: COOKIE, 'content-type': 'image/png', 'content-length': '8' }, body: Uint8Array.from([137,80,78,71,13,10,26,10]) });
    assert.equal((await handleAdminSupportAttachmentObject(put, new URL(put.url), env)).status, 204);
    const completed = await invoke(env, 'attachment:complete-upload', { ticket_id: created.id, file_key: upload.file_key, file_name: 'proof.png', mime_type: 'image/png', size: 8 }) as { attachment: { id: string } };
    await invoke(env, 'attachment:link-message-attachments', { ticket_id: created.id, message_id: created.initial_message_id, attachment_ids: [completed.attachment.id] });
    const download = await invoke(env, 'attachment:create-download-url', { attachment_id: completed.attachment.id }) as { download_url: string };
    const get = new Request(new URL(download.download_url, 'https://hotrosinhvienhub.id.vn'), { headers: { Cookie: COOKIE } });
    assert.equal((await handleAdminSupportAttachmentObject(get, new URL(get.url), env)).status, 200);
    await invoke(env, 'attachment:delete', { attachment_id: completed.attachment.id });
    assert.equal(env.__objects.size, 0);
  } finally { env.__sql.close(); }
});

test('active support runtime is D1/R2-only and retains Better Auth owner authority', () => {
  const source = readFileSync('cloudflare/worker/src/admin-support.ts', 'utf8');
  assert.doesNotMatch(source, /supabase|\/rest\/v1|service.role/i);
  assert.match(source, /requireBetterAuthSession/);
  assert.match(source, /SUPPORT_ATTACHMENTS_BUCKET/);
  assert.match(source, /support_tickets/);
  assert.match(source, /attachment:delete/);
});
