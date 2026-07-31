import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const CACHE_DIR = path.join(ROOT, '.cache', 'cloudflare');
const SEED_FILE = path.join(CACHE_DIR, 'benchmark-rankings-seed.sql');
const WRANGLER_CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.jsonc');
const DATABASE_NAME = 'hub-planner-public-dev';
const targetFlag = process.argv.includes('--remote') ? '--remote' : '--local';
const SQL_BATCH_SIZE = 100;

const parseEnvValue = (source, name) => {
  const match = source.match(
    new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm')
  );
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};

const sqlText = (value) =>
  `'${String(value ?? '').replaceAll("'", "''")}'`;

const sqlNullableText = (value) =>
  value === null || value === undefined || value === ''
    ? 'NULL'
    : sqlText(value);

const sqlNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return 'NULL';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'NULL';
  return String(number);
};

const runWrangler = (args) => {
  const wranglerEntry = path.join(
    ROOT,
    'node_modules',
    'wrangler',
    'bin',
    'wrangler.js'
  );
  const result = spawnSync(process.execPath, [wranglerEntry, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      XDG_CONFIG_HOME: path.join(CACHE_DIR, 'xdg'),
      WRANGLER_LOG_PATH: path.join(CACHE_DIR, 'wrangler.log'),
    },
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`Wrangler exited with code ${result.status ?? 'unknown'}.`);
  }
  process.stdout.write(result.stdout || '');
};

const normalizeStudentCode = (value) =>
  String(value || '').trim().toLocaleLowerCase('vi-VN');

const isComparable = (row) =>
  Number.isFinite(Number(row.gpa)) &&
  Number.isFinite(Number(row.training_score)) &&
  Number.isFinite(Number(row.credits));

const buildRankingScoreKey = (gpa, trainingScore, credits) =>
  Math.round(gpa * 1_000_000) * 1_000_000_000 +
  Math.round(trainingScore * 100) * 100_000 +
  Math.round(credits * 100);

const scopeKey = (semester, scopeType, scopeValue) =>
  JSON.stringify([semester, scopeType, scopeValue]);

const addScopeRow = (scopes, semester, scopeType, scopeValue, row) => {
  const key = scopeKey(semester, scopeType, scopeValue);
  let scope = scopes.get(key);
  if (!scope) {
    scope = {
      semester,
      scopeType,
      scopeValue,
      totalStudents: 0,
      comparableRows: [],
    };
    scopes.set(key, scope);
  }
  scope.totalStudents += 1;
  if (isComparable(row)) {
    scope.comparableRows.push({
      gpa: Number(row.gpa),
      trainingScore: Number(row.training_score),
      credits: Number(row.credits),
      scoreKey: buildRankingScoreKey(
        Number(row.gpa),
        Number(row.training_score),
        Number(row.credits)
      ),
    });
  }
};

const buildBuckets = (scope) => {
  const sorted = [...scope.comparableRows].sort(
    (left, right) => right.scoreKey - left.scoreKey
  );
  const buckets = [];
  let processed = 0;
  for (let index = 0; index < sorted.length;) {
    const row = sorted[index];
    let bucketSize = 1;
    while (
      index + bucketSize < sorted.length &&
      sorted[index + bucketSize].scoreKey === row.scoreKey
    ) {
      bucketSize += 1;
    }
    buckets.push({
      semester: scope.semester,
      scopeType: scope.scopeType,
      scopeValue: scope.scopeValue,
      gpa: row.gpa,
      trainingScore: row.trainingScore,
      credits: row.credits,
      scoreKey: row.scoreKey,
      rank: processed + 1,
    });
    processed += bucketSize;
    index += bucketSize;
  }
  return buckets;
};

const appendBatches = (statements, rows, render, insertPrefix, conflictClause) => {
  for (let index = 0; index < rows.length; index += SQL_BATCH_SIZE) {
    const values = rows.slice(index, index + SQL_BATCH_SIZE).map(render);
    statements.push(
      `${insertPrefix}\nVALUES\n  ${values.join(',\n  ')}\n${conflictClause};`
    );
  }
};

