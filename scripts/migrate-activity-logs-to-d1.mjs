// Operator-only Activity Log cutover.  It is never invoked by CI.  --plan is
// read-only; only --apply --remote can issue an explicit remote D1 write.
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
if ((!PLAN && !APPLY) || (APPLY && !REMOTE) || (PLAN && APPLY)) {
  throw new Error('ACTIVITY_LOG_MIGRATION_REQUIRES_PLAN_OR_APPLY_REMOTE');
}

const ROOT = new URL('../', import.meta.url);
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const CONFIG = 'cloudflare/wrangler.jsonc';
const DATABASE = 'hub-planner-public-dev';
const AUTH_CONFIG = 'cloudflare/wrangler.auth-production.jsonc';
const AUTH_DATABASE = 'hub-planner-auth-production';
const LOOKUP_BATCH_SIZE = 80;

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

const q = (value) => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const iso = (value) => value ? new Date(value).toISOString() : new Date(0).toISOString();
const json = (value, fallback = null) => value === null || value === undefined ? fallback : JSON.stringify(value);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const runWrangler = (args, errorCode, options = {}) => {
  try {
    return execFileSync(process.execPath, [WRANGLER, ...args], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options,
    });
  } catch {
    // SQL literals can contain historic audit data; never surface them.
    throw new Error(errorCode);
  }
};
const d1Json = (command) => {
  const output = runWrangler(
    ['d1', 'execute', AUTH_DATABASE, '--remote', '--json', '--config', AUTH_CONFIG, '--command', command],
    'D1_ACTIVITY_LOG_AUTH_LOOKUP_FAILED',
  );
  return JSON.parse(output.slice(output.indexOf('[')))?.[0]?.results || [];
};

const source = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await source.connect();
let sourceRows;
try {
  sourceRows = (await source.query(`SELECT al.id::text AS legacy_id, al.created_at, al.user_id::text AS legacy_user_id,
    al.user_email, al.user_role, al.action, al.action_label, al.target_table, al.table_name, al.target_id,
    al.record_id, al.page_path, al.status, al.metadata, al.old_data, al.new_data, al.details,
    al.error_message, al.ip_address, al.device_info, al.location_guess,
    p.email AS profile_email, p.student_code, legacy_auth.email AS legacy_auth_email,
    COALESCE(google_identity.subjects, ARRAY[]::text[]) AS google_subjects
    FROM public.activity_logs al
    LEFT JOIN public.profiles p ON p.id = al.user_id
    LEFT JOIN auth.users legacy_auth ON legacy_auth.id = al.user_id
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(DISTINCT identity_row.identity_data->>'sub') AS subjects
      FROM auth.identities identity_row
      WHERE identity_row.user_id = al.user_id
        AND identity_row.provider = 'google'
        AND NULLIF(BTRIM(identity_row.identity_data->>'sub'), '') IS NOT NULL
    ) google_identity ON TRUE
    WHERE COALESCE(al.action, '') <> 'view_page'
    ORDER BY al.id`)).rows;
} finally {
  await source.end();
}

const ownersByLegacyId = new Map();
for (const row of sourceRows) {
  if (!row.legacy_user_id) continue;
  const legacyUserId = String(row.legacy_user_id);
  if (!ownersByLegacyId.has(legacyUserId)) ownersByLegacyId.set(legacyUserId, {
    legacyUserId, profileEmail: row.profile_email, legacyAuthEmail: row.legacy_auth_email,
    studentCode: row.student_code, googleSubjects: Array.isArray(row.google_subjects) ? row.google_subjects : [],
  });
}
const owners = [...ownersByLegacyId.values()];
const lookup = { userIds: new Set(), userByEmail: new Map(), userByStudentCode: new Map(), userByGoogleSubject: new Map() };

for (let offset = 0; offset < owners.length; offset += LOOKUP_BATCH_SIZE) {
  const page = owners.slice(offset, offset + LOOKUP_BATCH_SIZE);
  const ids = page.map((owner) => owner.legacyUserId).filter(Boolean);
  const emails = [...new Set(page.flatMap((owner) => [owner.profileEmail, owner.legacyAuthEmail]).map(normalizeEmail).filter(Boolean))];
  const studentCodes = [...new Set(page.map((owner) => normalizeStudentCode(owner.studentCode)).filter(Boolean))];
  const googleSubjects = [...new Set(page.flatMap((owner) => owner.googleSubjects || []).map(normalizeGoogleSubject).filter(Boolean))];
  const records = d1Json(`SELECT 'id' AS kind, id AS canonical_user_id, id AS lookup_key
      FROM auth_user WHERE id IN (${ids.map(q).join(',') || 'NULL'})
    UNION ALL SELECT 'email', id, email FROM auth_user WHERE email IN (${emails.map(q).join(',') || 'NULL'})
    UNION ALL SELECT 'student', user_id, student_code FROM app_auth_identifiers WHERE student_code IN (${studentCodes.map(q).join(',') || 'NULL'})
    UNION ALL SELECT 'google', user_id, account_id FROM auth_account WHERE provider_id='google' AND account_id IN (${googleSubjects.map(q).join(',') || 'NULL'})`);
  for (const row of records) {
    const userId = String(row.canonical_user_id);
    if (row.kind === 'id') lookup.userIds.add(userId);
    if (row.kind === 'email') lookup.userByEmail.set(normalizeEmail(row.lookup_key), userId);
    if (row.kind === 'student') lookup.userByStudentCode.set(normalizeStudentCode(row.lookup_key), userId);
    if (row.kind === 'google') lookup.userByGoogleSubject.set(normalizeGoogleSubject(row.lookup_key), userId);
  }
}

