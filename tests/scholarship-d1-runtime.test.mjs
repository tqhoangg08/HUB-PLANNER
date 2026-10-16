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
  const getAdmin = async suffix => {
    const request = new Request(origin + '/api/admin/v1/scholarships/campaigns' + suffix, {headers:{Cookie:'synthetic=session'}});
    return handleAdminScholarships(request, new URL(request.url), env);
  };
  const patch = (slug, body, authEnv = env) => {
    const request = new Request(origin + '/api/admin/v1/scholarships/campaigns/' + slug, {method:'PATCH',
      headers:{Origin:origin,Cookie:'synthetic=session','Content-Type':'application/json'},body:JSON.stringify(body)});
    return handleAdminScholarships(request,new URL(request.url),authEnv);
  };
  await t.test('draft metadata updates normalize source text and fail closed on stale revisions, invalid text and non-draft states', async () => {
    await admin('', {slug:'synthetic-edit',title:'Bản nháp',schoolYear:'2026',semester:'HK1'});
    const updated = await patch('synthetic-edit',{expectedRevision:0,title:'  Đợt học bổng  ',schoolYear:'2026-2027',semester:'HK2'});
    assert.equal(updated.campaign.title,'Đợt học bổng'); assert.equal(updated.campaign.revision,1);
    await assert.rejects(patch('synthetic-edit',{expectedRevision:0,title:'stale'}),{status:409});
    await assert.rejects(patch('synthetic-edit',{expectedRevision:1,title:''}));
    await assert.rejects(patch('synthetic-edit',{expectedRevision:1,title:'x'.repeat(241)}));
    await assert.rejects(patch('synthetic-edit',{expectedRevision:1,title:'x'},{...env,AUTH_SERVICE:{fetch:async()=>Response.json({...identity,role:'user'})}}),{status:403});
    const preview=await admin('/synthetic-edit/imports/preview',{sourceSha256:'b'.repeat(64),sourceFilename:'synthetic.csv',
      mapping:{studentCode:'Code',fullName:'Name',awardType:'Award',scores:[]},rows:[{sourceRowNumber:2,values:{Code:'000000000001',Name:'Synthetic',Award:'Synthetic'}}]});
    const batchId=preview.receipt.batchId;
    await admin('/synthetic-edit/imports/apply',{expectedRevision:1,batchId});
    await assert.rejects(patch('synthetic-edit',{expectedRevision:2,title:'forbidden'}),{status:409});
    await admin('/synthetic-edit/approve',{expectedRevision:2,batchId,sourceSha256:'b'.repeat(64),
      officialSource:{title:'Synthetic',reference:'SYNTHETIC-LOCAL',url:null},approvedFields:['fullName','studentCode','awardType'],republicationConfirmed:true});
    await assert.rejects(patch('synthetic-edit',{expectedRevision:3,title:'forbidden'}),{status:409});
    await admin('/synthetic-edit/publish',{expectedRevision:3,batchId});
    await assert.rejects(patch('synthetic-edit',{expectedRevision:4,title:'forbidden'}),{status:409});
    await admin('/synthetic-edit/archive',{expectedRevision:4});
    await assert.rejects(patch('synthetic-edit',{expectedRevision:5,title:'forbidden'}),{status:409});
    assert.equal((await getAdmin('/synthetic-edit')).campaign.title,'Đợt học bổng');
  });
  await t.test('Admin campaign/import/audit/batch row pagination reads beyond the initial page with exact global totals', async () => {
    for (let i=0;i<22;i++) {
      await admin('',{slug:'page-'+i,title:'Synthetic page',schoolYear:'2026',semester:'HK1'});
      await admin('/synthetic/imports/preview',{sourceSha256:(i+1).toString(16).padStart(64,'0'),sourceFilename:'synthetic.csv',
        mapping:{studentCode:'Code',fullName:'Name',awardType:'Award',scores:[]},
        rows:Array.from({length:21},(_,row)=>({sourceRowNumber:row+2,values:{Code:String(row+1).padStart(12,'0'),Name:'Synthetic '+row,Award:'Synthetic Award'}}))});
    }
    const campaigns=await getAdmin('?page=2&limit=20'); assert.equal(campaigns.total,24); assert.equal(campaigns.campaigns.length,4);
    const first=await getAdmin('/synthetic/imports?page=1&limit=20'), next=await getAdmin('/synthetic/imports?page=2&limit=20');
    assert.equal(first.total,23); assert.equal(next.imports.length,3);
    assert.equal(new Set([...first.imports,...next.imports].map(value=>value.batchId)).size,23);
    const rows=await getAdmin('/synthetic/imports/'+first.imports[0].batchId+'/rows?page=2&limit=20');
    assert.equal(rows.total,21); assert.equal(rows.rows.length,1); assert.equal(rows.rows[0].studentCode,'000000000021');
    const audit=await getAdmin('/synthetic/audit?page=2&limit=20'); assert.ok(audit.total>20); assert.ok(audit.audit.length>0);
    const empty=await getAdmin('/synthetic/imports?page=100&limit=20'); assert.equal(empty.total,23); assert.equal(empty.imports.length,0);
  });
});
