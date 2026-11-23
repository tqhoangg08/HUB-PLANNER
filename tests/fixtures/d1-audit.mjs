import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { relative, dirname } from 'node:path';

export const BASELINE = 'eaa2a55';
export async function baselineModule(name) {
  const built = await build({ entryPoints: [name], bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'pinned-audit-baseline', setup(b) {
      b.onLoad({ filter: /cloudflare[/\\]worker[/\\]src[/\\](courses|course-publication|student-directory)\.ts$/ }, args => ({
        contents: execFileSync('git', ['show', `${BASELINE}:${relative(process.cwd(),args.path).replaceAll('\\','/')}`], { encoding: 'utf8' }),
        loader: 'ts', resolveDir: dirname(args.path),
      }));
    } }], logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text + '\n//# sourceURL=d1-audit-baseline-' + name).toString('base64'));
}

export function meterDb(raw) {
  let reads = 0, queries = 0;
  const statements = new WeakMap();
  const account = result => { reads += result.meta.rows_read; queries++; return result; };
  const wrap = native => {
    const statement = {
      bind: (...args) => wrap(native.bind(...args)),
      all: async () => account(await native.all()),
      run: async () => account(await native.run()),
      first: async column => { const row = (await statement.all()).results[0]; return row ? column ? row[column] : row : null; },
    };
    statements.set(statement, native); return statement;
  };
  return { db: { prepare: sql => wrap(raw.prepare(sql)), batch: async items =>
    (await raw.batch(items.map(item => statements.get(item)))).map(account) },
    measure: async fn => { reads = 0; queries = 0; const value = await fn(); return { value, rows_read: reads, queries }; },
  };
}

export async function auditFixture() {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("local audit")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const db = await mf.getD1Database('DB');
  try {
  const schema = JSON.parse(await readFile('docs/hk2-d1-import/production-readonly.json', 'utf8')).response.result[0].results;
  // Seed in one transaction before installing the original triggers. This
  // avoids benchmarking import cost; both readers see the same real schema.
  for (const type of ['table', 'index']) for (const row of schema.filter(r => r.type === type)) await db.prepare(row.sql).run();
  for (const statement of (await readFile('cloudflare/migrations/0062_hk2_catalogue_publication.sql', 'utf8'))
    .replace(/--[^\n]*/g, '').split(';').filter(q => q.trim())) await db.prepare(statement).run();
  await db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<4497)
    INSERT INTO course_schedules(id,course_code,subject_name,semester,is_user_added,phase,major,cohort,academic_program,group_name,
      updated_at,course_code_search,subject_name_search,instructor_search,source_position,catalogue_visibility)
    SELECT printf('c%05d',x),'C'||x,CASE WHEN x%2=0 THEN 'Án ' ELSE 'Toán ' END||(x%173),
      CASE WHEN x<=2357 OR x>4457 THEN 'HK2_2026_2027' ELSE 'HK1_2026_2027' END,
      CASE WHEN x>4457 THEN 1 WHEN x%3=0 THEN NULL ELSE 0 END,
      CASE WHEN x%2=0 THEN '1' ELSE '2' END,'M'||(x%7),'K'||(x%4),'P'||(x%3),'G_N1,2',
      '2026-11-20','c'||x,'toán '||(x%173),'',x,
      CASE WHEN x>2357 AND x<=4457 AND x%5=0 THEN 'retired' ELSE 'published' END FROM n;`).run();
  await db.prepare(`INSERT INTO course_filter_facets
    SELECT COALESCE(semester,''),COALESCE(phase,''),COALESCE(is_user_added,-1),COALESCE(subject_name,''),
      COALESCE(major,''),COALESCE(cohort,''),COALESCE(academic_program,''),COALESCE(group_name,''),COUNT(*),MIN(source_position)
    FROM course_schedules WHERE catalogue_visibility='published' GROUP BY COALESCE(semester,''),COALESCE(phase,''),COALESCE(is_user_added,-1),
      COALESCE(subject_name,''),COALESCE(major,''),COALESCE(cohort,''),COALESCE(academic_program,''),COALESCE(group_name,'');`).run();
  await db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1095)
    INSERT INTO course_mutation_receipts SELECT 'system',CASE WHEN x<=95 THEN 'hk2-bulk-v1' ELSE 'other' END,
      'key'||x,printf('%064d',x),'fixture','{}','2026-11-20' FROM n;`).run();
  for (const row of schema.filter(r => r.type === 'trigger')) await db.prepare(row.sql).run();
  return { mf, db };
  } catch (error) { await mf.dispose(); console.error(error); throw error; }
}
