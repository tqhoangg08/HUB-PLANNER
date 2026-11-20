import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { loadBulkPackage, captureSnapshot, createBulkPlan, validateBulkSnapshot, summarizePlan,
  applyNextBatch, rollbackNextBatch, exportReceipts, QUERIES, BATCH_SIZE, PAYLOAD_SHA256 } from '../scripts/hk2-2026-2027/bulk-import.mjs';
import { FIELDS, SEMESTER, sha256 } from '../scripts/hk2-2026-2027/catalogue.mjs';
import { handleCourses } from '../cloudflare/worker/src/courses.ts';
import { getOwnerEstimatedShift } from '../utils/provisionalCoursePolicy.js';
import { buildCalendarExport } from '../utils/calendarExport.ts';

const pkg = await loadBulkPackage();
const baseline = JSON.parse(await readFile(new URL('../docs/hk2-d1-import/production-readonly.json', import.meta.url)));
const approval = (plan, action = 'apply') => ({ plan_id: plan.plan_id, action, target: 'local',
  expires_at: new Date(Date.now() + 45 * 60_000).toISOString(), course_write_authority: 'd1' });
const rows = async (db, sql) => (await db.prepare(sql).all()).results;
const hk2 = db => rows(db, `SELECT * FROM course_schedules WHERE semester='${SEMESTER}' ORDER BY id`);

async function fixture(t) {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("local fixture")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const objects = baseline.response.result[0].results;
  for (const type of ['table', 'index', 'trigger']) for (const r of objects.filter(r => r.type === type)) await db.prepare(r.sql).run();
  // Full synthetic prior-semester catalogue, including duplicate legacy natural keys.
  const seed = Array.from({ length: 2103 }, (_, i) => db.prepare(`INSERT INTO course_schedules
    (id,course_code,subject_name,semester,instructor,is_user_added,updated_at,course_code_search,subject_name_search,instructor_search,source_position)
    VALUES (?,?,?,?,?,0,?,?,?,?,?)`).bind(`fixture-hk1-${i}`, `HK1_${i < 3 ? 0 : i}`, 'Fixture HK1', 'HK1_2026_2027', `Fixture lecturer ${i}`,
      '2026-01-01', `hk1_${i < 3 ? 0 : i}`, 'fixture hk1', `fixture lecturer ${i}`, i + 1));
  for (let i = 0; i < seed.length; i += 25) await db.batch(seed.slice(i, i + 25));
  await db.prepare("INSERT INTO user_schedules(id,user_id,course_id,semester,created_at,updated_at) VALUES('fixture-schedule','fixture-user','fixture-hk1-0','HK1_2026_2027','old','old')").run();
  return db;
}

test('bulk preflight reuses the exact merged payload and fails closed on stale/scope/schema/duplicate/conflict snapshots', async () => {
  assert.equal(pkg.catalogue.records.length, 2357); assert.equal(pkg.catalogue.temporary_items.length, 3);
  const historical = await createBulkPlan(pkg, baseline, { historical: true });
  assert.equal(historical.payload_sha256, PAYLOAD_SHA256);
  assert.deepEqual(historical.rows.map(r => Object.fromEntries(FIELDS.map(k => [k, k === 'is_user_added' ? Boolean(r[k]) : r[k]]))), pkg.catalogue.records.map(r => r.course));
  assert.equal(historical.batches, 95); assert.equal(historical.rows.length, 2357);
  assert.equal(summarizePlan(historical).can_apply, false);
  const changedPackage = structuredClone(pkg); changedPackage.catalogue.records[0].course.instructor = 'invented';
  await assert.rejects(createBulkPlan(changedPackage, baseline, { historical: true }), /catalogue tampered/);
  await assert.rejects(createBulkPlan(pkg, { ...baseline, checked_at: '2000-01-01' }), /Stale/);
  for (const mutate of [
    s => { s.database_id = 'wrong'; }, s => { s.queries = ['SELECT 1']; },
    s => { s.response.result.pop(); }, s => { s.response.result[0].meta.rows_written = 1; },
    s => { s.response.result[0].results.pop(); }, s => { s.response.result[1].results.pop(); },
    s => { s.response.result[4].results.push({ semester: SEMESTER, count: 2 }); },
    s => { s.response.result[3].results.push({ semester: SEMESTER, count: 1 }); },
  ]) {
    const snapshot = structuredClone(baseline); mutate(snapshot);
    await assert.rejects(createBulkPlan(pkg, snapshot, { historical: true }));
  }
  const conflict = structuredClone(baseline), row = historical.rows[0];
  conflict.response.result[2].results = [{ ...row, instructor: 'must never overwrite' }];
  conflict.response.result[3].results.push({ semester: SEMESTER, count: 1 });
  conflict.response.result[5].results[0].count++;
  await assert.rejects(createBulkPlan(pkg, conflict, { historical: true }), /conflict/);
  await mkdir('.cache/hk2-bulk', { recursive: true });
  await writeFile('.cache/hk2-bulk/historical-dry-run.json', JSON.stringify(summarizePlan(historical), null, 2));
});

