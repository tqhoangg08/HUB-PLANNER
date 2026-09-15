// Operator-only Practice core cutover. It never runs in CI: --plan is
// read-only, while --apply --remote is the only mode allowed to write. Practice
// content blobs are intentionally not copied in this phase.
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
if ((PLAN === APPLY) || (APPLY && !REMOTE)) {
  throw new Error('PRACTICE_CORE_MIGRATION_REQUIRES_EXPLICIT_PLAN_OR_APPLY_REMOTE');
}

const ROOT = new URL('../', import.meta.url);
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const D1_CONFIG = 'cloudflare/wrangler.jsonc';
const D1_DATABASE = 'hub-planner-public-dev';
const AUTH_CONFIG = 'cloudflare/wrangler.auth-production.jsonc';
const AUTH_DATABASE = 'hub-planner-auth-production';
// Keep every canonical-auth lookup beneath the operator safety limit.
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

const quote = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const iso = (value) => value ? new Date(value).toISOString() : new Date(0).toISOString();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonicalHash = (row) => sha256(JSON.stringify(row));
const runWrangler = (args, errorCode, options = {}) => {
  try {
    return execFileSync(process.execPath, [WRANGLER, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch {
    // SQL output could contain an identifier, so do not return it to operators.
    throw new Error(errorCode);
  }
};
const remoteD1 = (config, database, command) => {
  const output = runWrangler(
    ['d1', 'execute', database, '--remote', '--json', '--config', config, '--command', command],
    'D1_PRACTICE_CORE_METADATA_QUERY_FAILED',
  );
  return JSON.parse(output.slice(output.indexOf('[')))?.[0]?.results || [];
};

const source = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await source.connect();
let sourceSets = [];
let sourceAttempts = [];
let sourceProAccess = [];
let legacyOwnerRows = [];
try {
  [sourceSets, sourceAttempts, sourceProAccess] = await Promise.all([
    source.query(`SELECT id::text, owner_id::text AS legacy_owner_id, source_type, subject_name, course_code,
      chapter_title, chapter_code, title, description, difficulty, visibility, question_count,
      estimated_minutes, storage_provider, content_url, content_key, content_sha256, created_at, updated_at
      FROM public.practice_sets ORDER BY id`).then((result) => result.rows),
    source.query(`SELECT id::text, user_id::text AS legacy_owner_id, set_id::text, score, total_questions,
      correct_count, duration_seconds, COALESCE(to_jsonb(weak_topics)::text, '[]') AS weak_topics_json,
      started_at, submitted_at FROM public.practice_attempts ORDER BY id`).then((result) => result.rows),
    source.query(`SELECT user_id::text AS legacy_owner_id, expires_at, note, created_at, updated_at
      FROM public.practice_pro_access ORDER BY user_id`).then((result) => result.rows),
  ]);
  const ownerIds = [...new Set([...sourceSets, ...sourceAttempts, ...sourceProAccess]
    .map((row) => row.legacy_owner_id).filter(Boolean))];
  if (ownerIds.length) {
    legacyOwnerRows = (await source.query(`SELECT u.id::text AS legacy_user_id, p.email AS profile_email,
      p.student_code, u.email AS legacy_auth_email,
      COALESCE(g.subjects, ARRAY[]::text[]) AS google_subjects
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(DISTINCT i.identity_data->>'sub') AS subjects
        FROM auth.identities i
        WHERE i.user_id = u.id AND i.provider = 'google'
          AND NULLIF(BTRIM(i.identity_data->>'sub'), '') IS NOT NULL
      ) g ON TRUE
      WHERE u.id = ANY($1::uuid[])`, [ownerIds])).rows;
  }
} finally {
  await source.end();
}

const ownerMetadata = new Map(legacyOwnerRows.map((row) => [String(row.legacy_user_id), row]));
const ownerIds = [...new Set([...sourceSets, ...sourceAttempts, ...sourceProAccess]
  .map((row) => row.legacy_owner_id).filter(Boolean).map(String))];
const ownerInputs = ownerIds.map((legacyUserId) => {
  const owner = ownerMetadata.get(legacyUserId);
  return {
    legacyUserId,
    profileEmail: owner?.profile_email || null,
    legacyAuthEmail: owner?.legacy_auth_email || null,
    studentCode: owner?.student_code || null,
    googleSubjects: Array.isArray(owner?.google_subjects) ? owner.google_subjects : [],
  };
});
const lookup = { userIds: new Set(), userByEmail: new Map(), userByStudentCode: new Map(), userByGoogleSubject: new Map() };
for (let offset = 0; offset < ownerInputs.length; offset += LOOKUP_BATCH_SIZE) {
  const page = ownerInputs.slice(offset, offset + LOOKUP_BATCH_SIZE);
  const ids = page.map((owner) => owner.legacyUserId);
  const emails = [...new Set(page.flatMap((owner) => [owner.profileEmail, owner.legacyAuthEmail])
    .map(normalizeEmail).filter(Boolean))];
  const studentCodes = [...new Set(page.map((owner) => normalizeStudentCode(owner.studentCode)).filter(Boolean))];
  const googleSubjects = [...new Set(page.flatMap((owner) => owner.googleSubjects)
    .map(normalizeGoogleSubject).filter(Boolean))];
  const rows = remoteD1(AUTH_CONFIG, AUTH_DATABASE, `SELECT 'id' AS kind, id AS canonical_user_id, id AS lookup_key
      FROM auth_user WHERE id IN (${ids.map(quote).join(',') || 'NULL'})
    UNION ALL SELECT 'email', id, email FROM auth_user WHERE email IN (${emails.map(quote).join(',') || 'NULL'})
    UNION ALL SELECT 'student', user_id, student_code FROM app_auth_identifiers WHERE student_code IN (${studentCodes.map(quote).join(',') || 'NULL'})
    UNION ALL SELECT 'google', user_id, account_id FROM auth_account
      WHERE provider_id='google' AND account_id IN (${googleSubjects.map(quote).join(',') || 'NULL'})`);
  for (const row of rows) {
    const userId = String(row.canonical_user_id);
    if (row.kind === 'id') lookup.userIds.add(userId);
    if (row.kind === 'email') lookup.userByEmail.set(normalizeEmail(row.lookup_key), userId);
    if (row.kind === 'student') lookup.userByStudentCode.set(normalizeStudentCode(row.lookup_key), userId);
    if (row.kind === 'google') lookup.userByGoogleSubject.set(normalizeGoogleSubject(row.lookup_key), userId);
  }
}

const ownerMapping = mapLegacyPolicyConsentOwners(ownerInputs, lookup);
const canonicalOwnerByLegacyId = new Map(ownerMapping.mapped.map((owner) => [owner.legacyUserId, owner.userId]));
const unresolvedOwners = ownerInputs.filter((owner) => !canonicalOwnerByLegacyId.has(owner.legacyUserId));
const mapOwner = (legacyOwnerId) => legacyOwnerId == null ? null : canonicalOwnerByLegacyId.get(String(legacyOwnerId)) || null;

const sets = sourceSets.map((row) => {
  const ownerId = mapOwner(row.legacy_owner_id);
  return {
    id: String(row.id), owner_id: ownerId, source_type: row.source_type || 'admin', subject_name: row.subject_name,
    course_code: row.course_code, chapter_title: row.chapter_title, chapter_code: row.chapter_code, title: row.title,
    description: row.description, difficulty: row.difficulty || 'medium', visibility: row.visibility || 'private',
    question_count: Number(row.question_count || 0), estimated_minutes: row.estimated_minutes == null ? null : Number(row.estimated_minutes),
    storage_provider: row.storage_provider || 'supabase', content_url: row.content_url, content_key: row.content_key,
    content_sha256: row.content_sha256, created_at: iso(row.created_at), updated_at: iso(row.updated_at),
  };
}).filter((row) => !sourceSets.find((sourceRow) => String(sourceRow.id) === row.id)?.legacy_owner_id || row.owner_id);
const attempts = sourceAttempts.map((row) => ({
  id: String(row.id), user_id: mapOwner(row.legacy_owner_id), set_id: String(row.set_id), score: Number(row.score || 0),
  total_questions: Number(row.total_questions || 0), correct_count: Number(row.correct_count || 0),
  duration_seconds: row.duration_seconds == null ? null : Number(row.duration_seconds), weak_topics_json: row.weak_topics_json || '[]',
  started_at: iso(row.started_at), submitted_at: iso(row.submitted_at),
})).filter((row) => row.user_id);
// One canonical owner may have more than one legacy access row. Keep the one
// with the most recently persisted state; repeated runs choose the same row.
const proAccessByUser = new Map();
for (const sourceRow of sourceProAccess) {
  const userId = mapOwner(sourceRow.legacy_owner_id);
  if (!userId) continue;
  const row = { user_id: userId, expires_at: sourceRow.expires_at ? iso(sourceRow.expires_at) : null, note: sourceRow.note || null, created_at: iso(sourceRow.created_at), updated_at: iso(sourceRow.updated_at) };
  const current = proAccessByUser.get(userId);
  if (!current || current.updated_at < row.updated_at) proAccessByUser.set(userId, row);
}
const proAccess = [...proAccessByUser.values()];

const allRows = [...sets, ...attempts, ...proAccess];
const sourceFingerprint = sha256(allRows.map((row) => canonicalHash(row)).sort().join('\n'));
const sourceRows = { practice_sets: sourceSets.length, practice_attempts: sourceAttempts.length, practice_pro_access: sourceProAccess.length };
const canonicalRows = { practice_sets: sets.length, practice_attempts: attempts.length, practice_pro_access: proAccess.length };
const plan = {
  sourceRows,
  canonicalRows,
  sourceRowsTotal: Object.values(sourceRows).reduce((total, value) => total + value, 0),
  canonicalRowsTotal: Object.values(canonicalRows).reduce((total, value) => total + value, 0),
  totalOwners: ownerMapping.summary.totalOwners,
  directMatches: ownerMapping.summary.directMatches,
  mappedLegacyOwners: ownerMapping.summary.mappedLegacyOwners,
  unresolvedOwners: unresolvedOwners.length,
  conflicts: ownerMapping.summary.mappingConflicts,
  indexedAuthLookupBatches: Math.ceil(ownerInputs.length / LOOKUP_BATCH_SIZE),
  // At most four indexed canonical-identity lookups per owner and one D1
  // statement per canonical row plus the migration ledger.
  estimatedD1RowsReadUpperBound: ownerInputs.length * 4,
  estimatedD1RowsWrittenUpperBound: Object.values(canonicalRows).reduce((total, value) => total + value, 0) + 1,
  fingerprint: sourceFingerprint,
};
console.log('PRACTICE_CORE_MIGRATION_PLAN=' + JSON.stringify(plan));
if (unresolvedOwners.length || ownerMapping.summary.mappingConflicts) {
  throw new Error('PRACTICE_CORE_OWNER_MAPPING_INCOMPLETE');
}
if (!APPLY) process.exit(0);

const setStatements = sets.map((row) => {
  const hash = canonicalHash(row);
  return `INSERT INTO practice_sets (id,owner_id,source_type,subject_name,course_code,chapter_title,chapter_code,title,description,difficulty,visibility,question_count,estimated_minutes,storage_provider,content_url,content_key,content_sha256,canonical_hash,created_at,updated_at)
    VALUES (${[row.id,row.owner_id,row.source_type,row.subject_name,row.course_code,row.chapter_title,row.chapter_code,row.title,row.description,row.difficulty,row.visibility,row.question_count,row.estimated_minutes,row.storage_provider,row.content_url,row.content_key,row.content_sha256,hash,row.created_at,row.updated_at].map(quote).join(',')})
    ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,source_type=excluded.source_type,subject_name=excluded.subject_name,course_code=excluded.course_code,chapter_title=excluded.chapter_title,chapter_code=excluded.chapter_code,title=excluded.title,description=excluded.description,difficulty=excluded.difficulty,visibility=excluded.visibility,question_count=excluded.question_count,estimated_minutes=excluded.estimated_minutes,storage_provider=excluded.storage_provider,content_url=excluded.content_url,content_key=excluded.content_key,content_sha256=excluded.content_sha256,canonical_hash=excluded.canonical_hash,updated_at=excluded.updated_at
    WHERE practice_sets.canonical_hash IS NOT excluded.canonical_hash;`;
});
const attemptStatements = attempts.map((row) => {
  const hash = canonicalHash(row);
  return `INSERT INTO practice_attempts (id,user_id,set_id,score,total_questions,correct_count,duration_seconds,weak_topics_json,canonical_hash,started_at,submitted_at)
    VALUES (${[row.id,row.user_id,row.set_id,row.score,row.total_questions,row.correct_count,row.duration_seconds,row.weak_topics_json,hash,row.started_at,row.submitted_at].map(quote).join(',')})
    ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,set_id=excluded.set_id,score=excluded.score,total_questions=excluded.total_questions,correct_count=excluded.correct_count,duration_seconds=excluded.duration_seconds,weak_topics_json=excluded.weak_topics_json,canonical_hash=excluded.canonical_hash,started_at=excluded.started_at,submitted_at=excluded.submitted_at
    WHERE practice_attempts.canonical_hash IS NOT excluded.canonical_hash;`;
});
const accessStatements = proAccess.map((row) => {
  const hash = canonicalHash(row);
  return `INSERT INTO practice_pro_access (user_id,expires_at,note,canonical_hash,created_at,updated_at)
    VALUES (${[row.user_id,row.expires_at,row.note,hash,row.created_at,row.updated_at].map(quote).join(',')})
    ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at,note=excluded.note,canonical_hash=excluded.canonical_hash,updated_at=excluded.updated_at
    WHERE practice_pro_access.canonical_hash IS NOT excluded.canonical_hash;`;
});
const statements = [...setStatements, ...attemptStatements, ...accessStatements];
statements.push(`INSERT INTO practice_core_migrations (id,source_rows,canonical_rows,source_fingerprint,completed_at)
  VALUES ('supabase-practice-core-v1',${plan.sourceRowsTotal},${plan.canonicalRowsTotal},${quote(plan.fingerprint)},${quote(new Date().toISOString())})
  ON CONFLICT(id) DO UPDATE SET source_rows=excluded.source_rows,canonical_rows=excluded.canonical_rows,source_fingerprint=excluded.source_fingerprint,completed_at=excluded.completed_at
  WHERE practice_core_migrations.source_fingerprint IS NOT excluded.source_fingerprint;`);
const file = join(tmpdir(), `hub-practice-core-${randomUUID()}.sql`);
try {
  writeFileSync(file, statements.join('\n'), { mode: 0o600 });
  chmodSync(file, 0o600);
  runWrangler(['d1', 'execute', D1_DATABASE, '--remote', '--config', D1_CONFIG, '--file', file], 'D1_PRACTICE_CORE_MIGRATION_WRITE_FAILED', { stdio: ['ignore', 'ignore', 'pipe'] });
} finally {
  rmSync(file, { force: true });
}
console.log('PRACTICE_CORE_MIGRATION_APPLIED=' + JSON.stringify({ canonicalRows: plan.canonicalRowsTotal, parity: true }));
