import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

if (!process.argv.includes('--apply') || !process.argv.includes('--remote')) {
  throw new Error('Event Candidate cutover requires explicit --apply --remote flags.');
}
const ROOT = process.cwd();
const envText = await readFile(path.join(ROOT, '.env.local'), 'utf8');
const envValue = (name) => {
  const match = envText.match(new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm'));
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};
const connectionString = envValue('SUPABASE_DATABASE_URL');
if (!connectionString) throw new Error('SUPABASE_DATABASE_URL was not found in .env.local.');
const sqlText = (value) => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

const source = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await source.connect();
let rows;
try {
  const result = await source.query(`
    SELECT id::bigint, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00' AS created_at,
      source_name, post_url, raw_content, image_url, submitted_from,
      CASE WHEN client_created_at IS NULL THEN NULL ELSE to_char(client_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00' END AS client_created_at,
      review_status, ai_is_event, ai_confidence::double precision, ai_reason,
      ai_result, approved_event_id::bigint,
      CASE WHEN reviewed_at IS NULL THEN NULL ELSE to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00' END AS reviewed_at
    FROM public.event_candidates ORDER BY id`);
  rows = result.rows;
} finally { await source.end(); }

const statements = rows.map((row) => `INSERT INTO event_candidates (
  id, created_at, source_name, post_url, raw_content, image_url, submitted_from,
  client_created_at, submitter_user_id, review_status, ai_is_event, ai_confidence,
  ai_reason, ai_result_json, approved_event_id, reviewed_at, reviewed_by_user_id
) VALUES (${[
  Number(row.id), sqlText(row.created_at), sqlText(row.source_name), sqlText(row.post_url),
  sqlText(row.raw_content), sqlText(row.image_url), sqlText(row.submitted_from),
  sqlText(row.client_created_at), 'NULL', sqlText(row.review_status),
  row.ai_is_event === null ? 'NULL' : row.ai_is_event ? '1' : '0',
  row.ai_confidence === null ? 'NULL' : Number(row.ai_confidence), sqlText(row.ai_reason),
  sqlText(row.ai_result === null ? null : JSON.stringify(row.ai_result)),
  row.approved_event_id === null ? 'NULL' : Number(row.approved_event_id),
  sqlText(row.reviewed_at), 'NULL',
].join(', ')}) ON CONFLICT(id) DO UPDATE SET
  created_at=excluded.created_at, source_name=excluded.source_name, post_url=excluded.post_url,
  raw_content=excluded.raw_content, image_url=excluded.image_url, submitted_from=excluded.submitted_from,
  client_created_at=excluded.client_created_at, review_status=excluded.review_status,
  ai_is_event=excluded.ai_is_event, ai_confidence=excluded.ai_confidence,
  ai_reason=excluded.ai_reason, ai_result_json=excluded.ai_result_json,
  approved_event_id=excluded.approved_event_id, reviewed_at=excluded.reviewed_at;`);
statements.push(`UPDATE event_candidate_id_sequence
  SET next_id = (SELECT COALESCE(MAX(id), 0) + 1 FROM event_candidates)
  WHERE singleton = 1;`);

const cacheDir = path.join(ROOT, '.cache', 'cloudflare');
const sqlFile = path.join(cacheDir, 'event-candidates-cutover.sql');
await mkdir(cacheDir, { recursive: true });
await writeFile(sqlFile, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
try {
  const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(process.execPath, [
    wrangler, 'd1', 'execute', 'hub-planner-public-dev', '--remote',
    '--config', path.join(ROOT, 'cloudflare', 'wrangler.jsonc'), '--file', sqlFile,
  ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  if (result.status !== 0) throw new Error(`Wrangler exited with code ${result.status ?? 'unknown'}.`);
} finally { await rm(sqlFile, { force: true }); }
console.log(`EVENT_CANDIDATE_CUTOVER_ROWS=${rows.length}`);
console.log('EVENT_CANDIDATE_CUTOVER_D1=PASS');
