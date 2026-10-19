import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { handlePublicScholarships } from '../cloudflare/worker/src/scholarships.ts';
import { scholarshipFacetCache, ScholarshipFacetCache } from '../cloudflare/worker/src/scholarship-facet-cache.ts';
import { scholarshipFacetQuery } from '../cloudflare/worker/src/scholarship-facet-query.ts';
import { meter, seed, type Cost } from './fixtures/scholarship-performance.ts';

const base = 'cc7c8222d7c039912bb6b882b0ea5372cb645c6e';
const columns = { scholarshipType: 'scholarship_type', scholarshipRank: 'scholarship_rank',
  major: 'major', className: 'class_name', cohort: 'cohort', trainingProgram: 'training_program' };
const origin = 'https://example.test/api/public/v1/scholarships/';
const script = 'export default {fetch(){return new Response("local")}}';
type Handler = typeof handlePublicScholarships;
const pinned = (path: string) => execFileSync('git', ['show', base + ':' + path], { encoding: 'utf8' });
const baseline = async (): Promise<Handler> => {
  await mkdir('.cache/phase2', { recursive: true });
  const output = resolve('.cache/phase2/phase1.mjs');
  await build({ stdin: { contents: pinned('cloudflare/worker/src/scholarships.ts'),
    resolveDir: resolve('cloudflare/worker/src'), loader: 'ts' }, bundle: true, format: 'esm',
    platform: 'node', outfile: output, logLevel: 'silent', plugins: [{ name: 'pinned-phase1-cache', setup(build) {
      build.onLoad({ filter: /scholarship-facet-cache\.ts$/ }, () => ({
        contents: pinned('cloudflare/worker/src/scholarship-facet-cache.ts'), loader: 'ts',
      }));
    } }] });
  return (await import(pathToFileURL(output).href)).handlePublicScholarships;
};
const request = async (handler: Handler, measured: ReturnType<typeof meter>, suffix: string) => {
  const url = new URL(origin + suffix);
  return handler(new Request(url), url, { DB: measured.DB } as never) as Promise<any>;
};
const timed = async (handler: Handler, measured: ReturnType<typeof meter>, suffixes: string[]) => {
  measured.reset();
  const values = await Promise.all(suffixes.map(suffix => request(handler, measured, suffix)));
  assert.equal(measured.cost.rowsWritten, 0);
  return { values, cost: measured.cost };
};

