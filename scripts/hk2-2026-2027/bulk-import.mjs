/** Offline/operator library. No HTTP route, credentials, remote adapter or deployment hook. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, FIELDS, SEMESTER, normalizeKey, planImport, sha256 } from './catalogue.mjs';

export const MANIFEST_SHA256 = '2fe8af0743805fcc64ba414e22817fb26f3b5ce2247b50677bc518122c36e212';
export const PAYLOAD_SHA256 = '2d328a92c048d2869e49cf7abd078f1b9ee44afb4005e00cbdbf78d6a24f1797';
export const DATABASE_ID = '88d702e1-60d3-490a-8514-38ef881cf133';
export const BATCH_SIZE = 25;
const ACTOR = 'hk2-bulk-v1';
const PROVENANCE = `hk2_bulk_v1:${MANIFEST_SHA256}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const same = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message);
const canonicalSchema = rows => rows.map(r => [r.type, r.name, r.tbl_name, r.sql]).sort((a, b) => a[0].localeCompare(b[0], 'en') || a[1].localeCompare(b[1], 'en'));
export const QUERIES = [
  "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND (tbl_name IN ('course_schedules','course_filter_facets','course_mutation_receipts','user_schedules','user_schedule_course_snapshots','user_course_requests') OR sql LIKE '%course_schedules%') ORDER BY type,name",
  'PRAGMA table_info(course_schedules)',
  `SELECT * FROM course_schedules WHERE semester='${SEMESTER}' ORDER BY id`,
  'SELECT semester,catalogue_visibility,COUNT(*) AS count FROM course_schedules GROUP BY semester,catalogue_visibility ORDER BY semester,catalogue_visibility',
  'SELECT semester,course_code_search,COUNT(*) AS count FROM course_schedules GROUP BY semester,course_code_search HAVING COUNT(*)>1 ORDER BY semester,course_code_search',
  'SELECT COUNT(*) AS count,COALESCE(MAX(source_position),0) AS max_source_position FROM course_schedules',
];

/** Consume the merged artifact, never re-run normalization or rewrite it. */
export async function loadBulkPackage() {
  const bytes = await readFile(path.join(DATA_DIR, 'generated/manifest.json'));
  same(sha256(bytes), MANIFEST_SHA256, 'Merged manifest changed');
  const manifest = JSON.parse(bytes);
  for (const [name, digest] of Object.entries(manifest.source_files_unchanged)) {
    assert(path.basename(name) === name, 'Invalid source path');
    same(sha256(await readFile(path.join(DATA_DIR, 'source', name))), digest, `Source SHA: ${name}`);
  }
  const artifacts = {};
  for (const [name, digest] of Object.entries(manifest.output_sha256)) {
    assert(path.basename(name) === name, 'Invalid artifact path');
    const content = await readFile(path.join(DATA_DIR, 'generated', name));
    same(sha256(content), digest, `Artifact SHA: ${name}`);
    artifacts[name] = JSON.parse(content);
  }
  same(sha256(await readFile(new URL('./catalogue.mjs', import.meta.url))), manifest.builder_sha256, 'Builder changed');
  same(sha256(await readFile(new URL('../../utils/provisionalCoursePolicy.js', import.meta.url))), manifest.runtime_policy_sha256, 'Runtime policy changed');
  const catalogue = artifacts['catalogue.json'];
  same(catalogue.records.length, 2357, 'Official count');
  same(catalogue.temporary_items.length, 3, 'Temporary count');
  same(sha256(JSON.stringify(catalogue.records.map(r => r.course))), PAYLOAD_SHA256, 'Merged payload changed');
  same(artifacts['dry-run.json'].payload_sha256, PAYLOAD_SHA256, 'Original dry-run payload');
  const check = planImport(catalogue.records, [], catalogue.temporary_items);
  same(check.counts, { additions: 2357, identical: 0, blocked: 0, conflicts: 0, temporary_items: 3 }, 'Merged eligibility changed');
  return { manifest, catalogue, original_dry_run: artifacts['dry-run.json'] };
}

/** One read-only batch; use a primary/session binding for remote operator integrations. */
export async function captureSnapshot(db, databaseId = 'local') {
  const result = await db.batch(QUERIES.map(sql => db.prepare(sql)));
  return { version: 1, database_id: databaseId, checked_at: new Date().toISOString(), queries: QUERIES,
    response: { success: true, result } };
}

async function referenceSchema() {
  return JSON.parse(await readFile(new URL('../../docs/hk2-d1-import/production-readonly.json', import.meta.url))).response.result;
}

