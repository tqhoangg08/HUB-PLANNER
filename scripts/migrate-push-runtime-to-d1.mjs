// Push runtime migration is intentionally operator-only and never runs in CI.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const ROOT = new URL('../', import.meta.url);
// Invoke Wrangler directly so an operator's normal local OAuth session is used.
// CI migrations continue to use the repository wrapper with GitHub-provided credentials.
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const readEnv = () => {
  const values = {};
  for (const name of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(new URL(name, ROOT), 'utf8').split(/\r?\n/)) {
        const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    } catch { /* optional local env */ }
  }
  return { ...values, ...process.env };
};

const local = readEnv();
const sourceUrl = String(local.SUPABASE_URL || local.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const sourceKey = String(local.SUPABASE_SERVICE_ROLE_KEY || '');
if (!sourceUrl || sourceKey.length < 32) throw new Error('SOURCE_CONFIGURATION_UNAVAILABLE');

const sourceRows = async (path) => {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${sourceUrl}${path}`, {
      headers: { apikey: sourceKey, Authorization: `Bearer ${sourceKey}`, Range: `${offset}-${offset + 999}` },
    });
    if (!response.ok) throw new Error(`SOURCE_READ_${response.status}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
};

const wranglerJson = (config, database, sql) => {
  const output = execFileSync(process.execPath, [
    WRANGLER,
    'd1', 'execute', database, '--remote', '--json', '--config', config, '--command', sql,
  ], { cwd: new URL('../', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const start = output.indexOf('[');
  if (start < 0) throw new Error('D1_RESPONSE_INVALID');
  const payload = JSON.parse(output.slice(start));
  return payload?.[0]?.results || [];
};

const sqlValue = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const normalizedEmail = (value) => String(value || '').trim().toLowerCase();

const subscriptions = await sourceRows('/rest/v1/push_subscriptions?select=id,user_id,endpoint,subscription,created_at');
const preferences = await sourceRows('/rest/v1/notification_preferences?select=user_id,system,events,lost_found,schedule,school,created_at,updated_at');
const profiles = await sourceRows('/rest/v1/profiles?select=id,email,student_code');
const d1Profiles = wranglerJson('cloudflare/wrangler.jsonc', 'hub-planner-public-dev', 'SELECT user_id, student_code FROM user_profiles');
const authUsers = wranglerJson('cloudflare/wrangler.auth-production.jsonc', 'hub-planner-auth-production', 'SELECT id, email FROM auth_user');

const authById = new Map(authUsers.map((row) => [String(row.id), String(row.id)]));
const authByEmail = new Map(authUsers.map((row) => [normalizedEmail(row.email), String(row.id)]));
const d1ByStudent = new Map(d1Profiles.map((row) => [String(row.student_code || '').trim(), String(row.user_id)]));
const profileById = new Map(profiles.map((row) => [String(row.id), row]));
const ownerCache = new Map();

const sourceAuthEmail = async (ownerId) => {
  const response = await fetch(`${sourceUrl}/auth/v1/admin/users/${encodeURIComponent(ownerId)}`, {
    headers: { apikey: sourceKey, Authorization: `Bearer ${sourceKey}` },
  });
  if (response.status === 404) return '';
  if (!response.ok) throw new Error(`SOURCE_AUTH_READ_${response.status}`);
  const value = await response.json();
  return normalizedEmail(value?.user?.email || value?.email);
};

const canonicalOwner = async (legacyId) => {
  if (ownerCache.has(legacyId)) return ownerCache.get(legacyId);
  const profile = profileById.get(legacyId);
  const direct = authById.get(legacyId);
  const byEmail = authByEmail.get(normalizedEmail(profile?.email));
  const byStudent = d1ByStudent.get(String(profile?.student_code || '').trim());
  const resolved = direct || byEmail || byStudent || authByEmail.get(await sourceAuthEmail(legacyId)) || null;
  ownerCache.set(legacyId, resolved);
  return resolved;
};

const mappedSubscriptionRows = [];
for (const row of subscriptions) {
  const owner = await canonicalOwner(String(row.user_id));
  const stored = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
  const endpoint = String(row.endpoint || stored?.endpoint || '').trim();
  const p256dh = String(stored?.keys?.p256dh || '');
  const auth = String(stored?.keys?.auth || '');
  if (!owner || !endpoint.startsWith('https://') || !p256dh || !auth) continue;
  const started = Number.isFinite(Date.parse(stored?.__hubBindingStartedAt))
    ? new Date(stored.__hubBindingStartedAt).toISOString()
    : new Date(row.created_at || 0).toISOString();
  mappedSubscriptionRows.push({ id: row.id, owner, endpoint, p256dh, auth, started, created: row.created_at || started });
}

// The source table historically allowed duplicate rows for one browser endpoint.
// D1 deliberately makes endpoint the device identity, so retain only the newest
// binding without exposing or hashing endpoint material in operator output.
const subscriptionsByEndpoint = new Map();
for (const row of mappedSubscriptionRows) {
  const current = subscriptionsByEndpoint.get(row.endpoint);
  if (!current || Date.parse(row.started) >= Date.parse(current.started)) {
    subscriptionsByEndpoint.set(row.endpoint, row);
  }
}
const subscriptionRows = [...subscriptionsByEndpoint.values()];

const preferencesByOwner = new Map();
for (const row of preferences) {
  const owner = await canonicalOwner(String(row.user_id));
  if (!owner) continue;
  const current = preferencesByOwner.get(owner);
  if (!current || Date.parse(row.updated_at || row.created_at || 0) >= Date.parse(current.updated_at || current.created_at || 0)) {
    preferencesByOwner.set(owner, { ...row, owner });
  }
}
const preferenceRows = [...preferencesByOwner.values()];

const digest = createHash('sha256').update(subscriptionRows.map((row) =>
  `${row.owner}:${createHash('sha256').update(row.endpoint).digest('hex')}`).sort().join('\n')).digest('hex');
const summary = {
  sourceSubscriptions: subscriptions.length,
  migratedSubscriptions: subscriptionRows.length,
  duplicateSubscriptionsCollapsed: mappedSubscriptionRows.length - subscriptionRows.length,
  sourcePreferences: preferences.length,
  migratedPreferences: preferenceRows.length,
  unmappedOwners: [...new Set([...subscriptions, ...preferences].map((row) => String(row.user_id)))].filter((id) => !ownerCache.get(id)).length,
};
console.log(`PUSH_MIGRATION_PLAN=${JSON.stringify(summary)}`);
if (!APPLY) process.exit(0);
if (mappedSubscriptionRows.length !== summary.sourceSubscriptions || summary.unmappedOwners !== 0) {
  throw new Error('PUSH_MIGRATION_MAPPING_INCOMPLETE');
}

const statements = subscriptionRows.map((row) => `INSERT INTO push_subscriptions
  (id,user_id,endpoint,p256dh,auth,binding_started_at,created_at,updated_at) VALUES
  (${sqlValue(row.id)},${sqlValue(row.owner)},${sqlValue(row.endpoint)},${sqlValue(row.p256dh)},${sqlValue(row.auth)},${sqlValue(row.started)},${sqlValue(row.created)},CURRENT_TIMESTAMP)
  ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,
  binding_started_at=excluded.binding_started_at,updated_at=CURRENT_TIMESTAMP;`);
statements.push(...preferenceRows.map((row) => `INSERT INTO notification_preferences
  (user_id,system,events,lost_found,schedule,school,created_at,updated_at) VALUES
  (${sqlValue(row.owner)},${row.system === false ? 0 : 1},${row.events === false ? 0 : 1},${row.lost_found === false ? 0 : 1},
   ${row.schedule === false ? 0 : 1},${row.school === false ? 0 : 1},${sqlValue(row.created_at || new Date().toISOString())},${sqlValue(row.updated_at || new Date().toISOString())})
  ON CONFLICT(user_id) DO UPDATE SET system=excluded.system,events=excluded.events,lost_found=excluded.lost_found,
  schedule=excluded.schedule,school=excluded.school,updated_at=excluded.updated_at;`));
statements.push(`INSERT OR REPLACE INTO push_runtime_migrations VALUES
  ('supabase-to-d1-v1',${summary.sourceSubscriptions},${summary.migratedSubscriptions},${summary.sourcePreferences},${summary.migratedPreferences},${sqlValue(digest)},CURRENT_TIMESTAMP);`);

const file = join(tmpdir(), `hub-push-migration-${crypto.randomUUID()}.sql`);
try {
  writeFileSync(file, statements.join('\n'), { mode: 0o600 }); chmodSync(file, 0o600);
  execFileSync(process.execPath, [WRANGLER,
    'd1', 'execute', 'hub-planner-public-dev', '--remote', '--config', 'cloudflare/wrangler.jsonc', '--file', file],
  { cwd: new URL('../', import.meta.url), stdio: ['ignore', 'ignore', 'pipe'] });
} finally { rmSync(file, { force: true }); }
const verified = wranglerJson('cloudflare/wrangler.jsonc', 'hub-planner-public-dev',
  'SELECT (SELECT COUNT(*) FROM push_subscriptions) AS subscriptions, (SELECT COUNT(*) FROM notification_preferences) AS preferences');
if (Number(verified[0]?.subscriptions) !== summary.migratedSubscriptions || Number(verified[0]?.preferences) !== summary.migratedPreferences) {
  throw new Error('PUSH_MIGRATION_VERIFY_FAILED');
}
console.log(`PUSH_MIGRATION_APPLIED=${JSON.stringify({ subscriptions: summary.migratedSubscriptions, preferences: summary.migratedPreferences })}`);
