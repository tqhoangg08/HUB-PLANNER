import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const CACHE_DIR = path.join(ROOT, '.cache', 'cloudflare');
const SEED_FILE = path.join(CACHE_DIR, 'course-schedules-seed.sql');
const WRANGLER_CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.jsonc');
const DATABASE_NAME = 'hub-planner-public-dev';
const targetFlag = process.argv.includes('--remote') ? '--remote' : '--local';

const parseEnvValue = (source, name) => {
  const match = source.match(new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm'));
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};

const sqlText = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
};

const sqlInteger = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return value ? '1' : '0';
};

const runWrangler = (args) => {
  const wranglerEntry = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(process.execPath, [wranglerEntry, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      XDG_CONFIG_HOME: path.join(CACHE_DIR, 'xdg'),
      WRANGLER_LOG_PATH: path.join(CACHE_DIR, 'wrangler.log'),
    },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Wrangler exited with code ${result.status ?? 'unknown'}.`);
  }
};

const envText = await readFile(ENV_FILE, 'utf8');
const connectionString = parseEnvValue(envText, 'SUPABASE_DATABASE_URL');
if (!connectionString) throw new Error('SUPABASE_DATABASE_URL was not found in .env.local.');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
let rows;
try {
  const result = await client.query(`
    select
      id::text,
      course_code,
      subject_name,
      prerequisite,
      credits,
      knowledge_block,
      shift,
      day_of_week,
      weeks,
      room,
      campus,
      managing_faculty,
      exam_date,
      exam_shift,
      exam_campus,
      exam_room,
      cohort,
      major,
      group_name,
      orientation,
      orientation_note_3,
      registration_type,
      general_note,
      academic_program,
      student_count,
      phase,
      semester,
      instructor,
      is_user_added,
      case
        when created_at is null then null
        else to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00'
      end as created_at,
      to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00'
        as updated_at,
      row_number() over (order by ctid)::integer as source_position
    from public.course_schedules
    order by ctid
  `);
  rows = result.rows;
} finally {
  await client.end();
}

const values = rows.map((row) => [
  sqlText(row.id),
  sqlText(row.course_code),
  sqlText(row.subject_name),
  sqlText(row.prerequisite),
  row.credits === null ? 'NULL' : Number(row.credits),
  sqlText(row.knowledge_block),
  sqlText(row.shift),
  sqlText(row.day_of_week),
  sqlText(row.weeks),
  sqlText(row.room),
  sqlText(row.campus),
  sqlText(row.managing_faculty),
  sqlText(row.exam_date),
  sqlText(row.exam_shift),
  sqlText(row.exam_campus),
  sqlText(row.exam_room),
  sqlText(row.cohort),
  sqlText(row.major),
  sqlText(row.group_name),
  sqlText(row.orientation),
  sqlText(row.orientation_note_3),
  sqlText(row.registration_type),
  sqlText(row.general_note),
  sqlText(row.academic_program),
  row.student_count === null ? 'NULL' : Number(row.student_count),
  sqlText(row.phase),
  sqlText(row.semester),
  sqlText(row.instructor),
  sqlInteger(row.is_user_added),
  sqlText(row.created_at),
  sqlText(row.updated_at),
  sqlText(String(row.course_code || '').toLocaleLowerCase('vi-VN')),
  sqlText(String(row.subject_name || '').toLocaleLowerCase('vi-VN')),
  sqlText(String(row.instructor || '').toLocaleLowerCase('vi-VN')),
  Number(row.source_position),
].join(', '));

const statements = [
  'DELETE FROM course_schedules;',
  "DELETE FROM sync_metadata WHERE resource = 'course_schedules';",
];

const batchSize = 10;
for (let index = 0; index < values.length; index += batchSize) {
  statements.push(`
INSERT INTO course_schedules (
  id, course_code, subject_name, prerequisite, credits, knowledge_block,
  shift, day_of_week, weeks, room, campus, managing_faculty, exam_date,
  exam_shift, exam_campus, exam_room, cohort, major, group_name, orientation,
  orientation_note_3, registration_type, general_note, academic_program,
  student_count, phase, semester, instructor, is_user_added, created_at,
  updated_at, course_code_search, subject_name_search, instructor_search,
  source_position
)
VALUES
  (${values.slice(index, index + batchSize).join('),\n  (')});`);
}

const latest = rows.reduce(
  (current, row) => {
    if (!current || row.updated_at > current.updated_at) return row;
    return current;
  },
  null
);

statements.push(`
INSERT INTO sync_metadata (
  resource, source_row_count, source_max_created_at, synced_at, source_cursor,
  visible_row_count
)
VALUES (
  'course_schedules',
  ${rows.length},
  ${sqlText(latest?.updated_at || null)},
  ${sqlText(new Date().toISOString())},
  ${sqlText(latest?.id || null)},
  ${rows.length}
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
  `Seeded ${rows.length} course schedules into ${
    targetFlag === '--remote' ? 'remote' : 'local'
  } D1.`
);
