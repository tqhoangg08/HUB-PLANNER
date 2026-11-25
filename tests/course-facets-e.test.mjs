import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCourses } from '../cloudflare/worker/src/courses.ts';

const defaultRows = [{ facet_0: '[["a",1],["A",1]]', facet_1: '[["K1",1]]',
  facet_2: '[["subject","G_N1,2",1]]', facet_3: '[["P1",1]]' }];

function database(execute = () => ({ results: defaultRows }), { available = true } = {}) {
  const calls = [];
  const db = {
    prepare(sql) {
      const query = {
        sql, bindings: [],
        bind(...bindings) { return { ...query, bindings }; },
        first() { calls.push({ sql, probe: true }); return available ? { semester: 'HK2_2026_2027' } : null; },
        all() { calls.push(this); return execute(this); },
      };
      return query;
    },
    batch(queries) { calls.push({ queries }); return [{ results: [{ major: 'a' }, { major: 'A' }] }, { results: [] }, { results: [] }, { results: [] }]; },
  };
  return { db, calls };
}

function filter(count = 0) {
  const url = new URL('https://local.invalid/courses?resource=filter-options&semester=HK2_2026_2027&phase=1');
  for (const name of ['major', 'cohort', 'academicProgram'])
    for (let i = 0; i < count; i++) url.searchParams.append(name, name + i);
  return url;
}

test('E-S and E-M use identical scopes only, keep the complete inline gate and retain comparator ties', async () => {
  const url = filter();
  const separate = database();
  const result = await handleCourses(url, { DB: separate.db });
  assert.deepEqual(result.payload, {
    success: true, majorOptions: ['a', 'A'], cohortOptions: ['K1'],
    subjectNameOptions: ['subject'], groupNameOptions: ['G_N1', 'G_N2'], academicProgramOptions: ['P1'],
  });
  assert.equal(separate.calls.length, 2);
  assert.match(separate.calls[0].sql, /l\.actor_scope = NULL/);
  assert.match(separate.calls[1].sql, /gate AS MATERIALIZED/);
  assert.match(separate.calls[1].sql, /p\.verification_sha256=r\.verification_sha256/);
  assert.match(separate.calls[1].sql, /IS r\.import_ledger_json/);
  assert.equal((separate.calls[1].sql.match(/MIN\(first_source_position\)/g) || []).length, 4);
  assert.doesNotMatch(separate.calls[1].sql, /scope_\d+ AS MATERIALIZED/);
  assert.deepEqual(separate.calls[1].bindings, ['HK2_2026_2027', '1']);

  url.searchParams.append('major', 'a');
  const materialized = database();
  assert.deepEqual(await handleCourses(url, { DB: materialized.db }), result);
  assert.equal(materialized.calls.length, 2);
  assert.equal((materialized.calls[1].sql.match(/scope_\d+ AS MATERIALIZED/g) || []).length, 1);

  const missing = database(undefined, { available: false });
  await handleCourses(filter(), { DB: missing.db });
  assert.doesNotMatch(missing.calls[1].sql, /hk2_catalogue_publications|SELECT is_open/);
  assert.match(missing.calls[1].sql, /semester IS NOT 'HK2_2026_2027' OR is_user_added=1/);
});

test('E switches from numbered bindings to json_each only when necessary', async () => {
  for (const count of [12, 25, 28, 34, 72]) {
    const fixture = database();
    assert.equal((await handleCourses(filter(count), { DB: fixture.db })).status, 200);
    assert.equal(fixture.calls.length, 2);
    const query = fixture.calls[1];
    assert.equal(query.bindings.length, count <= 28 ? count * 3 + 2 : 5);
    assert.equal(query.sql.includes('SELECT +value FROM json_each'), count > 28);
  }
});

test('E retries a native result-size failure once as ordered aggregate rows without changing payload', async () => {
  const base = database();
  const expected = await handleCourses(filter(), { DB: base.db });
  const fixture = database(query => {
    if (!query.sql.includes('UNION ALL')) {
      throw new Error('D1_ERROR: string or blob too big: SQLITE_TOOBIG');
    }
    assert.equal(query.sql.split(' UNION ALL ').length, 4);
    assert.match(query.sql, /ORDER BY f, n$/);
    return { results: [
      { f: 0, k1: 'a' }, { f: 0, k1: 'A' }, { f: 1, k1: 'K1' },
      { f: 2, k1: 'subject', k2: 'G_N1,2' }, { f: 3, k1: 'P1' },
    ] };
  });
  assert.deepEqual(await handleCourses(filter(), { DB: fixture.db }), expected);
  assert.equal(fixture.calls.length, 3);
});

test('E does not retry unrelated D1 errors or an identical failed statement', async () => {
  for (const reason of ['D1_ERROR: Network connection lost.',
    "D1_ERROR: Your account has exceeded D1's free tier daily row read limit",
    'D1_ERROR: unrelated result says value too large']) {
    const fixture = database(() => { throw Error(reason); });
    await assert.rejects(handleCourses(filter(), { DB: fixture.db }), { message: reason });
    assert.equal(fixture.calls.length, 2);
  }
  const error = new Error('D1_ERROR: statement too long: SQLITE_TOOBIG');
  const fixture = database(() => { throw error; });
  assert.equal((await handleCourses(filter(), { DB: fixture.db })).status, 200);
  assert.equal(fixture.calls.length, 3);
  assert.equal(fixture.calls[2].queries.length, 4);
  const oversized = database(() => { throw error; });
  await assert.rejects(handleCourses(filter(34), { DB: oversized.db }), error);
  assert.equal(oversized.calls.length, 2); // JSON failed; baseline also exceeds the bind budget.
});
