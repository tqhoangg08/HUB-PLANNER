import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const REMOTE = process.argv.includes('--remote');
const CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.jsonc');
const CACHE = path.join(ROOT, '.cache', 'cloudflare', 'lost-found-cutover');
const SQL_FILE = path.join(CACHE, 'cutover.sql');
const DB_NAME = 'hub-planner-public-dev';
const BUCKET = 'hub-planner';
const R2_PUBLIC_HOST = 'pub-ca82d2fb2eba4a8f9373a3e45dc89265.r2.dev';

const envValue = (name) => {
  const source = requireEnv();
  const match = source.match(new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm'));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
};
let envText;
const requireEnv = () => envText ??= requireEnv.read();
requireEnv.read = () => {
  try { return process.loadEnvFile ? (process.loadEnvFile('.env.local'), '') : ''; }
  catch { return ''; }
};

// Node's loadEnvFile intentionally keeps values out of output. Older runtimes
// fall back to the ignored local env file parser.
try { process.loadEnvFile?.('.env.local'); } catch {}
if (!process.env.SUPABASE_DATABASE_URL) {
  envText = await readFile(path.join(ROOT, '.env.local'), 'utf8');
  process.env.SUPABASE_DATABASE_URL = envValue('SUPABASE_DATABASE_URL');
}
if (!process.env.SUPABASE_DATABASE_URL) throw new Error('SUPABASE_DATABASE_URL is unavailable.');

const wrangler = (...args) => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_LOG_PATH: path.join(CACHE, 'wrangler.log') },
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Wrangler failed at ${args.slice(0, 3).join(' ')} (exit ${result.status ?? 'unknown'}).`);
  return result.stdout;
};
const wranglerPipe = (args, bytes) => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args], {
    cwd: ROOT,
    input: bytes,
    encoding: 'buffer',
    env: { ...process.env, WRANGLER_LOG_PATH: path.join(CACHE, 'wrangler.log') },
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`R2 upload failed (exit ${result.status ?? 'unknown'}).`);
};
const sql = (value) => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const normalize = (value) => String(value || '').toLocaleLowerCase('vi-VN').trim().replace(/[%,]/g, ' ').replace(/\s+/g, ' ').trim();
const routeFor = (key) => `/api/public/v1/lost-found-images/${key.split('/').map(encodeURIComponent).join('/')}`;
const extensionFor = (type) => type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'jpg';
const isImageType = (type) => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type);

const fetchImage = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
  if (!response.ok) throw new Error(`Legacy image fetch returned ${response.status}.`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > 3 * 1024 * 1024) throw new Error('Legacy image exceeds the 3 MiB limit.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new Error('Legacy image size is invalid.');
  const contentType = String(response.headers.get('content-type') || '').split(';', 1)[0].toLowerCase();
  if (!isImageType(contentType)) throw new Error('Legacy object is not a supported image.');
  return { bytes, contentType, hash: createHash('sha256').update(bytes).digest('hex') };
};

await mkdir(CACHE, { recursive: true });
const source = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await source.connect();
let rows;
try {
  rows = (await source.query(`SELECT id::bigint, created_at, type, title, description, location,
    contact_info, user_name, image_url, status, is_deleted, user_id::text
    FROM public.lost_found_items ORDER BY id`)).rows;
} finally { await source.end(); }

let imageCount = 0;
let uploaded = 0;
let reused = 0;
let imageBytes = 0;
for (const row of rows) {
  row.image_key = null;
  if (!row.image_url) continue;
  imageCount += 1;
  const current = new URL(row.image_url);
  const fetched = await fetchImage(current);
  imageBytes += fetched.bytes.length;
  const existingKey = current.hostname === R2_PUBLIC_HOST && current.pathname.startsWith('/lost-found/')
    ? current.pathname.slice(1)
    : null;
  const key = existingKey || `lost-found/migrated/${row.id}-${fetched.hash.slice(0, 16)}.${extensionFor(fetched.contentType)}`;
  if (APPLY && !existingKey) {
    wranglerPipe(['r2', 'object', 'put', `${BUCKET}/${key}`, REMOTE ? '--remote' : '--local', '--pipe', '--content-type', fetched.contentType, '--cache-control', 'public, max-age=31536000, immutable', '--config', CONFIG], fetched.bytes);
    uploaded += 1;
  } else if (existingKey) reused += 1;
  row.image_key = key;
  row.image_url = routeFor(key);
}

const statements = [];
for (const row of rows) {
  const status = ['pending', 'approved', 'rejected', 'resolved'].includes(String(row.status).toLowerCase()) ? String(row.status).toLowerCase() : 'pending';
  const createdAt = new Date(row.created_at).toISOString();
  statements.push(`INSERT INTO lost_found_items (id,created_at,updated_at,type,title,description,location,contact_info,user_name,image_url,image_key,status,is_deleted,user_id,title_search,location_search,description_search)
    VALUES (${Number(row.id)},${sql(createdAt)},${sql(createdAt)},${sql(row.type)},${sql(row.title)},${sql(row.description)},${sql(row.location)},${sql(row.contact_info)},${sql(row.user_name)},${sql(row.image_url)},${sql(row.image_key)},${sql(status)},${row.is_deleted ? 1 : 0},${sql(row.user_id)},${sql(normalize(row.title))},${sql(normalize(row.location))},${sql(normalize(row.description))})
    ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at,type=excluded.type,title=excluded.title,description=excluded.description,location=excluded.location,contact_info=excluded.contact_info,user_name=excluded.user_name,image_url=excluded.image_url,image_key=excluded.image_key,status=excluded.status,is_deleted=excluded.is_deleted,user_id=excluded.user_id,title_search=excluded.title_search,location_search=excluded.location_search,description_search=excluded.description_search;`);
  if (!row.is_deleted && (status === 'approved' || status === 'resolved')) statements.push(`INSERT INTO public_lost_found_items (id,created_at,type,title,description,location,contact_info,user_name,image_url,status,is_deleted,user_id,title_search,location_search,description_search)
    SELECT id,created_at,type,title,description,location,contact_info,user_name,image_url,status,is_deleted,user_id,title_search,location_search,description_search FROM lost_found_items WHERE id=${Number(row.id)}
    ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at,type=excluded.type,title=excluded.title,description=excluded.description,location=excluded.location,contact_info=excluded.contact_info,user_name=excluded.user_name,image_url=excluded.image_url,status=excluded.status,is_deleted=excluded.is_deleted,user_id=excluded.user_id,title_search=excluded.title_search,location_search=excluded.location_search,description_search=excluded.description_search;`);
}
statements.push(`DELETE FROM public_lost_found_items WHERE id NOT IN (SELECT id FROM lost_found_items WHERE is_deleted=0 AND status IN ('approved','resolved'));`);
statements.push(`UPDATE sync_metadata SET source_row_count=${rows.length}, visible_row_count=(SELECT COUNT(*) FROM public_lost_found_items), source_max_created_at=(SELECT MAX(created_at) FROM lost_found_items), synced_at=${sql(new Date().toISOString())} WHERE resource='lost_found_items';`);

if (APPLY) {
  await writeFile(SQL_FILE, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  try { wrangler('d1', 'execute', DB_NAME, REMOTE ? '--remote' : '--local', '--file', SQL_FILE, '--config', CONFIG); }
  finally { await rm(SQL_FILE, { force: true }); }
}

console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'audit', target: REMOTE ? 'remote' : 'local', sourceRows: rows.length, visibleRows: rows.filter((row) => !row.is_deleted && ['approved', 'resolved'].includes(String(row.status).toLowerCase())).length, images: imageCount, imagesUploaded: uploaded, imagesReused: reused, imageBytes, canonicalHash: createHash('sha256').update(rows.map((row) => [row.id, row.created_at, row.type, row.status, row.is_deleted, row.image_key].join('|')).join('\n')).digest('hex') }));