test('Phase 2 vs pinned Phase 1: real local D1 costs, concurrency, golden filters and isolated precompute experiment',
  { timeout: 900_000 }, async t => {
    const phase1 = await baseline();
    const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-07-29',
      d1Databases: ['SMALL', 'MEDIUM', 'PRODUCTION_SIZE', 'LARGE', 'HIGH', 'ALL_HIGH'] });
    t.after(() => mf.dispose());
    const measurements: Record<string, unknown> = {};
    for (const [binding, size, classes] of [['SMALL', 13, 2], ['MEDIUM', 128, 16], ['PRODUCTION_SIZE', 1060, 250],
      ['LARGE', 10000, 250], ['HIGH', 1060, 1060], ['ALL_HIGH', 1024, 1024]] as const) {
      const db = await mf.getD1Database(binding); await seed(db, size, classes, 'Class', binding === 'ALL_HIGH');
      const before = meter(db), after = meter(db);
      const scenarios: Record<string, { phase1: Cost; phase2: Cost }> = {};
      const compare = async (name: string, suffixes: string[]) => {
        const a = await timed(phase1, before, suffixes), b = await timed(handlePublicScholarships, after, suffixes);
        assert.deepEqual(b.values, a.values, binding + '/' + name);
        scenarios[name] = { phase1: a.cost, phase2: b.cost };
        return b;
      };
      await compare('cold', ['synthetic/facets?facetLimit=200']);
      const coldQueries = [...after.queries];
      assert.ok(scenarios.cold.phase2.rowsRead <= scenarios.cold.phase1.rowsRead * 1.03,
        'bounded probe must stay within the high-cardinality regression budget');
      await compare('warm', ['synthetic/facets?facetLimit=200']);
      assert.deepEqual(scenarios.warm.phase2, { sql: 2, rowsRead: 4, rowsWritten: 0 });
      await compare('continuation', ['synthetic/facets?facetLimit=200&facetPage=2']);
      await compare('recipient-after-facets', ['synthetic/recipients?limit=20']);
      assert.equal(after.queries.some(sql => sql.startsWith('SELECT COUNT(*)')), false,
        'recipient page reuses the exact facet total, with independent before/after gates');
      const coldRecipientBefore = meter(db), coldRecipientAfter = meter(db);
      const ca = await timed(phase1, coldRecipientBefore, ['synthetic/recipients?limit=20']);
      const cb = await timed(handlePublicScholarships, coldRecipientAfter, ['synthetic/recipients?limit=20']);
      assert.deepEqual(cb.values, ca.values);
      scenarios['cold-recipient'] = { phase1: ca.cost, phase2: cb.cost };
      const wa = await timed(phase1, coldRecipientBefore, ['synthetic/recipients?limit=20']);
      const wb = await timed(handlePublicScholarships, coldRecipientAfter, ['synthetic/recipients?limit=20']);
      assert.deepEqual(wb.values, wa.values);
      scenarios['warm-recipient'] = { phase1: wa.cost, phase2: wb.cost };
      await compare('self-excluding-reuse', ['synthetic/facets?major=' + encodeURIComponent('Ngành 1') + '&facetLimit=200']);
      assert.equal(after.queries.filter(sql => /SELECT DISTINCT r.major AS value/.test(sql)).length, 0);
      // Fresh wrappers => fresh binding-scoped caches, with identical underlying D1.
      const concurrentBefore = meter(db), concurrentAfter = meter(db);
      const suffixes = Array(8).fill('synthetic/facets?facetLimit=200');
      const a = await timed(phase1, concurrentBefore, suffixes);
      const b = await timed(handlePublicScholarships, concurrentAfter, suffixes);
      assert.deepEqual(b.values, a.values);
      assert.ok(b.cost.rowsRead < a.cost.rowsRead);
      assert.equal(b.cost.sql, 8 * 2 + 7, 'eight gate pairs, one count, six facet queries');
      scenarios['concurrent-same-key-8'] = { phase1: a.cost, phase2: b.cost };
      const different = Array.from({ length: 8 }, (_, i) => 'synthetic/facets?className=Class' + i);
      await compare('concurrent-different-key-8', different);
      // Every dimension high-cardinality in the request-key space; no unbounded cache growth.
      const scopes = binding === 'PRODUCTION_SIZE' || binding === 'ALL_HIGH' ? 40 : 8;
      for (let i = 0; i < scopes; i++) await request(handlePublicScholarships, after, 'synthetic/facets?className=missing' + i);
      const stats = scholarshipFacetCache(after.DB as never).stats();
      assert.ok(stats.entries <= 224 && stats.characters <= 1_000_000);
      assert.equal(stats.pending, 0); assert.equal(stats.pendingCharacters, 0);
      measurements[binding] = { size, classes, scenarios, cache: stats,
        concurrencyCache: scholarshipFacetCache(concurrentAfter.DB as never).stats() };
      console.log('PHASE2_COST=' + JSON.stringify({ binding, scenarios }));
      if (binding === 'PRODUCTION_SIZE') {
        assert.ok(scenarios.cold.phase2.rowsRead < scenarios.cold.phase1.rowsRead * .65);
        const plans = [];
        for (const sql of coldQueries.filter(sql => sql.startsWith('WITH RECURSIVE'))) {
          const args = Array.from({ length: 3 }, () => ['synthetic', '1'.repeat(64), 3]).flat();
          const plan = await db.prepare('EXPLAIN QUERY PLAN ' + sql).bind(...args, 200, 0).all<{detail: string}>();
          assert.ok(plan.results.some(row => /COVERING INDEX/.test(row.detail)));
          plans.push({ sql, plan: plan.results });
        }
        measurements.queryPlans = plans;
        const values = ['Type1', 'Rank1', 'Ngành 1', 'Class1', 'K1', 'Program1'];
        for (let mask = 0; mask < 64; mask++) {
          const params = new URLSearchParams();
          Object.keys(columns).forEach((key, i) => { if (mask & (1 << i)) params.set(key, values[i]); });
          const suffix = 'synthetic/facets?' + params;
          assert.deepEqual(await request(handlePublicScholarships, after, suffix), await request(phase1, before, suffix));
          if (mask % 16 === 15) console.log('PHASE2_GOLDEN_MASKS=' + (mask + 1));
        }
        for (const q of ['ĐẠT', 'Nguyễn', '0000000000', '000000000010', '%_', '\\%', 'no match']) {
          for (const route of ['facets?facetPage=2&facetLimit=7&', 'search?page=2&limit=7&']) {
            const suffix = 'synthetic/' + route + new URLSearchParams({ q });
            assert.deepEqual(await request(handlePublicScholarships, after, suffix), await request(phase1, before, suffix));
          }
        }
        for (const query of ['facetPage=2000&facetLimit=200', 'facetLimit=1', 'facetPage=2&facetLimit=1',
          'awardType=Award1', 'className=missing']) {
          assert.deepEqual(await request(handlePublicScholarships, after, 'synthetic/facets?' + query),
            await request(phase1, before, 'synthetic/facets?' + query));
        }
        // LOCAL ONLY: normalized materialized-label design. This is a lower-bound
        // unfiltered read experiment, not a publishable migration or filtered API.
        await db.prepare(`CREATE TABLE phase2_precompute(facet TEXT,value TEXT,PRIMARY KEY(facet,value))`).run();
        let buildCost: Cost = { sql: 0, rowsRead: 0, rowsWritten: 0 };
        for (const [key, column] of Object.entries(columns)) {
          const built = await db.prepare(`INSERT INTO phase2_precompute SELECT ?,${column}
            FROM scholarship_snapshot_rows WHERE batch_id=? AND ${column} IS NOT NULL AND ${column}<>'' GROUP BY ${column}`)
            .bind(key, '1'.repeat(64)).run();
          buildCost.sql++; buildCost.rowsRead += built.meta.rows_read; buildCost.rowsWritten += built.meta.rows_written;
        }
        let readCost: Cost = { sql: 0, rowsRead: 0, rowsWritten: 0 };
        const golden = await request(phase1, before, 'synthetic/facets?facetLimit=200');
        for (const key of Object.keys(columns)) {
          const result = await db.prepare(`WITH facet_values AS MATERIALIZED (
            SELECT value FROM phase2_precompute WHERE facet=?)
            SELECT (SELECT COUNT(*) FROM facet_values) AS total,
              (SELECT json_group_array(value) FROM (SELECT value FROM facet_values ORDER BY value COLLATE BINARY LIMIT 200)) AS optionsJson`)
            .bind(key).all<any>();
          readCost.sql++; readCost.rowsRead += result.meta.rows_read;
          assert.equal(result.results[0].total, golden.facets[key].total);
          assert.deepEqual(JSON.parse(result.results[0].optionsJson), golden.facets[key].options);
        }
        await db.prepare('CREATE TABLE phase2_precompute_total(id INTEGER PRIMARY KEY,total INTEGER)').run();
        const builtCount = await db.prepare(`INSERT INTO phase2_precompute_total
          SELECT 1,COUNT(*) FROM scholarship_snapshot_rows WHERE batch_id=?`).bind('1'.repeat(64)).run();
        buildCost.sql++; buildCost.rowsRead += builtCount.meta.rows_read; buildCost.rowsWritten += builtCount.meta.rows_written;
        const count = await db.prepare('SELECT total FROM phase2_precompute_total WHERE id=1').all();
        assert.equal(count.results[0].total, golden.totalRecipients);
        readCost.sql++; readCost.rowsRead += count.meta.rows_read;
        const gateSql = before.queries.find(sql => sql.includes('c.slug=? LIMIT 1'))!;
        for (let i = 0; i < 2; i++) {
          const gate = await db.prepare(gateSql).bind('synthetic').all();
          readCost.sql++; readCost.rowsRead += gate.meta.rows_read;
        }
        measurements.precomputeExperiment = { buildCost, unfilteredRequestReadLowerBound: readCost,
          excludes: 'policy/revision storage, publication-time validation and filtered scopes; extra safety metadata can add cost',
          decision: 'design only; not needed for measured no-migration improvement; do not ship this experimental table' };
      }
    }
    const versions = Object.fromEntries(await Promise.all(['miniflare', 'wrangler', 'esbuild'].map(async name =>
      [name, JSON.parse(await readFile(resolve('node_modules', name, 'package.json'), 'utf8')).version])));
    await writeFile('.cache/phase2/benchmark.json', JSON.stringify({ base, runtime: process.version,
      versions, compatibilityDate: '2026-07-29', localOnly: true, measurements }, null, 2));
  });

