import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PUBLIC_DATABASE_NAME = 'hub-planner-public-dev';
const PUBLIC_DATABASE_ID = '88d702e1-60d3-490a-8514-38ef881cf133';
const AUTH_DATABASE_NAME = 'hub-planner-auth-production';
const AUTH_DATABASE_ID = '4f42d86e-f924-4ecc-b3af-fc947b48810b';
const PAGE_SIZE = 1_000;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SNAPSHOT_COURSE_COLUMNS = [
  'course_code', 'subject_name', 'prerequisite', 'credits', 'knowledge_block',
  'shift', 'day_of_week', 'weeks', 'room', 'campus', 'managing_faculty',
  'exam_date', 'exam_shift', 'exam_campus', 'exam_room', 'cohort', 'major',
  'group_name', 'orientation', 'orientation_note_3', 'registration_type',
  'general_note', 'academic_program', 'student_count', 'phase', 'semester',
  'instructor', 'is_user_added',
];
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const WRANGLER_WRAPPER = path.join(REPO_ROOT, 'scripts', 'run-wrangler.mjs');

export class ReconciliationError extends Error {
  constructor(code, message = 'safe reconciliation error') {
    super(message);
    this.name = 'ReconciliationError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ReconciliationError(code, message);
};

const maskSqlQuotedRegions = (text) => {
  const masked = [...text];
  let quote = null;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (quote !== null) {
      masked[index] = ' ';
      if (character === quote) {
        if (next === quote) {
          masked[index + 1] = ' ';
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if ((character === '-' && next === '-') || (character === '/' && next === '*')) {
      fail('READ_ONLY_SQL_REQUIRED', 'Only a single uncommented read-only statement is allowed');
    }
    if (character === "'" || character === '"') {
      quote = character;
      masked[index] = ' ';
    }
  }

  if (quote !== null) {
    fail('READ_ONLY_SQL_REQUIRED', 'An unterminated SQL quoted region was rejected');
  }
  return masked.join('');
};

export const assertReadOnlySql = (sql) => {
  const text = String(sql || '').trim();
  const masked = maskSqlQuotedRegions(text);
  if (!/^(?:SELECT|PRAGMA)\b/i.test(masked)) {
    fail('READ_ONLY_SQL_REQUIRED', 'Only a single read-only statement is allowed');
  }
  const withoutTrailingTerminators = masked.replace(/;+\s*$/, '');
  if (withoutTrailingTerminators.includes(';')) {
    fail('READ_ONLY_SQL_REQUIRED', 'Only a single read-only statement is allowed');
  }
  if (
    /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|REINDEX|ANALYZE|GRANT|REVOKE|COPY)\b/i.test(
      withoutTrailingTerminators,
    )
  ) {
    fail('WRITE_SQL_REJECTED', 'A database mutation was rejected');
  }
  return text.replace(/;+\s*$/, '');
};

export const normalizeUuid = (value) => {
  if (typeof value !== 'string') fail('UUID_MALFORMED', 'Malformed UUID value');
  const normalized = value.toLowerCase();
  if (!UUID_PATTERN.test(normalized)) fail('UUID_MALFORMED', 'Malformed UUID value');
  return normalized;
};

const canonicalJsonValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJsonValue(value[key])]),
    );
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  fail('CUSTOM_DATA_MALFORMED', 'Malformed custom schedule data');
};

const projectSnapshotCourse = (row) => {
  const projected = { id: normalizeUuid(row.id) };
  for (const column of SNAPSHOT_COURSE_COLUMNS) {
    const value = row[column] === undefined ? null : row[column];
    projected[column] = column === 'is_user_added'
      ? value === null ? null : Boolean(value)
      : canonicalJsonValue(value);
  }
  return projected;
};

export const normalizeCustomData = (value) => {
  if (value === null || value === undefined) return 'null';
  let parsed = value;
  if (typeof value === 'string') {
    if (!value.trim()) fail('CUSTOM_DATA_MALFORMED', 'Malformed custom schedule data');
    try {
      parsed = JSON.parse(value);
    } catch {
      fail('CUSTOM_DATA_MALFORMED', 'Malformed custom schedule data');
    }
  }
  if (parsed === null) return 'null';
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('CUSTOM_DATA_MALFORMED', 'Malformed custom schedule data');
  }
  return JSON.stringify(canonicalJsonValue(parsed));
};

