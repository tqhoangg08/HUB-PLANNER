import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const CACHE_DIR = path.join(ROOT, '.cache', 'cloudflare');
const SEED_FILE = path.join(CACHE_DIR, 'school-announcements-seed.sql');
const WRANGLER_CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.jsonc');
const DATABASE_NAME = 'hub-planner-public-dev';
const targetFlag = process.argv.includes('--remote') ? '--remote' : '--local';

const parseEnvValue = (source, name) => {
  const match = source.match(new RegExp(`^${name}=(?:\"([^\"]*)\"|'([^']*)'|([^\\r\\n]*))`, 'm'));
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};

const sqlText = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
};

const sqlInteger = (value) => (value ? '1' : '0');

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
    throw new Error(`Wrangler kết thúc với mã ${result.status ?? 'không xác định'}.`);
  }
};

const envText = await readFile(ENV_FILE, 'utf8');
const connectionString = parseEnvValue(envText, 'SUPABASE_DATABASE_URL');
if (!connectionString) throw new Error('Không tìm thấy SUPABASE_DATABASE_URL trong .env.local.');

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
let rows;
try {
  const result = await client.query(`
    select
      id,
      title,
      link,
      date,
      is_new,
      case
        when created_at is null then null
        else to_char(
          created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US'
        ) || '+00:00'
      end as created_at,
      is_hidden
      from public.school_announcements
     order by id
  `);
  rows = result.rows;
} finally {
  await client.end();
}

const values = rows.map((row) => {
  // Do not normalize Unicode composition here. PostgreSQL ILIKE treats a
  // decomposed title differently from a precomposed query, so preserving the
  // original composition keeps shadow results compatible.
  const titleSearch = String(row.title || '').toLocaleLowerCase('vi-VN');
  return [
    Number(row.id),
    sqlText(row.title),
    sqlText(titleSearch),
    sqlText(row.link),
    sqlText(row.date),
    sqlInteger(row.is_new),
    sqlText(row.created_at),
    sqlInteger(row.is_hidden),
  ].join(', ');
});

const statements = [
  'DELETE FROM school_announcements;',
  'DELETE FROM sync_metadata WHERE resource = \'school_announcements\';',
];

// Keep each SQL statement below D1's statement-size limit. Announcement titles
// and links can be long, so deliberately use small batches.
const batchSize = 20;
for (let index = 0; index < values.length; index += batchSize) {
  statements.push(`
INSERT INTO school_announcements
  (id, title, title_search, link, date, is_new, created_at, is_hidden)
VALUES
  (${values.slice(index, index + batchSize).join('),\n  (')});`);
}

const latestCreatedAt = rows.reduce((latest, row) => {
  const current = String(row.created_at || '');
  return current > latest ? current : latest;
}, '');
const visibleRowCount = rows.filter((row) => !row.is_hidden).length;

statements.push(`
INSERT INTO sync_metadata (
  resource, source_row_count, source_max_created_at, synced_at, visible_row_count
)
VALUES (
  'school_announcements',
  ${rows.length},
  ${sqlText(latestCreatedAt || null)},
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
  `Đã đồng bộ ${rows.length} thông báo từ Supabase vào D1 ${
    targetFlag === '--remote' ? 'development remote' : 'local'
  }.`
);
