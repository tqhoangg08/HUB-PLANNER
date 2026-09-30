import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  DIRECTORY_FIELDS,
  buildStudentDirectoryImportSql,
  validateStudentDirectoryWorkbook,
} from './student-directory-workbook.mjs';

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1] || null; };
const workbook = option('--workbook') || path.join(homedir(), 'Downloads', 'Database sinh viên.xlsx');
const apply = args.includes('--apply');
const remote = args.includes('--remote');
if (apply !== remote || args.includes('--help')) {
  throw new Error('Usage: node scripts/import-student-directory.mjs [--workbook PATH] [--apply --remote]. Dry-run is the default.');
}
const dataset = await validateStudentDirectoryWorkbook(workbook);
const summary = {
  mode: apply ? 'remote-apply' : 'dry-run',
  TOTAL_ROWS: dataset.counts.totalRows,
  VALID_ROWS: dataset.counts.validRows,
  UNIQUE_MSSV: dataset.rows.length,
  DUPLICATE_ROWS: dataset.counts.duplicateRows,
  INVALID_MSSV: dataset.counts.invalidMssv,
  ROWS_WITH_FULL_NAME: dataset.counts.rowsWithFullName,
  ROWS_WITH_COHORT: dataset.counts.rowsWithCohort,
  ROWS_WITH_MAJOR: dataset.counts.rowsWithMajor,
  ROWS_WITH_TRAINING_PROGRAM: dataset.counts.rowsWithTrainingProgram,
  CONFLICTING_DUPLICATE_MSSV: dataset.conflictCount,
  MISSING_OPTIONAL_COLUMNS: dataset.missingColumns,
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
    // Wrangler may include SQL and student data in diagnostics; never echo it.
    throw new Error(`Private D1 operation failed (exit ${result.status ?? 'unknown'}).`);
  }
  // `--file` prints a progress banner before its JSON result. The caller only
  // needs its success status; the aggregate read below verifies the import.
  if (rest.includes('--file')) return [];
  return JSON.parse(result.stdout)[0]?.results || [];
};
const existing = execute(['--command', `SELECT student_code, ${DIRECTORY_FIELDS.join(',')}, source_version FROM student_directory;`]);
const existingByCode = new Map(existing.map((row) => [row.student_code, row]));
let inserted = 0; let updated = 0; let unchanged = 0;
for (const row of dataset.rows) {
  const previous = existingByCode.get(row.student_code);
  if (!previous) inserted += 1;
  else if (previous.source_version !== dataset.sourceVersion ||
      DIRECTORY_FIELDS.some((field) => previous[field] !== row[field])) updated += 1;
  else unchanged += 1;
}
const temporary = await mkdtemp(path.join(tmpdir(), 'hub-student-directory-'));
try {
  const sqlFile = path.join(temporary, 'import.sql');
  await writeFile(sqlFile, buildStudentDirectoryImportSql(dataset.rows, dataset.sourceVersion,
    new Date().toISOString()), { encoding: 'utf8', mode: 0o600 });
  execute(['--file', sqlFile]);
  const aggregate = execute(['--command', `SELECT COUNT(*) AS rows,
    COUNT(DISTINCT student_code) AS unique_codes,
    SUM(CASE WHEN typeof(student_code)='text' AND length(student_code)=12 THEN 0 ELSE 1 END) AS invalid_code_type
    FROM student_directory;`])[0];
  if (aggregate.rows < dataset.rows.length || aggregate.rows !== aggregate.unique_codes ||
      aggregate.invalid_code_type !== 0) {
    throw new Error('Student directory aggregate validation failed.');
  }
  console.log(JSON.stringify({ ...summary, INSERTED: inserted, UPDATED: updated,
    UNCHANGED: unchanged, DIRECTORY_ROWS: aggregate.rows,
    DIRECTORY_UNIQUE_MSSV: aggregate.unique_codes }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