export const normalizeTimestamp = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    fail('TIMESTAMP_MALFORMED', 'Malformed schedule timestamp');
  }
  const input = value.trim();
  const parsed = Date.parse(input);
  if (!Number.isFinite(parsed)) fail('TIMESTAMP_MALFORMED', 'Malformed schedule timestamp');
  const fraction = input.match(/[T ]\d{2}:\d{2}:\d{2}(?:\.(\d+))?/i)?.[1] || '';
  const base = new Date(parsed).toISOString();
  const millisecondDigits = base.slice(20, 23);
  const subMilliseconds = fraction.slice(3).replace(/0+$/, '');
  const canonicalFraction = `${millisecondDigits}${subMilliseconds}`.replace(/0+$/, '');
  return `${base.slice(0, 19)}${canonicalFraction ? `.${canonicalFraction}` : ''}Z`;
};

export const normalizeScheduleRow = (row) => {
  if (!row || typeof row !== 'object') fail('ROW_MALFORMED', 'Malformed schedule row');
  if (typeof row.semester !== 'string') fail('SEMESTER_MALFORMED', 'Malformed semester');
  const semester = row.semester.trim();
  if (!semester) fail('SEMESTER_MALFORMED', 'Malformed semester');
  const normalized = {
    id: normalizeUuid(row.id),
    user_id: normalizeUuid(row.user_id),
    course_id: normalizeUuid(row.course_id),
    semester,
    custom_data: normalizeCustomData(row.custom_data),
    created_at: normalizeTimestamp(row.created_at),
  };
  return normalized;
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const analyzeRows = (rows) => {
  const normalizedById = new Map();
  const owners = new Set();
  const ownerCourseCounts = new Map();
  let invalidOwnerUuid = 0;
  let malformedCustomData = 0;
  let malformedRows = 0;
  let customDataNonempty = 0;

  for (const row of rows) {
    let owner;
    let course;
    try {
      owner = normalizeUuid(row?.user_id);
    } catch {
      invalidOwnerUuid += 1;
    }
    try {
      course = normalizeUuid(row?.course_id);
    } catch {
      // Counted as a malformed row below; only owner UUID has a public category.
    }
    if (owner && course) {
      const key = `${owner}\u0000${course}`;
      ownerCourseCounts.set(key, (ownerCourseCounts.get(key) || 0) + 1);
    }
    try {
      const normalized = normalizeScheduleRow(row);
      const hash = sha256(JSON.stringify(normalized));
      normalizedById.set(normalized.id, { normalized, hash });
      owners.add(normalized.user_id);
      if (normalized.custom_data !== 'null' && normalized.custom_data !== '{}') {
        customDataNonempty += 1;
      }
    } catch (error) {
      malformedRows += 1;
      if (error instanceof ReconciliationError && error.code === 'CUSTOM_DATA_MALFORMED') {
        malformedCustomData += 1;
      }
    }
  }

  return {
    normalizedById,
    owners,
    invalidOwnerUuid,
    malformedCustomData,
    malformedRows,
    customDataNonempty,
    duplicateOwnerCourse: [...ownerCourseCounts.values()].filter((count) => count > 1).length,
  };
};

const datasetHash = (analysis) =>
  sha256(
    [...analysis.normalizedById.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, value]) => `${id}:${value.hash}`)
      .join('\n'),
  );

