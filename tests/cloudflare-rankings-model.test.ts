import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  RankingError,
  buildRankingScoreKey,
  forecastBenchmarkRankings,
  forecastOwnImportedRanking,
  listRankingSemesters,
  parseRankingForecastInput,
  readOwnBenchmarkRanking,
  readRankingForecastBody,
  readImportedBenchmarkBody,
} from '../cloudflare/worker/src/rankings.ts';

const USER_ID = 'd9428888-122b-4f0f-b88f-1c8f4f762b22';

test('ranking forecast input is bounded and deduplicates semesters', async () => {
  assert.equal(
    Number.isSafeInteger(buildRankingScoreKey(4.5, 100, 300)),
    true
  );
  assert.deepEqual(
    parseRankingForecastInput({
      semesters: ['2025-2026_HK1', '2025-2026_HK1'],
      gpa: 3.5,
      credits: 18,
      trainingScore: 90,
      major: 'Công nghệ thông tin',
    }),
    {
      semesters: ['2025-2026_HK1'],
      gpa: 3.5,
      credits: 18,
      trainingScore: 90,
      major: 'Công nghệ thông tin',
    }
  );

  assert.throws(
    () =>
      parseRankingForecastInput({
        semester: '../invalid',
        gpa: 3.5,
        credits: 18,
        trainingScore: 90,
      }),
    RankingError
  );
  assert.throws(
    () =>
      parseRankingForecastInput({
        semester: '2025-2026_HK1',
        gpa: 99,
        credits: 18,
        trainingScore: 90,
      }),
    RankingError
  );

  await assert.rejects(
    () =>
      readRankingForecastBody(
        new Request('https://example.test/api/public/v1/rankings/forecast', {
          method: 'POST',
          body: JSON.stringify({ padding: 'x'.repeat(5_000) }),
        })
      ),
    (error: unknown) =>
      error instanceof RankingError && error.status === 413
  );
});

test('ranking forecasts use aggregate school and major buckets only', async () => {
  const statements: string[] = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      let values: unknown[] = [];
      const statement = {
        bind(...nextValues: unknown[]) {
          values = nextValues;
          return statement;
        },
        async first() {
          if (sql.includes('benchmark_ranking_scopes')) {
            return values[1] === 'major'
              ? { total_students: 20, comparable_students: 20 }
              : { total_students: 100, comparable_students: 100 };
          }
          if (sql.includes('benchmark_ranking_buckets')) {
            return { rank_value: values[1] === 'major' ? 3 : 12 };
          }
          return null;
        },
      };
      return statement;
    },
  };

  const result = await forecastBenchmarkRankings(
    { DB: db } as never,
    {
      semesters: ['2025-2026_HK1'],
      gpa: 3.5,
      credits: 18,
      trainingScore: 90,
      major: 'Công nghệ thông tin',
    }
  );

  assert.deepEqual(result.data, [
    {
      semester: '2025-2026_HK1',
      rank: 12,
      totalStudents: 100,
      rankInMajor: 3,
      totalInMajor: 20,
      major: 'Công nghệ thông tin',
    },
  ]);
  assert.equal(
    statements.every((sql) => !sql.includes('student_code')),
    true
  );
});

test('private ranking response is keyed by owner but never exposes user id', async () => {
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...nextValues: unknown[]) {
          values = nextValues;
          return statement;
        },
        async first() {
          if (sql.includes('benchmark_ranking_semesters')) {
            return { semester: values[0] };
          }
          assert.deepEqual(values, [USER_ID, '2025-2026_HK1']);
          return {
            student_rank: 9,
            total_students: 100,
            rank_in_class: 2,
            total_in_class: 30,
            class_code: 'K27CNTT1',
            rank_in_major: 4,
            total_in_major: 50,
            major: 'Công nghệ thông tin',
          };
        },
      };
      return statement;
    },
  };

  const result = await readOwnBenchmarkRanking(
    { DB: db } as never,
    USER_ID,
    '2025-2026_HK1'
  );

  assert.equal(result.data?.studentRank, 9);
  assert.equal(JSON.stringify(result).includes(USER_ID), false);
});

test('ranking semester list fails closed before seed', async () => {
  const db = {
    prepare() {
      return {
        async all() {
          return { results: [] };
        },
      };
    },
  };

  await assert.rejects(
    () => listRankingSemesters({ DB: db } as never),
    (error: unknown) =>
      error instanceof RankingError && error.status === 503
  );
});

test('semester metadata treats imported HK2 as forecast and leaves legacy semesters unchanged', async () => {
  const db = { prepare() { return { async all() { return { results: [
    { semester: '2025-2026_HK2', total_students: 10478, ranking_mode: 'forecast', ranking_source: 'imported' },
    { semester: '2025-2026_HK1', total_students: 100, ranking_mode: 'forecast', ranking_source: 'legacy' },
  ] }; } }; } };
  const result = await listRankingSemesters({ DB: db } as never);
  assert.deepEqual(result.data, [
    { semester: '2025-2026_HK2', totalStudents: 10478, rankingMode: 'forecast', rankingSource: 'imported' },
    { semester: '2025-2026_HK1', totalStudents: 100, rankingMode: 'forecast', rankingSource: 'legacy' },
  ]);
});

