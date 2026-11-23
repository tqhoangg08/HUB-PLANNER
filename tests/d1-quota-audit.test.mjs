import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { handleCourses } from '../cloudflare/worker/src/courses.ts';
import { publicCatalogueDb, HK2_MANIFEST, HK2_PAYLOAD } from '../cloudflare/worker/src/course-publication.ts';
import { handleStudentDirectoryClasses } from '../cloudflare/worker/src/student-directory.ts';
import { auditFixture, baselineModule, meterDb, BASELINE } from './fixtures/d1-audit.mjs';

const report = { baseline: BASELINE, runtime: 'local Miniflare D1; meta.rows_read including indexes', cases: [] };
const record = (name, before, after) => {
  report.cases.push({ name, before: { rows_read: before.rows_read, queries: before.queries },
    after: { rows_read: after.rows_read, queries: after.queries } });
  console.log('D1_ROWS_READ ' + JSON.stringify(report.cases.at(-1)));
};

test('actual catalogue APIs preserve payloads, avoid CLOSED count scans and coalesce only identical facet scopes', { timeout: 120000 }, async t => {
  const { mf, db } = await auditFixture(); t.after(() => mf.dispose());
  const before = await baselineModule('cloudflare/worker/src/courses.ts');
  const baselinePublication = await baselineModule('cloudflare/worker/src/course-publication.ts');
  const metered = meterDb(db);
  const run = (fn, q) => metered.measure(() => fn(new URL('https://local.invalid/courses?' + q), { DB: metered.db }));
  const cases = [
    'resource=filter-options', 'resource=filter-options&semester=HK2_2026_2027',
    'resource=filter-options&semester=HK1_2026_2027',
    'resource=filter-options&semester=HK2_2026_2027&major=M1',
    'resource=filter-options&semester=HK1_2026_2027&major=M1&cohort=K1',
    'resource=filter-options&major=M1&major=M2&cohort=K1&academicProgram=P1&phase=1&isUserAdded=false',
    'resource=filter-options&semester=HK2_2026_2027&isUserAdded=true',
    'semester=HK2_2026_2027', 'semester=HK1_2026_2027&limit=10&offset=10',
    'semester=HK2_2026_2027&search=toán', 'semester=HK2_2026_2027&suggestions=true',
    'semester=HK1_2026_2027&groupName=G_N2', 'semester=HK1_2026_2027&sort=name-asc&limit=10',
    'resource=course-detail&id=c00001',
  ];
  const compare = async state => {
    for (const query of cases) {
      const b = await run(before.handleCourses, query), a = await run(handleCourses, query);
      assert.deepEqual(a.value, b.value, state + ': ' + query);
      if (query.startsWith('resource=filter-options')) assert.ok(a.rows_read < b.rows_read, JSON.stringify({ query, a, b }));
      record(state + ':' + query, b, a);
    }
  };
  await compare('CLOSED');
  const b = await metered.measure(() => baselinePublication.publicCatalogueDb(metered.db));
  const a = await metered.measure(() => publicCatalogueDb(metered.db));
  record('schema probe with 1095 receipts', b, a);
  assert.ok(a.rows_read < 10); assert.ok(b.rows_read > 1000);
  // Synthetic local OPEN proof tests the exact predicate, never calls a
  // production/operator transport and is not an authorization capability.
  const ledger = await db.prepare(`SELECT json_group_array(json_array(actor_scope,actor_id,idempotency_key,request_hash,operation,response_json,created_at)) AS value
    FROM (SELECT * FROM course_mutation_receipts WHERE actor_id='hk2-bulk-v1' ORDER BY actor_scope,idempotency_key)`).first('value');
  await db.prepare(`INSERT INTO hk2_catalogue_publication_receipts VALUES('r','OPEN_HK2_2026_2027',?,?,252552483,1,?,?,'2026-11-20')`)
    .bind('a'.repeat(64), 'b'.repeat(64), 'c'.repeat(40), ledger).run();
  await db.prepare(`UPDATE hk2_catalogue_publications SET state='OPEN',revision=1,manifest_sha256=?,payload_sha256=?,official_count=2357,
    batch_count=95,verification_sha256=?,receipt_id='r',opened_at='2026-11-20'`).bind(HK2_MANIFEST, HK2_PAYLOAD, 'a'.repeat(64)).run();
  await compare('OPEN');
  const opened = await run(handleCourses, 'semester=HK2_2026_2027');
  assert.equal(opened.value.payload.total, 2397);
  const wrapped = await publicCatalogueDb(db);
  const tamper = async (change, restore) => {
    await db.prepare(change).run();
    const result = await wrapped.prepare("SELECT COUNT(*) AS n FROM course_schedules WHERE semester='HK2_2026_2027' AND is_user_added IS NOT 1").first();
    assert.equal(result.n, 0, change); await db.prepare(restore).run();
  };
  await tamper("UPDATE hk2_catalogue_publications SET state='CLOSED'", "UPDATE hk2_catalogue_publications SET state='OPEN'");
  await tamper("UPDATE course_mutation_receipts SET response_json='changed' WHERE idempotency_key='key1'", "UPDATE course_mutation_receipts SET response_json='{}' WHERE idempotency_key='key1'");
  await tamper("UPDATE course_schedules SET is_user_added=1 WHERE id='c00001'", "UPDATE course_schedules SET is_user_added=0 WHERE id='c00001'");
  await tamper("UPDATE course_schedules SET catalogue_visibility='retired' WHERE id='c00001'", "UPDATE course_schedules SET catalogue_visibility='published' WHERE id='c00001'");
  await tamper("UPDATE hk2_catalogue_publication_receipts SET verification_sha256='" + 'd'.repeat(64) + "'", "UPDATE hk2_catalogue_publication_receipts SET verification_sha256='" + 'a'.repeat(64) + "'");
});