export const compareScheduleDatasets = ({
  supabaseRows,
  d1Rows,
  authUserIds,
  supabaseCourseIds,
  supabaseCourseRows = [],
  d1CourseIds,
  d1Snapshots = [],
  supabaseSchema,
}) => {
  const supabase = analyzeRows(supabaseRows);
  const d1 = analyzeRows(d1Rows);
  const authUsers = new Set(authUserIds.map(normalizeUuid));
  const sourceCourses = new Set(supabaseCourseIds.map(normalizeUuid));
  const mirrorCourses = new Set(d1CourseIds.map(normalizeUuid));
  const sourceCourseKinds = new Map(
    supabaseCourseRows.map((row) => [normalizeUuid(row.id), row.is_user_added === true]),
  );
  const sourceCoursesById = new Map(
    supabaseCourseRows.map((row) => [normalizeUuid(row.id), row]),
  );
  let supabaseOnly = 0;
  let d1Only = 0;
  let fieldMismatch = 0;

  for (const [id, row] of supabase.normalizedById) {
    const mirror = d1.normalizedById.get(id);
    if (!mirror) supabaseOnly += 1;
    else if (mirror.hash !== row.hash) fieldMismatch += 1;
  }
  for (const id of d1.normalizedById.keys()) {
    if (!supabase.normalizedById.has(id)) d1Only += 1;
  }

  const snapshotsBySchedule = new Map();
  let invalidSnapshots = 0;
  let orphanSnapshots = 0;
  let snapshotSemanticMismatch = 0;
  for (const snapshot of d1Snapshots) {
    try {
      const scheduleId = normalizeUuid(snapshot.schedule_id);
      const ownerId = normalizeUuid(snapshot.user_id);
      const courseId = normalizeUuid(snapshot.course_id);
      if (!['HISTORICAL_PUBLIC', 'PRIVATE_IMPORTED'].includes(snapshot.source_kind)) {
        throw new Error('invalid-source-kind');
      }
      const course = typeof snapshot.course_json === 'string'
        ? canonicalJsonValue(JSON.parse(snapshot.course_json))
        : canonicalJsonValue(snapshot.course_json);
      if (!course || typeof course !== 'object' || Array.isArray(course) || normalizeUuid(course.id) !== courseId) {
        throw new Error('invalid-course-json');
      }
      const schedule = d1.normalizedById.get(scheduleId)?.normalized;
      if (!schedule || schedule.user_id !== ownerId || schedule.course_id !== courseId) {
        orphanSnapshots += 1;
      } else if (snapshotsBySchedule.has(scheduleId)) {
        invalidSnapshots += 1;
      } else {
        snapshotsBySchedule.set(scheduleId, snapshot);
        const sourceCourse = sourceCoursesById.get(courseId);
        if (sourceCourse && Object.hasOwn(sourceCourse, 'course_code')) {
          const expectedKind = sourceCourse.is_user_added === true
            ? 'PRIVATE_IMPORTED'
            : 'HISTORICAL_PUBLIC';
          const expectedCourse = projectSnapshotCourse(sourceCourse);
          if (
            snapshot.source_kind !== expectedKind ||
            JSON.stringify(course) !== JSON.stringify(canonicalJsonValue(expectedCourse))
          ) {
            snapshotSemanticMismatch += 1;
          }
        }
      }
    } catch {
      invalidSnapshots += 1;
    }
  }
  const missingSnapshots = [...d1.normalizedById.values()].filter(({ normalized }) => {
    const sourceIsPrivateImport = sourceCourseKinds.get(normalized.course_id) === true;
    return (sourceIsPrivateImport || !mirrorCourses.has(normalized.course_id)) && !snapshotsBySchedule.has(normalized.id);
  }).length;

  const columns = Array.isArray(supabaseSchema?.columns) ? supabaseSchema.columns : [];
  const constraints = Array.isArray(supabaseSchema?.constraints) ? supabaseSchema.constraints : [];
  const indexes = Array.isArray(supabaseSchema?.indexes) ? supabaseSchema.indexes : [];
  const customDataPresent = columns.some(
    (column) => column?.table_name === 'user_schedules' && column?.column_name === 'custom_data',
  );
  const output = {
    SUPABASE_TOTAL_ROWS: supabaseRows.length,
    D1_TOTAL_ROWS: d1Rows.length,
    SUPABASE_DISTINCT_OWNERS: supabase.owners.size,
    D1_DISTINCT_OWNERS: d1.owners.size,
    SUPABASE_ONLY_ROWS: supabaseOnly,
    D1_ONLY_ROWS: d1Only,
    FIELD_MISMATCH_ROWS: fieldMismatch,
    DUPLICATE_OWNER_COURSE_SUPABASE: supabase.duplicateOwnerCourse,
    DUPLICATE_OWNER_COURSE_D1: d1.duplicateOwnerCourse,
    INVALID_OWNER_UUID_SUPABASE: supabase.invalidOwnerUuid,
    INVALID_OWNER_UUID_D1: d1.invalidOwnerUuid,
    MALFORMED_ROWS_SUPABASE: supabase.malformedRows,
    MALFORMED_ROWS_D1: d1.malformedRows,
    MALFORMED_CUSTOM_DATA_SUPABASE: supabase.malformedCustomData,
    MALFORMED_CUSTOM_DATA_D1: d1.malformedCustomData,
    D1_OWNER_NOT_IN_BETTER_AUTH: [...d1.owners].filter((owner) => !authUsers.has(owner)).length,
    MISSING_COURSE_REFERENCE_D1: [...d1.normalizedById.values()].filter(
      ({ normalized }) => !mirrorCourses.has(normalized.course_id),
    ).length,
    UNRESOLVED_COURSE_REFERENCE_D1: [...d1.normalizedById.values()].filter(
      ({ normalized }) => !mirrorCourses.has(normalized.course_id) && !snapshotsBySchedule.has(normalized.id),
    ).length,
    MISSING_COURSE_REFERENCE_SUPABASE: [...supabase.normalizedById.values()].filter(
      ({ normalized }) => !sourceCourses.has(normalized.course_id),
    ).length,
    MISSING_PRIVATE_COURSE_SNAPSHOT: missingSnapshots,
    ORPHAN_PRIVATE_COURSE_SNAPSHOT: orphanSnapshots,
    INVALID_PRIVATE_COURSE_SNAPSHOT: invalidSnapshots,
    SNAPSHOT_SEMANTIC_MISMATCH: snapshotSemanticMismatch,
    CUSTOM_DATA_SCHEMA_PRESENT: customDataPresent,
    CUSTOM_DATA_NONEMPTY_ROWS: supabase.customDataNonempty,
    D1_CUSTOM_DATA_NONEMPTY_ROWS: d1.customDataNonempty,
    SUPABASE_SCHEMA_COLUMN_COUNT: columns.length,
    SUPABASE_SCHEMA_CONSTRAINT_COUNT: constraints.length,
    SUPABASE_SCHEMA_INDEX_COUNT: indexes.length,
    SUPABASE_SCHEMA_HASH: sha256(JSON.stringify({ columns, constraints, indexes })),
    SUPABASE_DATASET_HASH: datasetHash(supabase),
    D1_DATASET_HASH: datasetHash(d1),
  };
  const failingKeys = Object.entries(output).filter(([key, value]) =>
    key === 'CUSTOM_DATA_SCHEMA_PRESENT' ? value !== true :
      !key.endsWith('_HASH') &&
      key !== 'MISSING_COURSE_REFERENCE_D1' &&
      !['SUPABASE_TOTAL_ROWS', 'D1_TOTAL_ROWS', 'SUPABASE_DISTINCT_OWNERS',
        'D1_DISTINCT_OWNERS', 'CUSTOM_DATA_NONEMPTY_ROWS',
        'D1_CUSTOM_DATA_NONEMPTY_ROWS', 'SUPABASE_SCHEMA_COLUMN_COUNT',
        'SUPABASE_SCHEMA_CONSTRAINT_COUNT', 'SUPABASE_SCHEMA_INDEX_COUNT'].includes(key) &&
      Number(value) !== 0,
  );
  const equalAggregateCounts =
    output.SUPABASE_TOTAL_ROWS === output.D1_TOTAL_ROWS &&
    output.SUPABASE_DISTINCT_OWNERS === output.D1_DISTINCT_OWNERS &&
    output.CUSTOM_DATA_NONEMPTY_ROWS === output.D1_CUSTOM_DATA_NONEMPTY_ROWS;
  return {
    ...output,
    RECONCILIATION_STATUS:
      failingKeys.length === 0 && equalAggregateCounts &&
      output.SUPABASE_DATASET_HASH === output.D1_DATASET_HASH ? 'PASS' : 'FAIL',
  };
};

