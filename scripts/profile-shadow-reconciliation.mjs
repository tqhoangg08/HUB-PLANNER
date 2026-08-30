import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  makePrivateProfileShadowProjection,
  makeProfileShadowProjection,
} from './profile-shadow-projection.mjs';

const PUBLIC_DATABASE_NAME = 'hub-planner-public-dev';
const PUBLIC_DATABASE_ID = '88d702e1-60d3-490a-8514-38ef881cf133';
const EXPECTED_PROFILE_COUNT = 5_911;
const EXPECTED_PRIVATE_COUNT = 5_899;
const MAX_CAPTURE_BYTES = 192 * 1024 * 1024;
const MAX_STATEMENT_BYTES = 96 * 1024;
const MAX_ROWS_PER_STATEMENT = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const WRANGLER_WRAPPER = path.join(REPO_ROOT, 'scripts', 'run-wrangler.mjs');

export class ProfileShadowError extends Error {
  constructor(code, message = 'profile shadow migration failed') {
    super(message);
    this.name = 'ProfileShadowError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ProfileShadowError(code, message);
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const canonicalJsonValue = (value) => {
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
  fail('JSON_VALUE_INVALID', 'A profile JSON value was invalid');
};

const canonicalJsonText = (value, expectedType) => {
  const canonical = canonicalJsonValue(value);
  if (expectedType === 'object' && (!canonical || typeof canonical !== 'object' || Array.isArray(canonical))) {
    fail('JSON_OBJECT_REQUIRED', 'A profile JSON object was required');
  }
  if (expectedType === 'array' && !Array.isArray(canonical)) {
    fail('JSON_ARRAY_REQUIRED', 'A profile JSON array was required');
  }
  return JSON.stringify(canonical);
};

const nullableJsonText = (value, expectedType) =>
  value === null || value === undefined ? null : canonicalJsonText(value, expectedType);

const normalizeUuid = (value) => {
  if (typeof value !== 'string') fail('USER_ID_INVALID', 'A profile owner ID was invalid');
  const normalized = value.toLowerCase();
  if (!UUID_PATTERN.test(normalized)) fail('USER_ID_INVALID', 'A profile owner ID was invalid');
  return normalized;
};

const nullableText = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') fail('TEXT_VALUE_INVALID', 'A profile text value was invalid');
  return value;
};

const nullableStudentCode = (value) => {
  const normalized = nullableText(value);
  if (normalized === null) return null;
  if (!normalized.trim()) fail('STUDENT_CODE_INVALID', 'A profile student code was invalid');
  return normalized;
};

const requiredTimestamp = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    fail('TIMESTAMP_INVALID', 'A profile timestamp was invalid');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail('TIMESTAMP_INVALID', 'A profile timestamp was invalid');
  return new Date(parsed).toISOString();
};

const nullableBoolean = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'boolean') fail('BOOLEAN_INVALID', 'A profile boolean was invalid');
  return value ? 1 : 0;
};

const requiredBoolean = (value) => {
  const normalized = nullableBoolean(value);
  if (normalized === null) fail('BOOLEAN_REQUIRED', 'A profile boolean was required');
  return normalized;
};

const nullableNumber = (value, { integer = false, nonnegative = false } = {}) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('NUMBER_INVALID', 'A profile number was invalid');
  }
  if (integer && !Number.isInteger(value)) fail('INTEGER_REQUIRED', 'A profile integer was required');
  if (nonnegative && value < 0) fail('NONNEGATIVE_REQUIRED', 'A nonnegative profile number was required');
  return value;
};

const withHash = (projection) => ({
  ...projection,
  canonical_hash: sha256(JSON.stringify(projection)),
});

export const projectProfileRow = (row) => withHash(makeProfileShadowProjection({
  user_id: normalizeUuid(row.id),
  student_code: nullableStudentCode(row.student_code),
  full_name: nullableText(row.full_name),
  avatar_url: nullableText(row.avatar_url),
  bio: nullableText(row.bio),
  class_name: nullableText(row.class_name),
  class_name_overridden: requiredBoolean(row.class_name_overridden),
  profile_tags_json: canonicalJsonText(row.profile_tags, 'array'),
  public_profile_enabled: requiredBoolean(row.public_profile_enabled),
  show_profile_stats: requiredBoolean(row.show_profile_stats),
  public_gpa: nullableNumber(row.public_gpa, { nonnegative: true }),
  public_completed_semesters: nullableNumber(row.public_completed_semesters, {
    integer: true,
    nonnegative: true,
  }),
  public_credits: nullableNumber(row.public_credits, { integer: true, nonnegative: true }),
  created_at: requiredTimestamp(row.created_at),
  updated_at: requiredTimestamp(row.updated_at),
}));

