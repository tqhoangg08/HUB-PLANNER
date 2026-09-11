import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.local');
const CACHE_DIR = path.join(ROOT, '.cache', 'cloudflare');
const WRANGLER_CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.jsonc');
const DATABASE_NAME = 'hub-planner-public-dev';
const targetFlag = process.argv.includes('--remote') ? '--remote' : '--local';

const parseEnvValue = (source, name) => {
  const match = source.match(
    new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm')
  );
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};

const normalizeSearch = (value) =>
  String(value || '')
    .toLocaleLowerCase('vi-VN')
    .replace(/[%,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
let sourceRows;
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
      image_url,
      contribution_link,
      contributor_note,
      section,
      score::text
    from public.events
    order by id
  `);
  sourceRows = result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    close_on_full: Boolean(row.close_on_full),
    is_manually_closed: Boolean(row.is_manually_closed),
    is_deleted: Boolean(row.is_deleted),
    title_search: normalizeSearch(row.title),
    organizer_search: normalizeSearch(row.organizer),
  }));
} finally {
  await client.end();
}

const columns = [
  'id', 'title', 'organizer', 'category', 'criteria', 'points', 'format',
  'deadline', 'deadline_time', 'close_on_full', 'description', 'link',
  'classification', 'location_type', 'status', 'is_manually_closed',
  'is_deleted', 'created_at', 'event_date', 'event_time',
  'registration_start_date', 'registration_start_time', 'image_url',
  'contribution_link', 'contributor_note', 'section', 'score',
  'title_search', 'organizer_search',
];
const query = `SELECT ${columns.join(', ')} FROM admin_events ORDER BY id`;
const wranglerEntry = path.join(
  ROOT,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js'
);
const result = spawnSync(
  process.execPath,
  [
    wranglerEntry,
    'd1',
    'execute',
    DATABASE_NAME,
    targetFlag,
    '--config',
    WRANGLER_CONFIG,
    '--command',
    query,
    '--json',
  ],
  {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      XDG_CONFIG_HOME: path.join(CACHE_DIR, 'xdg'),
      WRANGLER_LOG_PATH: path.join(CACHE_DIR, 'wrangler.log'),
    },
  }
);
if (result.status !== 0) {
  process.stderr.write(result.stderr || '');
  throw new Error(`Wrangler exited with code ${result.status ?? 'unknown'}.`);
}

const jsonStart = result.stdout.indexOf('[');
if (jsonStart < 0) {
  throw new Error('Wrangler did not return a JSON result.');
}
const payload = JSON.parse(result.stdout.slice(jsonStart));
const candidateRows = (payload?.[0]?.results || []).map((row) => ({
  ...row,
  id: Number(row.id),
  close_on_full: Boolean(row.close_on_full),
  is_manually_closed: Boolean(row.is_manually_closed),
  is_deleted: Boolean(row.is_deleted),
}));

const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
const candidateById = new Map(candidateRows.map((row) => [row.id, row]));
const allIds = [...new Set([...sourceById.keys(), ...candidateById.keys()])]
  .sort((left, right) => left - right);
const mismatches = [];

for (const id of allIds) {
  const source = sourceById.get(id);
  const candidate = candidateById.get(id);
  if (!source || !candidate) {
    mismatches.push({ id, fields: ['missing_row'] });
    continue;
  }
  const fields = columns.filter(
    (column) =>
      JSON.stringify(source[column] ?? null) !==
      JSON.stringify(candidate[column] ?? null)
  );
  if (fields.length > 0) mismatches.push({ id, fields });
}

console.table({
  source: sourceRows.length,
  candidate: candidateRows.length,
  mismatches: mismatches.length,
});
if (mismatches.length > 0) {
  console.table(mismatches.slice(0, 10));
  console.error('Admin event D1 comparison failed.');
  process.exitCode = 1;
} else {
  console.log(`Admin event D1 comparison matched ${sourceRows.length} rows.`);
}