const envText = await readFile(ENV_FILE, 'utf8');
const connectionString = parseEnvValue(envText, 'SUPABASE_DATABASE_URL');
if (!connectionString) {
  throw new Error('SUPABASE_DATABASE_URL was not found in .env.local.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
let rankingRows;
let profileRows;
try {
  const [rankingResult, profileResult] = await Promise.all([
    client.query(`
      select
        id::text,
        semester,
        student_rank,
        gpa,
        credits,
        training_score,
        scholarship_status,
        student_code,
        class_code,
        major,
        rank_in_class,
        total_in_class,
        rank_in_major,
        total_in_major,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00'
          as created_at
      from public.benchmark_rankings
      where semester is not null
      order by semester, id
    `),
    client.query(`
      select user_id::text, student_code
      from public.profile_private_data
      where user_id is not null
        and nullif(btrim(student_code), '') is not null
    `),
  ]);
  rankingRows = rankingResult.rows;
  profileRows = profileResult.rows;
} finally {
  await client.end();
}

const userIdByStudentCode = new Map();
for (const row of profileRows) {
  const studentCode = normalizeStudentCode(row.student_code);
  if (studentCode && !userIdByStudentCode.has(studentCode)) {
    userIdByStudentCode.set(studentCode, row.user_id);
  }
}

const semesters = new Map();
const scopes = new Map();
const userRows = new Map();
for (const row of rankingRows) {
  const semester = String(row.semester || '').trim();
  if (!semester) continue;

  let semesterSummary = semesters.get(semester);
  if (!semesterSummary) {
    semesterSummary = {
      semester,
      totalStudents: 0,
      comparableStudents: 0,
    };
    semesters.set(semester, semesterSummary);
  }
  semesterSummary.totalStudents += 1;
  if (isComparable(row)) semesterSummary.comparableStudents += 1;

  addScopeRow(scopes, semester, 'school', '', row);
  const major = String(row.major || '').trim();
  if (major) addScopeRow(scopes, semester, 'major', major, row);

  const userId = userIdByStudentCode.get(
    normalizeStudentCode(row.student_code)
  );
  if (userId) {
    userRows.set(`${userId}\u0000${semester}`, {
      userId,
      semester,
      studentRank: row.student_rank,
      totalStudents: semesterSummary,
      rankInClass: row.rank_in_class,
      totalInClass: row.total_in_class,
      classCode: String(row.class_code || '').trim() || null,
      rankInMajor: row.rank_in_major,
      totalInMajor: row.total_in_major,
      major: major || null,
    });
  }
}

const syncedAt = new Date().toISOString();
const semesterRows = [...semesters.values()];
const scopeRows = [...scopes.values()];
const bucketRows = scopeRows.flatMap(buildBuckets);
const privateUserRows = [...userRows.values()].map((row) => ({
  ...row,
  totalStudents: row.totalStudents.totalStudents,
}));

const statements = [
  'DELETE FROM benchmark_ranking_users;',
  'DELETE FROM benchmark_ranking_buckets;',
  'DELETE FROM benchmark_ranking_scopes;',
  'DELETE FROM benchmark_ranking_semesters;',
  "DELETE FROM sync_metadata WHERE resource = 'benchmark_rankings';",
];

appendBatches(
  statements,
  semesterRows,
  (row) =>
    `(${sqlText(row.semester)}, ${row.totalStudents}, ${row.comparableStudents}, ${sqlText(syncedAt)})`,
  `INSERT INTO benchmark_ranking_semesters (
  semester, total_students, comparable_students, synced_at
)`,
  `ON CONFLICT(semester) DO UPDATE SET
  total_students = excluded.total_students,
  comparable_students = excluded.comparable_students,
  synced_at = excluded.synced_at`
);

appendBatches(
  statements,
  scopeRows,
  (row) =>
    `(${sqlText(row.semester)}, ${sqlText(row.scopeType)}, ${sqlText(row.scopeValue)}, ${row.totalStudents}, ${row.comparableRows.length})`,
  `INSERT INTO benchmark_ranking_scopes (
  semester, scope_type, scope_value, total_students, comparable_students
)`,
  `ON CONFLICT(semester, scope_type, scope_value) DO UPDATE SET
  total_students = excluded.total_students,
  comparable_students = excluded.comparable_students`
);

appendBatches(
  statements,
  bucketRows,
  (row) =>
    `(${sqlText(row.semester)}, ${sqlText(row.scopeType)}, ${sqlText(row.scopeValue)}, ${row.gpa}, ${row.trainingScore}, ${row.credits}, ${row.scoreKey}, ${row.rank})`,
  `INSERT INTO benchmark_ranking_buckets (
  semester, scope_type, scope_value, gpa, training_score, credits, score_key, rank_value
)`,
  `ON CONFLICT(
  semester, scope_type, scope_value, gpa, training_score, credits
) DO UPDATE SET
  score_key = excluded.score_key,
  rank_value = excluded.rank_value`
);

appendBatches(
  statements,
  privateUserRows,
  (row) =>
    `(${sqlText(row.userId)}, ${sqlText(row.semester)}, ${sqlNullableNumber(row.studentRank)}, ${row.totalStudents}, ${sqlNullableNumber(row.rankInClass)}, ${sqlNullableNumber(row.totalInClass)}, ${sqlNullableText(row.classCode)}, ${sqlNullableNumber(row.rankInMajor)}, ${sqlNullableNumber(row.totalInMajor)}, ${sqlNullableText(row.major)})`,
  `INSERT INTO benchmark_ranking_users (
  user_id, semester, student_rank, total_students,
  rank_in_class, total_in_class, class_code,
  rank_in_major, total_in_major, major
)`,
  `ON CONFLICT(user_id, semester) DO UPDATE SET
  student_rank = excluded.student_rank,
  total_students = excluded.total_students,
  rank_in_class = excluded.rank_in_class,
  total_in_class = excluded.total_in_class,
  class_code = excluded.class_code,
  rank_in_major = excluded.rank_in_major,
  total_in_major = excluded.total_in_major,
  major = excluded.major`
);

const sourceMaxCreatedAt = rankingRows.reduce(
  (current, row) =>
    row.created_at && (!current || row.created_at > current)
      ? row.created_at
      : current,
  null
);
statements.push(`
INSERT INTO sync_metadata (
  resource, source_row_count, source_max_created_at, synced_at, visible_row_count
)
VALUES (
  'benchmark_rankings',
  ${rankingRows.length},
  ${sourceMaxCreatedAt ? sqlText(sourceMaxCreatedAt) : 'NULL'},
  ${sqlText(syncedAt)},
  ${rankingRows.length}
);`);

await mkdir(CACHE_DIR, { recursive: true });
await writeFile(SEED_FILE, `${statements.join('\n')}\n`, 'utf8');

runWrangler([
  'd1',
  'execute',
  DATABASE_NAME,
  targetFlag,
  '--config',
  WRANGLER_CONFIG,
  '--file',
  SEED_FILE,
]);

console.log(
  `Seeded ${rankingRows.length} source rankings as ${bucketRows.length} aggregate buckets and ${privateUserRows.length} private user rows into ${
    targetFlag === '--remote' ? 'remote' : 'local'
  } D1.`
);