export const projectPrivateProfileRow = (row) => withHash(makePrivateProfileShadowProjection({
  user_id: normalizeUuid(row.user_id),
  data_json: canonicalJsonText(row.data, 'object'),
  student_name: nullableText(row.student_name),
  cohort: nullableText(row.cohort),
  major_name: nullableText(row.major_name),
  specialization_name: nullableText(row.specialization_name),
  program_name: nullableText(row.program_name),
  semesters_json: nullableJsonText(row.semesters, 'array'),
  target_gpa: nullableNumber(row.target_gpa, { nonnegative: true }),
  total_credits_required: nullableNumber(row.total_credits_required, {
    integer: true,
    nonnegative: true,
  }),
  has_onboarded: nullableBoolean(row.has_onboarded),
  lookback_seen_json: nullableJsonText(row.lookback_seen, 'object'),
  updated_at: requiredTimestamp(row.updated_at),
}));

const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('SQL_NUMBER_INVALID', 'A profile SQL number was invalid');
    return String(value);
  }
  if (typeof value !== 'string') fail('SQL_VALUE_INVALID', 'A profile SQL value was invalid');
  return `'${value.replaceAll("'", "''")}'`;
};

export const buildUpsertStatements = (table, rows, columns) => {
  if (!/^[a-z_]+$/.test(table)) fail('D1_TABLE_INVALID', 'The D1 profile table was invalid');
  if (!rows.length) return [];
  if (!columns.includes('updated_at')) {
    fail('D1_STALE_GUARD_TIMESTAMP_REQUIRED', 'A canonical profile timestamp was required');
  }
  const updateColumns = columns.filter((column) => !['user_id', 'row_version'].includes(column));
  const suffix = `ON CONFLICT(user_id) DO UPDATE SET\n  ${[
    ...updateColumns.map((column) => `${column}=excluded.${column}`),
    `row_version=${table}.row_version + 1`,
  ].join(',\n  ')}\nWHERE ${table}.canonical_hash <> excluded.canonical_hash\n  AND ${table}.updated_at < excluded.updated_at;`;
  const statements = [];
  let values = [];
  let bytes = 0;
  const flush = () => {
    if (!values.length) return;
    statements.push(
      `INSERT INTO ${table} (${columns.join(', ')}, row_version) VALUES\n  ${values.join(',\n  ')}\n${suffix}`,
    );
    values = [];
    bytes = 0;
  };
  for (const row of rows) {
    const rendered = `(${columns.map((column) => sqlValue(row[column])).join(', ')}, 1)`;
    const rowBytes = Buffer.byteLength(rendered);
    if (values.length && (values.length >= MAX_ROWS_PER_STATEMENT || bytes + rowBytes > MAX_STATEMENT_BYTES)) {
      flush();
    }
    values.push(rendered);
    bytes += rowBytes;
  }
  flush();
  return statements;
};

const runCaptured = (command, args, code) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    windowsHide: true,
  });
  const stdout = [];
  const stderr = [];
  let captured = 0;
  const capture = (target) => (chunk) => {
    captured += chunk.length;
    if (captured > MAX_CAPTURE_BYTES) {
      child.kill();
      reject(new ProfileShadowError(`${code}_OUTPUT_LIMIT`, 'A migration command exceeded its safe output limit'));
      return;
    }
    target.push(chunk);
  };
  child.stdout.on('data', capture(stdout));
  child.stderr.on('data', capture(stderr));
  child.on('error', () => reject(new ProfileShadowError(`${code}_START_FAILED`)));
  child.on('close', (status) => {
    if (status !== 0) reject(new ProfileShadowError(`${code}_FAILED`));
    else resolve(Buffer.concat(stdout).toString('utf8'));
  });
});