test('class labels seek distinct BINARY keys; authorization, trims, case, empty and live updates are preserved', { timeout: 60000 }, async t => {
  const { mf, db } = await auditFixture(); t.after(() => mf.dispose());
  await db.prepare(await readFile('cloudflare/migrations/0051_student_directory.sql', 'utf8')).run();
  await db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<20000)
    INSERT INTO student_directory(student_code,general_class,source_version,imported_at,updated_at)
    SELECT printf('%012d',x),' C'||(x%814)||' ','local','2026-11-20','2026-11-20' FROM n;`).run();
  await db.exec("CREATE TABLE event_candidates(image_url TEXT,review_status TEXT); CREATE TABLE ai_chat_logs(conversation_id TEXT,user_id TEXT,is_deleted INTEGER);");
  const migration = (await readFile('cloudflare/migrations/0063_d1_read_indexes.sql','utf8')).replace(/--[^\n]*/g,'').split(';').filter(q=>q.trim());
  for (const q of migration) await db.prepare(q).run();
  const before = await baselineModule('cloudflare/worker/src/student-directory.ts');
  const metered = meterDb(db), user = { userId: '11111111-1111-4111-8111-111111111111', email: '000000000001@st.buh.edu.vn', role: 'user' };
  const env = { DB: metered.db, AUTH_SERVICE: { fetch: async req => Response.json(new URL(req.url).pathname.startsWith('/internal/') ? user : { user: { id: user.userId, email: user.email, emailVerified: true } }) } };
  const req = () => new Request('https://local.invalid/api/user/v1/student-directory/classes', { headers: { Cookie: 'local=synthetic' } });
  const run = fn => metered.measure(() => fn(req(),env));
  const b = await run(before.handleStudentDirectoryClasses), a = await run(handleStudentDirectoryClasses);
  assert.deepEqual(a.value,b.value); record('directory 20000 students / 814 labels',b,a);
  assert.ok(a.rows_read < b.rows_read * 0.15);
  for (const [i, label] of [null, '', '   ', 'á', 'Á', 'c1', 'C1', 'x'.repeat(81), '\tC1\t'].entries())
    await db.prepare('UPDATE student_directory SET general_class=? WHERE student_code=?').bind(label,String(i+1).padStart(12,'0')).run();
  // NOCASE does not specify order between case-equivalent strings; compare
  // membership and verify each result's declared ordering separately.
  const expected = (await run(before.handleStudentDirectoryClasses)).value.classes;
  const actual = (await run(handleStudentDirectoryClasses)).value.classes;
  assert.deepEqual([...actual].sort(),[...expected].sort());
  assert.ok(actual.includes('\tC1\t')); assert.ok(actual.includes('c1')); assert.ok(actual.includes('C1'));
  await assert.rejects(handleStudentDirectoryClasses(req(), { ...env, AUTH_SERVICE: { fetch: async () => Response.json({ error: 'no session' }, { status: 401 }) } }), error => error.status === 401);
  await db.prepare('DROP INDEX student_directory_class_label_idx').run();
  const fallback = await run(handleStudentDirectoryClasses);
  assert.deepEqual([...fallback.value.classes].sort(), [...expected].sort(), 'missing migration uses the original query, not recursive full scans');
  assert.ok(fallback.rows_read < 22000);
  await db.prepare('DELETE FROM student_directory').run();
  assert.deepEqual(await handleStudentDirectoryClasses(req(),env),{ classes: [] });
});

test('additive image and conversation indexes reduce real D1 rows without changing lookup results or HK2 schema', async t => {
  const { mf, db } = await auditFixture(); t.after(() => mf.dispose());
  await db.exec('CREATE TABLE event_candidates(id INTEGER PRIMARY KEY,image_url TEXT,review_status TEXT); CREATE TABLE ai_chat_logs(id INTEGER PRIMARY KEY,conversation_id TEXT,user_id TEXT,is_deleted INTEGER);');
  await db.prepare(await readFile('cloudflare/migrations/0051_student_directory.sql','utf8')).run();
  await db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000)
    INSERT INTO event_candidates SELECT x,'image'||x,CASE WHEN x%2=0 THEN 'approved' ELSE 'pending' END FROM n`).run();
  await db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000)
    INSERT INTO ai_chat_logs SELECT x,'chat'||x,'owner'||x,x%2=0 FROM n`).run();
  const queries = ["SELECT id FROM event_candidates WHERE image_url='absent' AND review_status != 'approved' LIMIT 1",
    "SELECT user_id FROM ai_chat_logs WHERE conversation_id='chat9999' AND is_deleted=0 LIMIT 1"];
  const before = await Promise.all(queries.map(q=>db.prepare(q).all()));
  const pinnedSchema = () => db.prepare("SELECT type,name,sql FROM sqlite_master WHERE tbl_name IN ('course_schedules','course_filter_facets','course_mutation_receipts') ORDER BY type,name").all();
  const schema = await pinnedSchema();
  for (const q of (await readFile('cloudflare/migrations/0063_d1_read_indexes.sql','utf8')).replace(/--[^\n]*/g,'').split(';').filter(q=>q.trim())) await db.prepare(q).run();
  assert.deepEqual((await pinnedSchema()).results,schema.results);
  for (const [i,q] of queries.entries()) {
    const after=await db.prepare(q).all(); assert.deepEqual(after.results,before[i].results);
    record(i===0?'unreviewed banner miss / 10000 candidates':'live conversation owner / 10000 chat rows',
      {rows_read:before[i].meta.rows_read,queries:1},{rows_read:after.meta.rows_read,queries:1});
    assert.ok(after.meta.rows_read < 10); assert.ok(before[i].meta.rows_read>9000);
  }
});

test.after(async () => {
  if (process.env.D1_AUDIT_REPORT) await writeFile(process.env.D1_AUDIT_REPORT, JSON.stringify(report,null,2)+'\n');
});