export async function validateBulkSnapshot(snapshot, { now = Date.now(), maxAgeMs = 15 * 60_000, historical = false } = {}) {
  assert(snapshot.version === 1 && ['local', DATABASE_ID].includes(snapshot.database_id), 'Wrong snapshot target');
  same(snapshot.queries, QUERIES, 'Snapshot scope mismatch');
  assert(Number.isFinite(Date.parse(snapshot.checked_at)), 'Invalid snapshot timestamp');
  if (!historical) assert(now - Date.parse(snapshot.checked_at) >= -30_000 && now - Date.parse(snapshot.checked_at) <= maxAgeMs, 'Stale snapshot; capture a fresh primary snapshot');
  const results = snapshot.response?.result;
  assert(snapshot.response?.success === true && results?.length === QUERIES.length, 'Incomplete snapshot');
  assert(results.every(r => r.success === true && Array.isArray(r.results) && r.meta?.rows_written === 0
    && r.meta?.changes === 0 && r.meta?.changed_db === false), 'Snapshot must be SELECT-only');
  if (snapshot.database_id === DATABASE_ID) assert(results.every(r => r.meta.served_by_primary === true), 'Primary snapshot required');
  const reference = await referenceSchema();
  same(canonicalSchema(results[0].results), canonicalSchema(reference[0].results), 'D1 schema/trigger/reference drift');
  same(results[1].results, reference[1].results, 'D1 column drift');
  const rows = results[2].results;
  assert(rows.every(r => r.semester === SEMESTER && r.id && r.course_code), 'Wrong HK2 row scope');
  const count = results[3].results.filter(r => r.semester === SEMESTER).reduce((n, r) => n + r.count, 0);
  same(count, rows.length, 'Truncated HK2 snapshot');
  assert(!results[4].results.some(r => r.semester === SEMESTER), 'Duplicate HK2 keys');
  const aggregate = results[5].results[0];
  assert(results[5].results.length === 1 && Number.isSafeInteger(aggregate.count) && Number.isSafeInteger(aggregate.max_source_position)
    && aggregate.count >= rows.length && aggregate.max_source_position >= 0, 'Invalid aggregate');
  same(results[3].results.reduce((n, r) => n + r.count, 0), aggregate.count, 'Catalogue count mismatch');
  return results;
}

