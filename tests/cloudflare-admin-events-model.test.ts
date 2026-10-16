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
  resolveAdminEventDrlRule,
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
    '0027_create_event_candidates.sql',
    '0052_event_drl_history.sql',
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

test('ready DRL corpus derives official points and rejects arbitrary or unknown rules', async () => {
  const { sql, DB } = d1Fixture();
  try {
    sql.prepare(`INSERT INTO event_drl_corpus(source_version,historical_rows,status,imported_at)
      VALUES ('fixture',1,'ready','2026-10-06T00:00:00Z')`).run();
    sql.prepare(`INSERT INTO drl_rules(rule_id,section,content,points,event_suitable,active,source_version)
      VALUES ('I_TEST','I','Official fixture',5,1,1,'fixture')`).run();
    sql.prepare(`INSERT INTO drl_rules(rule_id,section,content,points,event_suitable,active,source_version)
      VALUES ('I_NOT_EVENT','I','Not for events',7,0,1,'fixture')`).run();
    assert.deepEqual(await resolveAdminEventDrlRule({ DB } as never, 'create',
      { title: 'Event', status: 'Sắp diễn ra', drl_rule_id: 'I_TEST' }),
    { title: 'Event', status: 'Sắp diễn ra', drl_rule_id: 'I_TEST', criteria: 'I', points: '5' });
    await assert.rejects(() => resolveAdminEventDrlRule({ DB } as never, 'create',
      { title: 'Event', status: 'Sắp diễn ra', drl_rule_id: 'I_TEST', points: '7' }), AdminEventMutationError);
    await assert.rejects(() => resolveAdminEventDrlRule({ DB } as never, 'create',
      { title: 'Event', status: 'Sắp diễn ra', drl_rule_id: 'INVENTED' }), AdminEventMutationError);
    await assert.rejects(() => resolveAdminEventDrlRule({ DB } as never, 'create',
      { title: 'Event', status: 'Sắp diễn ra', drl_rule_id: 'I_NOT_EVENT' }), AdminEventMutationError);
    await assert.rejects(() => resolveAdminEventDrlRule({ DB } as never, 'create',
      { title: 'Event', status: 'Sắp diễn ra', criteria: 'III', points: '9' }), AdminEventMutationError);
    assert.deepEqual(await resolveAdminEventDrlRule({ DB } as never, 'create',
      { title: 'Draft', status: 'pending' }), { title: 'Draft', status: 'pending' });
  } finally { sql.close(); }
});

test('editing an inactive historical rule preserves its saved tuple on this event only, including the public projection', async () => {
  const { sql, DB } = d1Fixture();
  try {
    sql.exec(`INSERT INTO event_drl_corpus VALUES('history',2750,'ready','2026-10-15');
      INSERT INTO drl_rules VALUES('OLD','I',NULL,'Historical fixture',NULL,5,'lần',1,1,'old');
      INSERT INTO drl_rules VALUES('NEW','III',NULL,'Current fixture',NULL,10,'hoạt động',1,1,'2026');`);
    const created = await mutateAdminEvent({DB},'create',{title:'Synthetic historical event',status:'Sắp diễn ra',drl_rule_id:'OLD'},undefined,fetch,
      {mutationId:'f475fdb4-39e1-4a0c-a11f-f4c7e71652f3',userId:'fixture-staff'});
    const id=Number(created.data[0].id);
    sql.exec("UPDATE drl_rules SET active=0 WHERE rule_id='OLD'");
    const tuple={drl_rule_id:'OLD',criteria:'I',points:'5'};
    const readTuple=(table:string)=>sql.prepare(`SELECT drl_rule_id,criteria,points FROM ${table} WHERE id=?`).get(id);
    for(const role of ['admin','auditor'] as const){
      const payload={...tuple,title:`Edited by ${role}`};
      assert.doesNotThrow(()=>assertAdminEventMutationAllowed(payload,role));
      assert.deepEqual(await resolveAdminEventDrlRule({DB},'update',payload,id),{title:payload.title});
      await mutateAdminEvent({DB},'update',payload,id);
      assert.deepEqual({...readTuple('admin_events')},tuple);
      assert.deepEqual({...readTuple('public_events')},tuple);
    }
    const before=sql.prepare('SELECT * FROM admin_events WHERE id=?').get(id);
    await mutateAdminEvent({DB},'update',tuple,id);
    assert.deepEqual(sql.prepare('SELECT * FROM admin_events WHERE id=?').get(id),before,'opening/saving same tuple is a no-op');
    await mutateAdminEvent({DB},'update',{description:'Unrelated edit'},id);
    assert.deepEqual({...readTuple('admin_events')},tuple);
    await assert.rejects(()=>resolveAdminEventDrlRule({DB},'create',{title:'New event',status:'pending',...tuple}),AdminEventMutationError);
    for(const patch of [{points:'10'},{criteria:'III'},{drl_rule_id:null}]){
      await assert.rejects(()=>resolveAdminEventDrlRule({DB},'update',patch,id),AdminEventMutationError);
    }
    await assert.rejects(()=>resolveAdminEventDrlRule({DB},'update',tuple,id+1),e=>e instanceof AdminEventMutationError&&e.status===404);
    await assert.rejects(()=>resolveAdminEventDrlRule({DB},'update',tuple),e=>e instanceof AdminEventMutationError&&e.status===400);
    const next=await mutateAdminEvent({DB},'create',{title:'Different event',status:'pending',drl_rule_id:'NEW'},undefined,fetch,
      {mutationId:'f475fdb4-39e1-4a0c-a11f-f4c7e71652f4',userId:'fixture-staff'});
    await assert.rejects(()=>resolveAdminEventDrlRule({DB},'update',tuple,Number(next.data[0].id)),AdminEventMutationError);
    await mutateAdminEvent({DB},'update',{drl_rule_id:'NEW'},id);
    assert.deepEqual({...readTuple('admin_events')},{drl_rule_id:'NEW',criteria:'III',points:'10'});
    assert.deepEqual({...readTuple('public_events')},{drl_rule_id:'NEW',criteria:'III',points:'10'});
  } finally { sql.close(); }
});