test('full local D1: 2,357 INSERTs, mid-batch failure, lost acknowledgment, resume/no-op, API filters and receipt rollback; HK1/users unchanged', { timeout: 600000 }, async t => {
  const db = await fixture(t);
  const protectedQueries = ["SELECT * FROM course_schedules WHERE semester='HK1_2026_2027' ORDER BY id",
    "SELECT * FROM course_filter_facets WHERE semester='HK1_2026_2027' ORDER BY subject_name", 'SELECT * FROM user_schedules ORDER BY id',
    'SELECT * FROM user_schedule_course_snapshots ORDER BY schedule_id', 'SELECT * FROM user_course_requests ORDER BY id'];
  const protectedBefore = await Promise.all(protectedQueries.map(q => rows(db, q)));
  const snapshot = await captureSnapshot(db);
  assert.deepEqual(snapshot.queries, QUERIES);
  const plan = await createBulkPlan(pkg, snapshot);
  assert.deepEqual(plan, await createBulkPlan(pkg, snapshot));
  const auth = approval(plan);
  await assert.rejects(applyNextBatch(db, pkg, plan, undefined), /approval/);
  const altered = structuredClone(plan); altered.rows[0].shift = 'S';
  await assert.rejects(applyNextBatch(db, pkg, altered, auth), /tampered/);
  const remoteSnapshot = structuredClone(snapshot); remoteSnapshot.database_id = baseline.database_id;
  remoteSnapshot.response.result.forEach(r => { r.meta.served_by_primary = true; });
  const remote = await createBulkPlan(pkg, remoteSnapshot);
  await assert.rejects(applyNextBatch(db, pkg, remote, { ...approval(remote), target: 'production' }), /Production execution is disabled/);

  await applyNextBatch(db, pkg, plan, auth);
  assert.equal((await hk2(db)).length, BATCH_SIZE);
  // Inject an actual SQL constraint failure in the middle of the second transactional batch.
  let fault = true;
  const faulty = { prepare: sql => db.prepare(sql), batch: statements => {
    if (fault && statements.length === BATCH_SIZE + 1) {
      fault = false;
      const list = [...statements]; list.splice(12, 0, db.prepare('INSERT INTO course_schedules(id) VALUES(NULL)'));
      return db.batch(list);
    }
    return db.batch(statements);
  } };
  await assert.rejects(applyNextBatch(faulty, pkg, plan, auth), /constraint|NOT NULL/i);
  assert.equal(fault, false, 'Failure must be injected into the actual mutation batch');
  assert.equal((await hk2(db)).length, 25); assert.equal((await exportReceipts(db, plan)).length, 1);
  // A competitor inserts the same natural key after our read and before the transaction.
  let race = true;
  const external = { ...plan.rows[25], id: 'fixture-race', source_key: 'fixture-race' };
  const racing = { prepare: sql => db.prepare(sql), batch: async statements => {
    if (race && statements.length === BATCH_SIZE + 1) {
      race = false;
      await db.prepare(`INSERT INTO course_schedules (${Object.keys(external).join(',')}) VALUES (${Object.keys(external).map(() => '?').join(',')})`).bind(...Object.values(external)).run();
    }
    return db.batch(statements);
  } };
  await assert.rejects(applyNextBatch(racing, pkg, plan, auth), /constraint|NOT NULL/i);
  assert.equal(race, false); assert.equal((await hk2(db)).length, 26);
  assert.equal((await exportReceipts(db, plan)).length, 1);
  await db.prepare("DELETE FROM course_schedules WHERE id='fixture-race'").run(); // fixture only
  // Commit then lose the response: next explicit invocation must discover the durable receipt.
  let lose = true;
  const lostAck = { prepare: sql => db.prepare(sql), batch: async statements => {
    const result = await db.batch(statements);
    if (lose && statements.length === BATCH_SIZE + 1) { lose = false; throw new Error('lost acknowledgment'); }
    return result;
  } };
  await assert.rejects(applyNextBatch(lostAck, pkg, plan, auth), /lost acknowledgment/);
  assert.equal((await hk2(db)).length, 50); assert.equal((await exportReceipts(db, plan)).length, 2);
  let progress;
  do { progress = await applyNextBatch(db, pkg, plan, auth); } while (!progress.done);
  assert.deepEqual(await applyNextBatch(db, pkg, plan, auth), { done: true, committed_batches: 95 });
  const imported = await hk2(db);
  assert.equal(imported.length, 2357); assert.equal(new Set(imported.map(r => r.course_code)).size, 2357);
  assert.ok(imported.every(r => r.instructor === null && r.is_user_added === 0 && r.course_code !== '_262_'));
  const byCode = new Map(imported.map(r => [r.course_code, r]));
  for (const record of pkg.catalogue.records) for (const field of FIELDS) {
    assert.equal(field === 'is_user_added' ? Boolean(byCode.get(record.course.course_code)[field]) : byCode.get(record.course.course_code)[field], record.course[field], `${record.course.course_code}: ${field}`);
  }
  for (const record of pkg.catalogue.records.filter(r => r.owner_derivation)) {
    const actual = byCode.get(record.course.course_code);
    assert.equal(getOwnerEstimatedShift(actual.shift).shift, 'S');
    assert.ok(buildCalendarExport({ semester: SEMESTER, courses: [actual] }).issues.some(r => r.reason === 'unknown_shift'));
  }
  for (const [program, expected] of [['Tiếng Anh bán phần', null], ['Chương trình đặc biệt', null], ['CT Elite', 29]]) {
    const response = await handleCourses(new URL(`https://local.test/courses?semester=${SEMESTER}&academicProgram=${encodeURIComponent(program)}`), { DB: db });
    assert.equal(response.payload.total, expected ?? imported.filter(r => r.academic_program === program).length);
    assert.ok(response.payload.data.every(r => r.academic_program === program));
  }
  const replay = await createBulkPlan(pkg, await captureSnapshot(db));
  assert.deepEqual(replay.dry_run.counts, { additions: 0, identical: 2357, blocked: 0, conflicts: 0, temporary_items: 3 });
  assert.equal((await exportReceipts(db, plan)).length, 95);
  assert.deepEqual(await Promise.all(protectedQueries.map(q => rows(db, q))), protectedBefore);
  assert.equal((await rows(db, `SELECT SUM(course_count) AS n FROM course_filter_facets WHERE semester='${SEMESTER}'`))[0].n, 2357);

  // Conservative rollback: references and changed rows must block before any deletion.
  const last = plan.rows.at(-1);
  await db.prepare('INSERT INTO user_schedules(id,user_id,course_id,semester,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind('block-rollback', 'fixture-user', last.id, SEMESTER, 'old', 'old').run();
  await assert.rejects(rollbackNextBatch(db, pkg, plan, approval(plan, 'rollback')), /constraint|NOT NULL/i);
  assert.equal((await hk2(db)).length, 2357);
  await db.prepare("DELETE FROM user_schedules WHERE id='block-rollback'").run(); // fixture only
  await db.prepare('UPDATE course_schedules SET room=? WHERE id=?').bind('external change without revision bump', last.id).run();
  await assert.rejects(rollbackNextBatch(db, pkg, plan, approval(plan, 'rollback')), /differs from receipt state/);
  await db.prepare('UPDATE course_schedules SET room=? WHERE id=?').bind(last.room, last.id).run(); // fixture only
  const rollbackAuth = approval(plan, 'rollback');
  do { progress = await rollbackNextBatch(db, pkg, plan, rollbackAuth); } while (!progress.done);
  assert.equal((await hk2(db)).length, 0);
  assert.deepEqual(await Promise.all(protectedQueries.map(q => rows(db, q))), protectedBefore);
  assert.deepEqual(await rows(db, `SELECT * FROM course_filter_facets WHERE semester='${SEMESTER}'`), []);
  assert.equal((await exportReceipts(db, plan)).length, 190);
  await assert.rejects(applyNextBatch(db, pkg, plan, auth), /terminal/);
  assert.equal((await rollbackNextBatch(db, pkg, plan, rollbackAuth)).done, true);
  const receipt = await exportReceipts(db, plan);
  const evidence = { version: 1, local_only: true, plan: summarizePlan(plan), imported: 2357,
    all_official_fields_match: true, temporary_imported: 0, apply_receipts: 95, rollback_receipts: 95,
    fault_batch_atomic: true, concurrent_natural_key_stopped: true, lost_ack_resumed: true, replay_additions: 0, rolled_back_rows: 2357,
    protected_before_sha256: sha256(JSON.stringify(protectedBefore)), protected_after_sha256: sha256(JSON.stringify(await Promise.all(protectedQueries.map(q => rows(db, q))))),
    receipt_sha256: sha256(JSON.stringify(receipt)) };
  await mkdir('.cache/hk2-bulk', { recursive: true });
  await writeFile('.cache/hk2-bulk/local-evidence.json', JSON.stringify(evidence, null, 2));
  await writeFile('.cache/hk2-bulk/local-receipts.json', JSON.stringify(receipt, null, 2));
});
