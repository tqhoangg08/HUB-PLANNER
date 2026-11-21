/** Operator process only: native D1 binding, no fetch handler or public endpoint. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applyNextBatch } from './bulk-import.mjs';
import { ACCOUNT, DB_ID, consumeProductionAuthorization } from './operator-authorization.mjs';

export const CLOSED_GATE_ASSERTION = `SELECT CASE WHEN
  (SELECT COUNT(*) FROM hk2_catalogue_publications WHERE semester='HK2_2026_2027'
    AND state='CLOSED' AND revision=0 AND manifest_sha256 IS NULL AND payload_sha256 IS NULL
    AND official_count IS NULL AND batch_count IS NULL AND verification_sha256 IS NULL
    AND receipt_id IS NULL AND opened_at IS NULL)=1
  AND (SELECT COUNT(*) FROM hk2_catalogue_publication_receipts)=0
  THEN 1 ELSE json('HK2_GATE_NOT_CLOSED') END AS gate_closed`;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const readOnly = sql => /^\s*(?:SELECT\b|PRAGMA table_info\()/i.test(sql);

/** Preserve prepared parameters and ONE native transaction per writer batch.
 * Extra SELECT assertion closes the gate-open race in the same transaction.
 * No arbitrary SQL flag, REST batch emulation, retry or rollback transport.
 */
export function guardedOperatorBinding(raw, plan, authorization) {
  const statements = new WeakMap();
  const prepare = (sql, params = []) => {
    const native = params.length ? raw.prepare(sql).bind(...params) : raw.prepare(sql);
    const statement = { bind: (...values) => prepare(sql, values),
      all: () => { assert(readOnly(sql), 'Writes require an approved atomic batch'); return native.all(); },
      first: (...args) => { assert(readOnly(sql), 'Writes require an approved atomic batch'); return native.first(...args); } };
    statements.set(statement, { sql, native }); return statement;
  };
  return { prepare, async batch(list) {
    const items = list.map(s => statements.get(s));
    assert(items.length > 0 && items.every(Boolean), 'Foreign/empty statement batch');
    if (items.every(i => readOnly(i.sql))) return raw.batch(items.map(i => i.native));
    assert(items.length >= 2 && items.length <= 26
      && /^INSERT INTO course_mutation_receipts\s/.test(items[0].sql)
      && items.slice(1).every(i => /^INSERT INTO course_schedules \(/.test(i.sql)), 'Only original receipt-first INSERT batches allowed');
    await consumeProductionAuthorization(plan, authorization);
    const result = await raw.batch([raw.prepare(CLOSED_GATE_ASSERTION), ...items.map(i => i.native)]);
    assert(result.length === items.length + 1 && result.every(r => r.success === true), 'Incomplete atomic D1 result; reconcile receipts before retry');
    return result.slice(1);
  } };
}

export async function openProductionBinding() {
  const configPath = new URL('./operator.wrangler.json', import.meta.url);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const d1 = config.d1_databases;
  assert(config.account_id === ACCOUNT && d1?.length === 1 && d1[0].binding === 'DB'
    && d1[0].database_id === DB_ID && d1[0].database_name === 'hub-planner-public-dev' && d1[0].remote === true
    && Object.keys(d1[0]).sort().join() === ['binding','database_id','database_name','remote'].join()
    && Object.keys(config).sort().join() === ['account_id','compatibility_date','d1_databases','name'].join(), 'Fixed operator resource configuration required');
  const { getPlatformProxy } = await import('wrangler');
  // Provider-authenticated remote binding session; not a Public Worker deploy.
  // No server.listen(), app route, fetch handler or remote SQL API adapter.
  return getPlatformProxy({ configPath: fileURLToPath(configPath), remoteBindings: true, persist: false, envFiles: [] });
}

export async function applyOperatorBatch(raw, pkg, plan, authorization) {
  return applyNextBatch(guardedOperatorBinding(raw, plan, authorization), pkg, plan, authorization);
}
