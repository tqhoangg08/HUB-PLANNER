import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  handleAdminLostFound,
  handleLostFound,
  handleLostFoundImage,
  submitLostFound,
} from '../cloudflare/worker/src/lost-found.ts';
import { handleModeratorNotification } from '../cloudflare/worker/src/user-submissions.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const makeEnv = (role: 'admin' | 'auditor' | 'user' = 'admin') => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('cloudflare/migrations/0007_create_public_lost_found.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0023_create_event_push_deliveries.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0024_create_native_push_runtime.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0029_lost_found_d1_r2_authority.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0030_lost_found_moderator_notifications.sql', 'utf8'));
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const deleted: string[] = [];
  const prepare = (query: string) => {
    let bindings: unknown[] = [];
    const statement = {
      query, get bindings() { return bindings; },
      bind(...values: unknown[]) { bindings = values; return statement; },
      async first<T>() { return (sql.prepare(query).get(...bindings) || null) as T | null; },
      async all<T>() { return { results: sql.prepare(query).all(...bindings) as T[] }; },
      async run() { const result = sql.prepare(query).run(...bindings); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
    };
    return statement;
  };
  const DB = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec('BEGIN');
      try {
        const results = statements.map((statement) => {
          if (/^\s*SELECT\b/i.test(statement.query)) return { results: sql.prepare(statement.query).all(...statement.bindings), meta: { changes: 0 } };
          const result = sql.prepare(statement.query).run(...statement.bindings);
          return { results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        });
        sql.exec('COMMIT'); return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  const bucket = {
    async put(key: string, bytes: Uint8Array, options: { httpMetadata?: { contentType?: string } }) { objects.set(key, { bytes: Uint8Array.from(bytes), type: options.httpMetadata?.contentType || 'application/octet-stream' }); },
    async get(key: string) { const item = objects.get(key); return item ? { body: item.bytes, httpEtag: '"fixture"', writeHttpMetadata(headers: Headers) { headers.set('Content-Type', item.type); } } : null; },
    async delete(key: string) { objects.delete(key); deleted.push(key); },
  };
  return {
    DB, SUPPORT_ATTACHMENTS_BUCKET: bucket,
    TURNSTILE_SECRET_KEY: 'fixture-secret',
    AUTH_SERVICE: { fetch: async (input: RequestInfo | URL) => new URL(input instanceof Request ? input.url : String(input)).pathname === '/internal/auth/staff-list'
      ? Response.json({ userIds: [USER] })
      : Response.json({ userId: USER, email: 'fixture@example.test', role }) },
    __sql: sql, __objects: objects, __deleted: deleted,
  } as never;
};

const adminRequest = (method: string, body?: Record<string, unknown>) => new Request('https://hotrosinhvienhub.id.vn/api/admin/v1/lost-found', {
  method, headers: { Cookie: 'hubplanner_auth.session_token=opaque', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);

test('submission writes only D1/R2, keeps owner server-scoped, and remains pending', async () => {
  const env = makeEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true });
  try {
    const body = { turnstileToken: 'fixture', payload: { type: 'LOST', title: 'Ví sinh viên', location: 'Cơ sở A', contact_info: 'Liên hệ nội bộ', user_name: 'Người dùng', image: { contentType: 'image/png', base64: Buffer.from(png).toString('base64') }, user_id: '22222222-2222-4222-8222-222222222222' } };
    const result = await submitLostFound(new Request('https://hotrosinhvienhub.id.vn/api/submissions/v1/protected', { headers: { 'CF-Connecting-IP': '127.0.0.1' } }), env, body, { userId: USER, email: 'fixture@example.test', role: 'user' });
    assert.equal(result.success, true);
    const stored = env.__sql.prepare('SELECT status,user_id,image_key,image_url FROM lost_found_items WHERE id=?').get(result.id) as Record<string, unknown>;
    assert.equal(stored.status, 'pending'); assert.equal(stored.user_id, USER);
    assert.match(String(stored.image_key), /^lost-found\//); assert.match(String(stored.image_url), /^\/api\/public\/v1\/lost-found-images\//);
    assert.equal(env.__sql.prepare('SELECT COUNT(*) count FROM public_lost_found_items').get().count, 0);
  } finally { globalThis.fetch = originalFetch; env.__sql.close(); }
});

test('admin approve/edit/resolve/delete maintains the public projection without cross-role writes', async () => {
  const env = makeEnv();
  env.__sql.prepare(`INSERT INTO lost_found_items (id,created_at,updated_at,type,title,location,contact_info,user_name,status,is_deleted,user_id,title_search,location_search,description_search) VALUES (10,?,?,?,?,?,?,?,'pending',0,?,?,?,'')`)
    .run('2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z','FOUND','Thẻ sinh viên','Sảnh','Nội bộ','Bạn A',USER,'thẻ sinh viên','sảnh');
  try {
    assert.equal((await handleAdminLostFound(adminRequest('PATCH', { id: 10, title: 'Thẻ sinh viên HUB', status: 'approved' }), new URL('https://x/api/admin/v1/lost-found'), env)).success, true);
    assert.equal(env.__sql.prepare('SELECT title FROM public_lost_found_items WHERE id=10').get().title, 'Thẻ sinh viên HUB');
    await handleAdminLostFound(adminRequest('PATCH', { id: 10, status: 'resolved' }), new URL('https://x/api/admin/v1/lost-found'), env);
    assert.equal(env.__sql.prepare('SELECT status FROM public_lost_found_items WHERE id=10').get().status, 'resolved');
    await handleAdminLostFound(adminRequest('PATCH', { id: 10, is_deleted: true }), new URL('https://x/api/admin/v1/lost-found'), env);
    assert.equal(env.__sql.prepare('SELECT COUNT(*) count FROM public_lost_found_items WHERE id=10').get().count, 0);
    const auditor = makeEnv('auditor');
    await assert.rejects(handleAdminLostFound(adminRequest('PATCH', { id: 10, status: 'approved' }), new URL('https://x/api/admin/v1/lost-found'), auditor), (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && error.status === 403);
    auditor.__sql.close();
  } finally { env.__sql.close(); }
});

test('public list keeps approved/resolved visibility, paging and search semantics', async () => {
  const env = makeEnv();
  env.__sql.exec(`INSERT INTO public_lost_found_items VALUES (1,'2026-09-11T00:00:00.000Z','LOST','Điện thoại','Màu đen','Khu A','x','A',NULL,'approved',0,NULL,'điện thoại','khu a','màu đen');
    INSERT INTO public_lost_found_items VALUES (2,'2026-09-10T00:00:00.000Z','FOUND','Ví','Da','Khu B','x','B',NULL,'resolved',0,NULL,'ví','khu b','da');`);
  try {
    const payload = await handleLostFound(new URL('https://x/lost-found?type=LOST&search=điện&limit=1'), env);
    assert.equal(payload.total, 1); assert.equal(payload.data[0]?.id, 1); assert.equal(payload.hasMore, false);
  } finally { env.__sql.close(); }
});

test('R2 image route serves immutable content and admin replacement deletes only the old owned key', async () => {
  const env = makeEnv();
  await env.SUPPORT_ATTACHMENTS_BUCKET.put('lost-found/old.png', png, { httpMetadata: { contentType: 'image/png' } });
  env.__sql.prepare(`INSERT INTO lost_found_items (id,created_at,updated_at,type,title,location,contact_info,user_name,image_url,image_key,status,is_deleted,title_search,location_search,description_search) VALUES (7,?,?,?,?,?,?,?,?,?,'approved',0,?,?,?)`)
    .run('2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z','FOUND','Ảnh','A','x','A','/api/public/v1/lost-found-images/lost-found/old.png','lost-found/old.png','ảnh','a','');
  try {
    const response = await handleLostFoundImage(new Request('https://x/api/public/v1/lost-found-images/lost-found/old.png'), 'lost-found/old.png', env);
    assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'image/png');
    await handleAdminLostFound(adminRequest('PATCH', { id: 7, is_deleted: true }), new URL('https://x/api/admin/v1/lost-found'), env);
    assert.deepEqual(env.__deleted, ['lost-found/old.png']);
    assert.equal(env.__sql.prepare('SELECT image_url FROM lost_found_items WHERE id=7').get().image_url, null);
  } finally { env.__sql.close(); }
});

test('pending-item moderator notice uses Better Auth staff authority and D1 exactly once', async () => {
  const env = makeEnv();
  env.__sql.prepare(`INSERT INTO lost_found_items (id,created_at,updated_at,type,title,location,contact_info,user_name,status,is_deleted,user_id,title_search,location_search,description_search) VALUES (11,?,?,?,?,?,?,?,'pending',0,?,?,?,'')`)
    .run('2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z','LOST','Ví test','Sảnh','Nội bộ','Bạn A',USER,'ví test','sảnh');
  const request = () => new Request('https://x/api/submissions/v1/moderator-notifications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'lost_found_pending', recordId: 11 }),
  });
  try {
    assert.equal((await handleModeratorNotification(request(), env) as { notified: number }).notified, 1);
    assert.equal((await handleModeratorNotification(request(), env) as { notified: number }).notified, 0);
    const stored = env.__sql.prepare('SELECT receiver_id, lost_found_item_id FROM lost_found_moderator_notifications').get() as Record<string, unknown>;
    assert.equal(stored.receiver_id, USER); assert.equal(stored.lost_found_item_id, 11);
  } finally { env.__sql.close(); }
});

test('active Lost & Found Worker runtime contains no Supabase table/storage dependency or sync cron', () => {
  const authority = readFileSync('cloudflare/worker/src/lost-found.ts', 'utf8');
  const admin = readFileSync('cloudflare/worker/src/admin-legacy-data.ts', 'utf8');
  const submissions = readFileSync('cloudflare/worker/src/user-submissions.ts', 'utf8');
  const worker = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  const config = readFileSync('cloudflare/wrangler.jsonc', 'utf8');
  assert.doesNotMatch(authority, /supabase|\/rest\/v1|\/storage\/v1/i);
  assert.doesNotMatch(admin, /\/rest\/v1\/lost_found_items|\/storage\/v1\/.*lost_found|lost_found_images/i);
  assert.match(submissions, /if \(action === 'lost-found'\) return submitLostFound/);
  const lostFoundModerator = submissions.slice(submissions.indexOf('const notifyLostFoundModerators'), submissions.indexOf('const notificationSource'));
  assert.doesNotMatch(lostFoundModerator, /supabase|\/rest\/v1|sourceConfig/i);
  assert.doesNotMatch(worker, /syncPublicLostFound|lost_found_sync/);
  assert.doesNotMatch(config, /"\*\/5 \* \* \* \*"/);
});
