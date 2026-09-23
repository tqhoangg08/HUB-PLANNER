import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { parseAdminEventQuery } from '../cloudflare/worker/src/admin-events.ts';
import {
  AdminEventMutationError,
  assertAdminEventMutationAllowed,
  mutateAdminEvent,
  readAdminEventIdempotencyKey,
  readAdminEventMutationPayload,
  validateAdminEventMutationPayload,
} from '../cloudflare/worker/src/admin-event-mutations.ts';
import { incrementPendingAdminEventView, incrementPublicEventView } from '../cloudflare/worker/src/events.ts';

test('admin event query clamps paging and accepts only known filters', () => {
  assert.deepEqual(parseAdminEventQuery(new URLSearchParams()), {
    limit: 50,
    offset: 0,
    search: '',
    state: 'all',
    criteria: 'all',
    scope: 'all',
    group: 'all',
    ids: null,
    sort: 'newest',
  });
  assert.deepEqual(
    parseAdminEventQuery(
      new URLSearchParams(
        'limit=999&offset=-3&search=  HUB, 100% &state=pending&sort=oldest'
      )
    ),
    {
      limit: 500,
      offset: 0,
      search: 'hub 100',
      state: 'pending',
      criteria: 'all',
      scope: 'all',
      group: 'all',
      ids: null,
      sort: 'oldest',
    }
  );
  assert.equal(
    parseAdminEventQuery(new URLSearchParams('state=unknown')).state,
    'all'
  );
  assert.equal(
    parseAdminEventQuery(new URLSearchParams('limit=2.8&offset=4.9')).limit,
    2
  );
  assert.equal(
    parseAdminEventQuery(new URLSearchParams('limit=2.8&offset=4.9')).offset,
    4
  );
  assert.equal(
    parseAdminEventQuery(
      new URLSearchParams(`search=${'a'.repeat(150)}`)
    ).search.length,
    120
  );
  assert.deepEqual(
    parseAdminEventQuery(
      new URLSearchParams(
        'criteria=III&scope=external&group=closed&ids=3,3,7&sort=expiring_soon'
      )
    ),
    {
      limit: 50,
      offset: 0,
      search: '',
      state: 'all',
      criteria: 'III',
      scope: 'external',
      group: 'closed',
      ids: [3, 7],
      sort: 'expiring_soon',
    }
  );
});

test('admin event mutation accepts only bounded known fields', () => {
  assert.deepEqual(
    validateAdminEventMutationPayload(
      {
        title: '  Sự kiện mới  ',
        points: 5,
        deadline: '',
        event_time: '08:30',
        close_on_full: true,
      },
      'create'
    ),
    {
      title: 'Sự kiện mới',
      points: '5',
      deadline: null,
      event_time: '08:30',
      close_on_full: true,
    }
  );

  assert.throws(
    () =>
      validateAdminEventMutationPayload(
        { title: 'Sự kiện', unexpected: 'field' },
        'create'
      ),
    (error: unknown) =>
      error instanceof AdminEventMutationError && error.status === 400
  );
  assert.throws(
    () =>
      validateAdminEventMutationPayload(
        { title: 'Sự kiện', event_date: '2026-02-31' },
        'create'
      ),
    AdminEventMutationError
  );
  assert.throws(
    () => validateAdminEventMutationPayload({ status: 'Đang diễn ra' }, 'create'),
    AdminEventMutationError
  );
});

test('admin event mutation enforces delete role and JSON content type', async () => {
  assert.throws(
    () => assertAdminEventMutationAllowed({ is_deleted: true }, 'auditor'),
    (error: unknown) =>
      error instanceof AdminEventMutationError && error.status === 403
  );
  assert.doesNotThrow(() =>
    assertAdminEventMutationAllowed({ is_deleted: true }, 'admin')
  );

  const request = new Request('https://example.com/api/admin/v1/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ title: 'Sự kiện hợp lệ' }),
  });
  assert.deepEqual(await readAdminEventMutationPayload(request, 'create'), {
    title: 'Sự kiện hợp lệ',
  });

  await assert.rejects(
    () =>
      readAdminEventMutationPayload(
        new Request('https://example.com/api/admin/v1/events', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: '{}',
        }),
        'create'
      ),
    (error: unknown) =>
      error instanceof AdminEventMutationError && error.status === 415
  );
});

