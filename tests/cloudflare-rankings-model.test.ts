import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RankingError,
  buildRankingScoreKey,
  forecastBenchmarkRankings,
  listRankingSemesters,
  parseRankingForecastInput,
  readOwnBenchmarkRanking,
  readRankingForecastBody,
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
