import { readFile } from 'node:fs/promises';
export type Cost = { sql: number; rowsRead: number; rowsWritten: number };
const keys = ['scholarshipType', 'scholarshipRank', 'major', 'className', 'cohort', 'trainingProgram'];
const mapping = { studentCode: 'Code', fullName: 'Name', awardType: 'Award', scores: [],
  ...Object.fromEntries(keys.map(key => [key, key])) };
const approved = ['studentCode', 'fullName', 'awardType', ...keys];
export const meter = (db: D1Database) => {
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

export const seed = async (db: D1Database, count: number, classes: number, label = 'Class', highCardinality = false) => {
  for (const name of ['0055_scholarships.sql', '0056_scholarship_snapshots.sql',
    '0057_scholarship_filters.sql', '0059_scholarship_personal_details.sql']) {
    const sql = await readFile(new URL('../../cloudflare/migrations/' + name, import.meta.url), 'utf8');
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
      ?||(x%?),CASE WHEN x%13=0 THEN NULL ELSE 'Ngành '||(x%${highCardinality ? count : 6}) END,'Award'||(x%2),'{}','synthetic',
      'Type'||(x%${highCardinality ? count : 2}),'Rank'||(x%${highCardinality ? count : 3}),
      CASE WHEN x%17=0 THEN '' ELSE 'K'||(x%${highCardinality ? count : 4}) END,'Program'||(x%${highCardinality ? count : 2}),
      '{"topClass":999}' FROM n`).bind(count, label, classes).run();
  await db.prepare("UPDATE scholarship_import_batches SET status='applied'").run();
  await db.prepare(`UPDATE scholarship_campaigns SET status='published',public_data_approved=1,
    published_at='2026-10-17',active_batch_id='1111111111111111111111111111111111111111111111111111111111111111',revision=3`).run();
};
