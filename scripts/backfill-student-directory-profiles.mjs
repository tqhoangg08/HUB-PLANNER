import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { makeProfileShadowProjection, makePrivateProfileShadowProjection } from './profile-shadow-projection.mjs';
import { fillEditableDirectoryField } from './student-directory-backfill-core.mjs';
import { directoryCohortToProfile, directoryProgramToProfile } from '../shared/student-directory-academic.ts';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const remote = args.includes('--remote');
if (apply !== remote || args.includes('--help')) {
  throw new Error('Usage: node scripts/backfill-student-directory-profiles.mjs [--apply --remote]. Dry-run is the default.');
}
const root = path.resolve(import.meta.dirname, '..');
const wrangler = path.join(root, 'scripts', 'run-wrangler.mjs');
const publicConfig = path.join(root, 'cloudflare', 'wrangler.jsonc');
const authConfig = path.join(root, 'cloudflare', 'wrangler.auth-production.jsonc');
const query = (database, config, sql) => {
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', database,
    '--remote', '--config', config, '--json', '--command', sql], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Private D1 read failed (exit ${result.status ?? 'unknown'}).`);
  return JSON.parse(result.stdout)[0]?.results || [];
};
const publicQuery = (sql) => query('hub-planner-public-dev', publicConfig, sql);
const authQuery = (sql) => query('hub-planner-auth-production', authConfig, sql);
const allPublicRows = (table) => {
  const rows = [];
  let cursor = null;
  for (;;) {
    const after = cursor ? `WHERE user_id > '${cursor.replaceAll("'", "''")}'` : '';
    const page = publicQuery(`SELECT * FROM ${table} ${after} ORDER BY user_id LIMIT 500;`);
    rows.push(...page);
    if (page.length < 500) return rows;
    cursor = page.at(-1).user_id;
  }
};
const directory = new Map(publicQuery(`SELECT student_code,full_name,gender,general_class,
  major_class,major,specialization,training_program,cohort FROM student_directory;`)
  .map((row) => [row.student_code, row]));
