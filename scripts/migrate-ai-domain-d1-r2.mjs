import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const REMOTE = process.argv.includes('--remote');
const APPLY_SOURCE_PREFLIGHT = process.argv.includes('--apply-source-preflight');
const VERIFY = process.argv.includes('--verify');
const CONFIG = path.join(ROOT, 'cloudflare', 'wrangler.jsonc');
const CACHE = path.join(ROOT, '.cache', 'cloudflare', 'ai-domain-cutover');
const SQL_FILE = path.join(CACHE, 'cutover.sql');
const SOURCE_PREFLIGHT = path.join(ROOT, 'supabase', 'migrations', '20260912210000_remove_ai_from_account_delete_preflight.sql');
const DB_NAME = 'hub-planner-public-dev';
const BUCKET = 'hub-planner';

try { process.loadEnvFile?.('.env.local'); } catch {}
if (!process.env.SUPABASE_DATABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const text = await readFile(path.join(ROOT, '.env.local'), 'utf8');
  const read = (name) => {
    const match = text.match(new RegExp(`^${name}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n]*))`, 'm'));
    return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
  };
  process.env.SUPABASE_DATABASE_URL ||= read('SUPABASE_DATABASE_URL');
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= read('SUPABASE_SERVICE_ROLE_KEY');
  process.env.VITE_SUPABASE_URL ||= read('VITE_SUPABASE_URL');
}
if (!process.env.SUPABASE_DATABASE_URL) throw new Error('SUPABASE_DATABASE_URL is unavailable.');

const wrangler = (...args) => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_LOG_PATH: path.join(CACHE, 'wrangler.log') },
    maxBuffer: 16 * 1024 * 1024,
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
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`R2 upload failed (exit ${result.status ?? 'unknown'}).`);
};

const sql = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const int = (value) => value == null ? 'NULL' : Number(value) ? 1 : 0;
const iso = (value) => new Date(value).toISOString();
const safeName = (value) => String(value || 'document')
  .normalize('NFKC').replace(/[\\/\0-\x1f\x7f]+/g, '-').replace(/\.\.+/g, '.')
  .replace(/[^\p{L}\p{N}._ -]+/gu, '-').replace(/\s+/g, ' ').trim().slice(0, 180) || 'document';
const rowHash = (row) => createHash('sha256').update(JSON.stringify(row)).digest('hex');

const source = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await source.connect();
let documents;
let logs;
try {
  documents = (await source.query(`SELECT id::text,title,original_file_name,storage_path,mime_type,file_size,
    content_hash,category,academic_year,program_code,visibility,version,gemini_store_name,
    gemini_document_name,gemini_operation_name,indexing_status,indexing_error,uploaded_by::text,
    created_at,updated_at,deleted_at FROM public.ai_documents ORDER BY id`)).rows;
  logs = (await source.query(`SELECT id::bigint,created_at,user_id::text,user_message,bot_reply,is_helpful,
    metadata,title,is_deleted,is_pinned,notice_sources,document_sources,document_search_unavailable
    FROM public.ai_chat_logs ORDER BY id`)).rows;
  if (APPLY_SOURCE_PREFLIGHT) await source.query(await readFile(SOURCE_PREFLIGHT, 'utf8'));
} finally { await source.end(); }

await mkdir(CACHE, { recursive: true });
let filesMigrated = 0;
let fileBytes = 0;
for (const document of documents) {
  const targetKey = `ai-documents/migrated/${document.id}-${safeName(document.original_file_name)}`;
  document.target_storage_path = targetKey;
  if (!APPLY || document.deleted_at) continue;
  const base = String(process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !serviceKey) throw new Error('Supabase Storage source configuration is unavailable.');
  const objectPath = String(document.storage_path).split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${base}/storage/v1/object/ai-documents/${objectPath}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Source document fetch failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== Number(document.file_size) || hash !== document.content_hash) throw new Error('Source document integrity check failed.');
  wranglerPipe(['r2', 'object', 'put', `${BUCKET}/${targetKey}`, REMOTE ? '--remote' : '--local', '--pipe', '--content-type', document.mime_type, '--config', CONFIG], bytes);
  filesMigrated += 1;
  fileBytes += bytes.length;
}

