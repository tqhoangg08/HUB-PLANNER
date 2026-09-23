import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../cloudflare/worker/src/index.ts';
import { handleEvents, incrementPendingAdminEventView, parseEventViewId } from '../cloudflare/worker/src/events.ts';
import { handleAdminEvents } from '../cloudflare/worker/src/admin-events.ts';
import { formatEventViewCount } from '../utils/eventViewCount.ts';

const origin = 'https://hotrosinhvienhub.id.vn';

test('card view formatter uses the persisted count without synthetic popularity', () => {
  assert.equal(formatEventViewCount(0), '0 lượt xem');
  assert.equal(formatEventViewCount(856), '856 lượt xem');
  assert.equal(formatEventViewCount(1_200), '1.2K lượt xem');
  assert.equal(formatEventViewCount(2_100), '2.1K lượt xem');
});

const fixture = () => {
  const sql = new DatabaseSync(':memory:');
  for (const migration of ['0006_create_public_events.sql', '0008_create_admin_events.sql', '0048_event_view_count.sql']) {
    sql.exec(readFileSync(`cloudflare/migrations/${migration}`, 'utf8'));
  }
  sql.prepare("INSERT INTO admin_events (id,title,created_at,title_search,organizer_search,status) VALUES (1,'Public','2026-09-01','public','','published')").run();
  sql.prepare("INSERT INTO public_events (id,title,created_at,title_search,organizer_search,status) VALUES (1,'Public','2026-09-01','public','','published')").run();
  sql.prepare("INSERT INTO admin_events (id,title,created_at,title_search,organizer_search,status) VALUES (2,'Pending','2026-09-01','pending','','pending')").run();
  sql.prepare("INSERT INTO public_events (id,title,created_at,title_search,organizer_search,status,is_deleted) VALUES (3,'Deleted','2026-09-01','deleted','','published',1)").run();
  const DB = {
    prepare(query: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) { bindings = values; return this; },
        async first<T>() { return (sql.prepare(query).get(...bindings) || null) as T | null; },
        async all<T>() { return { results: sql.prepare(query).all(...bindings) as T[] }; },
      };
    },
  } as unknown as D1Database;
  const env = { DB } as Parameters<typeof worker.fetch>[1];
  const ctx = { waitUntil() {} } as unknown as ExecutionContext;
  const post = (id: string, headers?: HeadersInit) => worker.fetch(new Request(`${origin}/api/events/${id}/view`, { method: 'POST', headers }), env, ctx);
  return { sql, DB, env, ctx, post };
};

test('public event view endpoint increments atomically for guest and authenticated callers', async () => {
  const { sql, DB, post } = fixture();
  try {
    assert.equal(parseEventViewId('1'), 1);
    assert.equal(parseEventViewId('1 OR 1=1'), null);
    const guest = await post('1');
    assert.equal(guest.status, 200);
    assert.deepEqual(await guest.json(), { success: true, views: 1 });
    assert.equal(guest.headers.get('Cache-Control'), 'no-store');
    const student = await post('1', { Cookie: 'session=student' });
    const admin = await post('1', { Cookie: 'session=admin' });
    const auditor = await post('1', { Cookie: 'session=auditor' });
    assert.deepEqual([student, admin, auditor].map((response) => response.status), [200, 200, 200]);
    assert.equal((await auditor.json() as { views: number }).views, 4);
    assert.equal(sql.prepare('SELECT view_count FROM public_events WHERE id=1').get()?.view_count, 4);
    assert.equal(sql.prepare('SELECT view_count FROM admin_events WHERE id=1').get()?.view_count, 4);
    const listed = await handleEvents(new URL(`${origin}/events`), { DB });
    assert.equal(listed.data[0].view_count, 4);
    const managed = await handleAdminEvents(new URL(`${origin}/api/admin/v1/events`), { DB });
    assert.equal(managed.data.find((event) => event.id === 1)?.view_count, 4);
  } finally { sql.close(); }
});

test('concurrent requests each add one; invalid, hidden and unknown IDs do not change counts', async () => {
  const { sql, post } = fixture();
  try {
    const responses = await Promise.all(Array.from({ length: 20 }, () => post('1')));
    assert.ok(responses.every((response) => response.status === 200));
    assert.equal(sql.prepare('SELECT view_count FROM public_events WHERE id=1').get()?.view_count, 20);
    assert.equal((await post('2')).status, 404);
    assert.equal((await post('3')).status, 404);
    assert.equal((await post('999')).status, 404);
    assert.equal((await post('oops')).status, 400);
    assert.equal(sql.prepare('SELECT view_count FROM public_events WHERE id=1').get()?.view_count, 20);
    assert.equal(sql.prepare('SELECT view_count FROM admin_events WHERE id=2').get()?.view_count, 0);
  } finally { sql.close(); }
});

test('admin pending preview count is separate and public list reads never increment', async () => {
  const { sql, DB, env, ctx } = fixture();
  try {
    assert.equal(await incrementPendingAdminEventView({ DB }, 2), 1);
    assert.equal(await incrementPendingAdminEventView({ DB }, 2), 2);
    assert.equal(await incrementPendingAdminEventView({ DB }, 1), null);
    const list = await handleEvents(new URL(`${origin}/events`), { DB });
    assert.equal(list.data[0].view_count, 0);
    assert.equal(sql.prepare('SELECT view_count FROM admin_events WHERE id=2').get()?.view_count, 2);
    const anonymousAdmin = await worker.fetch(new Request(`${origin}/api/admin/v1/events/2/view`, { method: 'POST' }), env, ctx);
    assert.equal(anonymousAdmin.status, 401);
  } finally { sql.close(); }
});
