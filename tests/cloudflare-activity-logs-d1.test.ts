import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleActivityLog } from '../cloudflare/worker/src/activity-log.ts';
import { handleAdminLegacyData } from '../cloudflare/worker/src/admin-legacy-data.ts';

const USER = 'a42a6f01-a58e-4046-b90c-73ffa2aeee26';
const ADMIN = 'b42a6f01-a58e-4046-b90c-73ffa2aeee26';
const EVENT = 'c42a6f01-a58e-4046-b90c-73ffa2aeee26';

const makeDb = () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, legacy_source_id TEXT UNIQUE, client_event_id TEXT UNIQUE,
    source_key TEXT NOT NULL UNIQUE, canonical_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
    user_id TEXT,user_email TEXT,user_role TEXT,action TEXT NOT NULL,action_label TEXT,target_table TEXT,
    table_name TEXT,target_id TEXT,record_id TEXT,page_path TEXT,status TEXT NOT NULL DEFAULT 'success',
    metadata_json TEXT NOT NULL DEFAULT '{}',old_data_json TEXT,new_data_json TEXT,details_json TEXT,
    error_message TEXT,ip_address TEXT,device_info TEXT,location_guess TEXT
  );`);
  const prepare = (query: string) => {
    const statement = (...bindings: unknown[]) => ({
        async run() { const result = sql.prepare(query).run(...bindings); return { meta: { changes: Number(result.changes) } }; },
        async first<T>() { return (sql.prepare(query).get(...bindings) || null) as T | null; },
        async all<T>() { return { results: sql.prepare(query).all(...bindings) as T[] }; },
    });
    return {
      bind(...bindings: unknown[]) { return statement(...bindings); },
      async first<T>() { return (sql.prepare(query).get() || null) as T | null; },
      async all<T>() { return { results: sql.prepare(query).all() as T[] }; },
      async run() { const result = sql.prepare(query).run(); return { meta: { changes: Number(result.changes) } }; },
    };
  };
  return { sql, db: { prepare } as unknown as D1Database };
};

const env = (db: D1Database, role: 'user' | 'admin' | 'auditor', userId = USER) => ({
  DB: db,
  AUTH_SERVICE: {
    async fetch() {
      return Response.json({ userId, email: `${role}@st.buh.edu.vn`, role });
    },
  },
});

const request = (url: string, init: RequestInit = {}) => new Request(url, {
  ...init,
  headers: { Cookie: 'hubplanner_auth.session_token=opaque', ...(init.headers || {}) },
});

test('Activity log writer is Better Auth-owned, filters view_page, and deduplicates a retried event', async () => {
  const store = makeDb();
  const body = JSON.stringify({
    eventId: EVENT, action: 'update_profile', targetTable: 'profiles', targetId: 'ignored-client-owner',
    metadata: { source: 'test', password: 'never-store-this' },
  });
  const first = await handleActivityLog(request('https://app.test/api/private/v1/activity-log', { method: 'POST', body }), env(store.db, 'user'));
  const replay = await handleActivityLog(request('https://app.test/api/private/v1/activity-log', { method: 'POST', body }), env(store.db, 'user'));
  const skipped = await handleActivityLog(request('https://app.test/api/private/v1/activity-log', { method: 'POST', body: JSON.stringify({ action: 'view_page' }) }), env(store.db, 'user'));
  const row = store.sql.prepare('SELECT user_id,metadata_json FROM activity_logs').get() as { user_id: string; metadata_json: string };
  assert.equal(first.success, true);
  assert.equal(replay.skipped, true);
  assert.equal(skipped.skipped, true);
  assert.equal(row.user_id, USER);
  assert.match(row.metadata_json, /\[REDACTED\]/);
  assert.equal((store.sql.prepare('SELECT COUNT(*) AS n FROM activity_logs').get() as { n: number }).n, 1);
});

test('admin activity uses D1 pagination, hides view_page, and preserves JSON response fields', async () => {
  const store = makeDb();
  store.sql.prepare(`INSERT INTO activity_logs (source_key,canonical_hash,created_at,action,status,metadata_json)
    VALUES ('one','${'1'.repeat(64)}','2026-09-14T01:00:00.000Z','login','success','{"source":"test"}'),
           ('view','${'2'.repeat(64)}','2026-09-14T02:00:00.000Z','view_page','success','{}'),
           ('two','${'3'.repeat(64)}','2026-09-14T03:00:00.000Z','logout','success','{}')`).run();
  const payload = await handleAdminLegacyData(
    request('https://app.test/api/admin/v1/activity?limit=1&offset=0'),
    new URL('https://app.test/api/admin/v1/activity?limit=1&offset=0'),
    env(store.db, 'admin', ADMIN),
  );
  assert.equal(payload.total, 2);
  assert.equal((payload.data as Array<Record<string, unknown>>).length, 1);
  assert.equal((payload.data as Array<Record<string, unknown>>)[0].action, 'logout');
  assert.deepEqual((payload.data as Array<Record<string, unknown>>)[0].metadata, {});
  assert.equal('metadata_json' in (payload.data as Array<Record<string, unknown>>)[0], false);
});

test('auditor and ordinary users cannot read the admin-only activity log', async () => {
  const store = makeDb();
  const url = new URL('https://app.test/api/admin/v1/activity');
  for (const role of ['auditor', 'user'] as const) {
    await assert.rejects(
      handleAdminLegacyData(request(url.toString()), url, env(store.db, role, role === 'auditor' ? ADMIN : USER)),
      (error: { status?: number }) => error.status === 403,
    );
  }
});

test('D1 activity migration and active runtime have no Supabase activity dependency', () => {
  const runtime = [
    readFileSync('cloudflare/worker/src/activity-log.ts', 'utf8'),
    readFileSync('cloudflare/worker/src/admin-legacy-data.ts', 'utf8'),
  ].join('\n');
  const migration = readFileSync('cloudflare/migrations/0037_activity_logs_d1_authority.sql', 'utf8');
  assert.doesNotMatch(readFileSync('cloudflare/worker/src/activity-log.ts', 'utf8'), /SUPABASE_|rest\/v1\/activity_logs/);
  assert.match(runtime, /FROM activity_logs/);
  assert.match(runtime, /INSERT OR IGNORE INTO activity_logs/);
  assert.match(migration, /CHECK \(action <> 'view_page'\)/);
});