const statements = [];
for (const document of documents) {
  const canonical = rowHash([
    document.id, document.title, document.original_file_name, document.target_storage_path,
    document.mime_type, Number(document.file_size), document.content_hash, document.category,
    document.academic_year, document.program_code, document.visibility, Number(document.version),
    document.gemini_store_name, document.gemini_document_name, document.gemini_operation_name,
    document.indexing_status, document.uploaded_by, iso(document.created_at), iso(document.updated_at),
    document.deleted_at ? iso(document.deleted_at) : null,
  ]);
  document.__canonical = canonical;
  statements.push(`INSERT INTO ai_documents (id,title,original_file_name,storage_path,mime_type,file_size,content_hash,category,academic_year,program_code,visibility,version,gemini_store_name,gemini_document_name,gemini_operation_name,indexing_status,indexing_error,uploaded_by,created_at,updated_at,deleted_at,canonical_hash)
    VALUES (${sql(document.id)},${sql(document.title)},${sql(document.original_file_name)},${sql(document.target_storage_path)},${sql(document.mime_type)},${Number(document.file_size)},${sql(document.content_hash)},${sql(document.category)},${sql(document.academic_year)},${sql(document.program_code || 'all')},${sql(document.visibility || 'public')},${Number(document.version || 1)},${sql(document.gemini_store_name)},${sql(document.gemini_document_name)},${sql(document.gemini_operation_name)},${sql(document.indexing_status || 'pending')},${sql(document.indexing_error)},${sql(document.uploaded_by)},${sql(iso(document.created_at))},${sql(iso(document.updated_at))},${sql(document.deleted_at ? iso(document.deleted_at) : null)},${sql(canonical)})
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,original_file_name=excluded.original_file_name,storage_path=excluded.storage_path,mime_type=excluded.mime_type,file_size=excluded.file_size,content_hash=excluded.content_hash,category=excluded.category,academic_year=excluded.academic_year,program_code=excluded.program_code,visibility=excluded.visibility,version=excluded.version,gemini_store_name=excluded.gemini_store_name,gemini_document_name=excluded.gemini_document_name,gemini_operation_name=excluded.gemini_operation_name,indexing_status=excluded.indexing_status,indexing_error=excluded.indexing_error,uploaded_by=excluded.uploaded_by,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,canonical_hash=excluded.canonical_hash;`);
}
for (const log of logs) {
  const created = iso(log.created_at);
  const metadataJson = log.metadata == null ? null : JSON.stringify(log.metadata);
  const notices = JSON.stringify(log.notice_sources || []);
  const documentSources = JSON.stringify(log.document_sources || []);
  const canonical = rowHash([String(log.id), created, log.user_id, log.user_message, log.bot_reply, log.is_helpful,
    metadataJson, log.title, Boolean(log.is_deleted), Boolean(log.is_pinned), notices, documentSources,
    Boolean(log.document_search_unavailable)]);
  log.__canonical = canonical;
  statements.push(`INSERT INTO ai_chat_logs (id,created_at,user_id,user_message,bot_reply,is_helpful,metadata_json,title,is_deleted,is_pinned,notice_sources_json,document_sources_json,document_search_unavailable,canonical_hash)
    VALUES (${Number(log.id)},${sql(created)},${sql(log.user_id)},${sql(log.user_message)},${sql(log.bot_reply)},${int(log.is_helpful)},${sql(metadataJson)},${sql(log.title)},${int(log.is_deleted) || 0},${int(log.is_pinned) || 0},${sql(notices)},${sql(documentSources)},${int(log.document_search_unavailable) || 0},${sql(canonical)})
    ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at,user_id=excluded.user_id,user_message=excluded.user_message,bot_reply=excluded.bot_reply,is_helpful=excluded.is_helpful,metadata_json=excluded.metadata_json,title=excluded.title,is_deleted=excluded.is_deleted,is_pinned=excluded.is_pinned,notice_sources_json=excluded.notice_sources_json,document_sources_json=excluded.document_sources_json,document_search_unavailable=excluded.document_search_unavailable,canonical_hash=excluded.canonical_hash;`);
}

if (APPLY) {
  await writeFile(SQL_FILE, `${statements.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  try { wrangler('d1', 'execute', DB_NAME, REMOTE ? '--remote' : '--local', '--file', SQL_FILE, '--config', CONFIG); }
  finally { await rm(SQL_FILE, { force: true }); }
}

const aggregateHash = (values) => createHash('sha256').update(values.join('\n')).digest('hex');
const sourceDocumentHash = aggregateHash(documents.map((row) => row.__canonical));
const sourceLogHash = aggregateHash(logs.map((row) => row.__canonical));
let targetDocuments = null;
let targetChatLogs = null;
let targetDocumentHash = null;
let targetLogHash = null;
if (VERIFY) {
  const output = wrangler('d1', 'execute', DB_NAME, REMOTE ? '--remote' : '--local', '--command',
    'SELECT id, canonical_hash FROM ai_documents ORDER BY id; SELECT id, canonical_hash FROM ai_chat_logs ORDER BY id;',
    '--json', '--config', CONFIG);
  const payload = JSON.parse(output.slice(output.indexOf('[')));
  const documentRows = payload[0]?.results || [];
  const logRows = payload[1]?.results || [];
  targetDocuments = documentRows.length;
  targetChatLogs = logRows.length;
  targetDocumentHash = aggregateHash(documentRows.map((row) => row.canonical_hash));
  targetLogHash = aggregateHash(logRows.map((row) => row.canonical_hash));
}
console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'audit',
  target: REMOTE ? 'remote' : 'local',
  documents: documents.length,
  chatLogs: logs.length,
  filesMigrated,
  fileBytes,
  geminiMappingsPreserved: documents.filter((row) => row.gemini_document_name).length,
  sourceDocumentHash,
  sourceLogHash,
  targetDocuments,
  targetChatLogs,
  targetDocumentHash,
  targetLogHash,
  parity: VERIFY
    ? documents.length === targetDocuments && logs.length === targetChatLogs
      && sourceDocumentHash === targetDocumentHash && sourceLogHash === targetLogHash
    : null,
  sourcePreflightUpdated: APPLY_SOURCE_PREFLIGHT,
}));
