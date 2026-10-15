import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { handleAdminScholarships } from '../cloudflare/worker/src/scholarship-admin.ts';
import { handlePublicScholarships } from '../cloudflare/worker/src/scholarships.ts';

test('real Worker routing + D1 migrations/JSON chunks/CAS transactions run locally without Auth network', async t => {
  const bundled = await build({ entryPoints: ['cloudflare/worker/src/index.ts'], bundle: true, write: false,
    format: 'esm', platform: 'browser', external: ['cloudflare:*'], logLevel: 'silent', metafile: true });
  assert.ok(Object.keys(bundled.metafile.inputs).every(file => !/^(?:dev\/|tests\/|scripts\/(?:dev-scholarships-local|prepare-scholarship-import|scholarship-workbook)\.)/.test(file)), 'production Worker must not import scholarship dev identity, offline tools or fixtures');
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-07-29',
    d1Databases: ['DB'], bindings: { ALLOWED_ORIGINS: 'https://example.test' } });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  for (const file of ['0055_scholarships.sql', '0056_scholarship_snapshots.sql', '0057_scholarship_filters.sql']) {
    const sql = await readFile(new URL('../cloudflare/migrations/' + file, import.meta.url), 'utf8');
    const statements = sql.replace(/--[^\n]*/g, '').match(/CREATE TRIGGER[\s\S]*?END;|(?:CREATE|ALTER)[\s\S]*?;/g);
    await db.batch(statements.filter(s => s.trim()).map(s => db.prepare(s)));
  }
  const origin = 'https://example.test';
  const empty = await mf.dispatchFetch(origin + '/api/public/v1/scholarships/campaigns');
  assert.equal(empty.status, 200); assert.equal(empty.headers.get('cache-control'), 'no-store');
  assert.equal((await empty.json()).total, 0);
  const noAuth = await mf.dispatchFetch(origin + '/api/admin/v1/scholarships/campaigns');
  assert.equal(noAuth.status, 401); assert.equal(noAuth.headers.get('cache-control'), 'private, no-store');
  const qaCookie = { headers: { Cookie: 'scholarship_qa=synthetic', 'X-User-Role': 'admin' } };
  for (const route of ['/api/me/scholarships', '/api/admin/v1/scholarships/campaigns']) {
    const forged = await mf.dispatchFetch(origin + route, qaCookie);
    assert.equal(forged.status, 503, 'without AUTH_SERVICE a supplied QA cookie must fail closed, never grant access');
  }
  const method = await mf.dispatchFetch(origin + '/api/public/v1/scholarships/campaigns', { method: 'POST' });
  assert.equal(method.status, 405); assert.match(method.headers.get('allow'), /GET/);
  const guessed = await mf.dispatchFetch(origin + '/api/public/v1/scholarships/guessed/recipients');
  assert.equal(guessed.status, 404);
  const identity = { userId: '11111111-1111-4111-8111-111111111111', email: 'synthetic@example.test', role: 'admin' };
  const env = { DB: db, AUTH_SERVICE: { fetch: async () => Response.json(identity) } };
  const admin = async (suffix, body) => {
    const request = new Request(origin + '/api/admin/v1/scholarships/campaigns' + suffix, { method: 'POST',
      headers: { Origin: origin, Cookie: 'synthetic=session', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return handleAdminScholarships(request, new URL(request.url), env);
  };
  await admin('', { slug: 'synthetic', title: 'Synthetic', schoolYear: '2026', semester: 'HK1' });
  const preview = await admin('/synthetic/imports/preview', { sourceSha256: 'a'.repeat(64), sourceFilename: 'synthetic.csv',
    mapping: { studentCode: 'Code', fullName: 'Name', awardType: 'Award', scores: [] },
    rows: [{ sourceRowNumber: 2, values: { Code: '000000000001', Name: 'Synthetic A', Award: 'Synthetic Award' } }] });
  const batchId = preview.receipt.batchId;
  await admin('/synthetic/imports/apply', { expectedRevision: 0, batchId });
  await admin('/synthetic/approve', { expectedRevision: 1, batchId, sourceSha256: 'a'.repeat(64),
    officialSource: { title: 'Synthetic', reference: 'SYNTHETIC-LOCAL', url: null },
    approvedFields: ['fullName', 'studentCode', 'awardType'], republicationConfirmed: true });
  await admin('/synthetic/publish', { expectedRevision: 2, batchId });
  const response = await mf.dispatchFetch(origin + '/api/public/v1/scholarships/synthetic/recipients');
  assert.equal(response.status, 200); assert.equal((await response.json()).total, 1);
  // Make the CAS lose after its initial read. D1 must abort the entire batch.
  const racingDb = { prepare: query => db.prepare(query), batch: async statements => {
    await db.prepare('UPDATE scholarship_campaigns SET revision=revision+1 WHERE slug=?').bind('synthetic').run();
    return db.batch(statements);
  } };
  const request = new Request(origin + '/api/admin/v1/scholarships/campaigns/synthetic/unpublish', { method: 'POST',
    headers: { Origin: origin, Cookie: 'synthetic=session', 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 3 }) });
  await assert.rejects(handleAdminScholarships(request, new URL(request.url), { ...env, DB: racingDb }), { status: 409 });
  assert.equal((await db.prepare('SELECT status FROM scholarship_campaigns').first()).status, 'published');
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM scholarship_audit_events WHERE action='unpublished'").first()).n, 0);
  await admin('/synthetic/unpublish', { expectedRevision: 4 });
  const url = new URL(origin + '/api/public/v1/scholarships/synthetic/recipients');
  await assert.rejects(handlePublicScholarships(new Request(url), url, env), { status: 404 });
});
