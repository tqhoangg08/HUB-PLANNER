import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const CACHE_DIR = path.join(ROOT, '.cache', 'cloudflare');
const SEED_FILE = path.join(CACHE_DIR, 'user-schedules-seed.sql');
const WRANGLER_CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.jsonc');
const DATABASE_NAME = 'hub-planner-public-dev';
const targetFlag = process.argv.includes('--remote') ? '--remote' : '--local';

const parseEnvValue = (source, name) => {
  const match = source.match(
    new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm')
  );
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};

const sqlText = (value) =>
  `'${String(value ?? '').replaceAll("'", "''")}'`;

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
let rows;
try {
  const result = await client.query(`
    select
      id::text,
      user_id::text,
      course_id::text,
      coalesce(semester, '') as semester,
      custom_data,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00'
        as created_at
    from public.user_schedules
    where id is not null
      and user_id is not null
      and course_id is not null
    order by id
  `);
  rows = result.rows;
} finally {
  await client.end();
}

const statements = [
  'DELETE FROM user_schedules;',
  "DELETE FROM sync_metadata WHERE resource = 'user_schedules';",
];
const batchSize = 100;
for (let index = 0; index < rows.length; index += batchSize) {
  const values = rows.slice(index, index + batchSize).map((row) => {
    const customData =
      row.custom_data === null || row.custom_data === undefined
        ? 'NULL'
        : sqlText(JSON.stringify(row.custom_data));
    return `(${sqlText(row.id)}, ${sqlText(row.user_id)}, ${sqlText(row.course_id)}, ${sqlText(row.semester)}, ${customData}, ${sqlText(row.created_at)})`;
  });
  statements.push(`
INSERT INTO user_schedules (
  id, user_id, course_id, semester, custom_data, created_at
)
VALUES
  ${values.join(',\n  ')}
ON CONFLICT(id) DO UPDATE SET
  user_id = excluded.user_id,
  course_id = excluded.course_id,
  semester = excluded.semester,
  custom_data = excluded.custom_data,
  created_at = excluded.created_at;`);
}

const sourceMaxCreatedAt = rows.reduce(
  (current, row) =>
    !current || row.created_at > current ? row.created_at : current,
  null
);
statements.push(`
INSERT INTO sync_metadata (
  resource, source_row_count, source_max_created_at, synced_at, visible_row_count
)
VALUES (
  'user_schedules',
  ${rows.length},
  ${sourceMaxCreatedAt ? sqlText(sourceMaxCreatedAt) : 'NULL'},
  ${sqlText(new Date().toISOString())},
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
  `Seeded ${rows.length} user schedules into ${
    targetFlag === '--remote' ? 'remote' : 'local'
  } D1.`
);