test('preserving a historical tuple cannot overwrite a concurrent rule change', async () => {
  const {sql,DB}=d1Fixture();
  try {
    sql.exec(`INSERT INTO drl_rules VALUES('OLD','I',NULL,'Historical',NULL,5,'lần',0,1,'old');
      INSERT INTO drl_rules VALUES('NEW','III',NULL,'Current',NULL,10,'hoạt động',1,1,'2026');
      INSERT INTO admin_events(id,title,created_at,title_search,organizer_search,drl_rule_id,criteria,points,status)
      VALUES(99,'Fixture','2026-01-01','fixture','','OLD','I','5','pending');`);
    const originalBatch=DB.batch.bind(DB);
    const racingDB={...DB,batch:async(statements: D1PreparedStatement[])=>{
      sql.exec("UPDATE admin_events SET drl_rule_id='NEW',criteria='III',points='10' WHERE id=99");
      return originalBatch(statements);
    }};
    await mutateAdminEvent({DB:racingDB} as never,'update',{title:'Edited',drl_rule_id:'OLD',criteria:'I',points:'5'},99);
    assert.deepEqual({...sql.prepare('SELECT drl_rule_id,criteria,points FROM admin_events WHERE id=99').get()},
      {drl_rule_id:'NEW',criteria:'III',points:'10'});
  } finally {sql.close();}
});

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

test('event banner survives publish and unrelated edit, and explicit replacement updates public projection', async () => {
  const { sql, DB } = d1Fixture();
  try {
    const originalBanner = '/api/public/v1/event-banners/00000000-0000-4000-8000-000000000001.png';
    const replacementBanner = '/api/public/v1/event-banners/00000000-0000-4000-8000-000000000002.png';
    const created = await mutateAdminEvent({ DB }, 'create', {
      title: 'Banner fixture', status: 'pending', image_url: originalBanner,
    }, undefined, fetch, {
      mutationId: 'f475fdb4-39e1-4a0c-a11f-f4c7e71652f3',
      userId: 'd9428888-122b-4f0f-b88f-1c8f4f762b22',
    });
    const eventId = Number(created.data[0].id);
    assert.equal(sql.prepare('SELECT image_url FROM admin_events WHERE id=?').get(eventId)?.image_url, originalBanner);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM public_events WHERE id=?').get(eventId)?.n, 0);

    await mutateAdminEvent({ DB }, 'update', { status: 'published' }, eventId);
    assert.equal(sql.prepare('SELECT image_url FROM public_events WHERE id=?').get(eventId)?.image_url, originalBanner);
    await mutateAdminEvent({ DB }, 'update', { title: 'Banner fixture edited' }, eventId);
    assert.equal(sql.prepare('SELECT image_url FROM admin_events WHERE id=?').get(eventId)?.image_url, originalBanner);
    assert.equal(sql.prepare('SELECT image_url FROM public_events WHERE id=?').get(eventId)?.image_url, originalBanner);

    await mutateAdminEvent({ DB }, 'update', { image_url: replacementBanner }, eventId);
    assert.equal(sql.prepare('SELECT image_url FROM admin_events WHERE id=?').get(eventId)?.image_url, replacementBanner);
    assert.equal(sql.prepare('SELECT image_url FROM public_events WHERE id=?').get(eventId)?.image_url, replacementBanner);
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
