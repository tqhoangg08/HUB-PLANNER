import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { buildEventDrlImportSql, validateEventDrlWorkbook } from './event-drl-workbook.mjs';

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1] || null; };
const workbook = option('--workbook') || path.join(homedir(), 'Downloads', 'SỰ KIỆN ĐRL.xlsx');
const apply = args.includes('--apply');
const remote = args.includes('--remote');
if (apply !== remote || args.includes('--help')) {
  throw new Error('Usage: node scripts/import-event-drl-history.mjs [--workbook PATH] [--apply --remote]. Dry-run is default.');
}
const dataset = await validateEventDrlWorkbook(workbook);
const summary = {
  mode: apply ? 'remote-apply' : 'dry-run',
  HISTORICAL_LABELED_ROWS: dataset.stats.historicalLabeledRows,
  HISTORICAL_UNIQUE_TITLES: dataset.stats.uniqueHistoricalTitles,
  OBSERVED_CODES: dataset.stats.observedCodes,
  ORGANIZERS: dataset.stats.organizers,
  DRL_RULES: dataset.stats.officialRules,
  ACTIVE_EVENT_RULES: dataset.stats.activeEventRules,
  AMBIGUOUS_NORMALIZED_TITLES: dataset.stats.ambiguousNormalizedTitles,
  INVALID_ROWS: dataset.stats.invalidRows,
  COUNTS_BY_OBSERVED_CODE: dataset.stats.countsByCode,
};
if (!apply) { console.log(JSON.stringify(summary)); process.exit(0); }

const root = path.resolve(import.meta.dirname, '..');
const wrangler = path.join(root, 'scripts', 'run-wrangler.mjs');
const config = path.join(root, 'cloudflare', 'wrangler.jsonc');
const execute = (rest) => {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'hub-planner-public-dev',
    '--remote', '--config', config, '--json', ...rest], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    // Wrangler diagnostics can echo SQL containing source data. Never print them.
    throw new Error(`Private event DRL D1 operation failed (exit ${result.status ?? 'unknown'}).`);
  }
  if (rest.includes('--file')) return [];
  return JSON.parse(result.stdout)[0]?.results || [];
};
const prior = execute(['--command', `SELECT source_version,historical_rows,status FROM event_drl_corpus
  ORDER BY imported_at DESC LIMIT 1;`])[0];
if (prior?.source_version === dataset.sourceVersion && prior.historical_rows === dataset.historyRows.length &&
    prior.status === 'ready') {
  const current = execute(['--command', `SELECT COUNT(*) AS rows FROM event_drl_history;`])[0];
  if (current.rows === dataset.historyRows.length) {
    console.log(JSON.stringify({ ...summary, EVENT_DRL_HISTORY_ROWS: current.rows,
      IMPORT_IDEMPOTENT: 'unchanged', DATASET_STATUS: 'ready' }));
    process.exit(0);
  }
}
const temporary = await mkdtemp(path.join(tmpdir(), 'hub-event-drl-'));
try {
  const sqlFile = path.join(temporary, 'import.sql');
  await writeFile(sqlFile, buildEventDrlImportSql(dataset, new Date().toISOString()), { encoding: 'utf8', mode: 0o600 });
  execute(['--file', sqlFile]);
  const aggregate = execute(['--command', `SELECT (SELECT COUNT(*) FROM event_drl_history) AS historical_rows,
    (SELECT COUNT(DISTINCT source_row) FROM event_drl_history) AS distinct_source_rows,
    (SELECT COUNT(*) FROM drl_rules) AS rules,
    (SELECT COUNT(*) FROM event_organizers WHERE source_version <> 'custom') AS organizers,
    (SELECT COUNT(*) FROM event_drl_corpus WHERE status='ready') AS ready_datasets;`])[0];
  if (aggregate.historical_rows !== dataset.historyRows.length ||
      aggregate.distinct_source_rows !== dataset.historyRows.length ||
      aggregate.rules !== dataset.ruleRows.length ||
      aggregate.organizers !== dataset.organizerRows.length || aggregate.ready_datasets !== 1) {
    throw new Error('Event DRL corpus aggregate post-import validation failed.');
  }
  const perCode = execute(['--command', 'SELECT observed_code, COUNT(*) AS rows FROM event_drl_history GROUP BY observed_code;']);
  if (perCode.length !== dataset.stats.observedCodes || perCode.some((row) =>
    row.rows !== dataset.stats.countsByCode[row.observed_code])) {
    throw new Error('Event DRL corpus per-code post-import validation failed.');
  }
  console.log(JSON.stringify({ ...summary, EVENT_DRL_HISTORY_ROWS: aggregate.historical_rows,
    IMPORT_IDEMPOTENT: 'source-version replacement', DATASET_STATUS: 'ready' }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
