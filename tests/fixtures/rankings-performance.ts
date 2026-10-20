import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';

export const productionBase = 'a330d5d9e86fc02083f494bdf833288d79f21f3c';
export const semester = '2025-2026_HK2';
export type Cost = { sql: number; rowsRead: number; rowsWritten: number };
export const input = { semester, gpa: 3.5, trainingScore: 90, credits: 18 };

export async function loadProductionRanking() {
  const source = execFileSync('git', ['show', productionBase + ':cloudflare/worker/src/rankings.ts'], { encoding: 'utf8' });
  const { code } = await transform(source, { loader: 'ts', format: 'esm' });
  await mkdir('.cache/rankings-phase3', { recursive: true });
  const file = resolve('.cache/rankings-phase3/production.mjs');
  await writeFile(file, code);
  return (await import(pathToFileURL(file).href)).forecastOwnImportedRanking;
}

export const meterRanking = (db: D1Database) => {
  let cost: Cost = { sql: 0, rowsRead: 0, rowsWritten: 0 };
  let queries: { sql: string; args: unknown[]; rowsRead: number }[] = [];
  let intercept: ((sql: string) => Promise<void>) | undefined;
  const DB = { prepare(sql: string) {
    let statement = db.prepare(sql), args: unknown[] = [];
    const capture = async () => {
      await intercept?.(sql);
      const r = await statement.all();
      cost.sql++; cost.rowsRead += r.meta.rows_read; cost.rowsWritten += r.meta.rows_written;
      queries.push({ sql, args, rowsRead: r.meta.rows_read });
      return r;
    };
    const wrapper = {
      bind(...values: unknown[]) { args = values; statement = statement.bind(...values); return wrapper; },
      all: capture,
      async first() { return (await capture()).results[0] ?? null; },
    };
    return wrapper;
  } };
  return { DB, get cost() { return { ...cost }; }, get queries() { return [...queries]; },
    reset() { cost = { sql: 0, rowsRead: 0, rowsWritten: 0 }; queries = []; },
    intercept(fn?: (sql: string) => Promise<void>) { intercept = fn; } };
};

export async function seedRankings(db: D1Database, size: number) {
  const migration = await readFile('cloudflare/migrations/0050_semester_exact_rankings.sql', 'utf8');
  await db.batch(migration.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  await db.batch([
    db.prepare('CREATE TABLE user_profiles (user_id TEXT PRIMARY KEY, class_name TEXT)'),
    db.prepare('CREATE TABLE user_profile_private (user_id TEXT PRIMARY KEY, major_name TEXT)'),
    db.prepare("INSERT INTO user_profiles VALUES ('alice',' Lớp 1 '), ('bob','Lớp 2'), ('unknown','missing'), ('empty','  '), ('class-only','Lớp 1'), ('major-only',NULL), ('unicode','Lớp 1'' OR 1=1 --')"),
    db.prepare("INSERT INTO user_profile_private VALUES ('alice',' Ngành 1 '), ('bob','Ngành 2'), ('unknown','missing'), ('empty',NULL), ('class-only',NULL), ('major-only','Ngành 1'), ('unicode','Ngành 1'' OR 1=1 --')"),
    db.prepare(`INSERT INTO semester_exact_ranking_datasets VALUES (?,?,'source-v1','ready','2026-10-19')`).bind(semester, size),
  ]);
  await db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<?)
    INSERT INTO semester_exact_rankings(semester,student_code,rank,total_students,gpa,training_score,credits,class_code,major)
    SELECT ?,printf('synthetic-%08d',x),x,?,
      CASE WHEN x%101=0 THEN NULL ELSE (x%9)/2.0 END,
      CASE WHEN x%103=0 THEN NULL ELSE 50+x%51 END,
      CASE WHEN x%107=0 THEN NULL ELSE x%31 END,
      CASE WHEN x%109=0 THEN NULL ELSE 'Lớp '||(x%40) END,
      CASE WHEN x%113=0 THEN NULL ELSE 'Ngành '||(x%8) END FROM n`).bind(size, semester, size).run();
  await db.batch([
    db.prepare("INSERT INTO semester_exact_ranking_datasets VALUES ('other-semester',2,'source-other','ready','2026-10-19')"),
    db.prepare(`INSERT INTO semester_exact_rankings(semester,student_code,rank,total_students,gpa,training_score,credits,class_code,major)
      SELECT 'other-semester',student_code,rank,2,gpa,training_score,credits,class_code,major
      FROM semester_exact_rankings WHERE semester=? AND rank<=2`).bind(semester),
  ]);
}

// Experiments only: never imported by runtime/migration/release code.
export async function addExperimentalIndexes(db: D1Database) {
  await db.batch([
    'CREATE INDEX experiment_rank_school ON semester_exact_rankings(semester,gpa,training_score,credits)',
    'CREATE INDEX experiment_rank_class ON semester_exact_rankings(semester,class_code,gpa,training_score,credits)',
    'CREATE INDEX experiment_rank_major ON semester_exact_rankings(semester,major,gpa,training_score,credits)',
  ].map(s => db.prepare(s)));
}

export async function buildExperimentalPrefix(db: D1Database) {
  // A separate aggregate-only prototype. No official rank/identity is stored.
  const scopes = `SELECT semester,'school' AS scope,'' AS value,gpa,training_score,credits FROM semester_exact_rankings
    UNION ALL SELECT semester,'class',class_code,gpa,training_score,credits FROM semester_exact_rankings
    UNION ALL SELECT semester,'major',major,gpa,training_score,credits FROM semester_exact_rankings`;
  const r = await db.prepare(`CREATE TABLE experiment_rank_prefix AS WITH grouped AS (
    SELECT semester,scope,value,gpa,training_score,credits,COUNT(*) AS n FROM (${scopes})
    GROUP BY semester,scope,value,gpa,training_score,credits)
    SELECT *,SUM(n) OVER (PARTITION BY semester,scope,value) AS total,
      COALESCE(SUM(n) OVER (PARTITION BY semester,scope,value ORDER BY gpa DESC,training_score DESC,credits DESC
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS outranking FROM grouped`).run();
  const index = await db.prepare(`CREATE INDEX experiment_rank_prefix_lookup ON experiment_rank_prefix
    (semester,scope,value,gpa DESC,training_score DESC,credits DESC,outranking)`).run();
  return { rowsRead: r.meta.rows_read + index.meta.rows_read, rowsWritten: r.meta.rows_written + index.meta.rows_written };
}

export const prefixScopeSql = `SELECT
  COALESCE((SELECT total FROM experiment_rank_prefix WHERE semester=? AND scope=? AND value=? LIMIT 1),0) AS total,
  COALESCE((SELECT outranking+n FROM experiment_rank_prefix
    WHERE semester=? AND scope=? AND value=? AND (gpa,training_score,credits)>(?,?,?)
    ORDER BY gpa ASC,training_score ASC,credits ASC LIMIT 1),0) AS outranking`;

export function withExperimentalPrefix(db: ReturnType<typeof meterRanking>['DB']) {
  return { prepare(sql: string) {
    if (!sql.includes('FROM semester_exact_rankings')) return db.prepare(sql);
    const scope = sql.includes('class_code = ?') ? 'class' : sql.includes('major = ?') ? 'major' : 'school';
    return { bind(...args: unknown[]) {
      const sem = args[6], value = args[7] ?? '';
      return db.prepare(prefixScopeSql).bind(sem, scope, value, sem, scope, value, args[0], args[2], args[5]);
    } };
  } };
}
