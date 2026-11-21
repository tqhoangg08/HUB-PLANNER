/** Native operator transport. Publication library owns every mutation/SQL guard. */
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyHk2Publication, authorizeHk2Publication, openHk2Publication } from './publication.mjs';
import { validateBackupEvidence, DB_ID, digest, RELEASE } from './operator-authorization.mjs';
import { verifyPublicationOperator, V477_ASSET_MANIFEST_SHA256 } from './publication-operator.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const readOnly = sql => /^\s*(?:SELECT\b|PRAGMA table_info\()/i.test(sql);
const semester = 'HK2_2026_2027';

export function publicationBinding(raw) {
  const statements = new WeakMap();
  const prepare = (sql, params = []) => {
    const native = params.length ? raw.prepare(sql).bind(...params) : raw.prepare(sql);
    const statement = { bind: (...values) => prepare(sql, values),
      all: () => { assert(readOnly(sql), 'Publication writes require native atomic batch'); return native.all(); },
      first: (...args) => { assert(readOnly(sql), 'Publication writes require native atomic batch'); return native.first(...args); } };
    statements.set(statement, { sql, native }); return statement;
  };
  return { prepare, async batch(list) {
    const items = list.map(s => statements.get(s));
    assert(items.length && items.every(Boolean), 'Foreign/empty publication batch');
    if (items.every(i => readOnly(i.sql))) return raw.batch(items.map(i => i.native));
    assert(items.length === 2 && /^INSERT INTO hk2_catalogue_publication_receipts\(/.test(items[0].sql)
      && /^UPDATE hk2_catalogue_publications SET state='OPEN',revision=1,/.test(items[1].sql), 'Only original atomic publication pair allowed');
    const result = await raw.batch(items.map(i => i.native));
    assert(result.length === 2 && result.every(r => r.success === true), 'Uncertain publication response; reconcile without write retry');
    return result;
  } };
}

/** Adapt the existing full backup report, preserving independent source/restored
 * digests. It is evidence, never authorization; a separate owner comment is required.
 */
export function publicationBackupEvidence(report, plan) {
  const reportHash = validateBackupEvidence(report, plan);
  const names = ['course_schedules','user_schedules','user_schedule_course_snapshots','user_course_requests'];
  const tables = names.map(name => report.restore.tables.find(t => t.table === name));
  const protectedDigest = field => digest(tables.map(t => ({ table: t.table, ...t[field] })));
  return { database_id: DB_ID, export_sha256: report.backup.sha256, export_bytes: report.backup.bytes,
    export_reference: `sha256:${report.backup.sha256};bookmark:${report.backup.exportBookmark}`,
    protected_source_sha256: protectedDigest('reference'), protected_restored_sha256: protectedDigest('restored'),
    restore_environment: 'isolated', production_restored: false, exported_at: report.backup.completedAt,
    restore_verified_at: report.restore.verified_at, source_report_sha256: reportHash };
}

export async function verifyBackupFile(report) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(report.backup.file)) { hash.update(chunk); bytes += chunk.length; }
  assert(bytes === report.backup.bytes && hash.digest('hex') === report.backup.sha256, 'Private export file hash/length differs');
}

export async function assertPublicationSchema(db) {
  const source = (await readFile(new URL('../../cloudflare/migrations/0062_hk2_catalogue_publication.sql', import.meta.url), 'utf8')).replace(/--[^\n]*/g, '');
  const objects = (await db.prepare("SELECT name,sql FROM sqlite_master WHERE name IN ('hk2_catalogue_publications','hk2_catalogue_publication_receipts') ORDER BY name").all()).results;
  const canonical = sql => sql.replace(/\s/g, '').replace(/;$/, '');
  assert(objects.length === 2 && objects.every(o => {
    const expected = source.match(new RegExp(`CREATE TABLE ${o.name} \\([\\s\\S]*?\\n\\);`))?.[0];
    return expected && canonical(o.sql) === canonical(expected);
  }), 'Exact reviewed migration 0062 schema required');
  const ledger = (await db.prepare("SELECT name FROM d1_migrations WHERE name='0062_hk2_catalogue_publication.sql'").all()).results;
  assert(ledger.length === 1, 'Migration 0062 tracking receipt required');
}

export async function inspectPublication(db) {
  const gate = await db.prepare('SELECT * FROM hk2_catalogue_publications WHERE semester=?').bind(semester).first();
  const receipts = (await db.prepare('SELECT * FROM hk2_catalogue_publication_receipts ORDER BY id').all()).results;
  return { gate, receipts };
}

export async function prepareProductionPublication(raw, { plan, report, operatorSha, credentials }) {
  assert(plan.snapshot.database_id === DB_ID, 'Fixed production database required');
  const backup = publicationBackupEvidence(report, plan);
  const release = { sha: RELEASE.sha, run_id: RELEASE.run_id, worker_version: RELEASE.version,
    asset_manifest_sha256: V477_ASSET_MANIFEST_SHA256, operator_sha: operatorSha };
  const provider = await verifyPublicationOperator(release, credentials);
  const db = publicationBinding(raw);
  await assertPublicationSchema(db);
  const before = await inspectPublication(db);
  assert(before.gate?.state === 'CLOSED' && before.gate.revision === 0 && before.receipts.length === 0
    && Object.entries(before.gate).every(([k,v]) => ['semester','state','revision'].includes(k) || v === null), 'Pristine CLOSED revision 0 gate required');
  const verification = await verifyHk2Publication(db, { plan, backup, release });
  return { verification, provider, backup, release };
}

/** Exactly one attempt. Provider/constraint/network errors propagate unchanged.
 * The caller saves inspectPublication() evidence; no mutation retry is hidden here.
 */
export async function publishProductionCatalogue(raw, verification, approvals) {
  const capability = await authorizeHk2Publication(verification, approvals);
  return openHk2Publication(publicationBinding(raw), verification, capability);
}