const parseWranglerJson = (stdout) => {
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed) || parsed.some((entry) => entry?.success !== true)) throw new Error();
    return parsed;
  } catch {
    fail('WRANGLER_RESPONSE_INVALID', 'Wrangler returned an invalid response');
  }
};

const assertConfigTarget = async (configPath) => {
  const source = await readFile(configPath, 'utf8');
  const bindingPattern = /"binding"\s*:\s*"DB"[\s\S]{0,300}?"database_name"\s*:\s*"hub-planner-public-dev"[\s\S]{0,300}?"database_id"\s*:\s*"88d702e1-60d3-490a-8514-38ef881cf133"/;
  if (!bindingPattern.test(source)) {
    fail('PUBLIC_D1_CONFIG_MISMATCH', 'The Public D1 binding did not match the approved database');
  }
};

const psqlJson = async (service, selectSql) => {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(service)) {
    fail('SUPABASE_SERVICE_INVALID', 'A named read-only psql service is required');
  }
  if (!/^SELECT\b/i.test(selectSql.trim()) || selectSql.includes(';')) {
    fail('READ_ONLY_SQL_REQUIRED', 'Only a single SELECT is allowed');
  }
  const wrapped = `BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ; SET LOCAL statement_timeout='60s'; ${selectSql}; COMMIT;`;
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

const assertSupabaseReadOnlyService = async (service) => {
  const [capabilities] = await psqlJson(
    service,
    `SELECT json_build_object(
      'transaction_read_only', current_setting('transaction_read_only'),
      'profiles_insert', has_table_privilege(current_user, 'public.profiles', 'INSERT'),
      'profiles_update', has_table_privilege(current_user, 'public.profiles', 'UPDATE'),
      'profiles_delete', has_table_privilege(current_user, 'public.profiles', 'DELETE'),
      'private_insert', has_table_privilege(current_user, 'public.profile_private_data', 'INSERT'),
      'private_update', has_table_privilege(current_user, 'public.profile_private_data', 'UPDATE'),
      'private_delete', has_table_privilege(current_user, 'public.profile_private_data', 'DELETE')
    )`,
  );
  if (
    capabilities?.transaction_read_only !== 'on' ||
    Object.entries(capabilities || {}).some(([key, value]) => key !== 'transaction_read_only' && value === true)
  ) {
    fail('SUPABASE_SERVICE_NOT_READ_ONLY', 'The configured Supabase service was not read-only');
  }
};

const whereForSince = (since) => {
  if (!since) return '';
  const parsed = Date.parse(since);
  if (!Number.isFinite(parsed)) fail('SINCE_INVALID', 'The delta watermark was invalid');
  const overlap = new Date(parsed - 1_000).toISOString();
  return `WHERE updated_at >= ${sqlValue(overlap)}`;
};

const loadSourceRows = async (service, since = null) => {
  const where = whereForSince(since);
  const profileRows = await psqlJson(
    service,
    `SELECT row_to_json(source_row) FROM (
      SELECT id::text, student_code, full_name, avatar_url, bio, class_name,
             class_name_overridden, profile_tags, public_profile_enabled,
             show_profile_stats, public_gpa, public_completed_semesters,
             public_credits, created_at::text, updated_at::text
      FROM public.profiles ${where}
      ORDER BY id
    ) source_row`,
  );
  const privateRows = await psqlJson(
    service,
    `SELECT row_to_json(source_row) FROM (
      SELECT user_id::text, data, student_name, cohort, major_name,
             specialization_name, program_name, semesters, target_gpa,
             total_credits_required, has_onboarded, lookback_seen, updated_at::text
      FROM public.profile_private_data ${where}
      ORDER BY user_id
    ) source_row`,
  );
  const [watermarks] = await psqlJson(
    service,
    `SELECT json_build_object(
      'profiles', max(updated_at),
      'private_profiles', (SELECT max(updated_at) FROM public.profile_private_data)
    ) FROM public.profiles`,
  );
  return {
    profiles: profileRows.map(projectProfileRow),
    privateProfiles: privateRows.map(projectPrivateProfileRow),
    watermarks,
  };
};

const d1Args = ({ database, configPath, remote, profile }) => [
  WRANGLER_WRAPPER,
  'd1', 'execute', database,
  remote ? '--remote' : '--local',
  '--config', configPath,
  ...(profile ? ['--profile', profile] : []),
];