test('ready exact semester cannot enter public forecast calculation', async () => {
  let touchedForecast = false;
  const db = { prepare(sql: string) { return {
    bind() { return this; },
    async first() {
      if (sql.includes('semester_exact_ranking_datasets')) return { semester: '2025-2026_HK2' };
      touchedForecast = true;
      return null;
    },
  }; } };
  await assert.rejects(() => forecastBenchmarkRankings({ DB: db } as never, {
    semesters: ['2025-2026_HK2'], gpa: 4, credits: 20,
    trainingScore: 100, major: null,
  }), (error: unknown) => error instanceof RankingError && error.status === 400);
  assert.equal(touchedForecast, false);
});

test('imported benchmark parser accepts incomplete personal inputs but rejects invalid tuples', async () => {
  const request = (data: unknown) => new Request('https://example.test/api/user/v1/rankings/benchmark', {
    method: 'POST', body: JSON.stringify(data),
  });
  assert.deepEqual(await readImportedBenchmarkBody(request({
    semester: '2025-2026_HK2', gpa: null, trainingScore: null, credits: 0,
  })), { semester: '2025-2026_HK2', gpa: null, trainingScore: null, credits: 0 });
  await assert.rejects(() => readImportedBenchmarkBody(request({
    semester: '2025-2026_HK2', gpa: 9, trainingScore: 90, credits: 16,
  })), RankingError);
});

test('imported HK2 comparator gives best tie rank and respects GPA, training, credits, class and major', async () => {
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec(`CREATE TABLE semester_exact_ranking_datasets (semester TEXT, total_students INTEGER, status TEXT);
      CREATE TABLE semester_exact_rankings (semester TEXT, student_code TEXT, rank INTEGER, gpa REAL,
        training_score INTEGER, credits INTEGER, class_code TEXT, major TEXT);
      CREATE TABLE user_profiles (user_id TEXT, student_code TEXT, class_name TEXT);
      CREATE TABLE user_profile_private (user_id TEXT, major_name TEXT);`);
    const insert = sql.prepare(`INSERT INTO semester_exact_rankings
      (semester, student_code, rank, gpa, training_score, credits, class_code, major)
      VALUES ('2025-2026_HK2', ?, ?, ?, ?, ?, ?, ?)`);
    for (let rank = 1; rank <= 99; rank += 1) {
      insert.run(String(rank).padStart(12, '0'), rank, 4, 90, 16,
        rank <= 5 ? 'CLASS_A' : 'CLASS_B', rank <= 20 ? 'MAJOR_A' : 'MAJOR_B');
    }
    for (let rank = 100; rank <= 102; rank += 1) {
      insert.run(String(rank).padStart(12, '0'), rank, 3.6, 90, 16, 'CLASS_A', 'MAJOR_A');
    }
    insert.run('000000000103', 103, 3.6, 89, 30, 'CLASS_B', 'MAJOR_B');
    insert.run('000000000104', 104, 3.5, 100, 30, 'CLASS_B', 'MAJOR_B');
    sql.prepare(`INSERT INTO semester_exact_ranking_datasets VALUES ('2025-2026_HK2',104,'ready')`).run();
    sql.prepare(`INSERT INTO user_profiles VALUES (?,?,?)`).run(USER_ID, '000000000100', 'CLASS_A');
    sql.prepare(`INSERT INTO user_profile_private VALUES (?,?)`).run(USER_ID, 'MAJOR_A');
    const otherUser = '57768d5d-e2a7-49c3-92a5-3956cd05de69';
    sql.prepare(`INSERT INTO user_profiles VALUES (?,?,?)`).run(otherUser, '999999999999', 'CLASS_A');
    sql.prepare(`INSERT INTO user_profile_private VALUES (?,?)`).run(otherUser, 'MAJOR_A');

    const seenSql: string[] = [];
    const db = { prepare(text: string) {
      seenSql.push(text);
      const stmt = sql.prepare(text);
      let values: unknown[] = [];
      return { bind(...args: unknown[]) { values = args; return this; },
        async first() { return stmt.get(...values as (string | number | null)[]); } };
    } };
    const rank = (gpa: number, trainingScore: number, credits: number, userId = USER_ID) =>
      forecastOwnImportedRanking({ DB: db } as never, userId,
        { semester: '2025-2026_HK2', gpa, trainingScore, credits });
    const tied = (await rank(3.6, 90, 16)).data;
    assert.equal(tied.rank, 100);
    assert.equal(tied.rankInClass, 6);
    assert.equal(tied.totalInClass, 8);
    assert.equal(tied.rankInMajor, 21);
    assert.equal(tied.totalInMajor, 23);
    assert.equal(tied.totalStudents, 104);
    assert.equal(tied.rankingMode, 'forecast');
    assert.equal(tied.rankingSource, 'imported');
    const worseCredits = (await rank(3.6, 90, 15)).data;
    assert.equal(worseCredits.rank, 103);
    assert.equal(worseCredits.rankInClass, 9);
    assert.equal(worseCredits.rankInMajor, 24);
    assert.equal((await rank(3.6, 89, 30)).data.rank, 103);
    assert.equal((await rank(3.5, 100, 30)).data.rank, 104);
    assert.deepEqual((await rank(3.6, 90, 16, otherUser)).data, tied);
    assert.equal(seenSql.some((text) => /student_code|\brank\b\s*[<>=]/i.test(text)), false);
    const missing = await forecastOwnImportedRanking({ DB: db } as never, USER_ID,
      { semester: '2025-2026_HK2', gpa: null, trainingScore: null, credits: 0 });
    assert.equal(missing.data.found, false);
    assert.equal('rank' in missing.data, false);
  } finally { sql.close(); }
});
