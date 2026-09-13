// Operator-only cutover for CTV/protected submissions.  It is intentionally
// absent from CI.  --plan is read-only; --apply additionally requires --remote.
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import {
  mapLegacyPolicyConsentOwners,
  normalizeEmail,
  normalizeGoogleSubject,
  normalizeStudentCode,
} from './lib/policy-consent-owner-mapping.mjs';

const PLAN = process.argv.includes('--plan');
const APPLY = process.argv.includes('--apply');
const REMOTE = process.argv.includes('--remote');
if ((!PLAN && !APPLY) || (APPLY && !REMOTE)) throw new Error('PROTECTED_SUBMISSION_MIGRATION_REQUIRES_EXPLICIT_PLAN_OR_APPLY_REMOTE');
try { process.loadEnvFile?.('.env.local'); } catch {}
if (!process.env.SUPABASE_DATABASE_URL) throw new Error('SOURCE_CONFIGURATION_UNAVAILABLE');

const ROOT = new URL('../', import.meta.url);
const WRANGLER = fileURLToPath(
  new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)
);
const TABLES = ['feedback', 'donations', 'canva_pro_requests', 'bug_reports', 'course_reports', 'event_reports', 'ctv_requests'];
const D1_KINDS = { feedback: 'feedback', donations: 'donation', canva_pro_requests: 'canva_pro_requests', bug_reports: 'bug_reports', course_reports: 'course_reports', event_reports: 'event_reports', ctv_requests: 'ctv_requests' };
const q = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const runWrangler = (args, errorCode) => {
  try { return execFileSync(process.execPath, [WRANGLER, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error(errorCode); }
};
const remoteD1 = (command) => {
  const output = runWrangler(['d1', 'execute', 'hub-planner-auth-production', '--remote', '--json', '--config', 'cloudflare/wrangler.auth-production.jsonc', '--command', command], 'D1_AUTH_MAPPING_QUERY_FAILED');
  return JSON.parse(output.slice(output.indexOf('[')))?.[0]?.results || [];
};

const source = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await source.connect();
let rows = [];
let legacyOwnerRows = [];
try {
  // Metadata makes the plan resilient to older source tables that do not have
  // a user_id yet.  It is a single catalog query; no data is logged.
  const columns = await source.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1)`, [TABLES]);
  const byTable = new Map(TABLES.map((table) => [table, new Set()]));
  for (const row of columns.rows) byTable.get(row.table_name)?.add(row.column_name);
  const parts = TABLES.filter((table) => byTable.get(table)?.has('id')).map((table) => {
    const hasUser = byTable.get(table)?.has('user_id');
    const hasStatus = byTable.get(table)?.has('status');
    const hasCreated = byTable.get(table)?.has('created_at');
    return `SELECT ${q(table)} AS source_table, id::text AS source_id, ${hasUser ? 'user_id::text' : 'NULL::text'} AS legacy_user_id, ${hasStatus ? 'COALESCE(status,\'pending\')' : '\'pending\''} AS status, ${hasCreated ? 'created_at' : 'NOW()'} AS created_at, to_jsonb(t) - 'id' - 'user_id' - 'status' - 'created_at' AS payload FROM public.${table} t`;
  });
  rows = parts.length ? (await source.query(parts.join(' UNION ALL '))).rows : [];
  const ownerIds = [...new Set(rows.map((row) => row.legacy_user_id).filter(Boolean))];
  if (ownerIds.length) {
    legacyOwnerRows = (await source.query(`SELECT p.id::text AS legacy_user_id, p.email AS profile_email,
      p.student_code, u.email AS legacy_auth_email,
      COALESCE(g.subjects, ARRAY[]::text[]) AS google_subjects
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id=p.id
      LEFT JOIN LATERAL (SELECT ARRAY_AGG(DISTINCT i.identity_data->>'sub') AS subjects
        FROM auth.identities i WHERE i.user_id=p.id AND i.provider='google'
          AND NULLIF(BTRIM(i.identity_data->>'sub'),'') IS NOT NULL) g ON TRUE
      WHERE p.id = ANY($1)`, [ownerIds])).rows;
  }
} finally { await source.end(); }

const owners = [...new Set(rows.map((row) => row.legacy_user_id).filter(Boolean))];
const ownerMetadata = new Map(legacyOwnerRows.map((row) => [String(row.legacy_user_id), row]));
const ownerInputs = owners.map((legacyUserId) => ({ legacyUserId: String(legacyUserId), profileEmail: ownerMetadata.get(String(legacyUserId))?.profile_email || null, legacyAuthEmail: ownerMetadata.get(String(legacyUserId))?.legacy_auth_email || null, studentCode: ownerMetadata.get(String(legacyUserId))?.student_code || null, googleSubjects: ownerMetadata.get(String(legacyUserId))?.google_subjects || [] }));
const lookup = { userIds: new Set(), userByEmail: new Map(), userByStudentCode: new Map(), userByGoogleSubject: new Map() };
for (let offset = 0; offset < ownerInputs.length; offset += 80) {
  const page = ownerInputs.slice(offset, offset + 80);
  const ids = page.map((owner) => owner.legacyUserId);
  const emails = [...new Set(page.flatMap((owner) => [owner.profileEmail, owner.legacyAuthEmail]).map(normalizeEmail).filter(Boolean))];
  const studentCodes = [...new Set(page.map((owner) => normalizeStudentCode(owner.studentCode)).filter(Boolean))];
  const subjects = [...new Set(page.flatMap((owner) => owner.googleSubjects).map(normalizeGoogleSubject).filter(Boolean))];
  const results = remoteD1(`SELECT 'id' AS kind,id AS canonical_user_id,id AS lookup_key FROM auth_user WHERE id IN (${ids.map(q).join(',') || 'NULL'})
    UNION ALL SELECT 'email',id,email FROM auth_user WHERE email IN (${emails.map(q).join(',') || 'NULL'})
    UNION ALL SELECT 'student',user_id,student_code FROM app_auth_identifiers WHERE student_code IN (${studentCodes.map(q).join(',') || 'NULL'})
    UNION ALL SELECT 'google',user_id,account_id FROM auth_account WHERE provider_id='google' AND account_id IN (${subjects.map(q).join(',') || 'NULL'})`);
  for (const row of results) {
    const id = String(row.canonical_user_id);
    if (row.kind === 'id') lookup.userIds.add(id);
    if (row.kind === 'email') lookup.userByEmail.set(normalizeEmail(row.lookup_key), id);
    if (row.kind === 'student') lookup.userByStudentCode.set(normalizeStudentCode(row.lookup_key), id);
    if (row.kind === 'google') lookup.userByGoogleSubject.set(normalizeGoogleSubject(row.lookup_key), id);
  }
}
const mapping = mapLegacyPolicyConsentOwners(ownerInputs, lookup);
const ownerByLegacyId = new Map(mapping.mapped.map((owner) => [owner.legacyUserId, owner.userId]));
const unresolvedOwners = ownerInputs.filter((owner) => !ownerByLegacyId.has(owner.legacyUserId));
const canonical = new Map();
for (const row of rows) {
  if (row.legacy_user_id && !ownerByLegacyId.has(String(row.legacy_user_id))) continue;
  const key = `${row.source_table}:${row.source_id}`;
  if (!canonical.has(key)) canonical.set(key, row);
}
const canonicalRowsToWrite = [...canonical.values()];
const fingerprint = createHash('sha256').update(canonicalRowsToWrite.map((row) => `${row.source_table}:${row.source_id}`).sort().join('\n')).digest('hex');
const plan = {
  sourceRows: rows.length,
  canonicalRows: canonicalRowsToWrite.length,
  duplicateRows: rows.length - canonicalRowsToWrite.length,
  totalOwners: owners.length,
  directMatches: mapping.summary.directMatches,
  mappedLegacyOwners: mapping.summary.mappedLegacyOwners,
  unresolvedOwners: unresolvedOwners.length,
  // One bounded auth-id lookup plus an INSERT for each source row and a ledger.
  estimatedD1RowsReadUpperBound: owners.length,
  estimatedD1RowsWrittenUpperBound: canonicalRowsToWrite.length + 1,
  fingerprint,
};
console.log('PROTECTED_SUBMISSION_MIGRATION_PLAN=' + JSON.stringify(plan));
if (unresolvedOwners.length || mapping.summary.mappingConflicts) throw new Error('PROTECTED_SUBMISSION_OWNER_MAPPING_INCOMPLETE');
if (!APPLY) process.exit(0);

const now = new Date().toISOString();
const statements = canonicalRowsToWrite.map((row) => `INSERT INTO protected_submissions (id,kind,user_id,status,payload_json,source_table,source_id,source_fingerprint,created_at,updated_at)
  VALUES (${[randomUUID(), D1_KINDS[row.source_table], row.legacy_user_id ? ownerByLegacyId.get(String(row.legacy_user_id)) : null, String(row.status || 'pending').slice(0, 32), JSON.stringify(row.payload || {}), row.source_table, row.source_id, createHash('sha256').update(`${row.source_table}:${row.source_id}`).digest('hex'), new Date(row.created_at).toISOString(), new Date(row.created_at).toISOString()].map(q).join(',')})
  ON CONFLICT(source_table,source_id) DO UPDATE SET status=excluded.status,payload_json=excluded.payload_json,source_fingerprint=excluded.source_fingerprint
  WHERE protected_submissions.status IS NOT excluded.status OR protected_submissions.payload_json IS NOT excluded.payload_json;`);
statements.push(`INSERT INTO protected_submission_migrations (id,source_rows,canonical_rows,source_fingerprint,completed_at) VALUES ('supabase-protected-submissions-v1',${rows.length},${canonicalRowsToWrite.length},${q(fingerprint)},${q(now)}) ON CONFLICT(id) DO UPDATE SET source_rows=excluded.source_rows,canonical_rows=excluded.canonical_rows,source_fingerprint=excluded.source_fingerprint,completed_at=excluded.completed_at WHERE protected_submission_migrations.source_fingerprint IS NOT excluded.source_fingerprint;`);
const file = join(tmpdir(), `hub-protected-submissions-${randomUUID()}.sql`);
try {
  writeFileSync(file, statements.join('\n'), { mode: 0o600 }); chmodSync(file, 0o600);
  runWrangler(['d1', 'execute', 'hub-planner-public-dev', '--remote', '--config', 'cloudflare/wrangler.jsonc', '--file', file], 'D1_PROTECTED_SUBMISSION_MIGRATION_WRITE_FAILED');
} finally { rmSync(file, { force: true }); }
console.log('PROTECTED_SUBMISSION_MIGRATION_APPLIED=' + JSON.stringify({ canonicalRows: canonicalRowsToWrite.length }));
