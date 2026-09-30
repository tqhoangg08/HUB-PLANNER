import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  buildExactRankingImportSql,
  validateExactRankingWorkbook,
} from './semester-exact-rankings.mjs';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index < 0 ? null : args[index + 1] || null;
};
const workbookPath = valueAfter('--workbook');
const semester = valueAfter('--semester');
const apply = args.includes('--apply');
const remote = args.includes('--remote');
if (!workbookPath || !semester || (apply && !remote) || (remote && !apply)) {
  throw new Error('Use --workbook PATH --semester ID [--apply --remote]. Dry-run is the default.');
}
const expectedRows = semester === '2025-2026_HK2' ? 10478
  : valueAfter('--expected-rows') ? Number(valueAfter('--expected-rows')) : null;
if (expectedRows !== null && (!Number.isSafeInteger(expectedRows) || expectedRows <= 0)) {
  throw new Error('--expected-rows must be a positive integer.');
}

const dataset = await validateExactRankingWorkbook(workbookPath, semester, expectedRows);
console.log(JSON.stringify({
  mode: apply ? 'remote-apply' : 'dry-run',
  semester, rankingRows: dataset.rankingRows, dssvRows: dataset.dssvRows,
  uniqueMssv: dataset.uniqueMssv, minRank: dataset.rows[0].rank,
  maxRank: dataset.rows.at(-1).rank, sourceSha256: dataset.sourceSha256,
}));
if (!apply) process.exit(0);

const root = path.resolve(import.meta.dirname, '..');
const wrangler = path.join(root, 'scripts', 'run-wrangler.mjs');
const config = path.join(root, 'cloudflare', 'wrangler.jsonc');
const database = 'hub-planner-public-dev';
const run = (rest) => {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', database,
    '--remote', '--config', config, '--json', ...rest], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    // Wrangler may echo SQL on failure. Never print its raw output.
    throw new Error(`D1 operation failed (exit ${result.status ?? 'unknown'}).`);
  }
  return result.stdout;
};
const readSummary = () => {
  const sql = `SELECT COUNT(*) AS rows, COUNT(DISTINCT student_code) AS codes,
    MIN(rank) AS min_rank, MAX(rank) AS max_rank,
    COUNT(DISTINCT rank) AS distinct_ranks,
    MIN(total_students) AS min_total, MAX(total_students) AS max_total,
    SUM(CASE WHEN rank_in_class < 1 OR rank_in_class > total_in_class
      OR rank_in_major < 1 OR rank_in_major > total_in_major
      OR rank_in_class IS NULL OR total_in_class IS NULL
      OR rank_in_major IS NULL OR total_in_major IS NULL THEN 1 ELSE 0 END) AS invalid_scope
    FROM semester_exact_rankings WHERE semester='${semester}';`;
  const output = JSON.parse(run(['--command', sql]));
  return output[0]?.results?.[0];
};
const verifySourceSamples = () => {
  const ranks = [...new Set([1, 41, 325, dataset.rows.length])]
    .filter((rank) => rank <= dataset.rows.length);
  const sql = `SELECT rank, student_code, class_code, major, gpa,
    training_score, credits, scholarship_status, rank_in_class,
    total_in_class, rank_in_major, total_in_major
    FROM semester_exact_rankings WHERE semester='${semester}'
    AND rank IN (${ranks.join(',')}) ORDER BY rank;`;
  const actual = JSON.parse(run(['--command', sql]))[0]?.results || [];
  if (actual.length !== ranks.length) throw new Error('Source sample validation failed.');
  const mapping = [
    ['student_code', 'studentCode'], ['class_code', 'classCode'],
    ['major', 'major'], ['gpa', 'gpa'],
    ['training_score', 'trainingScore'], ['credits', 'credits'],
    ['scholarship_status', 'scholarshipStatus'],
    ['rank_in_class', 'rankInClass'], ['total_in_class', 'totalInClass'],
    ['rank_in_major', 'rankInMajor'], ['total_in_major', 'totalInMajor'],
  ];
  for (let index = 0; index < ranks.length; index += 1) {
    const source = dataset.rows[ranks[index] - 1];
    const found = actual[index];
    if (found.rank !== source.rank || mapping.some(([dbKey, sourceKey]) =>
      found[dbKey] !== source[sourceKey])) {
      throw new Error('Source sample validation failed.');
    }
  }
};
const existingOutput = JSON.parse(run(['--command',
  `SELECT source_sha256, status FROM semester_exact_ranking_datasets WHERE semester='${semester}';`,
]));
const existing = existingOutput[0]?.results?.[0];
if (existing?.status === 'ready' && existing?.source_sha256 === dataset.sourceSha256) {
  const summary = readSummary();
  if (summary?.rows === dataset.rows.length && summary?.codes === dataset.rows.length &&
      summary?.distinct_ranks === dataset.rows.length && summary?.min_rank === 1 &&
      summary?.max_rank === dataset.rows.length && summary?.invalid_scope === 0) {
    verifySourceSamples();
    console.log(JSON.stringify({ mode: 'already-ready', rows: summary.rows }));
    process.exit(0);
  }
}

const temp = await mkdtemp(path.join(tmpdir(), 'hub-exact-rank-'));
try {
  const sqlFile = path.join(temp, 'import.sql');
  await writeFile(sqlFile, buildExactRankingImportSql(dataset, new Date().toISOString()),
    { encoding: 'utf8', mode: 0o600 });
  run(['--file', sqlFile]);
  const summary = readSummary();
  if (summary?.rows !== dataset.rows.length || summary?.codes !== dataset.rows.length ||
      summary?.distinct_ranks !== dataset.rows.length || summary?.min_rank !== 1 ||
      summary?.max_rank !== dataset.rows.length || summary?.min_total !== dataset.rows.length ||
      summary?.max_total !== dataset.rows.length || summary?.invalid_scope !== 0) {
    throw new Error('Post-import aggregate validation failed; dataset remains not ready.');
  }
  verifySourceSamples();
  run(['--command', `UPDATE semester_exact_ranking_datasets SET status='ready'
    WHERE semester='${semester}' AND source_sha256='${dataset.sourceSha256}' AND status='importing';`]);
  const verified = JSON.parse(run(['--command',
    `SELECT status, total_students FROM semester_exact_ranking_datasets WHERE semester='${semester}';`,
  ]))[0]?.results?.[0];
  if (verified?.status !== 'ready' || verified?.total_students !== dataset.rows.length) {
    throw new Error('Dataset ready-state verification failed.');
  }
  console.log(JSON.stringify({ mode: 'remote-ready', rows: summary.rows,
    distinctMssv: summary.codes, minRank: summary.min_rank, maxRank: summary.max_rank,
    status: verified.status }));
} finally {
  await rm(temp, { recursive: true, force: true });
}