const d1Query = async (target, sql) => {
  if (!/^(?:SELECT|PRAGMA)\b/i.test(sql.trim()) || sql.includes(';')) {
    fail('D1_READ_ONLY_SQL_REQUIRED', 'Only a read-only D1 query was allowed');
  }
  const stdout = await runCaptured(
    process.execPath,
    [...d1Args(target), '--command', sql, '--json', '--yes'],
    'D1_READ',
  );
  return parseWranglerJson(stdout).flatMap((entry) => entry.results || []);
};

const d1ExecuteFile = async (target, sql) => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'hub-profile-shadow-'));
  const sqlPath = path.join(tempDirectory, 'shadow-upsert.sql');
  try {
    await writeFile(sqlPath, sql, { encoding: 'utf8', mode: 0o600 });
    await runCaptured(
      process.execPath,
      [...d1Args(target), '--file', sqlPath, '--json', '--yes'],
      'D1_WRITE',
    );
    // Remote `wrangler d1 execute --file` can emit progress text even with
    // `--json`; its process exit status is the reliable execution contract.
    // Exact effects are always verified afterward through read-only queries.
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};

const PROFILE_COLUMNS = [
  'user_id', 'student_code', 'full_name', 'avatar_url', 'bio', 'class_name',
  'class_name_overridden', 'profile_tags_json', 'public_profile_enabled',
  'show_profile_stats', 'public_gpa', 'public_completed_semesters', 'public_credits',
  'created_at', 'updated_at', 'canonical_hash',
];

const PRIVATE_COLUMNS = [
  'user_id', 'data_json', 'student_name', 'cohort', 'major_name',
  'specialization_name', 'program_name', 'semesters_json', 'target_gpa',
  'total_credits_required', 'has_onboarded', 'lookback_seen_json', 'updated_at',
  'canonical_hash',
];

const SEMESTERS_PARITY_MISMATCH_SQL = `CASE
  WHEN json_type(data_json, '$.semesters') IS NULL
    OR json_type(data_json, '$.semesters') = 'null'
  THEN semesters_json IS NOT NULL
  ELSE semesters_json IS NULL
    OR json(semesters_json) <> json(json_extract(data_json, '$.semesters'))
END`;

const assertD1Schema = async (target) => {
  // Wrangler local executions share one SQLite state directory and remote
  // executions share account/API limits. Keep reads sequential so one
  // reconciliation process cannot race its own CLI subprocesses.
  const profiles = await d1Query(target, 'PRAGMA table_info(user_profiles)');
  const privateProfiles = await d1Query(target, 'PRAGMA table_info(user_profile_private)');
  if (!PROFILE_COLUMNS.every((name) => profiles.some((column) => column.name === name))) {
    fail('D1_PROFILE_SCHEMA_INVALID', 'The D1 public profile shadow schema was incomplete');
  }
  if (!PRIVATE_COLUMNS.every((name) => privateProfiles.some((column) => column.name === name))) {
    fail('D1_PRIVATE_SCHEMA_INVALID', 'The D1 private profile shadow schema was incomplete');
  }
};

const writeShadowRows = async (target, source) => {
  const statements = [
    ...buildUpsertStatements('user_profiles', source.profiles, PROFILE_COLUMNS),
    ...buildUpsertStatements('user_profile_private', source.privateProfiles, PRIVATE_COLUMNS),
  ];
  if (!statements.length) return;
  await d1ExecuteFile(target, `PRAGMA foreign_keys=ON;\n${statements.join('\n')}\n`);
};

const loadPrivateRowsForIds = async (service, ids) => {
  if (!ids.length) return [];
  if (ids.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    fail('SEMESTERS_REPAIR_OWNER_INVALID', 'A private-profile repair owner was invalid');
  }
  const ownerList = ids.map(sqlValue).join(', ');
  const rows = await psqlJson(
    service,
    `SELECT row_to_json(source_row) FROM (
      SELECT user_id::text, data, student_name, cohort, major_name,
             specialization_name, program_name, semesters, target_gpa,
             total_credits_required, has_onboarded, lookback_seen, updated_at::text
      FROM public.profile_private_data
      WHERE user_id::text IN (${ownerList})
      ORDER BY user_id
    ) source_row`,
  );
  return rows.map(projectPrivateProfileRow);
};