const parseJsonc = (source) => {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      output += '\n';
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 1;
      continue;
    }
    output += character;
  }
  return JSON.parse(output.replace(/^\uFEFF/, ''));
};

const readGuardedConfig = async (configPath, binding, expectedName, expectedId) => {
  let config;
  try {
    config = parseJsonc(await readFile(configPath, 'utf8'));
  } catch {
    fail('WRANGLER_CONFIG_INVALID', 'A guarded Wrangler configuration is invalid');
  }
  const matches = (config.d1_databases || []).filter((entry) => entry?.binding === binding);
  if (
    matches.length !== 1 ||
    matches[0].database_name !== expectedName ||
    matches[0].database_id !== expectedId
  ) {
    fail('DATABASE_GUARD_FAILED', 'A guarded database target did not match');
  }
  return matches[0];
};

const capture = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  stream.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_CAPTURE_BYTES) {
      reject(new ReconciliationError('PROCESS_OUTPUT_TOO_LARGE', 'A tool response exceeded its safe limit'));
      stream.destroy();
      return;
    }
    chunks.push(chunk);
  });
  stream.once('error', reject);
  stream.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
});

const runCaptured = async (command, args, code) => {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdoutPromise = capture(child.stdout);
  const stderrPromise = capture(child.stderr);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value) => resolve(value ?? 1));
  }).catch(() => fail(`${code}_START_FAILED`, 'A required read-only tool could not start'));
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  if (exitCode !== 0) {
    const category = /auth|password|permission|denied/i.test(stderr)
      ? 'authentication or read-only permission failed'
      : /timeout|network|fetch|econn/i.test(stderr)
        ? 'read-only network request failed'
        : 'read-only command failed';
    fail(`${code}_FAILED`, category);
  }
  return stdout;
};

