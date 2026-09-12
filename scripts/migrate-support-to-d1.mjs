// Operator-only, idempotent support cutover. Never invoked by CI.
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const APPLY_SOURCE_PREFLIGHT = process.argv.includes('--apply-source-preflight');
const ROOT = new URL('../', import.meta.url);
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const CONFIG = 'cloudflare/wrangler.jsonc';
const DATABASE = 'hub-planner-public-dev';
try { process.loadEnvFile?.('.env.local'); } catch {}
if (!process.env.SUPABASE_DATABASE_URL) {
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^SUPABASE_DATABASE_URL=(.*)$/);
      if (match) process.env.SUPABASE_DATABASE_URL = match[1].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}
if (!process.env.SUPABASE_DATABASE_URL) throw new Error('SOURCE_CONFIGURATION_UNAVAILABLE');

const source = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await source.connect();
let tickets;
let messages;
let attachments;
try {
  if (APPLY_SOURCE_PREFLIGHT) {
    await source.query(readFileSync(new URL('../supabase/migrations/20260912103000_remove_support_from_account_delete_preflight.sql', import.meta.url), 'utf8'));
    const check = await source.query("SELECT pg_get_functiondef('public.preflight_account_delete_source_cleanup()'::regprocedure) !~ 'support_ticket' AS support_free");
    if (check.rows[0]?.support_free !== true) throw new Error('SOURCE_PREFLIGHT_VERIFY_FAILED');
  }
  tickets = (await source.query('SELECT id::text,user_id::text,assigned_to::text,subject,category,priority,status,initial_message,attachment_urls,last_message_at,resolved_at,resolved_by::text,resolved_by_role,first_admin_reply_email_sent_at,first_admin_reply_email_message_id::text,created_at,updated_at FROM public.support_tickets ORDER BY id')).rows;
  messages = (await source.query('SELECT id::text,ticket_id::text,sender_id::text,sender_role,body,attachment_urls,is_internal_note,metadata,created_at FROM public.support_ticket_messages ORDER BY id')).rows;
  attachments = (await source.query('SELECT id::text,ticket_id::text,message_id::text,uploaded_by::text,file_key,file_name,mime_type,size_bytes::bigint,storage_provider,status,metadata,created_at FROM public.support_ticket_attachments ORDER BY id')).rows;
} finally {
  await source.end();
}
if (attachments.some((row) => row.storage_provider !== 'cloudflare_r2')) throw new Error('NON_R2_SUPPORT_ATTACHMENT_FOUND');
const ticketIds = new Set(tickets.map((row) => row.id));
const messageIds = new Set(messages.map((row) => row.id));
if (messages.some((row) => !ticketIds.has(row.ticket_id)) || attachments.some((row) => !ticketIds.has(row.ticket_id) || (row.message_id && !messageIds.has(row.message_id)))) {
  throw new Error('SOURCE_RELATIONSHIP_INVALID');
}