const repairSemestersParity = async (target, service) => {
  const d1Rows = await d1Query(
    target,
    `SELECT ${PRIVATE_COLUMNS.join(', ')}, row_version
      FROM user_profile_private
      WHERE ${SEMESTERS_PARITY_MISMATCH_SQL}
      ORDER BY user_id`,
  );
  if (!d1Rows.length) return { SEMESTERS_REPAIR_CANDIDATES: 0, D1_ONLY_DELTA_WRITES: 0 };
  const sourceRows = await loadPrivateRowsForIds(service, d1Rows.map((row) => row.user_id));
  const sourceByOwner = new Map(sourceRows.map((row) => [row.user_id, row]));
  const unchangedColumns = PRIVATE_COLUMNS.filter(
    (column) => !['data_json', 'semesters_json', 'canonical_hash'].includes(column),
  );
  const statements = [];
  for (const d1Row of d1Rows) {
    const sourceRow = sourceByOwner.get(d1Row.user_id);
    if (!sourceRow) {
      fail('SEMESTERS_REPAIR_SOURCE_MISSING', 'A private-profile repair source row was missing');
    }
    if (Date.parse(String(d1Row.updated_at)) > Date.parse(String(sourceRow.updated_at))) {
      fail('SEMESTERS_REPAIR_D1_NEWER', 'A D1 private-profile row was newer than Supabase');
    }
    const sourceData = JSON.parse(sourceRow.data_json);
    const sourceDataSemesters = Object.hasOwn(sourceData, 'semesters')
      ? sourceData.semesters
      : null;
    const sourceDataSemestersJson = sourceDataSemesters === null
      ? null
      : JSON.stringify(canonicalJsonValue(sourceDataSemesters));
    if (sourceDataSemestersJson !== sourceRow.semesters_json) {
      fail('SEMESTERS_REPAIR_SOURCE_INCONSISTENT', 'Supabase semesters were not canonical');
    }
    const d1Data = JSON.parse(d1Row.data_json);
    if (!d1Data || typeof d1Data !== 'object' || Array.isArray(d1Data)) {
      fail('SEMESTERS_REPAIR_D1_DATA_INVALID', 'D1 private-profile data was invalid');
    }
    const { semesters: _d1Semesters, ...d1DataWithoutSemesters } = d1Data;
    const { semesters: _sourceSemesters, ...sourceDataWithoutSemesters } = sourceData;
    if (
      JSON.stringify(canonicalJsonValue(d1DataWithoutSemesters)) !==
      JSON.stringify(canonicalJsonValue(sourceDataWithoutSemesters))
    ) {
      fail('SEMESTERS_REPAIR_DATA_NOT_ISOLATED', 'Private data differed beyond semesters');
    }
    const extraDiffColumns = unchangedColumns.filter((column) => d1Row[column] !== sourceRow[column]);
    if (extraDiffColumns.length) {
      process.stdout.write(`SEMESTERS_REPAIR_EXTRA_DIFF_COLUMNS=${extraDiffColumns.join(',')}\n`);
      fail('SEMESTERS_REPAIR_NOT_ISOLATED', 'A mismatch involved fields beyond semesters_json');
    }
    statements.push(`UPDATE user_profile_private SET
      data_json=${sqlValue(sourceRow.data_json)},
      semesters_json=${sqlValue(sourceRow.semesters_json)},
      canonical_hash=${sqlValue(sourceRow.canonical_hash)},
      row_version=row_version + 1
      WHERE user_id=${sqlValue(sourceRow.user_id)}
        AND canonical_hash=${sqlValue(d1Row.canonical_hash)}
        AND updated_at=${sqlValue(sourceRow.updated_at)}
        AND data_json=${sqlValue(d1Row.data_json)};`);
  }
  await d1ExecuteFile(target, `PRAGMA foreign_keys=ON;\n${statements.join('\n')}\n`);
  const repairedRows = await d1Query(
    target,
    `SELECT user_id, canonical_hash FROM user_profile_private
      WHERE user_id IN (${sourceRows.map((row) => sqlValue(row.user_id)).join(', ')})`,
  );
  const repairedByOwner = new Map(repairedRows.map((row) => [row.user_id, row.canonical_hash]));
  if (sourceRows.some((row) => repairedByOwner.get(row.user_id) !== row.canonical_hash)) {
    fail('SEMESTERS_REPAIR_CONCURRENT_CHANGE', 'A private-profile row changed during repair');
  }
  return {
    SEMESTERS_REPAIR_CANDIDATES: d1Rows.length,
    D1_ONLY_DELTA_WRITES: d1Rows.length,
  };
};