const uuid = key => {
  const hex = sha256(key);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const rowKeys = (snapshot) => snapshot.response.result[1].results.map(r => r.name);
const rowValues = (row, columns) => columns.map(k => row[k] ?? null);
const targetState = (rows, columns) => [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(r => rowValues(r, columns));
const digestPlan = plan => { const { plan_id: _, ...body } = plan; return sha256(JSON.stringify(body)); };

export async function createBulkPlan(pkg, snapshot, options = {}) {
  same(sha256(`${JSON.stringify(pkg.manifest, null, 2)}\n`), MANIFEST_SHA256, 'Package manifest tampered');
  same(sha256(`${JSON.stringify(pkg.catalogue, null, 2)}\n`), pkg.manifest.output_sha256['catalogue.json'], 'Package catalogue tampered');
  const results = await validateBulkSnapshot(snapshot, options);
  const dryRun = planImport(pkg.catalogue.records, results[2].results, pkg.catalogue.temporary_items);
  assert(!dryRun.conflicts.length && !dryRun.blocked.length, 'HK2 conflict; no write plan');
  const wanted = new Set(dryRun.additions);
  const max = results[5].results[0].max_source_position;
  const rows = pkg.catalogue.records.filter(r => wanted.has(r.course.course_code)).map((r, i) => ({
    ...r.course, is_user_added: 0,
    id: uuid(`${MANIFEST_SHA256}:${r.course.course_code}`),
    created_at: snapshot.checked_at, updated_at: snapshot.checked_at,
    course_code_search: normalizeKey(r.course.course_code), subject_name_search: normalizeKey(r.course.subject_name), instructor_search: '',
    source_position: max + i + 1, catalogue_visibility: 'published', revision: 0, source_kind: 'admin',
    source_key: `hk2:${MANIFEST_SHA256}:${r.source_kind}:${r.source_row}`,
    writer_provenance: PROVENANCE, content_hash: sha256(JSON.stringify(r.course)), instructor_provenance: 'source_not_published', retired_at: null,
  }));
  const plan = { version: 1, semester: SEMESTER, manifest_sha256: MANIFEST_SHA256, payload_sha256: PAYLOAD_SHA256,
    snapshot, snapshot_sha256: sha256(JSON.stringify(snapshot)), batch_size: BATCH_SIZE,
    rows, dry_run: dryRun, batches: Math.ceil(rows.length / BATCH_SIZE), requires_owner_approval: true };
  plan.plan_id = digestPlan(plan);
  return plan;
}

async function validatePlan(pkg, plan) {
  same(plan.plan_id, digestPlan(plan), 'Plan tampered');
  const recreated = await createBulkPlan(pkg, plan.snapshot, { historical: true });
  same(plan, recreated, 'Plan differs from frozen catalogue');
}

export const summarizePlan = plan => ({ plan_id: plan.plan_id, semester: plan.semester, manifest_sha256: MANIFEST_SHA256,
  payload_sha256: PAYLOAD_SHA256, snapshot_sha256: plan.snapshot_sha256, snapshot_checked_at: plan.snapshot.checked_at,
  counts: plan.dry_run.counts, batches: plan.batches, batch_size: plan.batch_size, can_apply: false,
  production_transport_available: false, requires_owner_approval: true });

/** Evidence is an operator attestation, not authentication or release approval.
 * This module is unreachable from the application. It cannot create credentials or grant authority.
 */
function authorize(plan, authorization, action) {
  assert(authorization?.plan_id === plan.plan_id && authorization.action === action, 'Explicit plan/action approval required');
  assert(Date.parse(authorization.expires_at) > Date.now() && Date.parse(authorization.expires_at) <= Date.now() + 60 * 60_000, 'Expired/unbounded operator approval');
  assert(authorization.course_write_authority === 'd1', 'Existing D1 authority required');
  if (plan.snapshot.database_id === 'local') {
    assert(authorization.target === 'local', 'Local authorization required');
    return;
  }
  // No production adapter is shipped. A future owner-approved integration must authenticate the
  // operator, resolve these receipts from trusted systems, and supply the primary D1 binding.
  throw new Error('Production execution is disabled in this PR; owner-approved transport and verified release/backup receipts required');
}

const jsonArrays = columns => {
  const chunks = [];
  for (let i = 0; i < columns.length; i += 20) chunks.push(`json_array(${columns.slice(i, i + 20).join(',')})`);
  return `json_array(${chunks.join(',')})`;
};
const nestedRows = (rows, columns) => targetState(rows, columns).map(values => {
  const chunks = []; for (let i = 0; i < values.length; i += 20) chunks.push(values.slice(i, i + 20)); return chunks;
});
const receiptKey = (plan, kind, index) => `${plan.plan_id}:${kind}:${index}`;
const chunk = (plan, i) => plan.rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
const receiptBody = (plan, kind, i) => ({ version: 1, plan_id: plan.plan_id, action: kind, batch_index: i,
  payload_sha256: PAYLOAD_SHA256, snapshot_sha256: plan.snapshot_sha256,
  batch_sha256: sha256(JSON.stringify(chunk(plan, i))), ids: chunk(plan, i).map(r => r.id) });

async function inspect(db, pkg, plan) {
  await validatePlan(pkg, plan);
  const snapshot = await captureSnapshot(db, plan.snapshot.database_id);
  await validateBulkSnapshot(snapshot);
  const receipts = (await db.prepare("SELECT * FROM course_mutation_receipts WHERE actor_scope='system' AND actor_id=? AND idempotency_key>=? AND idempotency_key<? ORDER BY idempotency_key")
    .bind(ACTOR, `${plan.plan_id}:`, `${plan.plan_id};`).all()).results;
  const applied = new Set(), rolled = new Set();
  for (const receipt of receipts) {
    const body = JSON.parse(receipt.response_json);
    assert(['apply', 'rollback'].includes(body.action) && Number.isInteger(body.batch_index) && body.batch_index >= 0 && body.batch_index < plan.batches, 'Invalid receipt');
    same(body, receiptBody(plan, body.action, body.batch_index), 'Receipt body conflict');
    same(receipt.idempotency_key, receiptKey(plan, body.action, body.batch_index), 'Receipt key conflict');
    same(receipt.request_hash, sha256(JSON.stringify(body)), 'Receipt hash conflict');
    same(receipt.operation, `hk2_bulk_${body.action}`, 'Receipt operation conflict');
    (body.action === 'apply' ? applied : rolled).add(body.batch_index);
  }
  for (let i = 0; i < applied.size; i++) assert(applied.has(i), 'Non-contiguous apply receipts');
  for (let i = applied.size - rolled.size; i < applied.size; i++) assert(rolled.has(i) && applied.has(i), 'Non-contiguous rollback receipts');
  const active = plan.rows.slice(0, (applied.size - rolled.size) * BATCH_SIZE);
  const expected = [...plan.snapshot.response.result[2].results, ...active];
  same(targetState(snapshot.response.result[2].results, rowKeys(plan.snapshot)), targetState(expected, rowKeys(plan.snapshot)), 'Live HK2 differs from receipt state; stop');
  return { snapshot, applied: applied.size, rolled: rolled.size, expected };
}

/** First statement is a NOT NULL assertion AND the durable receipt. Any failed guard,
 * INSERT, trigger or reference check aborts the *same* D1 batch, including the receipt.
 */
function guardedReceipt(db, plan, state, action, index) {
  const columns = rowKeys(plan.snapshot);
  const body = receiptBody(plan, action, index);
  const live = `(SELECT json_group_array(${jsonArrays(columns)}) FROM (SELECT * FROM course_schedules WHERE semester='${SEMESTER}' ORDER BY id))`;
  const schema = `(SELECT json_group_array(json_array(type,name,tbl_name,sql)) FROM (${QUERIES[0]}))`;
  const expectedSchema = state.snapshot.response.result[0].results.map(r => [r.type, r.name, r.tbl_name, r.sql]);
  const bindings = [ACTOR, receiptKey(plan, action, index), sha256(JSON.stringify(body)),
    JSON.stringify(nestedRows(state.expected, columns)), JSON.stringify(expectedSchema),
    state.snapshot.response.result[5].results[0].max_source_position];
  let guard = `${live} IS ? AND ${schema} IS ? AND (SELECT COALESCE(MAX(source_position),0) FROM course_schedules) IS ?`;
  if (action === 'rollback') {
    const ids = JSON.stringify(chunk(plan, index).map(r => r.id));
    for (const [table, field] of [['user_schedules', 'course_id'], ['user_schedule_course_snapshots', 'course_id'], ['user_course_requests', 'approved_course_id']]) {
      guard += ` AND NOT EXISTS (SELECT 1 FROM ${table} WHERE ${field} IN (SELECT value FROM json_each(?)))`;
      bindings.push(ids);
    }
  }
  bindings.push(`hk2_bulk_${action}`, JSON.stringify(body), new Date().toISOString());
  // Each json_array has <=20 arguments; each statement has <100 parameters, <100 KB SQL.
  assert(bindings.every(v => typeof v !== 'string' || Buffer.byteLength(v) < 1_900_000), 'Guard exceeds D1 value limit; do not reduce scope');
  return db.prepare(`INSERT INTO course_mutation_receipts (actor_scope,actor_id,idempotency_key,request_hash,operation,response_json,created_at)
    SELECT 'system',?,?,?,CASE WHEN ${guard} THEN ? ELSE NULL END,?,?`).bind(...bindings);
}

export async function applyNextBatch(db, pkg, plan, authorization) {
  authorize(plan, authorization, 'apply');
  const state = await inspect(db, pkg, plan);
  assert(!state.rolled, 'Rolled-back plans are terminal; prepare a new plan and approval');
  if (state.applied === plan.batches) return { done: true, committed_batches: state.applied };
  if (state.applied === 0) await validateBulkSnapshot(plan.snapshot);
  same(state.snapshot.response.result[5].results[0].max_source_position,
    plan.snapshot.response.result[5].results[0].max_source_position + state.expected.length - plan.snapshot.response.result[2].results.length,
    'Source-position drift; stop and review the partial run');
  const i = state.applied;
  // Every mutation is plain INSERT. No UPDATE, DELETE, REPLACE or INSERT OR IGNORE.
  const statements = chunk(plan, i).map(row => db.prepare(`INSERT INTO course_schedules (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row)));
  await db.batch([guardedReceipt(db, plan, state, 'apply', i), ...statements]);
  if (i + 1 === plan.batches) {
    const final = await inspect(db, pkg, plan);
    same(final.applied, plan.batches, 'Final receipt missing');
  }
  return { done: i + 1 === plan.batches, committed_batches: i + 1 };
}

export async function rollbackNextBatch(db, pkg, plan, authorization) {
  authorize(plan, authorization, 'rollback');
  const state = await inspect(db, pkg, plan);
  const i = state.applied - state.rolled - 1;
  if (i < 0) return { done: true, rolled_back_batches: state.rolled };
  const statements = chunk(plan, i).map(row => db.prepare(`DELETE FROM course_schedules WHERE semester=? AND id=? AND source_key=? AND writer_provenance=? AND revision=0 AND content_hash=?`)
    .bind(SEMESTER, row.id, row.source_key, PROVENANCE, row.content_hash));
  // The exact-row guard also checks every field, not just content_hash/revision.
  await db.batch([guardedReceipt(db, plan, state, 'rollback', i), ...statements]);
  if (i === 0) {
    const final = await inspect(db, pkg, plan);
    same(final.rolled, final.applied, 'Final rollback receipt missing');
  }
  return { done: i === 0, rolled_back_batches: state.rolled + 1 };
}

export async function exportReceipts(db, plan) {
  return (await db.prepare("SELECT * FROM course_mutation_receipts WHERE actor_scope='system' AND actor_id=? AND idempotency_key>=? AND idempotency_key<? ORDER BY created_at,idempotency_key")
    .bind(ACTOR, `${plan.plan_id}:`, `${plan.plan_id};`).all()).results;
}
