import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const CACHE_DIR = path.join(ROOT, '.cache', 'cloudflare');
const SEED_FILE = path.join(CACHE_DIR, 'lost-found-seed.sql');
const WRANGLER_CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.jsonc');
const DATABASE_NAME = 'hub-planner-public-dev';
const targetFlag = process.argv.includes('--remote') ? '--remote' : '--local';

const parseEnvValue = (source, name) => {
  const match = source.match(
    new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm')
  );
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};

const sqlText = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
};

const normalizeSearch = (value) =>
  String(value || '')
    .toLocaleLowerCase('vi-VN')
    .trim()
    .replace(/[%,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
      id::bigint,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00'
        as created_at,
      type,
      title,
      description,
      location,
      contact_info,
      user_name,
      image_url,
      status,
      is_deleted,
      user_id::text
    from public.lost_found_items
    where is_deleted = false
      and status in ('approved', 'resolved')
    order by id
  `);
  rows = result.rows;
} finally {
  await client.end();
}

const values = rows.map((row) => [
  Number(row.id),
  sqlText(row.created_at),
  sqlText(row.type),
  sqlText(row.title),
  sqlText(row.description),
  sqlText(row.location),
  sqlText(row.contact_info),
  sqlText(row.user_name),
  sqlText(row.image_url),
  sqlText(row.status),
  row.is_deleted ? '1' : '0',
  sqlText(row.user_id),
  sqlText(normalizeSearch(row.title)),
  sqlText(normalizeSearch(row.location)),
  sqlText(normalizeSearch(row.description)),
].join(', '));

const statements = [
  'DELETE FROM public_lost_found_items;',
  "DELETE FROM sync_metadata WHERE resource = 'lost_found_items';",
];

for (const value of values) {
  statements.push(`
INSERT INTO public_lost_found_items (
  id, created_at, type, title, description, location, contact_info,
  user_name, image_url, status, is_deleted, user_id, title_search,
  location_search, description_search
)
VALUES (${value});`);
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
  'lost_found_items',
  ${rows.length},
  ${sqlText(sourceMaxCreatedAt)},
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
  `Seeded ${rows.length} public lost-found items into ${
    targetFlag === '--remote' ? 'remote' : 'local'
  } D1.`
);