const setFrom = (rows, key) => new Set(rows.map((row) => row[key]));

export const compareShadowDatasets = ({ sourceProfiles, sourcePrivate, d1Profiles, d1Private }) => {
  const sourceProfileIds = setFrom(sourceProfiles, 'user_id');
  const sourcePrivateIds = setFrom(sourcePrivate, 'user_id');
  const d1ProfileIds = setFrom(d1Profiles, 'user_id');
  const d1PrivateIds = setFrom(d1Private, 'user_id');
  const d1ProfileHashes = new Map(d1Profiles.map((row) => [row.user_id, row.canonical_hash]));
  const d1PrivateHashes = new Map(d1Private.map((row) => [row.user_id, row.canonical_hash]));
  const missingProfiles = [...sourceProfileIds].filter((id) => !d1ProfileIds.has(id)).length;
  const extraProfiles = [...d1ProfileIds].filter((id) => !sourceProfileIds.has(id)).length;
  const missingPrivate = [...sourcePrivateIds].filter((id) => !d1PrivateIds.has(id)).length;
  const extraPrivate = [...d1PrivateIds].filter((id) => !sourcePrivateIds.has(id)).length;
  const fieldHashMismatch =
    sourceProfiles.filter((row) => d1ProfileHashes.get(row.user_id) !== row.canonical_hash).length +
    sourcePrivate.filter((row) => d1PrivateHashes.get(row.user_id) !== row.canonical_hash).length;
  return {
    SOURCE_PROFILE_COUNT: sourceProfiles.length,
    SOURCE_PRIVATE_PROFILE_COUNT: sourcePrivate.length,
    D1_PROFILE_ROW_COUNT: d1Profiles.length,
    D1_PRIVATE_PROFILE_ROW_COUNT: d1Private.length,
    MISSING_PROFILE_IDS: missingProfiles,
    EXTRA_PROFILE_IDS: extraProfiles,
    MISSING_PRIVATE_IDS: missingPrivate,
    EXTRA_PRIVATE_IDS: extraPrivate,
    PROFILE_ONLY_ROWS: [...d1ProfileIds].filter((id) => !d1PrivateIds.has(id)).length,
    SYNTHETIC_BETTER_AUTH_ONLY_ROWS: extraProfiles,
    FIELD_HASH_MISMATCH: fieldHashMismatch,
  };
};

const reconcile = async (target, source) => {
  const d1Profiles = await d1Query(
    target,
    'SELECT user_id, canonical_hash FROM user_profiles ORDER BY user_id',
  );
  const d1Private = await d1Query(
    target,
    'SELECT user_id, canonical_hash FROM user_profile_private ORDER BY user_id',
  );
  const integrity = await d1Query(
    target,
    `SELECT
      (SELECT count(*) FROM (SELECT user_id FROM user_profiles GROUP BY user_id HAVING count(*) > 1)) AS duplicate_profiles,
      (SELECT count(*) FROM (SELECT user_id FROM user_profile_private GROUP BY user_id HAVING count(*) > 1)) AS duplicate_private,
      (SELECT count(*) FROM user_profile_private pp LEFT JOIN user_profiles p ON p.user_id=pp.user_id WHERE p.user_id IS NULL) AS owner_mismatch`,
  );
  const summary = compareShadowDatasets({
    sourceProfiles: source.profiles,
    sourcePrivate: source.privateProfiles,
    d1Profiles,
    d1Private,
  });
  summary.OWNER_MISMATCH = Number(integrity[0]?.owner_mismatch || 0);
  summary.DUPLICATE_PROFILE_IDS = Number(integrity[0]?.duplicate_profiles || 0);
  summary.DUPLICATE_PRIVATE_IDS = Number(integrity[0]?.duplicate_private || 0);
  summary.INVALID_PROJECTED_ROWS = 0;
  const pass =
    summary.SOURCE_PROFILE_COUNT === EXPECTED_PROFILE_COUNT &&
    summary.SOURCE_PRIVATE_PROFILE_COUNT === EXPECTED_PRIVATE_COUNT &&
    summary.D1_PROFILE_ROW_COUNT === EXPECTED_PROFILE_COUNT &&
    summary.D1_PRIVATE_PROFILE_ROW_COUNT === EXPECTED_PRIVATE_COUNT &&
    summary.MISSING_PROFILE_IDS === 0 &&
    summary.EXTRA_PROFILE_IDS === 0 &&
    summary.MISSING_PRIVATE_IDS === 0 &&
    summary.EXTRA_PRIVATE_IDS === 0 &&
    summary.PROFILE_ONLY_ROWS === 12 &&
    summary.SYNTHETIC_BETTER_AUTH_ONLY_ROWS === 0 &&
    summary.OWNER_MISMATCH === 0 &&
    summary.DUPLICATE_PROFILE_IDS === 0 &&
    summary.DUPLICATE_PRIVATE_IDS === 0 &&
    summary.FIELD_HASH_MISMATCH === 0;
  summary.STAGE2_VALIDATION = pass ? 'PASS' : 'FAIL';
  return summary;
};