test('single-flight rejection cleanup, independent copies, expiry and bounded active keys', async () => {
  const cache = new ScholarshipFacetCache();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  const compute = async () => { reads++; await gate; return { options: ['Approved'] }; };
  const calls = Array.from({ length: 8 }, () => cache.coalesce('same', compute));
  release(); const results = await Promise.all(calls);
  assert.equal(reads, 1); results[0].options[0] = 'mutated';
  assert.equal(results[1].options[0], 'Approved'); assert.equal(cache.stats().joined, 7);
  await assert.rejects(cache.coalesce('failure', async () => { throw Error('synthetic'); }));
  assert.equal(cache.stats().pending, 0);
  assert.equal(await cache.coalesce('failure', async () => 7), 7);
  let unlock!: () => void;
  const pending = new Promise<void>(resolve => { unlock = resolve; });
  const active = Array.from({ length: 40 }, (_, i) => cache.coalesce('scope' + i, async () => { await pending; return i; }));
  assert.equal(cache.stats().pending, 32); unlock(); await Promise.all(active);
  assert.equal(cache.stats().pendingCharacters, 0);
  const value = { totalRecipients: 1, facets: {} };
  for (let i = 0; i < 225; i++) cache.put('entry' + i, value, 0);
  assert.equal(cache.stats().entries, 224); assert.equal(cache.get('entry0', 1), undefined);
  cache.put('entry39', value, 29_000); assert.equal(cache.get('entry39', 30_000), undefined, 'no sliding TTL');
  cache.put('expired', value, 0); cache.put('expired', value, 30_001);
  assert.equal(cache.get('expired', 30_002)!.totalRecipients, 1, 'expired replacement starts a fresh bounded lifetime');
  const pages = { totalRecipients: 0, facets: { major: { total: 2, pages: { '1:1': ['A'] } } } };
  cache.put('pages', pages, 0);
  cache.put('pages', { totalRecipients: 0, facets: { major: { total: 2, pages: { '1:2': ['B'] } } } }, 1);
  assert.deepEqual(cache.get('pages', 2)!.facets.major.pages, { '1:1': ['A'], '1:2': ['B'] });
  for (let i = 0; i < 8; i++) cache.put('large' + i, { totalRecipients: 0,
    facets: { major: { total: 1, pages: { '1:1': ['x'.repeat(200_000)] } } } }, 0);
  assert.ok(cache.stats().characters <= 1_000_000); assert.equal(cache.get('large0', 1), undefined);
});

