import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  normalizeCustomData,
  normalizeScheduleRow,
  normalizeTimestamp,
  parseWranglerJson,
} from './compare-production-user-schedules.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const WRANGLER = path.join(ROOT, 'scripts', 'run-wrangler.mjs');
const PUBLIC_DB = 'hub-planner-public-dev';
const PUBLIC_DB_ID = '88d702e1-60d3-490a-8514-38ef881cf133';
const PAGE_SIZE = 1_000;
const WRITE_BATCH_SIZE = 100;
const SNAPSHOT_COLUMNS = [
  'course_code', 'subject_name', 'prerequisite', 'credits', 'knowledge_block',
  'shift', 'day_of_week', 'weeks', 'room', 'campus', 'managing_faculty',
  'exam_date', 'exam_shift', 'exam_campus', 'exam_room', 'cohort', 'major',
  'group_name', 'orientation', 'orientation_note_3', 'registration_type',
  'general_note', 'academic_program', 'student_count', 'phase', 'semester',
  'instructor', 'is_user_added',
];

class ConvergenceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => { throw new ConvergenceError(code, message); };
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseArgs = (argv) => {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--apply') {
      values.apply = true;
      continue;
    }
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      fail('ARGUMENTS_INVALID', 'Invalid convergence arguments');
    }
    values[key.slice(2)] = value;
    index += 1;
  }
  for (const name of ['supabase-service', 'd1-config', 'd1-database']) {
    if (!values[name]) fail('ARGUMENTS_INVALID', 'Missing convergence arguments');
  }
  if (values['d1-database'] !== PUBLIC_DB) fail('DATABASE_GUARD_FAILED', 'Unexpected D1 database name');
  return values;
};

const capture = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  stream.once('error', reject);
  stream.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
});

const run = async (command, args, code) => {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    capture(child.stdout),
    capture(child.stderr),
    new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (value) => resolve(value ?? 1));
    }),
  ]).catch(() => fail(`${code}_START_FAILED`, 'Required convergence tool could not start'));
  if (exitCode !== 0) fail(`${code}_FAILED`, 'Required convergence command failed');
  return { stdout, stderr };
};

const parseJsonc = (source) => {
  let result = '';
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; result += char; continue; }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 1;
      continue;
    }
    result += char;
  }
  return JSON.parse(result.replace(/^\uFEFF/, ''));
};

const assertD1Target = async (configValue) => {
  const configPath = path.resolve(ROOT, configValue);
  const config = parseJsonc(await readFile(configPath, 'utf8'));
  const matches = (config.d1_databases || []).filter((entry) => entry?.binding === 'DB');
  if (matches.length !== 1 || matches[0].database_name !== PUBLIC_DB || matches[0].database_id !== PUBLIC_DB_ID) {
    fail('DATABASE_GUARD_FAILED', 'Unexpected D1 target');
  }
  return configPath;
};

const psqlJson = async (service, sql) => {
  const wrapped = `BEGIN READ ONLY; SET LOCAL statement_timeout='30s'; ${sql}; COMMIT;`;
  const { stdout } = await run('psql', [
    `service=${service}`, '-X', '--no-psqlrc', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', wrapped,
  ], 'SUPABASE_READ');
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
};

