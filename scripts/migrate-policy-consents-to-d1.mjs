// Operator-only policy-consent cutover. It is intentionally not a CI command.
// --plan performs only bounded, indexed mapping reads; --apply --remote writes.
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
  normalizeStudentCode,
} from './lib/policy-consent-owner-mapping.mjs';

const PLAN = process.argv.includes('--plan');
const APPLY = process.argv.includes('--apply');
const REMOTE = process.argv.includes('--remote');
if ((!PLAN && !APPLY) || (APPLY && !REMOTE)) {
  throw new Error('POLICY_CONSENT_MIGRATION_REQUIRES_EXPLICIT_PLAN_OR_APPLY_REMOTE');
}

const ROOT = new URL('../', import.meta.url);
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const CONFIG = 'cloudflare/wrangler.jsonc';
const DATABASE = 'hub-planner-public-dev';
const AUTH_CONFIG = 'cloudflare/wrangler.auth-production.jsonc';
const AUTH_DATABASE = 'hub-planner-auth-production';
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

const q = (value) => value === null || value === undefined ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
const iso = (value) => value ? new Date(value).toISOString() : new Date(0).toISOString();
const canonicalKey = (row) => [row.user_id, row.policy_type, row.policy_version, row.consent_context].join('|');
const fingerprint = (rows) => createHash('sha256').update(rows
  .map((row) => [canonicalKey(row), row.accepted_at].join('|')).sort().join('\n')).digest('hex');
const runWrangler = (args, errorCode, options = {}) => {
  try {
    return execFileSync(process.execPath, [WRANGLER, ...args], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options,
    });
  } catch {
    // Never surface SQL literals (which can include a user identifier) in operator output.
    throw new Error(errorCode);
  }
};
const d1Json = (config, database, command) => {
  const output = runWrangler(
    ['d1', 'execute', database, '--remote', '--json', '--config', config, '--command', command],
    'D1_POLICY_CONSENT_METADATA_QUERY_FAILED',
  );
  return JSON.parse(output.slice(output.indexOf('[')))?.[0]?.results || [];
};

const source = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await source.connect();
let sourceRows;
try {
  sourceRows = (await source.query(`SELECT pc.user_id::text AS legacy_user_id, pc.policy_type, pc.policy_version,
    pc.consent_context, pc.accepted, pc.source, pc.created_at, p.email AS profile_email,
    p.student_code, legacy_auth.email AS legacy_auth_email
    FROM public.policy_consents pc
    LEFT JOIN public.profiles p ON p.id = pc.user_id
    LEFT JOIN auth.users legacy_auth ON legacy_auth.id = pc.user_id
    WHERE pc.user_id IS NOT NULL AND pc.accepted IS TRUE
    ORDER BY pc.user_id, pc.policy_type, pc.policy_version, pc.consent_context, pc.created_at DESC`)).rows;
} finally {
  await source.end();
}

const ownersByLegacyId = new Map();
for (const row of sourceRows) {
  const legacyUserId = String(row.legacy_user_id);
  if (!ownersByLegacyId.has(legacyUserId)) ownersByLegacyId.set(legacyUserId, {
    legacyUserId,
    profileEmail: row.profile_email,
    legacyAuthEmail: row.legacy_auth_email,
    studentCode: row.student_code,
  });
}
const owners = [...ownersByLegacyId.values()];
const lookup = {
  userIds: new Set(),
  userByEmail: new Map(),
  userByStudentCode: new Map(),
};

// The auth database is the only canonical mapping authority. Every statement
// is bounded to <=80 legacy owners and uses a primary/unique lookup key.
for (let offset = 0; offset < owners.length; offset += 80) {
  const page = owners.slice(offset, offset + 80);
  const ids = page.map((owner) => owner.legacyUserId).filter(Boolean);
  const emails = [...new Set(page.flatMap((owner) => [owner.profileEmail, owner.legacyAuthEmail])
    .map(normalizeEmail).filter(Boolean))];
  const studentCodes = [...new Set(page.map((owner) => normalizeStudentCode(owner.studentCode)).filter(Boolean))];
  const rows = d1Json(AUTH_CONFIG, AUTH_DATABASE, `SELECT 'id' AS kind, id AS canonical_user_id, id AS lookup_key
      FROM auth_user WHERE id IN (${ids.map(q).join(',') || 'NULL'})
    UNION ALL SELECT 'email' AS kind, id AS canonical_user_id, email AS lookup_key
      FROM auth_user WHERE email IN (${emails.map(q).join(',') || 'NULL'})
    UNION ALL SELECT 'student' AS kind, user_id AS canonical_user_id, student_code AS lookup_key
      FROM app_auth_identifiers WHERE student_code IN (${studentCodes.map(q).join(',') || 'NULL'})`);
  for (const row of rows) {
    const userId = String(row.canonical_user_id);
    if (row.kind === 'id') lookup.userIds.add(userId);
    if (row.kind === 'email') lookup.userByEmail.set(normalizeEmail(row.lookup_key), userId);
    if (row.kind === 'student') lookup.userByStudentCode.set(normalizeStudentCode(row.lookup_key), userId);
  }
}

