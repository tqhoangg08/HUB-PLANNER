import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { forecastOwnImportedRanking } from '../cloudflare/worker/src/rankings.ts';
import { addExperimentalIndexes, buildExperimentalPrefix, input, loadProductionRanking,
  meterRanking, productionBase, seedRankings, semester, withExperimentalPrefix } from './fixtures/rankings-performance.ts';

const script = 'export default {fetch(){return new Response("local ranking fixtures only")}}';

test('Phase 3: pinned production golden API and real local D1 costs at 1k/10k/50k',
  { timeout: 900_000 }, async t => {
    const baseline = await loadProductionRanking();
    const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-07-29',
      d1Databases: ['SMALL', 'MEDIUM', 'PRODUCTION_COUNT', 'LARGE'] });
    t.after(() => mf.dispose());
    const measurements: Record<string, unknown> = { productionBase, runtime: 'Miniflare/D1 local, synthetic fixtures only' };
    for (const [binding, size] of [['SMALL', 1000], ['MEDIUM', 10000], ['PRODUCTION_COUNT', 10478], ['LARGE', 50000]] as const) {
      const db = await mf.getD1Database(binding); await seedRankings(db, size);
      const before = meterRanking(db), after = meterRanking(db);
      const cases: Record<string, unknown> = {};
      const run = async (name: string, users: string[], tuples = users.map(() => input)) => {
        before.reset(); after.reset();
        const a = await Promise.all(users.map((u, i) => baseline({ DB: before.DB }, u, tuples[i])));
        const b = await Promise.all(users.map((u, i) => forecastOwnImportedRanking({ DB: after.DB } as never, u, tuples[i])));
        assert.deepEqual(b, a, binding + '/' + name);
        cases[name] = { baseline: before.cost, optimized: after.cost };
        return { baseline: before.cost, optimized: after.cost };
      };
      const cold = await run('cold', ['alice']);
      assert.ok(cold.optimized.rowsRead <= cold.baseline.rowsRead * .34, 'three populated scopes must remove two scans');
      assert.equal(cold.baseline.sql, 5); assert.equal(cold.optimized.sql, 4);
      assert.equal(after.queries.filter(q => q.sql.includes('FROM semester_exact_rankings')).length, 1);
      const queries = after.queries;
      const baselinePlans = await Promise.all(before.queries.map(async q => ({ ...q,
        plan: (await db.prepare('EXPLAIN QUERY PLAN ' + q.sql).bind(...q.args).all()).results })));
      const plans = await Promise.all(queries.map(async q => ({ ...q,
        plan: (await db.prepare('EXPLAIN QUERY PLAN ' + q.sql).bind(...q.args).all()).results })));
      await run('warm', ['alice']);
      await run('concurrent-same-input-8', Array(8).fill('alice'));
      await run('concurrent-different-users-8', ['alice', 'bob', 'unknown', 'empty', 'no-profile', 'unicode', 'alice', 'bob']);
      await run('school-only', ['empty']);
      await run('school-class-only', ['class-only']);
      await run('school-major-only', ['major-only']);
      await run('nonmatching-scopes', ['unknown']);
      await run('incomplete-input', ['alice'], [{ ...input, gpa: null }]);
      const tuples = [input, { ...input, gpa: 0 }, { ...input, gpa: 4.5 },
        { ...input, semester: 'other-semester' },
        { ...input, gpa: 3.5 + Number.EPSILON * 2 }, { ...input, gpa: 3.5 - Number.EPSILON * 2 },
        { ...input, trainingScore: 90.00000001 }, { ...input, credits: 18.00000001 },
        { ...input, gpa: null }, { ...input, trainingScore: null }, { ...input, credits: null },
        { ...input, credits: 0 }];
      const goldenUsers = size === 1000 ? ['alice', 'bob', 'unknown', 'empty', 'no-profile', 'unicode'] : ['alice', 'unknown'];
      for (const user of goldenUsers) {
        for (const tuple of tuples) {
          assert.deepEqual(await forecastOwnImportedRanking({ DB: after.DB } as never, user, tuple),
            await baseline({ DB: before.DB }, user, tuple), binding + '/golden/' + user + '/' + JSON.stringify(tuple));
        }
      }
      // Index-only candidate: execute the exact pinned production code against
      // the same database after adding three experiment-only covering indexes.
      await addExperimentalIndexes(db);
      before.reset(); const indexed = await baseline({ DB: before.DB }, 'alice', input);
      assert.deepEqual(indexed, await forecastOwnImportedRanking({ DB: after.DB } as never, 'alice', input));
      const indexOnly = { cost: before.cost, queries: await Promise.all(before.queries.map(async q => ({ ...q,
        plan: (await db.prepare('EXPLAIN QUERY PLAN ' + q.sql).bind(...q.args).all()).results }))) };
      assert.ok(indexOnly.queries.filter(q => q.sql.includes('FROM semester_exact_rankings'))
        .every(q => q.plan.some(p => /COVERING INDEX/.test(String(p.detail)))));
      const precomputeBuildCost = await buildExperimentalPrefix(db);
      const prototype = meterRanking(db), prefixDB = withExperimentalPrefix(prototype.DB);
      const precomputed = await baseline({ DB: prefixDB }, 'alice', input);
      assert.deepEqual(precomputed, indexed);
      const precompute = { build: precomputeBuildCost, request: prototype.cost };
      for (const tuple of tuples.filter(x => x.gpa !== null && x.trainingScore !== null && x.credits !== null && x.credits > 0)) {
        for (const user of goldenUsers)
          assert.deepEqual(await baseline({ DB: prefixDB }, user, tuple), await baseline({ DB: before.DB }, user, tuple));
      }
      measurements[binding] = { size, cases, baselinePlans, plans, indexOnly, precompute,
        goldenCases: goldenUsers.length * tuples.length, cache: 'NONE; every request performs fresh readiness/profile reads, no private cross-request state' };
      console.log('RANKINGS_PHASE3_COST=' + JSON.stringify({ size, cases, indexOnly: indexOnly.cost, precompute }));
      await writeFile('.cache/rankings-phase3/benchmark.json', JSON.stringify(measurements, null, 2));
    }
    await mkdir('.cache/rankings-phase3', { recursive: true });
    await writeFile('.cache/rankings-phase3/benchmark.json', JSON.stringify(measurements, null, 2));
  });