test('bounded seeks preserve SQLite BINARY Unicode ordering, null/empty semantics and probe boundaries', async t => {
  const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  t.after(() => mf.dispose()); const db = await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE labels(value TEXT)').run();
  await db.prepare('CREATE INDEX labels_value_idx ON labels(value)').run();
  const labels = ['é', 'e\u0301', 'Đại học', '\uE000', '\u{10000}', 'A', 'a', ...Array.from({ length: 10 }, (_, i) => 'Label' + i)];
  for (const count of [0, 7, 15, 16, 17]) {
    await db.prepare('DELETE FROM labels').run();
    await db.batch([...labels.slice(0, count), ...labels.slice(0, count), '', null].map(value =>
      db.prepare('INSERT INTO labels(value) VALUES(?)').bind(value)));
    for (const page of [1, 2, 2000]) {
      const from = 'FROM labels r WHERE 1=1';
      const a = await db.prepare(scholarshipFacetQuery(from, 'value', false)).bind(7, (page - 1) * 7).all();
      const b = await db.prepare(scholarshipFacetQuery(from, 'value', true)).bind(7, (page - 1) * 7).all();
      assert.deepEqual(b.results, a.results, 'distinct labels ' + count + ', page ' + page);
      assert.equal(b.meta.rows_written, 0);
    }
  }
});