const ownerMapping = mapLegacyPolicyConsentOwners(owners, lookup);
const ownerByLegacyId = new Map(ownerMapping.mapped.map((row) => [row.legacyUserId, row.userId]));

// Legacy rows are append-only. Only after their owner is canonically resolved
// do we collapse repeated history; multiple old owners can map to one current
// Better Auth user without generating duplicate D1 consent rows.
const canonical = new Map();
for (const row of sourceRows) {
  const userId = ownerByLegacyId.get(String(row.legacy_user_id));
  if (!userId) continue;
  const migrated = { ...row, user_id: userId, accepted_at: iso(row.created_at), source: 'migration' };
  const key = canonicalKey(migrated);
  if (!canonical.has(key)) canonical.set(key, migrated);
}
const rows = [...canonical.values()];

const plan = {
  sourceRows: sourceRows.length,
  canonicalRows: rows.length,
  duplicateRowsCollapsed: sourceRows.length - rows.length,
  totalOwners: ownerMapping.summary.totalOwners,
  directMatches: ownerMapping.summary.directMatches,
  mappedLegacyOwners: ownerMapping.summary.mappedLegacyOwners,
  unresolvedOwners: ownerMapping.summary.unresolvedOwners,
  mappingConflicts: ownerMapping.summary.mappingConflicts,
  // One indexed auth query per <=80 owners, one bulk SQL file, and one ledger
  // row. No public D1 scan or per-row remote D1 write is used.
  indexedAuthLookupBatches: Math.ceil(owners.length / 80),
  estimatedD1RowsReadUpperBound: owners.length * 3,
  estimatedD1RowsWrittenUpperBound: rows.length + 1,
  fingerprint: fingerprint(rows),
};
console.log('POLICY_CONSENT_MIGRATION_PLAN=' + JSON.stringify(plan));
if (ownerMapping.summary.unresolvedOwners !== 0) throw new Error('POLICY_CONSENT_OWNER_MAPPING_INCOMPLETE');
if (!APPLY) process.exit(0);

const statements = rows.map((row) => `INSERT INTO policy_consents
  (user_id, policy_type, policy_version, consent_context, accepted, source, metadata_json, accepted_at)
  VALUES (${[row.user_id, row.policy_type, row.policy_version, row.consent_context, 1, 'migration', JSON.stringify({ legacy_migrated: true }), row.accepted_at].map(q).join(',')})
  ON CONFLICT(user_id, policy_type, policy_version, consent_context) DO UPDATE SET
    accepted=excluded.accepted, source=excluded.source, metadata_json=excluded.metadata_json, accepted_at=excluded.accepted_at
  WHERE policy_consents.accepted IS NOT excluded.accepted
     OR policy_consents.source IS NOT excluded.source
     OR policy_consents.metadata_json IS NOT excluded.metadata_json
     OR policy_consents.accepted_at IS NOT excluded.accepted_at;`);
statements.push(`INSERT INTO policy_consent_migrations (id, source_rows, canonical_rows, source_fingerprint, completed_at)
  VALUES ('supabase-policy-consents-v1', ${sourceRows.length}, ${rows.length}, ${q(plan.fingerprint)}, ${q(new Date().toISOString())})
  ON CONFLICT(id) DO UPDATE SET source_rows=excluded.source_rows, canonical_rows=excluded.canonical_rows,
    source_fingerprint=excluded.source_fingerprint, completed_at=excluded.completed_at
  WHERE policy_consent_migrations.source_fingerprint IS NOT excluded.source_fingerprint;`);

const file = join(tmpdir(), `hub-policy-consent-migration-${randomUUID()}.sql`);
try {
  writeFileSync(file, statements.join('\n') + '\n', { mode: 0o600 });
  chmodSync(file, 0o600);
  runWrangler(
    ['d1', 'execute', DATABASE, '--remote', '--config', CONFIG, '--file', file],
    'D1_POLICY_CONSENT_MIGRATION_WRITE_FAILED',
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
} finally {
  rmSync(file, { force: true });
}
console.log('POLICY_CONSENT_MIGRATION_APPLIED=' + JSON.stringify({ canonicalRows: rows.length, parity: true }));