test('dataset readiness, count/revision races and cross-user profile changes fail closed or stay fresh',
  { timeout: 120_000 }, async t => {
    const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
    t.after(() => mf.dispose()); const db = await mf.getD1Database('DB'); await seedRankings(db, 1000);
    const request = (DB: unknown = db) => forecastOwnImportedRanking({ DB } as never, 'alice', input);
    for (const change of ["status='importing'", "source_sha256='source-v2'", "imported_at='2026-10-20'", 'total_students=999']) {
      const tracked = meterRanking(db); let changed = false;
      tracked.intercept(async sql => { if (!changed && sql.includes('FROM semester_exact_rankings')) {
        changed = true; await db.prepare('UPDATE semester_exact_ranking_datasets SET ' + change).run();
      } });
      await assert.rejects(() => request(tracked.DB), e => e instanceof Error && /nhất quán/.test(e.message));
      await db.prepare("UPDATE semester_exact_ranking_datasets SET status='ready',source_sha256='source-v1',imported_at='2026-10-19',total_students=1000").run();
    }
    await db.prepare("UPDATE semester_exact_ranking_datasets SET status='importing'").run();
    await assert.rejects(() => request(), /khởi tạo/);
    await db.prepare("UPDATE semester_exact_ranking_datasets SET status='ready'").run();
    const a = await request();
    await db.prepare("UPDATE user_profiles SET class_name='Lớp 2' WHERE user_id='alice'").run();
    const b = await request(); assert.notEqual(a.data.classCode, b.data.classCode);
    assert.equal(b.data.classCode, 'Lớp 2'); assert.equal(b.data.major, 'Ngành 1');
    await assert.rejects(() => forecastOwnImportedRanking({ DB: db }, 'alice', { ...input, semester: 'not-ready' }), /khởi tạo/);
    await db.prepare('DELETE FROM semester_exact_rankings WHERE rank=1').run();
    await assert.rejects(() => request(), /nhất quán/);
    // An independent binding with the same semester must never reuse results.
    const other = new Miniflare({ modules: true, script, compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
    t.after(() => other.dispose()); const otherDb = await other.getD1Database('DB'); await seedRankings(otherDb, 10);
    assert.equal((await request(otherDb)).data.totalStudents, 10);
  });
