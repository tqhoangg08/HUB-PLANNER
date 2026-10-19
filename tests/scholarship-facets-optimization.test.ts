import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { handlePublicScholarships, handleMyScholarships } from '../cloudflare/worker/src/scholarships.ts';
import { handleAdminScholarships } from '../cloudflare/worker/src/scholarship-admin.ts';
import { ScholarshipFacetCache } from '../cloudflare/worker/src/scholarship-facet-cache.ts';

const baselineRef = 'a746e7f73e366e383b19cc1027442ff83c5034e7';
const origin = 'https://example.test';
const keys = ['scholarshipType', 'scholarshipRank', 'major', 'className', 'cohort', 'trainingProgram'];
const mapping = { studentCode: 'Code', fullName: 'Name', awardType: 'Award', scores: [],
  ...Object.fromEntries(keys.map(key => [key, key])) };
const approved = ['studentCode', 'fullName', 'awardType', ...keys];
type Handler = typeof handlePublicScholarships;
type Cost = { sql: number; rowsRead: number; rowsWritten: number };

const loadBaseline = async (): Promise<Handler> => {
  const source = execFileSync('git', ['show', baselineRef + ':cloudflare/worker/src/scholarships.ts'], { encoding: 'utf8' });
  await mkdir('.cache/phase1', { recursive: true });
  const output = resolve('.cache/phase1/scholarships-baseline.mjs');
  await build({ stdin: { contents: source, resolveDir: resolve('cloudflare/worker/src'), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile: output, logLevel: 'silent' });
  return (await import(pathToFileURL(output).href)).handlePublicScholarships;
};

const meter = (db: D1Database) => {
  let cost: Cost = { sql: 0, rowsRead: 0, rowsWritten: 0 };
  let queries: string[] = [];
  let beforeQuery: ((sql: string) => Promise<void>) | undefined;
  const capture = async (sql: string, statement: D1PreparedStatement) => {
    await beforeQuery?.(sql);
    const result = await statement.all();
    cost.sql++; cost.rowsRead += result.meta.rows_read; cost.rowsWritten += result.meta.rows_written;
    queries.push(sql);
    return result;
  };
  const DB = { prepare(sql: string) {
    let statement = db.prepare(sql);
    const wrapper = {
      bind(...args: unknown[]) { statement = statement.bind(...args); return wrapper; },
      all: () => capture(sql, statement),
      async first() { return (await capture(sql, statement)).results[0] ?? null; },
    };
    return wrapper;
  } };
  return { DB, reset() { cost = { sql: 0, rowsRead: 0, rowsWritten: 0 }; queries = []; },
    get cost() { return { ...cost }; }, get queries() { return queries; },
    intercept(fn?: (sql: string) => Promise<void>) { beforeQuery = fn; } };
};

const seed = async (db: D1Database, count: number, classes: number, label = 'Class') => {
  for (const name of ['0055_scholarships.sql', '0056_scholarship_snapshots.sql',
    '0057_scholarship_filters.sql', '0059_scholarship_personal_details.sql']) {
    const sql = await readFile(new URL('../cloudflare/migrations/' + name, import.meta.url), 'utf8');
    const statements = sql.replace(/--[^\n]*/g, '').match(/CREATE TRIGGER[\s\S]*?END;|(?:CREATE|ALTER)[\s\S]*?;/g)!;
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  await db.prepare(`INSERT INTO scholarship_campaigns(slug,title,school_year,semester,source_title)
    VALUES('synthetic','Synthetic','2026','HK1','Synthetic')`).run();
  await db.prepare(`INSERT INTO scholarship_import_batches(id,campaign_slug,source_sha256,source_filename,
    expected_rows,status,performed_by_user_id,mapping_json,approved_fields_json,approval_document_json)
    VALUES('1111111111111111111111111111111111111111111111111111111111111111','synthetic',?,'synthetic',?,'previewed','synthetic',?,?,?)`)
    .bind('a'.repeat(64), count, JSON.stringify(mapping), JSON.stringify(approved),
      JSON.stringify({ title: 'Synthetic', reference: 'SYNTHETIC', url: null })).run();
  await db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<?)
    INSERT INTO scholarship_snapshot_rows(batch_id,source_row_number,student_code,full_name,full_name_search,
      class_name,major,award_type,scores_json,source_row_sha256,scholarship_type,scholarship_rank,cohort,training_program,private_rankings_json)
    SELECT '1111111111111111111111111111111111111111111111111111111111111111',x,printf('%012d',x),'Nguyễn Đạt '||x,'nguyen dat '||x,
      ?||(x%?),CASE WHEN x%13=0 THEN NULL ELSE 'Ngành '||(x%6) END,'Award'||(x%2),'{}','synthetic',
      'Type'||(x%2),'Rank'||(x%3),CASE WHEN x%17=0 THEN '' ELSE 'K'||(x%4) END,'Program'||(x%2),
      '{"topClass":999}' FROM n`).bind(count, label, classes).run();
  await db.prepare("UPDATE scholarship_import_batches SET status='applied'").run();
  await db.prepare(`UPDATE scholarship_campaigns SET status='published',public_data_approved=1,
    published_at='2026-10-17',active_batch_id='1111111111111111111111111111111111111111111111111111111111111111',revision=3`).run();
};

test('Miniflare golden results, query/row costs, cache fencing and isolation', { timeout: 300_000 }, async t => {
  const baseline = await loadBaseline();
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("local")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB', 'OTHER', 'HIGH_CARDINALITY'] });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  console.log('PHASE1_STAGE=seed');
  await seed(db, 1060, 250);
  const before = meter(db), after = meter(db);
  const call = async (handler: Handler, measured: ReturnType<typeof meter>, suffix: string) => {
    measured.reset();
    const url = new URL(origin + '/api/public/v1/scholarships/' + suffix);
    const result = await handler(new Request(url), url, { DB: measured.DB } as never);
    return { result, cost: measured.cost };
  };
  const benchmark: Record<string, { before: Cost; after: Cost }> = {};
  console.log('PHASE1_STAGE=benchmark');
  for (const [label, qs] of [['cold-page-one', 'facetPage=1&facetLimit=200'],
    ['continuation-page-two', 'facetPage=2&facetLimit=200'],
    ['warm-page-one', 'facetPage=1&facetLimit=200']] as const) {
    const a = await call(baseline, before, 'synthetic/facets?' + qs);
    const b = await call(handlePublicScholarships, after, 'synthetic/facets?' + qs);
    assert.deepEqual(b.result, a.result);
    assert.equal(b.cost.rowsWritten, 0); assert.equal(a.cost.rowsWritten, 0);
    assert.ok(b.cost.sql < a.cost.sql); assert.ok(b.cost.rowsRead < a.cost.rowsRead);
    benchmark[label] = { before: a.cost, after: b.cost };
    if (label === 'continuation-page-two') {
      assert.equal(after.queries.filter(sql => sql.includes('facet_values AS MATERIALIZED')).length, 1,
        'only the unfinished class facet is queried again');
      assert.equal(after.queries.filter(sql => sql.startsWith('SELECT COUNT')).length, 0);
    }
  }
  console.log('SCHOLARSHIP_INITIAL_BENCHMARK='+JSON.stringify(benchmark));
  // Independent golden oracle is the actual main handler, not reimplemented SQL.
  const values = ['Type1', 'Rank1', 'Ngành 1', 'Class1', 'K1', 'Program1'];
  console.log('PHASE1_STAGE=golden');
  for (let mask = 0; mask < 64; mask++) {
    const params = new URLSearchParams();
    keys.forEach((key, i) => { if (mask & (1 << i)) params.set(key, values[i]); });
    const suffix = 'synthetic/facets?' + params;
    assert.deepEqual((await call(handlePublicScholarships, after, suffix)).result,
      (await call(baseline, before, suffix)).result, 'self-excluding AND filters mask ' + mask);
    if (mask % 16 === 15) console.log('PHASE1_GOLDEN_MASKS=' + (mask + 1));
  }
  for (const q of ['ĐẠT', 'Nguyễn', 'nguyen dat', '0000000000', '000000000010', '%_', '\\%', 'no match']) {
    for (const route of ['facets?facetPage=2&facetLimit=7&', 'search?page=2&limit=7&']) {
      const suffix = 'synthetic/' + route + new URLSearchParams({ q });
      assert.deepEqual((await call(handlePublicScholarships, after, suffix)).result,
        (await call(baseline, before, suffix)).result, route + q);
    }
  }
  for (const query of ['facetPage=2000&facetLimit=200', 'facetPage=1&facetLimit=1',
    'facetPage=2&facetLimit=1', 'awardType=Award1', 'className=missing']) {
    const suffix = 'synthetic/facets?' + query;
    assert.deepEqual((await call(handlePublicScholarships, after, suffix)).result,
      (await call(baseline, before, suffix)).result);
  }
  assert.doesNotMatch(JSON.stringify((await call(handlePublicScholarships, after, 'synthetic/facets')).result),
    /topClass|000000000001|Nguyễn Đạt/);

  // Warm cache must not bypass unpublish, revoked approval or snapshot policy.
  await call(handlePublicScholarships, after, 'synthetic/facets');
  await db.prepare("UPDATE scholarship_campaigns SET status='validated'").run();
  await assert.rejects(call(handlePublicScholarships, after, 'synthetic/facets'), { status: 404 });
  await assert.rejects(db.prepare("UPDATE scholarship_campaigns SET status='published', public_data_approved=0").run());
  await db.prepare("UPDATE scholarship_campaigns SET status='published',public_data_approved=1").run();
  await db.prepare('UPDATE scholarship_import_batches SET approved_fields_json=?').bind(JSON.stringify(approved.filter(f => f !== 'className'))).run();
  const revoked = (await call(handlePublicScholarships, after, 'synthetic/facets')).result as any;
  assert.equal(revoked.supportedFilters.includes('className'), false);
  assert.deepEqual(revoked.facets.className.options, []);
  await db.prepare('UPDATE scholarship_import_batches SET approved_fields_json=?').bind(JSON.stringify(approved)).run();
  await db.prepare('UPDATE scholarship_import_batches SET approval_document_json=NULL').run();
  await assert.rejects(call(handlePublicScholarships, after, 'synthetic/facets'), { status: 404 });
  await db.prepare('UPDATE scholarship_import_batches SET approval_document_json=?').bind('{"title":"Synthetic","reference":"SYNTHETIC","url":null}').run();
  let raced = false;
  after.intercept(async sql => {
    if (!raced && sql.startsWith('WITH facet_values')) {
      raced = true;
      await db.prepare('UPDATE scholarship_campaigns SET revision=revision+1').run();
    }
  });
  await assert.rejects(call(handlePublicScholarships, after, 'synthetic/facets?q=race'), { status: 409 });
  after.intercept();

  const other = await mf.getD1Database('OTHER'); await seed(other, 13, 2, 'OtherDB');
  const isolated = meter(other);
  const otherResult = (await call(handlePublicScholarships, isolated, 'synthetic/facets')).result as any;
  assert.equal(otherResult.totalRecipients, 13);
  assert.ok(otherResult.facets.className.options.every((v: string) => v.startsWith('OtherDB')));
  const high = await mf.getD1Database('HIGH_CARDINALITY'); await seed(high, 1060, 1060, 'Unique');
  const highBefore = meter(high), highAfter = meter(high);
  const highA = await call(baseline, highBefore, 'synthetic/facets?facetLimit=200');
  const highB = await call(handlePublicScholarships, highAfter, 'synthetic/facets?facetLimit=200');
  assert.deepEqual(highB.result, highA.result);
  assert.equal(highB.cost.rowsWritten, 0);
  benchmark['high-cardinality-cold'] = { before: highA.cost, after: highB.cost };
  console.log('SCHOLARSHIP_HIGH_CARDINALITY=' + JSON.stringify(benchmark['high-cardinality-cold']));

  // Actual existing Admin transitions publish/unpublish and roll back pointers;
  // no production auth implementation or role policy is modified.
  const env = { DB: db, AUTH_SERVICE: { fetch: async () => Response.json({
    userId: '11111111-1111-4111-8111-111111111111', email: 'synthetic@example.test', role: 'admin',
  }) } };
  const transition = async (action: string, body: Record<string, unknown> = {}) => {
    const revision = (await db.prepare('SELECT revision FROM scholarship_campaigns').first<{revision:number}>())!.revision;
    const req = new Request(origin + '/api/admin/v1/scholarships/campaigns/synthetic/' + action,
      { method: 'POST', headers: { Origin: origin, Cookie: 'synthetic=session', 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision, ...body }) });
    return handleAdminScholarships(req, new URL(req.url), env as never);
  };
  await transition('unpublish');
  await assert.rejects(call(handlePublicScholarships, after, 'synthetic/facets'), { status: 404 });
  await db.prepare("UPDATE scholarship_campaigns SET candidate_batch_id='1111111111111111111111111111111111111111111111111111111111111111'").run();
  await transition('approve', { batchId: '1111111111111111111111111111111111111111111111111111111111111111', sourceSha256: 'a'.repeat(64),
    officialSource: { title: 'Synthetic', reference: 'SYNTHETIC', url: null },
    approvedFields: approved, republicationConfirmed: true });
  await transition('publish', { batchId: '1111111111111111111111111111111111111111111111111111111111111111' });
  const republished = await call(handlePublicScholarships, after, 'synthetic/facets');
  assert.equal((republished.result as any).totalRecipients, 1060);
  // Publish a different immutable batch, then roll back through the real
  // policy. Cached counts/options from either batch must not cross pointers.
  const replacement = '2'.repeat(64);
  await db.prepare(`INSERT INTO scholarship_import_batches(id,campaign_slug,source_sha256,source_filename,
    expected_rows,status,performed_by_user_id,mapping_json,approved_fields_json,approval_document_json)
    SELECT ?,'synthetic',source_sha256,'synthetic',1,'previewed','synthetic',
      mapping_json,approved_fields_json,approval_document_json FROM scholarship_import_batches LIMIT 1`).bind(replacement).run();
  await db.prepare(`INSERT INTO scholarship_snapshot_rows(batch_id,source_row_number,student_code,
    full_name,full_name_search,class_name,major,award_type,scores_json,source_row_sha256)
    VALUES(?,1,'000000000001','Synthetic','synthetic','Replacement','Replacement','Award','{}','synthetic')`).bind(replacement).run();
  await db.prepare("UPDATE scholarship_import_batches SET status='applied' WHERE id=?").bind(replacement).run();
  await db.prepare("UPDATE scholarship_campaigns SET candidate_batch_id=?,status='validated',public_data_approved=0,revision=revision+1").bind(replacement).run();
  await transition('approve', { batchId: replacement, sourceSha256: 'a'.repeat(64),
    officialSource: { title: 'Synthetic replacement', reference: 'SYNTHETIC', url: null },
    approvedFields: approved, republicationConfirmed: true });
  await transition('publish', { batchId: replacement });
  const replaced = (await call(handlePublicScholarships, after, 'synthetic/facets')).result as any;
  assert.equal(replaced.totalRecipients, 1); assert.deepEqual(replaced.facets.className.options, ['Replacement']);
  // Prior publication audit is required by the existing rollback policy.
  await transition('rollback', { batchId: '1111111111111111111111111111111111111111111111111111111111111111' });
  assert.deepEqual((await call(handlePublicScholarships, after, 'synthetic/facets')).result,
    (await call(baseline, before, 'synthetic/facets')).result);
  await writeFile('.cache/phase1/scholarship-benchmark.json', JSON.stringify({ baselineRef, rows: 1060, benchmark }, null, 2));
  console.log('SCHOLARSHIP_D1_BENCHMARK=' + JSON.stringify(benchmark));
});

test('all public scholarship reads are rate limited before SQL; private reads keep their auth boundary', async () => {
  let limited = 0;
  const env = { DB: { prepare() { throw Error('SQL must not execute'); } },
    SCHOLARSHIP_SEARCH_RATE_LIMIT: { async limit({ key }: {key:string}) {
      limited++; assert.match(key, /^scholarships:/); return { success: false };
    } } };
  for (const path of ['campaigns', 'synthetic/summary', 'synthetic/recipients', 'synthetic/search?q=ab', 'synthetic/facets']) {
    const request = new Request(origin + '/api/public/v1/scholarships/' + path, { headers: { 'CF-Connecting-IP': '192.0.2.1' } });
    await assert.rejects(handlePublicScholarships(request, new URL(request.url), env as never), { status: 429 });
  }
  assert.equal(limited, 5);
  await assert.rejects(handleMyScholarships(new Request(origin + '/api/me/scholarships'), env as never), { status: 401 });
  assert.equal(limited, 5, 'private endpoint must not spend public quota/rate-limit tokens');
});

test('aggregate cache expires, is bounded, and does not share mutable results', () => {
  const cache = new ScholarshipFacetCache();
  const value = { totalRecipients: 1, facets: { major: { total: 1, pages: { '200:1': ['Public'] } } } };
  cache.put('a', value, 0);
  value.facets.major.pages['200:1'][0] = 'changed';
  const result = cache.get('a', 1)!; assert.equal(result.facets.major.pages['200:1'][0], 'Public');
  result.facets.major.pages['200:1'][0] = 'changed again';
  assert.equal(cache.get('a', 2)!.facets.major.pages['200:1'][0], 'Public');
  assert.equal(cache.get('a', 30_000), undefined);
  for (let i = 0; i < 225; i++) cache.put('scope' + i, value, 0);
  assert.equal(cache.get('scope0', 1), undefined);
  cache.put('oversize', { totalRecipients: 0, facets: { major: { total: 1, pages: { '1:1': ['x'.repeat(1_000_001)] } } } }, 0);
  assert.equal(cache.get('oversize', 1), undefined);
});

test('same database isolates campaigns and a warm response is fenced against concurrent unpublish', async t => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("local")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB'); await seed(db, 13, 2);
  const secondBatch = '4'.repeat(64);
  await db.prepare(`INSERT INTO scholarship_campaigns(slug,title,school_year,semester,source_title)
    VALUES('second','Second','2026','HK1','Synthetic')`).run();
  await db.prepare(`INSERT INTO scholarship_import_batches(id,campaign_slug,source_sha256,source_filename,
    expected_rows,status,performed_by_user_id,mapping_json,approved_fields_json,approval_document_json)
    SELECT ?,'second',source_sha256,'synthetic',1,'previewed','synthetic',
      mapping_json,approved_fields_json,approval_document_json FROM scholarship_import_batches LIMIT 1`).bind(secondBatch).run();
  await db.prepare(`INSERT INTO scholarship_snapshot_rows(batch_id,source_row_number,student_code,
    full_name,full_name_search,class_name,award_type,scores_json,source_row_sha256)
    VALUES(?,1,'000000000001','Synthetic','synthetic','OtherCampaign','Award','{}','synthetic')`).bind(secondBatch).run();
  await db.prepare("UPDATE scholarship_import_batches SET status='applied' WHERE id=?").bind(secondBatch).run();
  await db.prepare(`UPDATE scholarship_campaigns SET status='published',public_data_approved=1,
    published_at='synthetic',active_batch_id=?,revision=3 WHERE slug='second'`).bind(secondBatch).run();
  const measured = meter(db);
  const call = async (slug: string) => {
    const url = new URL(origin + '/api/public/v1/scholarships/' + slug + '/facets');
    return handlePublicScholarships(new Request(url), url, { DB: measured.DB } as never) as Promise<any>;
  };
  const first = await call('synthetic'), second = await call('second');
  assert.equal(first.totalRecipients, 13); assert.equal(second.totalRecipients, 1);
  assert.deepEqual(second.facets.className.options, ['OtherCampaign']);
  assert.deepEqual(await call('synthetic'), first);
  let gates = 0;
  measured.intercept(async sql => {
    if (sql.includes('c.slug=? LIMIT 1') && ++gates === 2)
      await db.prepare("UPDATE scholarship_campaigns SET status='validated',public_data_approved=0 WHERE slug='synthetic'").run();
  });
  await assert.rejects(call('synthetic'), { status: 404 });
  assert.equal(gates, 2, 'a warm hit must execute both fresh publication gates');
});