test('every single-flight waiter rechecks publication; cached counts fence recipient pages and policy races', async t => {
  const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB'); await seed(db, 1060, 250);
  const measured = meter(db);
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { entered = resolve; });
  let paused = false;
  measured.intercept(async sql => {
    if (!paused && sql.includes('facet_values AS MATERIALIZED')) { paused = true; entered(); await wait; }
  });
  const concurrent = Promise.allSettled(Array.from({ length: 4 }, () => request(handlePublicScholarships, measured, 'synthetic/facets')));
  await ready;
  await db.prepare("UPDATE scholarship_campaigns SET status='validated',public_data_approved=0").run();
  release();
  for (const result of await concurrent) {
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.equal(result.reason.status, 404);
  }
  assert.equal(scholarshipFacetCache(measured.DB as never).stats().entries, 0, 'no result stored before a successful fence');
  assert.equal(scholarshipFacetCache(measured.DB as never).stats().pending, 0);
  measured.intercept();
  await db.prepare("UPDATE scholarship_campaigns SET status='published',public_data_approved=1").run();
  await request(handlePublicScholarships, measured, 'synthetic/facets');
  // Scope identity includes policy/checksum text even when revision is unchanged.
  for (const [column, value] of [['source_sha256', 'b'.repeat(64)],
    ['approval_document_json', '{"title":"Changed approval","reference":"SYNTHETIC","url":null}']] as const) {
    await db.prepare(`UPDATE scholarship_import_batches SET ${column}=?`).bind(value).run();
    measured.reset();
    const fresh = await request(handlePublicScholarships, measured, 'synthetic/facets');
    assert.ok(measured.cost.sql > 2, column + ' must invalidate aggregate hits without a revision bump');
    assert.equal(fresh.totalRecipients, 1060);
  }
  let gates = 0;
  measured.intercept(async sql => {
    if (sql.includes('c.slug=? LIMIT 1') && ++gates === 2)
      await db.prepare('UPDATE scholarship_import_batches SET mapping_json=?').bind('{}').run();
  });
  await assert.rejects(request(handlePublicScholarships, measured, 'synthetic/recipients'), { status: 409 });
  assert.equal(gates, 2);
});

test('single-flight executes inside independent workerd request contexts with real D1 bindings', async t => {
  const bundle = await build({ stdin: { contents: `
    import {handlePublicScholarships} from './scholarships.ts';
    import {scholarshipFacetCache} from './scholarship-facet-cache.ts';
    const wrappers=new WeakMap();
    const delayed=db=>{
      if(wrappers.has(db))return wrappers.get(db);
      const binding={prepare(sql){
        const wrap=statement=>({bind(...args){return wrap(statement.bind(...args))},
          async first(){
            if(sql.startsWith('SELECT COUNT(*)'))await new Promise(resolve=>setTimeout(resolve,100));
            return statement.first();
          },all(){return statement.all()}});
        return wrap(db.prepare(sql));
      }};
      wrappers.set(db,binding);return binding;
    };
    export default {async fetch(request,env){try {
      const DB=delayed(env.DB);
      const result=await handlePublicScholarships(request,new URL(request.url),{...env,DB});
      return Response.json({result,stats:scholarshipFacetCache(DB).stats()});
    } catch(error){return Response.json({error:String(error)},{status:500})}}};`,
    resolveDir: resolve('cloudflare/worker/src'), loader: 'ts' }, bundle: true, write: false,
    format: 'esm', platform: 'browser', external: ['cloudflare:*'], logLevel: 'silent' });
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  t.after(() => mf.dispose()); await seed(await mf.getD1Database('DB'), 1060, 250);
  const results = await Promise.all(Array.from({ length: 8 }, () => mf.dispatchFetch(origin + 'synthetic/facets')));
  const bodies = await Promise.all(results.map(async result => { assert.equal(result.status, 200); return result.json(); }));
  bodies.forEach((body: any) => assert.deepEqual(body.result, (bodies[0] as any).result));
  console.log('PHASE2_WORKERD_CACHE=' + JSON.stringify(bodies.map((body: any) => body.stats)));
  assert.ok(bodies.some((body: any) => body.stats.joined > 0), 'real request contexts actually joined in-flight reads');
});

test('a failed facet drains other shared D1 work before its initiating request exits', async t => {
  const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  t.after(() => mf.dispose()); const db = await mf.getD1Database('DB'); await seed(db, 13, 2);
  const measured = meter(db);
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { entered = resolve; });
  measured.intercept(async sql => {
    if (sql.includes('SELECT DISTINCT r.major AS value')) throw Error('synthetic D1 failure');
    if (sql.includes('SELECT DISTINCT r.class_name AS value')) { entered(); await wait; }
  });
  let finished = false;
  const calls = Promise.allSettled(Array.from({ length: 3 }, () => request(handlePublicScholarships, measured, 'synthetic/facets')))
    .then(results => { finished = true; return results; });
  await ready; await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(finished, false, 'leader must remain alive while shared class query is pending');
  release(); for (const result of await calls) assert.equal(result.status, 'rejected');
  const cache = scholarshipFacetCache(measured.DB as never);
  assert.equal(cache.stats().entries, 0); assert.equal(cache.stats().pending, 0);
  measured.intercept();
  assert.equal((await request(handlePublicScholarships, measured, 'synthetic/facets')).totalRecipients, 13);
});