const parseArgs = (args) => {
  const mode = args.shift();
  if (!['backfill', 'reconcile', 'repair-semesters'].includes(mode)) {
    fail('MODE_INVALID', 'Use backfill, reconcile, or repair-semesters');
  }
  const values = { mode, remote: false };
  while (args.length) {
    const key = args.shift();
    if (key === '--remote') {
      values.remote = true;
      continue;
    }
    const value = args.shift();
    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      fail('ARGUMENTS_INVALID', 'Migration arguments were invalid');
    }
    values[key.slice(2)] = value;
  }
  for (const name of ['supabase-service', 'd1-config', 'd1-database']) {
    if (!values[name]) fail('ARGUMENTS_INVALID', 'Required migration arguments were missing');
  }
  if (values['d1-database'] !== PUBLIC_DATABASE_NAME) {
    fail('PUBLIC_D1_DATABASE_REJECTED', 'The approved Public D1 database name did not match');
  }
  if (values.remote && values.profile !== 'hub-planner-prod') {
    fail('PRODUCTION_PROFILE_REQUIRED', 'The approved Cloudflare production profile was required');
  }
  return values;
};

const printSummary = (summary) => {
  for (const [key, value] of Object.entries(summary)) {
    process.stdout.write(`${key}=${value}\n`);
  }
};

const main = async () => {
  const values = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(REPO_ROOT, values['d1-config']);
  await assertConfigTarget(configPath);
  await assertSupabaseReadOnlyService(values['supabase-service']);
  const target = {
    database: values['d1-database'],
    configPath,
    remote: values.remote,
    profile: values.profile,
  };
  await assertD1Schema(target);
  if (values.mode === 'repair-semesters') {
    const summary = await repairSemestersParity(target, values['supabase-service']);
    printSummary({
      SEMESTERS_REPAIR_STATUS: 'PASS',
      ...summary,
      SUPABASE_WRITES: 0,
    });
    return;
  }
  const source = await loadSourceRows(values['supabase-service'], values.since || null);
  if (values.mode === 'backfill') {
    await writeShadowRows(target, source);
    printSummary({
      BACKFILL_STATUS: 'PASS',
      BACKFILLED_PROFILE_ROWS: source.profiles.length,
      BACKFILLED_PRIVATE_PROFILE_ROWS: source.privateProfiles.length,
      PROFILE_HIGH_WATERMARK: source.watermarks?.profiles || 'unknown',
      PRIVATE_PROFILE_HIGH_WATERMARK: source.watermarks?.private_profiles || 'unknown',
    });
    return;
  }
  const summary = await reconcile(target, source);
  printSummary(summary);
  if (summary.STAGE2_VALIDATION !== 'PASS') process.exitCode = 2;
};

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof ProfileShadowError ? error.code : 'PROFILE_SHADOW_INTERNAL_ERROR';
    process.stdout.write('STAGE2_VALIDATION=FAIL\n');
    process.stdout.write(`ERROR_CODE=${code}\n`);
    process.exitCode = 1;
  }
}