const q = (value) => value === null || value === undefined ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
const iso = (value) => value ? new Date(value).toISOString() : null;
const json = (value, fallback) => JSON.stringify(value ?? fallback);
const hash = (row) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
const runWrangler = (args, errorCode, options = {}) => {
  try {
    return execFileSync(process.execPath, [WRANGLER, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch {
    // Wrangler includes the complete command (and therefore SQL literals) in
    // child-process errors. Operator output must stay metadata-only.
    throw new Error(errorCode);
  }
};
const d1Json = (command) => {
  const output = runWrangler(
    ['d1', 'execute', DATABASE, '--remote', '--json', '--config', CONFIG, '--command', command],
    'D1_METADATA_QUERY_FAILED',
  );
  return JSON.parse(output.slice(output.indexOf('[')))?.[0]?.results || [];
};
const owners = [...new Set([
  ...tickets.flatMap((row) => [row.user_id, row.assigned_to, row.resolved_by]),
  ...messages.map((row) => row.sender_id),
  ...attachments.map((row) => row.uploaded_by),
].filter(Boolean))];
const knownOwners = new Set();
for (let offset = 0; offset < owners.length; offset += 80) {
  const page = owners.slice(offset, offset + 80);
  for (const row of d1Json('SELECT user_id FROM user_profiles WHERE user_id IN (' + page.map(q).join(',') + ')')) knownOwners.add(String(row.user_id));
}
const missingOwnerProfiles = owners.filter((owner) => !knownOwners.has(owner)).length;
const ticketHashes = new Map(tickets.map((row) => [row.id, hash(row)]));
const messageHashes = new Map(messages.map((row) => [row.id, hash(row)]));
const attachmentHashes = new Map(attachments.map((row) => [row.id, hash(row)]));
const statements = [];
for (const row of tickets) {
  statements.push('INSERT INTO support_tickets (id,user_id,assigned_to,subject,category,priority,status,initial_message,attachment_urls_json,last_message_at,resolved_at,resolved_by,resolved_by_role,first_admin_reply_email_sent_at,first_admin_reply_email_message_id,created_at,updated_at,canonical_hash) VALUES (' +
    [row.id,row.user_id,row.assigned_to,row.subject,row.category,row.priority,row.status,row.initial_message,json(row.attachment_urls,[]),iso(row.last_message_at),iso(row.resolved_at),row.resolved_by,row.resolved_by_role,iso(row.first_admin_reply_email_sent_at),row.first_admin_reply_email_message_id,iso(row.created_at),iso(row.updated_at),ticketHashes.get(row.id)].map(q).join(',') +
    ') ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,assigned_to=excluded.assigned_to,subject=excluded.subject,category=excluded.category,priority=excluded.priority,status=excluded.status,initial_message=excluded.initial_message,attachment_urls_json=excluded.attachment_urls_json,last_message_at=excluded.last_message_at,resolved_at=excluded.resolved_at,resolved_by=excluded.resolved_by,resolved_by_role=excluded.resolved_by_role,first_admin_reply_email_sent_at=excluded.first_admin_reply_email_sent_at,first_admin_reply_email_message_id=excluded.first_admin_reply_email_message_id,created_at=excluded.created_at,updated_at=excluded.updated_at,canonical_hash=excluded.canonical_hash WHERE excluded.updated_at>=support_tickets.updated_at;');
}
for (const row of messages) {
  statements.push('INSERT OR IGNORE INTO support_ticket_messages (id,ticket_id,sender_id,sender_role,body,attachment_urls_json,is_internal_note,metadata_json,created_at,canonical_hash) VALUES (' +
    [row.id,row.ticket_id,row.sender_id,row.sender_role,row.body,json(row.attachment_urls,[]),row.is_internal_note ? 1 : 0,json(row.metadata,{}),iso(row.created_at),messageHashes.get(row.id)].map(q).join(',') + ');');
}
for (const row of attachments) {
  statements.push('INSERT INTO support_ticket_attachments (id,ticket_id,message_id,uploaded_by,file_key,file_name,mime_type,size_bytes,storage_provider,status,metadata_json,created_at,canonical_hash) VALUES (' +
    [row.id,row.ticket_id,row.message_id,row.uploaded_by,row.file_key,row.file_name,row.mime_type,Number(row.size_bytes),'cloudflare_r2',row.status,json(row.metadata,{}),iso(row.created_at),attachmentHashes.get(row.id)].map(q).join(',') +
    ") ON CONFLICT(id) DO UPDATE SET message_id=COALESCE(support_ticket_attachments.message_id,excluded.message_id),status=CASE WHEN support_ticket_attachments.status='deleted' THEN 'deleted' ELSE excluded.status END,metadata_json=excluded.metadata_json,canonical_hash=excluded.canonical_hash;");
}
const aggregate = (mapping) => createHash('sha256').update([...mapping].map(([id, value]) => id + '|' + value).sort().join('\n')).digest('hex');
const expected = { tickets: aggregate(ticketHashes), messages: aggregate(messageHashes), attachments: aggregate(attachmentHashes) };
console.log('SUPPORT_MIGRATION_PLAN=' + JSON.stringify({ tickets: tickets.length, messages: messages.length, attachments: attachments.length, owners: owners.length, missingOwnerProfiles, hashes: expected }));
if (APPLY_SOURCE_PREFLIGHT) console.log('SOURCE_PREFLIGHT_SUPPORT_FREE=YES');
if (missingOwnerProfiles !== 0) throw new Error('SUPPORT_OWNER_MAPPING_INCOMPLETE');
if (!APPLY) process.exit(0);

const file = join(tmpdir(), 'hub-support-migration-' + randomUUID() + '.sql');
try {
  writeFileSync(file, statements.join('\n') + '\n', { mode: 0o600 });
  chmodSync(file, 0o600);
  runWrangler(
    ['d1', 'execute', DATABASE, '--remote', '--config', CONFIG, '--file', file],
    'D1_MIGRATION_WRITE_FAILED',
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
} finally {
  rmSync(file, { force: true });
}
const verifyMap = (table) => new Map(d1Json('SELECT id,canonical_hash FROM ' + table).map((row) => [String(row.id), String(row.canonical_hash)]));
const actual = {
  tickets: aggregate(verifyMap('support_tickets')),
  messages: aggregate(verifyMap('support_ticket_messages')),
  attachments: aggregate(verifyMap('support_ticket_attachments')),
};
if (actual.tickets !== expected.tickets || actual.messages !== expected.messages || actual.attachments !== expected.attachments) {
  throw new Error('SUPPORT_MIGRATION_VERIFY_FAILED');
}
console.log('SUPPORT_MIGRATION_APPLIED=' + JSON.stringify({ tickets: tickets.length, messages: messages.length, attachments: attachments.length, parity: true }));
