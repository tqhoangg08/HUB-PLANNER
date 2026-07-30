import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const CACHE_DIR = path.join(ROOT, '.cache', 'cloudflare');
const SEED_FILE = path.join(CACHE_DIR, 'events-seed.sql');
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

const sqlBoolean = (value) => (value ? '1' : '0');

const normalizeSearch = (value) =>
  String(value || '')
    .toLocaleLowerCase('vi-VN')
    .replace(/[%,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
      title,
      organizer,
      category,
      criteria,
      points,
      format,
      deadline::text,
      deadline_time,
      close_on_full,
      description,
      link,
      classification,
      location_type,
      status,
      is_manually_closed,
      is_deleted,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00'
        as created_at,
      event_date::text,
      event_time::text,
      registration_start_date::text,
      registration_start_time::text,
      image_url
    from public.events
    where (is_deleted = false or is_deleted is null)
      and status <> 'pending'
    order by id
  `);
  rows = result.rows;
} finally {
  await client.end();
}

const values = rows.map((row) => [
  Number(row.id),
  sqlText(row.title),
  sqlText(row.organizer),
  sqlText(row.category),
  sqlText(row.criteria),
  sqlText(row.points),
  sqlText(row.format),
  sqlText(row.deadline),
  sqlText(row.deadline_time),
  sqlBoolean(row.close_on_full),
  sqlText(row.description),
  sqlText(row.link),
  sqlText(row.classification),
  sqlText(row.location_type),
  sqlText(row.status),
  sqlBoolean(row.is_manually_closed),
  sqlBoolean(row.is_deleted),
  sqlText(row.created_at),
  sqlText(row.event_date),
  sqlText(row.event_time),
  sqlText(row.registration_start_date),
  sqlText(row.registration_start_time),
  sqlText(row.image_url),
  sqlText(normalizeSearch(row.title)),
  sqlText(normalizeSearch(row.organizer)),
].join(', '));

const statements = [
  'DELETE FROM public_events;',
  "DELETE FROM sync_metadata WHERE resource = 'events';",
];

// Event descriptions and image URLs can be large. Keep each INSERT below
// Wrangler's local SQLite statement-size limit instead of truncating data.
const batchSize = 1;
for (let index = 0; index < values.length; index += batchSize) {
  statements.push(`
INSERT INTO public_events (
  id, title, organizer, category, criteria, points, format, deadline,
  deadline_time, close_on_full, description, link, classification,
  location_type, status, is_manually_closed, is_deleted, created_at,
  event_date, event_time, registration_start_date, registration_start_time,
  image_url, title_search, organizer_search
)
VALUES
  (${values.slice(index, index + batchSize).join('),\n  (')});`);
}

const sourceMaxCreatedAt = rows.reduce(
  (current, row) =>
    !current || row.created_at > current ? row.created_at : current,
  null
);
const visibleRowCount = rows.length;
statements.push(`
INSERT INTO sync_metadata (
  resource, source_row_count, source_max_created_at, synced_at, visible_row_count
)
VALUES (
  'events',
  ${rows.length},
  ${sqlText(sourceMaxCreatedAt)},
  ${sqlText(new Date().toISOString())},
  ${visibleRowCount}
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
  `Seeded ${rows.length} events into ${
    targetFlag === '--remote' ? 'remote' : 'local'
  } D1.`
);
