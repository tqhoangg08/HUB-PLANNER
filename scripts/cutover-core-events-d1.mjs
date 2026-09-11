import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, '.cache', 'cloudflare');
const SQL_FILE = path.join(CACHE_DIR, 'core-events-cutover.sql');
const ENV_FILE = path.join(ROOT, '.env.local');
const WRANGLER_CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.jsonc');
const DATABASE_NAME = 'hub-planner-public-dev';

if (!process.argv.includes('--apply') || !process.argv.includes('--remote')) {
  throw new Error('Core event cutover requires explicit --apply --remote flags.');
}

const parseEnvValue = (source, name) => {
  const match = source.match(new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm'));
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? '';
};
const sqlText = (value) => value === null || value === undefined
  ? 'NULL'
  : `'${String(value).replaceAll("'", "''")}'`;
const sqlBoolean = (value) => value ? '1' : '0';
const normalizeSearch = (value) => String(value || '')
  .toLocaleLowerCase('vi-VN')
  .replace(/[%,]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const envText = await readFile(ENV_FILE, 'utf8');
const connectionString = parseEnvValue(envText, 'SUPABASE_DATABASE_URL');
if (!connectionString) throw new Error('SUPABASE_DATABASE_URL was not found in .env.local.');

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
let rows;
try {
  const result = await client.query(`
    select
      id::bigint, title, organizer, category, criteria, points, format,
      deadline::text, deadline_time, close_on_full, description, link,
      classification, location_type, status, is_manually_closed, is_deleted,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00' as created_at,
      event_date::text, event_time::text, registration_start_date::text,
      registration_start_time::text, image_url, contribution_link,
      contributor_note, section, score::text
    from public.events
    order by id
  `);
  rows = result.rows;
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
const mutable = columns.slice(1);
// Wrangler applies file statements sequentially. Keep every operation
// independently idempotent; the current production mirror remains active
// until parity is verified and the D1-authority Worker is deployed.
const statements = [];
for (const row of rows) {
  const values = [
    Number(row.id), row.title, row.organizer, row.category, row.criteria,
    row.points, row.format, row.deadline, row.deadline_time,
    sqlBoolean(row.close_on_full), row.description, row.link,
    row.classification, row.location_type, row.status,
    sqlBoolean(row.is_manually_closed), sqlBoolean(row.is_deleted),
    row.created_at, row.event_date, row.event_time,
    row.registration_start_date, row.registration_start_time, row.image_url,
    row.contribution_link, row.contributor_note, row.section, row.score,
    normalizeSearch(row.title), normalizeSearch(row.organizer),
  ].map((value, index) => index === 0 || [9, 15, 16].includes(index) ? String(value) : sqlText(value));
  statements.push(`INSERT INTO admin_events (${columns.join(', ')}) VALUES (${values.join(', ')})
    ON CONFLICT(id) DO UPDATE SET ${mutable.map((column) => `${column}=excluded.${column}`).join(', ')};`);
}
statements.push(`
  INSERT INTO public_events (
    id, title, organizer, category, criteria, points, format, deadline,
    deadline_time, close_on_full, description, link, classification,
    location_type, status, is_manually_closed, is_deleted, created_at,
    event_date, event_time, registration_start_date, registration_start_time,
    image_url, title_search, organizer_search
  )
  SELECT
    id, title, organizer, category, criteria, points, format, deadline,
    deadline_time, close_on_full, description, link, classification,
    location_type, status, is_manually_closed, is_deleted, created_at,
    event_date, event_time, registration_start_date, registration_start_time,
    image_url, title_search, organizer_search
  FROM admin_events
  WHERE COALESCE(is_deleted, 0) = 0 AND COALESCE(status, '') <> 'pending'
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title, organizer=excluded.organizer, category=excluded.category,
    criteria=excluded.criteria, points=excluded.points, format=excluded.format,
    deadline=excluded.deadline, deadline_time=excluded.deadline_time,
    close_on_full=excluded.close_on_full, description=excluded.description,
    link=excluded.link, classification=excluded.classification,
    location_type=excluded.location_type, status=excluded.status,
    is_manually_closed=excluded.is_manually_closed, is_deleted=excluded.is_deleted,
    created_at=excluded.created_at, event_date=excluded.event_date,
    event_time=excluded.event_time,
    registration_start_date=excluded.registration_start_date,
    registration_start_time=excluded.registration_start_time,
    image_url=excluded.image_url, title_search=excluded.title_search,
    organizer_search=excluded.organizer_search;

  DELETE FROM public_events
   WHERE id NOT IN (
     SELECT id FROM admin_events
      WHERE COALESCE(is_deleted, 0) = 0 AND COALESCE(status, '') <> 'pending'
   );

  UPDATE core_event_id_sequence
     SET next_id = (SELECT COALESCE(MAX(id), 0) + 1 FROM admin_events)
   WHERE singleton = 1;`);

await mkdir(CACHE_DIR, { recursive: true });
await writeFile(SQL_FILE, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
try {
  const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(process.execPath, [
    wrangler, 'd1', 'execute', DATABASE_NAME, '--remote',
    '--config', WRANGLER_CONFIG, '--file', SQL_FILE,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    throw new Error(`Wrangler exited with code ${result.status ?? 'unknown'}.`);
  }
} finally {
  await rm(SQL_FILE, { force: true });
}

console.log(`CORE_EVENT_CUTOVER_ROWS=${rows.length}`);
console.log('CORE_EVENT_CUTOVER_D1=PASS');