const ownerMapping = mapLegacyPolicyConsentOwners(owners, lookup);
const ownerByLegacyId = new Map(ownerMapping.mapped.map((row) => [row.legacyUserId, row.userId]));
const canonicalRows = sourceRows.map((row) => ({
  ...row,
  user_id: row.legacy_user_id ? ownerByLegacyId.get(String(row.legacy_user_id)) : null,
  created_at: iso(row.created_at),
}));
const sourceFingerprint = hash(canonicalRows.map((row) => [row.legacy_id, row.user_id || '', row.created_at].join('|')).join('\n'));
const plan = {
  sourceRows: sourceRows.length,
  canonicalRows: canonicalRows.length,
  duplicateRowsCollapsed: 0,
  totalOwners: ownerMapping.summary.totalOwners,
  directMatches: ownerMapping.summary.directMatches,
  googleMapped: ownerMapping.summary.googleMapped,
  mappedLegacyOwners: ownerMapping.summary.mappedLegacyOwners,
  unresolvedOwners: ownerMapping.summary.unresolvedOwners,
  mappingConflicts: ownerMapping.summary.mappingConflicts,
  indexedAuthLookupBatches: Math.ceil(owners.length / LOOKUP_BATCH_SIZE),
  estimatedD1RowsReadUpperBound: owners.length * 4,
  estimatedD1RowsWrittenUpperBound: canonicalRows.length + 1,
  fingerprint: sourceFingerprint,
};
console.log(`ACTIVITY_LOG_MIGRATION_PLAN=${JSON.stringify(plan)}`);
if (ownerMapping.summary.unresolvedOwners > 0 || ownerMapping.summary.mappingConflicts > 0) {
  throw new Error('ACTIVITY_LOG_OWNER_MAPPING_INCOMPLETE');
}
if (!APPLY) process.exit(0);

const statements = canonicalRows.map((row) => {
  const sourceKey = `legacy:${row.legacy_id}`;
  const canonicalHash = hash(JSON.stringify([
    sourceKey, row.user_id, row.created_at, row.user_email, row.user_role, row.action, row.action_label,
    row.target_table, row.table_name, row.target_id, row.record_id, row.page_path, row.status,
    row.metadata, row.old_data, row.new_data, row.details, row.error_message, row.ip_address,
    row.device_info, row.location_guess,
  ]));
  const values = [
    row.legacy_id, sourceKey, canonicalHash, row.created_at, row.user_id, row.user_email, row.user_role,
    row.action, row.action_label, row.target_table, row.table_name, row.target_id, row.record_id,
    row.page_path, row.status || 'success', json(row.metadata, '{}'), json(row.old_data), json(row.new_data),
    json(row.details), row.error_message, row.ip_address, row.device_info, row.location_guess,
  ].map(q).join(',');
  return `INSERT INTO activity_logs (legacy_source_id,source_key,canonical_hash,created_at,user_id,user_email,user_role,action,action_label,target_table,table_name,target_id,record_id,page_path,status,metadata_json,old_data_json,new_data_json,details_json,error_message,ip_address,device_info,location_guess)
    VALUES (${values}) ON CONFLICT(legacy_source_id) DO UPDATE SET
      source_key=excluded.source_key, canonical_hash=excluded.canonical_hash, created_at=excluded.created_at,
      user_id=excluded.user_id, user_email=excluded.user_email, user_role=excluded.user_role, action=excluded.action,
      action_label=excluded.action_label, target_table=excluded.target_table, table_name=excluded.table_name,
      target_id=excluded.target_id, record_id=excluded.record_id, page_path=excluded.page_path, status=excluded.status,
      metadata_json=excluded.metadata_json, old_data_json=excluded.old_data_json, new_data_json=excluded.new_data_json,
      details_json=excluded.details_json, error_message=excluded.error_message, ip_address=excluded.ip_address,
      device_info=excluded.device_info, location_guess=excluded.location_guess
    WHERE activity_logs.canonical_hash IS NOT excluded.canonical_hash;`;
});
statements.push(`INSERT INTO activity_log_migrations (id,source_rows,canonical_rows,source_fingerprint,completed_at)
  VALUES ('supabase-activity-logs-v1',${sourceRows.length},${canonicalRows.length},${q(sourceFingerprint)},${q(new Date().toISOString())})
  ON CONFLICT(id) DO UPDATE SET source_rows=excluded.source_rows,canonical_rows=excluded.canonical_rows,source_fingerprint=excluded.source_fingerprint,completed_at=excluded.completed_at
  WHERE activity_log_migrations.source_fingerprint IS NOT excluded.source_fingerprint;`);

const file = join(tmpdir(), `hub-activity-log-migration-${randomUUID()}.sql`);
try {
  writeFileSync(file, `${statements.join('\n')}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  runWrangler(['d1', 'execute', DATABASE, '--remote', '--config', CONFIG, '--file', file], 'D1_ACTIVITY_LOG_MIGRATION_WRITE_FAILED', { stdio: ['ignore', 'ignore', 'pipe'] });
} finally {
  rmSync(file, { force: true });
}
console.log(`ACTIVITY_LOG_MIGRATION_APPLIED=${JSON.stringify({ canonicalRows: canonicalRows.length })}`);