const psqlPages = async (service, columns, table) => {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await psqlJson(service, `SELECT row_to_json(page_row) FROM (
      SELECT ${columns} FROM ${table} ORDER BY id LIMIT ${PAGE_SIZE} OFFSET ${offset}
    ) page_row`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

const d1Query = async (configPath, sql) => {
  if (!/^\s*(SELECT|PRAGMA)\b/i.test(sql) || /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|ATTACH|DETACH)\b/i.test(sql.replace(/'[^']*'/g, ''))) {
    fail('D1_READ_ONLY_GUARD_FAILED', 'Unexpected D1 read query');
  }
  const { stdout } = await run(process.execPath, [
    WRANGLER, 'd1', 'execute', PUBLIC_DB, '--remote', '--config', configPath, '--command', sql, '--json', '--yes',
  ], 'D1_READ');
  return parseWranglerJson(stdout).flatMap((entry) => entry.results || []);
};

const d1Pages = async (configPath, columns, table, orderColumn = 'id') => {
  if (!/^[a-z_]+$/i.test(orderColumn)) fail('D1_READ_QUERY_INVALID', 'Unexpected D1 ordering column');
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await d1Query(configPath, `SELECT ${columns} FROM ${table} ORDER BY ${orderColumn} LIMIT ${PAGE_SIZE} OFFSET ${offset}`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  fail('SOURCE_ROW_INVALID', 'Invalid source value');
};

const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
const sqlLiteral = (value) => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

const sourceSchedule = (row) => {
  const normalized = normalizeScheduleRow(row);
  return {
    ...normalized,
    custom_data: normalizeCustomData(row.custom_data),
  };
};

const snapshotCourse = (course) => {
  const id = String(course.id || '').toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(id)) fail('SOURCE_COURSE_INVALID', 'Invalid source course id');
  const output = { id };
  for (const column of SNAPSHOT_COLUMNS) {
    const value = course[column] === undefined ? null : course[column];
    output[column] = column === 'is_user_added'
      ? value === null ? null : Boolean(value)
      : canonicalValue(value);
  }
  return output;
};

const currentSourceMode = async () => {
  // Invoke npm's JS entry point through the Node executable. This avoids the
  // Windows npx.cmd shell shim, which would otherwise reinterpret SQL
  // punctuation before the read-only control query reaches the CLI.
  const npxCli = process.platform === 'win32'
    ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
    : 'npx';
  const command = process.platform === 'win32' ? process.execPath : npxCli;
  const args = process.platform === 'win32' ? [npxCli] : [];
  const { stdout } = await run(command, [...args,
    '--yes', 'supabase@latest', 'db', 'query', '--linked',
    "select mode from hub_private.schedule_source_control where singleton = true;",
  ], 'SOURCE_CONTROL_READ');
  const match = stdout.match(/"mode"\s*:\s*"([^"]+)"/);
  if (!match) fail('SOURCE_CONTROL_READ_FAILED', 'Could not verify source control mode');
  return match[1];
};

const d1Write = async (configPath, statements) => {
  if (statements.length === 0) return;
  const directory = await mkdtemp(path.join(tmpdir(), 'hub-schedule-convergence-'));
  const file = path.join(directory, 'batch.sql');
  try {
    // The remote D1 SQL API deliberately rejects SQL BEGIN/COMMIT. Each
    // statement below is itself an idempotent owner-scoped UPSERT/UPDATE, and
    // the source barrier is active for the entire convergence window. A failed
    // transport batch can therefore be safely rerun without stale-source or
    // partial-replace risk; reconciliation determines completion.
    await writeFile(file, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
    await run(process.execPath, [
      WRANGLER, 'd1', 'execute', PUBLIC_DB, '--remote', '--config', configPath, '--file', file, '--yes',
    ], 'D1_WRITE');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const writeBatches = async (configPath, statements) => {
  for (let index = 0; index < statements.length; index += WRITE_BATCH_SIZE) {
    await d1Write(configPath, statements.slice(index, index + WRITE_BATCH_SIZE));
  }
};

export const planConvergence = async (args) => {
  const values = parseArgs(args);
  const configPath = await assertD1Target(values['d1-config']);
  const sourceRows = await psqlPages(
    values['supabase-service'],
    'id::text, user_id::text, course_id::text, semester, custom_data, created_at::text',
    'public.user_schedules',
  );
  const sourceCourses = await psqlPages(
    values['supabase-service'],
    `id::text AS id, ${SNAPSHOT_COLUMNS.join(', ')}, updated_at::text`,
    'public.course_schedules',
  );
  const d1Rows = await d1Pages(configPath, 'id, user_id, course_id, semester, custom_data, created_at', 'user_schedules');
  const d1CourseIds = new Set((await d1Pages(configPath, 'id', 'course_schedules')).map((row) => String(row.id).toLowerCase()));
  const d1Snapshots = await d1Pages(configPath, 'schedule_id, user_id, course_id, source_kind, course_json, source_updated_at', 'user_schedule_course_snapshots', 'schedule_id');
  const sourceById = new Map(sourceRows.map((row) => [sourceSchedule(row).id, { raw: row, normalized: sourceSchedule(row) }]));
  const d1ById = new Map(d1Rows.map((row) => [sourceSchedule(row).id, { raw: row, normalized: sourceSchedule(row) }]));
  const courseById = new Map(sourceCourses.map((row) => [String(row.id).toLowerCase(), row]));
  if (sourceById.size !== sourceRows.length || d1ById.size !== d1Rows.length) fail('DUPLICATE_SCHEDULE_ID', 'Duplicate schedule IDs detected');
  if (sourceById.size !== d1ById.size) fail('ROW_COUNT_MISMATCH', 'Source and D1 schedule counts differ');

  const scheduleUpdates = [];
  let customDataRepairs = 0;
  for (const [id, source] of sourceById) {
    const target = d1ById.get(id);
    if (!target) fail('D1_ROW_MISSING', 'D1 schedule row is missing');
    const sourceValue = canonicalJson(source.normalized);
    const targetValue = canonicalJson(target.normalized);
    if (sourceValue !== targetValue) {
      if (source.normalized.custom_data !== target.normalized.custom_data) customDataRepairs += 1;
      scheduleUpdates.push(`UPDATE user_schedules SET user_id=${sqlLiteral(source.normalized.user_id)}, course_id=${sqlLiteral(source.normalized.course_id)}, semester=${sqlLiteral(source.normalized.semester)}, custom_data=${sqlLiteral(source.normalized.custom_data)}, created_at=${sqlLiteral(source.normalized.created_at)} WHERE id=${sqlLiteral(id)};`);
    }
  }
  for (const id of d1ById.keys()) if (!sourceById.has(id)) fail('D1_EXTRA_ROW', 'D1 contains an extra schedule row');

  const existingSnapshots = new Map(d1Snapshots.map((row) => [String(row.schedule_id).toLowerCase(), row]));
  const snapshotWrites = [];
  let snapshotCreates = 0;
  let snapshotUpdates = 0;
  for (const source of sourceById.values()) {
    const course = courseById.get(source.normalized.course_id);
    if (!course) fail('SOURCE_COURSE_MISSING', 'A source schedule course reference is missing');
    const isPrivateImport = course.is_user_added === true;
    const needsSnapshot = isPrivateImport || !d1CourseIds.has(source.normalized.course_id);
    if (!needsSnapshot) continue;
    const sourceKind = isPrivateImport ? 'PRIVATE_IMPORTED' : 'HISTORICAL_PUBLIC';
    const courseJson = canonicalJson(snapshotCourse(course));
    const sourceUpdatedAt = course.updated_at ? normalizeTimestamp(course.updated_at) : null;
    const existing = existingSnapshots.get(source.normalized.id);
    const unchanged = existing &&
      String(existing.user_id).toLowerCase() === source.normalized.user_id &&
      String(existing.course_id).toLowerCase() === source.normalized.course_id &&
      existing.source_kind === sourceKind &&
      canonicalJson(JSON.parse(existing.course_json)) === courseJson &&
      (existing.source_updated_at || null) === sourceUpdatedAt;
    if (unchanged) continue;
    if (existing) snapshotUpdates += 1;
    else snapshotCreates += 1;
    const now = new Date().toISOString();
    snapshotWrites.push(`INSERT INTO user_schedule_course_snapshots (schedule_id, user_id, course_id, source_kind, course_json, source_updated_at, created_at, updated_at) VALUES (${sqlLiteral(source.normalized.id)}, ${sqlLiteral(source.normalized.user_id)}, ${sqlLiteral(source.normalized.course_id)}, ${sqlLiteral(sourceKind)}, ${sqlLiteral(courseJson)}, ${sqlLiteral(sourceUpdatedAt)}, ${sqlLiteral(now)}, ${sqlLiteral(now)}) ON CONFLICT(schedule_id) DO UPDATE SET user_id=excluded.user_id, course_id=excluded.course_id, source_kind=excluded.source_kind, course_json=excluded.course_json, source_updated_at=excluded.source_updated_at, updated_at=excluded.updated_at;`);
  }

  return {
    values,
    configPath,
    sourceCount: sourceRows.length,
    d1Count: d1Rows.length,
    scheduleUpdates,
    customDataRepairs,
    snapshotWrites,
    snapshotCreates,
    snapshotUpdates,
  };
};

export const runConvergence = async (args) => {
  const values = parseArgs(args);
  if (values.apply && await currentSourceMode() !== 'frozen') {
    fail('PRIVATE_SCHEDULE_FREEZE_REQUIRED', 'D1 convergence requires the active private-schedule source freeze');
  }
  const plan = await planConvergence(args);
  if (plan.values.apply) {
    if (await currentSourceMode() !== 'frozen') {
      fail('PRIVATE_SCHEDULE_FREEZE_REQUIRED', 'D1 convergence requires the active private-schedule source freeze');
    }
    await writeBatches(plan.configPath, plan.scheduleUpdates);
    await writeBatches(plan.configPath, plan.snapshotWrites);
  }
  return {
    APPLY: plan.values.apply === true,
    FROZEN_SOURCE_USER_SCHEDULE_COUNT: plan.sourceCount,
    D1_USER_SCHEDULE_COUNT: plan.d1Count,
    D1_USER_SCHEDULE_UPDATES: plan.scheduleUpdates.length,
    CUSTOM_DATA_ROWS_REPAIRED_D1: plan.customDataRepairs,
    SNAPSHOTS_CREATED: plan.snapshotCreates,
    SNAPSHOTS_UPDATED: plan.snapshotUpdates,
    TOTAL_D1_ONLY_WRITES: plan.scheduleUpdates.length + plan.snapshotWrites.length,
  };
};

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    const result = await runConvergence(process.argv.slice(2));
    for (const [key, value] of Object.entries(result)) process.stdout.write(`${key}=${value}\n`);
  } catch (error) {
    process.stdout.write('CONVERGENCE_STATUS=FAIL\n');
    process.stdout.write(`ERROR_CODE=${error instanceof ConvergenceError ? error.code : 'CONVERGENCE_INTERNAL_ERROR'}\n`);
    // Diagnostic text is restricted to the thrown technical message. None of
    // the planner data values are interpolated into errors in this script.
    if (!(error instanceof ConvergenceError) && error instanceof Error) {
      process.stderr.write(`TECHNICAL_ERROR=${error.message.replace(/[\r\n]+/g, ' ')}\n`);
    }
    process.exitCode = 1;
  }
}
