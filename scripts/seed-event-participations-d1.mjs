import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const CACHE_DIR = path.join(ROOT, '.cache', 'cloudflare');
const SEED_FILE = path.join(CACHE_DIR, 'event-participations-seed.sql');
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
      user_id::text,
      event_id::bigint,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00'
        as created_at
    from public.user_participations
    where user_id is not null
      and event_id is not null
    order by user_id, event_id
  `);
  rows = result.rows;
} finally {
  await client.end();
}

const statements = [
  'DELETE FROM user_event_participations;',
  "DELETE FROM sync_metadata WHERE resource = 'user_event_participations';",
];
const batchSize = 200;
for (let index = 0; index < rows.length; index += batchSize) {
  const values = rows.slice(index, index + batchSize).map(
    (row) =>
      `(${sqlText(row.user_id)}, ${Number(row.event_id)}, ${sqlText(row.created_at)})`
  );
  statements.push(`
INSERT INTO user_event_participations (user_id, event_id, created_at)
VALUES
  ${values.join(',\n  ')}
ON CONFLICT(user_id, event_id) DO UPDATE SET
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
  'user_event_participations',
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
  `Seeded ${rows.length} event participations into ${
    targetFlag === '--remote' ? 'remote' : 'local'
  } D1.`
);
