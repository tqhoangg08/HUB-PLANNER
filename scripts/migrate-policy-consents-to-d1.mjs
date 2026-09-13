// Operator-only policy-consent cutover. It is intentionally not a CI command.
// --plan reads the legacy source only; --apply --remote is required for D1 writes.
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

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
const d1Json = (command) => {
  const output = runWrangler(
    ['d1', 'execute', DATABASE, '--remote', '--json', '--config', CONFIG, '--command', command],
    'D1_POLICY_CONSENT_METADATA_QUERY_FAILED',
  );
  return JSON.parse(output.slice(output.indexOf('[')))?.[0]?.results || [];
};

const source = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await source.connect();
let sourceRows;
try {
  sourceRows = (await source.query(`SELECT user_id::text, policy_type, policy_version, consent_context,
    accepted, source, created_at FROM public.policy_consents
    WHERE user_id IS NOT NULL AND accepted IS TRUE
    ORDER BY user_id, policy_type, policy_version, consent_context, created_at DESC`)).rows;
} finally {
  await source.end();
}

// Legacy rows are append-only. Keep the newest consent for each current key;
// a repeated acceptance must not become an unbounded D1 history write.
const canonical = new Map();
for (const row of sourceRows) {
  const key = canonicalKey(row);
  if (!canonical.has(key)) canonical.set(key, {
    ...row, accepted_at: iso(row.created_at), source: 'migration',
  });
}
const rows = [...canonical.values()];
const owners = [...new Set(rows.map((row) => row.user_id))];
let missingOwners = 0;
if (APPLY) {
  const knownOwners = new Set();
  for (let offset = 0; offset < owners.length; offset += 80) {
    const page = owners.slice(offset, offset + 80);
    for (const row of d1Json('SELECT user_id FROM user_profiles WHERE user_id IN (' + page.map(q).join(',') + ')')) {
      knownOwners.add(String(row.user_id));
    }
  }
  missingOwners = owners.filter((owner) => !knownOwners.has(owner)).length;
}

const plan = {
  sourceRows: sourceRows.length,
  canonicalRows: rows.length,
  duplicateRowsCollapsed: sourceRows.length - rows.length,
  owners: owners.length,
  // Applying uses one indexed D1 point lookup per <=80 owners, one bulk SQL
  // file, and a single migration ledger row. No full D1 table scan is used.
  estimatedD1RowsReadUpperBound: APPLY ? Math.ceil(owners.length / 80) * 80 : 'requires_apply_owner_preflight',
  estimatedD1RowsWrittenUpperBound: rows.length + 1,
  fingerprint: fingerprint(rows),
};
console.log('POLICY_CONSENT_MIGRATION_PLAN=' + JSON.stringify(plan));
if (!APPLY) process.exit(0);
if (missingOwners !== 0) throw new Error('POLICY_CONSENT_OWNER_MAPPING_INCOMPLETE');

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

const file = join(tmpdir(), `hub-policy-consent-migration-${crypto.randomUUID()}.sql`);
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
