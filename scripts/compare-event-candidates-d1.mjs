import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const targetFlag = process.argv.includes('--remote') ? '--remote' : '--local';
const envText = await readFile(path.join(ROOT, '.env.local'), 'utf8');
const envValue = (name) => {
  const match = envText.match(new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm'));
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};
const connectionString = envValue('SUPABASE_DATABASE_URL');
if (!connectionString) throw new Error('SUPABASE_DATABASE_URL was not found in .env.local.');

const source = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await source.connect();
let sourceRows;
try {
  const result = await source.query(`
    SELECT id::bigint, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00' AS created_at,
      source_name, post_url, raw_content, image_url, submitted_from,
      CASE WHEN client_created_at IS NULL THEN NULL ELSE to_char(client_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00' END AS client_created_at,
      review_status, ai_is_event, ai_confidence::double precision, ai_reason,
      ai_result, approved_event_id::bigint,
      CASE WHEN reviewed_at IS NULL THEN NULL ELSE to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00' END AS reviewed_at
    FROM public.event_candidates ORDER BY id`);
  sourceRows = result.rows;
} finally { await source.end(); }

const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const command = `SELECT id, created_at, source_name, post_url, raw_content, image_url, submitted_from,
  client_created_at, review_status, ai_is_event, ai_confidence, ai_reason, ai_result_json,
  approved_event_id, reviewed_at FROM event_candidates ORDER BY id`;
const result = spawnSync(process.execPath, [
  wrangler, 'd1', 'execute', 'hub-planner-public-dev', targetFlag,
  '--config', path.join(ROOT, 'cloudflare', 'wrangler.jsonc'), '--command', command, '--json',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
if (result.status !== 0) throw new Error(`Wrangler exited with code ${result.status ?? 'unknown'}.`);
const payload = JSON.parse(result.stdout.slice(result.stdout.indexOf('[')));
const d1Rows = payload?.[0]?.results || [];

const normalize = (row, d1 = false) => ({
  id: Number(row.id), created_at: row.created_at, source_name: row.source_name,
  post_url: row.post_url, raw_content: row.raw_content, image_url: row.image_url,
  submitted_from: row.submitted_from, client_created_at: row.client_created_at,
  review_status: row.review_status,
  ai_is_event: row.ai_is_event === null ? null : d1 ? Boolean(row.ai_is_event) : Boolean(row.ai_is_event),
  ai_confidence: row.ai_confidence === null ? null : Number(row.ai_confidence),
  ai_reason: row.ai_reason,
  ai_result: d1 ? (row.ai_result_json ? JSON.parse(row.ai_result_json) : null) : row.ai_result,
  approved_event_id: row.approved_event_id === null ? null : Number(row.approved_event_id),
  reviewed_at: row.reviewed_at,
});
const canonical = (rows, d1) => rows.map((row) => normalize(row, d1));
const hash = (rows) => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const sourceCanonical = canonical(sourceRows, false);
const d1Canonical = canonical(d1Rows, true);
const sourceHash = hash(sourceCanonical);
const d1Hash = hash(d1Canonical);
const sourceStatus = Object.groupBy(sourceCanonical, (row) => row.review_status);
const distinctSourceUrls = new Set(sourceCanonical.map((row) => row.post_url)).size;
console.log(`CANDIDATE_SOURCE_ROWS=${sourceCanonical.length}`);
console.log(`CANDIDATE_D1_ROWS=${d1Canonical.length}`);
console.log(`CANDIDATE_PENDING_ROWS=${sourceStatus.pending?.length || 0}`);
console.log(`CANDIDATE_APPROVED_ROWS=${sourceStatus.approved?.length || 0}`);
console.log(`CANDIDATE_REJECTED_ROWS=${sourceStatus.rejected?.length || 0}`);
console.log(`CANDIDATE_DISTINCT_SOURCE_URLS=${distinctSourceUrls}`);
console.log(`CANDIDATE_SOURCE_HASH=${sourceHash}`);
console.log(`CANDIDATE_D1_HASH=${d1Hash}`);
console.log(`CANDIDATE_PARITY=${sourceHash === d1Hash ? 'PASS' : 'FAIL'}`);
if (sourceHash !== d1Hash) process.exitCode = 1;