export const parseWranglerJson = (stdout) => {
  const input = String(stdout).trim();
  for (let index = input.length; index >= 0; index = input.lastIndexOf('[', index - 1)) {
    const candidate = input.slice(index);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.every((entry) => entry?.success === true)) return parsed;
    } catch {
      // Wrangler may prefix JSON with progress output.
    }
    if (index === 0) break;
  }
  fail('WRANGLER_RESPONSE_INVALID', 'Wrangler returned an invalid read-only response');
};

const d1Query = async (databaseName, configPath, sql) => {
  const guardedSql = assertReadOnlySql(sql);
  const stdout = await runCaptured(
    process.execPath,
    [WRANGLER_WRAPPER, 'd1', 'execute', databaseName, '--remote', '--config', configPath,
      '--command', guardedSql, '--json', '--yes'],
    'WRANGLER_READ',
  );
  return parseWranglerJson(stdout).flatMap((entry) => entry.results || []);
};

const d1PagedQuery = async (databaseName, configPath, columns, table) => {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await d1Query(
      databaseName,
      configPath,
      `SELECT ${columns} FROM ${table} ORDER BY 1 LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

const psqlJson = async (service, selectSql) => {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(service)) {
    fail('SUPABASE_SERVICE_INVALID', 'A named read-only psql service is required');
  }
  const sql = assertReadOnlySql(selectSql);
  const wrapped = `BEGIN READ ONLY; SET LOCAL statement_timeout='30s'; ${sql}; COMMIT;`;
  const stdout = await runCaptured(
    'psql',
    [`service=${service}`, '-X', '--no-psqlrc', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', wrapped],
    'SUPABASE_READ',
  );
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('{'))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        fail('SUPABASE_RESPONSE_INVALID', 'Supabase returned invalid read-only data');
      }
    });
};

const psqlPagedJson = async (service, selectColumns, fromSql, orderColumn = 'id') => {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await psqlJson(
      service,
      `SELECT row_to_json(page_row) FROM (
        SELECT ${selectColumns} FROM ${fromSql}
        ORDER BY ${orderColumn} LIMIT ${PAGE_SIZE} OFFSET ${offset}
      ) page_row`,
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

const assertSupabaseReadOnlyService = async (service) => {
  const [capabilities] = await psqlJson(
    service,
    `SELECT json_build_object(
      'transaction_read_only', current_setting('transaction_read_only'),
      'schedule_insert', has_table_privilege(current_user, 'public.user_schedules', 'INSERT'),
      'schedule_update', has_table_privilege(current_user, 'public.user_schedules', 'UPDATE'),
      'schedule_delete', has_table_privilege(current_user, 'public.user_schedules', 'DELETE'),
      'course_insert', has_table_privilege(current_user, 'public.course_schedules', 'INSERT'),
      'course_update', has_table_privilege(current_user, 'public.course_schedules', 'UPDATE'),
      'course_delete', has_table_privilege(current_user, 'public.course_schedules', 'DELETE')
    )`,
  );
  if (
    capabilities?.transaction_read_only !== 'on' ||
    Object.entries(capabilities || {}).some(([key, value]) => key !== 'transaction_read_only' && value === true)
  ) {
    fail('SUPABASE_SERVICE_NOT_READ_ONLY', 'The configured Supabase service has write privileges');
  }
};

const parseArgs = (args) => {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      fail('ARGUMENTS_INVALID', 'All required reconciliation arguments must be provided');
    }
    values[key.slice(2)] = value;
  }
  for (const name of ['supabase-service', 'd1-config', 'd1-database', 'auth-config']) {
    if (!values[name]) fail('ARGUMENTS_INVALID', 'All required reconciliation arguments must be provided');
  }
  return values;
};

export const runProductionReconciliation = async (args) => {
  const values = parseArgs(args);
  if (values['d1-database'] !== PUBLIC_DATABASE_NAME) {
    fail('PUBLIC_DATABASE_NAME_REJECTED', 'The Public D1 database name did not match');
  }
  const publicConfig = path.resolve(REPO_ROOT, values['d1-config']);
  const authConfig = path.resolve(REPO_ROOT, values['auth-config']);
  await readGuardedConfig(publicConfig, 'DB', PUBLIC_DATABASE_NAME, PUBLIC_DATABASE_ID);
  await readGuardedConfig(authConfig, 'AUTH_DB', AUTH_DATABASE_NAME, AUTH_DATABASE_ID);
  await assertSupabaseReadOnlyService(values['supabase-service']);

  const schemaRows = await psqlJson(
    values['supabase-service'],
    `SELECT row_to_json(schema_row) FROM (
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('user_schedules','course_schedules')
      ORDER BY table_name, ordinal_position
    ) schema_row`,
  );
  const constraintRows = await psqlJson(
    values['supabase-service'],
    `SELECT row_to_json(constraint_row) FROM (
      SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid IN ('public.user_schedules'::regclass, 'public.course_schedules'::regclass)
      ORDER BY table_name, conname
    ) constraint_row`,
  );
  const indexRows = await psqlJson(
    values['supabase-service'],
    `SELECT row_to_json(index_row) FROM (
      SELECT tablename AS table_name, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname='public' AND tablename IN ('user_schedules','course_schedules')
      ORDER BY tablename, indexname
    ) index_row`,
  );
  const customDataPresent = schemaRows.some(
    (row) => row.table_name === 'user_schedules' && row.column_name === 'custom_data',
  );
  const customSelect = customDataPresent ? 'custom_data' : 'NULL AS custom_data';
  const supabaseRows = await psqlPagedJson(
    values['supabase-service'],
    `id::text, user_id::text, course_id::text, semester, ${customSelect}, created_at::text`,
    'public.user_schedules',
  );
  const supabaseCourses = await psqlPagedJson(
    values['supabase-service'],
    'id::text AS id, is_user_added',
    'public.course_schedules',
  );
  const d1Rows = await d1PagedQuery(
    PUBLIC_DATABASE_NAME,
    publicConfig,
    'id, user_id, course_id, semester, custom_data, created_at',
    'user_schedules',
  );
  const d1Courses = await d1PagedQuery(PUBLIC_DATABASE_NAME, publicConfig, 'id', 'course_schedules');
  const d1Snapshots = await d1PagedQuery(
    PUBLIC_DATABASE_NAME,
    publicConfig,
    'schedule_id, user_id, course_id, source_kind, course_json',
    'user_schedule_course_snapshots',
  );
  const authUsers = await d1PagedQuery(AUTH_DATABASE_NAME, authConfig, 'id', 'auth_user');
  const d1Schema = await d1Query(PUBLIC_DATABASE_NAME, publicConfig, 'PRAGMA table_info(user_schedules)');
  const requiredD1Columns = ['id', 'user_id', 'course_id', 'semester', 'custom_data', 'created_at'];
  if (!requiredD1Columns.every((name) => d1Schema.some((column) => column.name === name))) {
    fail('D1_SCHEMA_INVALID', 'The D1 schedule mirror schema is incomplete');
  }

  const summary = compareScheduleDatasets({
    supabaseRows,
    d1Rows,
    authUserIds: authUsers.map((row) => row.id),
    supabaseCourseIds: supabaseCourses.map((row) => row.id),
    supabaseCourseRows: supabaseCourses,
    d1CourseIds: d1Courses.map((row) => row.id),
    d1Snapshots,
    supabaseSchema: { columns: schemaRows, constraints: constraintRows, indexes: indexRows },
  });
  return summary;
};

const printSummary = (summary) => {
  for (const [key, value] of Object.entries(summary)) {
    const safeValue = typeof value === 'boolean' ? (value ? 'True' : 'False') : value;
    process.stdout.write(`${key}=${safeValue}\n`);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    const summary = await runProductionReconciliation(process.argv.slice(2));
    const artifactDir = path.join(REPO_ROOT, '.cache', 'schedule-reconcile');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(
      path.join(artifactDir, 'latest-summary.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    printSummary(summary);
    if (summary.RECONCILIATION_STATUS !== 'PASS') process.exitCode = 2;
  } catch (error) {
    const code = error instanceof ReconciliationError ? error.code : 'RECONCILIATION_INTERNAL_ERROR';
    const message = error instanceof ReconciliationError ? error.message : 'internal reconciliation error';
    process.stdout.write('RECONCILIATION_STATUS=FAIL\n');
    process.stdout.write(`ERROR_CODE=${code}\n`);
    process.stdout.write(`ERROR_MESSAGE=${message}\n`);
    process.exitCode = 1;
  }
}