test('admin event create requires a UUID idempotency key', () => {
  const request = new Request('https://example.com/api/admin/v1/events', {
    headers: {
      'Idempotency-Key': 'f475fdb4-39e1-4a0c-a11f-f4c7e71652f3',
    },
  });
  assert.equal(
    readAdminEventIdempotencyKey(request),
    'f475fdb4-39e1-4a0c-a11f-f4c7e71652f3'
  );
  assert.throws(
    () =>
      readAdminEventIdempotencyKey(
        new Request('https://example.com/api/admin/v1/events')
      ),
    (error: unknown) =>
      error instanceof AdminEventMutationError && error.status === 400
  );
});

const d1Fixture = () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE sync_metadata (
    resource TEXT PRIMARY KEY, source_row_count INTEGER, source_max_created_at TEXT,
    synced_at TEXT, visible_row_count INTEGER
  )`);
  for (const migration of [
    '0006_create_public_events.sql',
    '0008_create_admin_events.sql',
    '0009_create_admin_event_mutations.sql',
    '0023_create_event_push_deliveries.sql',
    '0026_core_events_d1_authority.sql',
    '0048_event_view_count.sql',
  ]) sql.exec(readFileSync(`cloudflare/migrations/${migration}`, 'utf8'));

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
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sql, DB };
};

test('D1 core event create/replay/publish/edit/hide/unhide/delete projection is atomic', async () => {
  const { sql, DB } = d1Fixture();
  try {
    const createRequest = {
      mutationId: 'f475fdb4-39e1-4a0c-a11f-f4c7e71652f3',
      userId: 'd9428888-122b-4f0f-b88f-1c8f4f762b22',
    };
    const created = await mutateAdminEvent(
      { DB }, 'create', { title: 'Sự kiện D1', status: 'pending' }, undefined, fetch, createRequest
    );
    const eventId = Number(created.data[0].id);
    assert.equal(created.mirrorSynced, true);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM admin_events').get()?.n, 1);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM public_events').get()?.n, 0);

    assert.equal(await incrementPendingAdminEventView({ DB }, eventId), 1);

    const replay = await mutateAdminEvent(
      { DB }, 'create', { title: 'Không được tạo lại' }, undefined, fetch, createRequest
    );
    assert.equal(replay.replayed, true);
    assert.equal(replay.data[0].id, eventId);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM admin_events').get()?.n, 1);

    await mutateAdminEvent({ DB }, 'update', { status: 'published' }, eventId);
    assert.equal(sql.prepare('SELECT title FROM public_events WHERE id = ?').get(eventId)?.title, 'Sự kiện D1');
    assert.equal(sql.prepare('SELECT view_count FROM public_events WHERE id = ?').get(eventId)?.view_count, 1);
    assert.equal(await incrementPublicEventView({ DB }, eventId), 2);
    await mutateAdminEvent({ DB }, 'update', { title: 'Sự kiện D1 đã sửa' }, eventId);
    assert.equal(sql.prepare('SELECT title FROM public_events WHERE id = ?').get(eventId)?.title, 'Sự kiện D1 đã sửa');
    assert.equal(sql.prepare('SELECT view_count FROM public_events WHERE id = ?').get(eventId)?.view_count, 2);

    await mutateAdminEvent({ DB }, 'update', { is_deleted: true }, eventId);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM public_events').get()?.n, 0);
    assert.equal(sql.prepare('SELECT is_deleted FROM admin_events WHERE id = ?').get(eventId)?.is_deleted, 1);
    await mutateAdminEvent({ DB }, 'update', { is_deleted: false }, eventId);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM public_events').get()?.n, 1);
  } finally { sql.close(); }
});

test('core event runtime has no Supabase event read, write, sync, or rollback path', () => {
  for (const file of [
    'cloudflare/worker/src/events.ts',
    'cloudflare/worker/src/admin-events.ts',
    'cloudflare/worker/src/admin-event-mutations.ts',
  ]) assert.doesNotMatch(readFileSync(file, 'utf8'), /supabase|rest\/v1\/events/i);
  const index = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  assert.doesNotMatch(index, /syncPublicEvents|syncAdminEvents|event_sync_complete/);
  const candidateAuthority = readFileSync('cloudflare/worker/src/event-candidates.ts', 'utf8');
  assert.doesNotMatch(candidateAuthority, /supabase|rest\/v1\/events|rest\/v1\/event_candidates/i);
});