const authUsers = authQuery('SELECT id,email,email_verified FROM auth_user;');
const identifiers = authQuery('SELECT user_id,student_code FROM app_auth_identifiers;');
const verifiedCodes = new Map(authUsers.flatMap((user) => {
  const match = Number(user.email_verified) === 1 && typeof user.email === 'string'
    ? /^(\d{12})@st\.buh\.edu\.vn$/i.exec(user.email.trim()) : null;
  return match ? [[user.id, match[1]]] : [];
}));
const trustedCodes = new Map(identifiers.map((row) => [row.user_id, row.student_code]));
const publicRows = allPublicRows('user_profiles');
const privateRows = new Map(allPublicRows('user_profile_private').map((row) => [row.user_id, row]));
const metrics = {
  EXISTING_USERS_ELIGIBLE: 0, EXISTING_USERS_DIRECTORY_MATCHED: 0,
  FULL_NAME_WOULD_UPDATE: 0, COHORT_WOULD_UPDATE: 0,
  GENDER_WOULD_FILL: 0, GENERAL_CLASS_WOULD_FILL: 0,
  MAJOR_CLASS_WOULD_FILL: 0, MAJOR_WOULD_FILL: 0,
  SPECIALIZATION_WOULD_FILL: 0, TRAINING_PROGRAM_WOULD_FILL: 0,
  EDITABLE_NONEMPTY_FIELDS_PRESERVED: 0, IDENTITY_CONFLICTS: 0,
  EXISTING_USERS_BACKFILLED: 0,
};
const changes = [];
const nonblank = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, canonical(value[key])])) : value;
const hash = (projection) => createHash('sha256').update(JSON.stringify(projection)).digest('hex');
const sql = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
for (const row of publicRows) {
  const codeByEmail = verifiedCodes.get(row.user_id);
  const codeByIdentifier = trustedCodes.get(row.user_id);
  if (codeByEmail && codeByIdentifier && codeByEmail !== codeByIdentifier) {
    metrics.IDENTITY_CONFLICTS += 1; continue;
  }
  const trustedCode = codeByEmail || codeByIdentifier;
  if (!trustedCode || !/^\d{12}$/.test(trustedCode)) continue;
  // A verified email is authoritative, but a conflicting persisted profile code
  // requires review rather than silently backfilling the wrong student record.
  if (row.student_code && row.student_code !== trustedCode) {
    metrics.IDENTITY_CONFLICTS += 1; continue;
  }
  metrics.EXISTING_USERS_ELIGIBLE += 1;
  const match = directory.get(trustedCode);
  if (!match) continue;
  metrics.EXISTING_USERS_DIRECTORY_MATCHED += 1;
  const beforePrivate = privateRows.get(row.user_id);
  const nextPublic = { ...row };
  const nextPrivate = beforePrivate ? { ...beforePrivate } : null;
  const data = nextPrivate ? JSON.parse(nextPrivate.data_json) : null;
  let changed = false;
  const lockedPublic = nonblank(match.full_name);
  if (lockedPublic && nextPublic.full_name !== lockedPublic) {
    nextPublic.full_name = lockedPublic; metrics.FULL_NAME_WOULD_UPDATE += 1; changed = true;
  }
  const fillPublic = (field, value, metric) => {
    const outcome = fillEditableDirectoryField(nextPublic, field, value);
    if (outcome === 'preserved') metrics.EDITABLE_NONEMPTY_FIELDS_PRESERVED += 1;
    if (outcome === 'filled') { metrics[metric] += 1; changed = true; }
  };
  fillPublic('class_name', match.general_class, 'GENERAL_CLASS_WOULD_FILL');
  if (nextPrivate && data) {
    const setLocked = (key, value, metric) => {
      if (!nonblank(value)) return;
      if (data[key] !== value) { data[key] = value; metrics[metric] += 1; changed = true; }
    };
    setLocked('studentName', lockedPublic, 'FULL_NAME_WOULD_UPDATE');
    setLocked('cohort', directoryCohortToProfile(match.cohort, match.training_program), 'COHORT_WOULD_UPDATE');
    const fillData = (key, value, metric) => {
      const outcome = fillEditableDirectoryField(data, key, value);
      if (outcome === 'preserved') metrics.EDITABLE_NONEMPTY_FIELDS_PRESERVED += 1;
      if (outcome === 'filled') { metrics[metric] += 1; changed = true; }
    };
    fillData('gender', match.gender, 'GENDER_WOULD_FILL');
    fillData('majorClass', match.major_class, 'MAJOR_CLASS_WOULD_FILL');
    fillData('majorName', match.major, 'MAJOR_WOULD_FILL');
    fillData('specializationName', match.specialization, 'SPECIALIZATION_WOULD_FILL');
    fillData('programName', directoryProgramToProfile(match.training_program), 'TRAINING_PROGRAM_WOULD_FILL');
    nextPrivate.data_json = JSON.stringify(canonical(data));
    nextPrivate.student_name = nonblank(nextPublic.full_name) || nonblank(data.studentName);
    nextPrivate.cohort = nonblank(data.cohort);
    nextPrivate.major_name = nonblank(data.majorName);
    nextPrivate.specialization_name = nonblank(data.specializationName);
    nextPrivate.program_name = nonblank(data.programName);
  }
  if (!changed) continue;
  metrics.EXISTING_USERS_BACKFILLED += 1;
  changes.push({ beforePublic: row, afterPublic: nextPublic,
    beforePrivate, afterPrivate: nextPrivate });
}
if (metrics.IDENTITY_CONFLICTS) {
  console.log(JSON.stringify({ mode: 'blocked', ...metrics }));
  throw new Error('Trusted Auth identity mappings disagree; no backfill applied.');
}
if (!apply) { console.log(JSON.stringify({ mode: 'dry-run', ...metrics })); process.exit(0); }
const timestamp = new Date().toISOString();
const statements = [];
for (const { beforePublic, afterPublic, beforePrivate, afterPrivate } of changes) {
  afterPublic.updated_at = timestamp;
  const projectedPublic = makeProfileShadowProjection(afterPublic);
  statements.push(`UPDATE user_profiles SET full_name=${sql(afterPublic.full_name)},
    class_name=${sql(afterPublic.class_name)},updated_at=${sql(timestamp)},
    canonical_hash=${sql(hash(projectedPublic))},row_version=row_version+1
    WHERE user_id=${sql(beforePublic.user_id)} AND canonical_hash=${sql(beforePublic.canonical_hash)};`);
  if (beforePrivate && afterPrivate) {
    afterPrivate.updated_at = timestamp;
    const projectedPrivate = makePrivateProfileShadowProjection(afterPrivate);
    statements.push(`UPDATE user_profile_private SET data_json=${sql(afterPrivate.data_json)},
      student_name=${sql(afterPrivate.student_name)},cohort=${sql(afterPrivate.cohort)},
      major_name=${sql(afterPrivate.major_name)},specialization_name=${sql(afterPrivate.specialization_name)},
      program_name=${sql(afterPrivate.program_name)},updated_at=${sql(timestamp)},
      canonical_hash=${sql(hash(projectedPrivate))},row_version=row_version+1
      WHERE user_id=${sql(beforePrivate.user_id)} AND canonical_hash=${sql(beforePrivate.canonical_hash)};`);
  }
}
const temporary = await mkdtemp(path.join(tmpdir(), 'hub-directory-backfill-'));
try {
  const file = path.join(temporary, 'backfill.sql');
  for (let start = 0; start < statements.length; start += 1_000) {
    await writeFile(file, statements.slice(start, start + 1_000).join('\n'),
      { encoding: 'utf8', mode: 0o600 });
    const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'hub-planner-public-dev',
      '--remote', '--config', publicConfig, '--json', '--file', file], {
      cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error(`Private D1 backfill batch failed (exit ${result.status ?? 'unknown'}).`);
  }
  const publicAfter = new Map(publicQuery('SELECT user_id,canonical_hash FROM user_profiles;')
    .map((row) => [row.user_id, row.canonical_hash]));
  const privateAfter = new Map(publicQuery('SELECT user_id,canonical_hash FROM user_profile_private;')
    .map((row) => [row.user_id, row.canonical_hash]));
  for (const change of changes) {
    if (publicAfter.get(change.beforePublic.user_id) !== hash(makeProfileShadowProjection(change.afterPublic)) ||
        change.afterPrivate && privateAfter.get(change.beforePublic.user_id) !==
          hash(makePrivateProfileShadowProjection(change.afterPrivate))) {
      throw new Error('Post-backfill hash verification failed.');
    }
  }
  console.log(JSON.stringify({ mode: 'remote-applied', ...metrics }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
