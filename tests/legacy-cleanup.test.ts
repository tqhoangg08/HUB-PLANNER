import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  readPublicDonations,
  readPublicProfile,
  searchPublicProfiles,
} from '../cloudflare/worker/src/public-directory.ts';

const frontendRoots = ['app', 'components', 'features', 'hooks', 'layouts', 'pages', 'utils'];
const sourceFiles = (root: string): string[] => readdirSync(root).flatMap((name) => {
  const path = join(root, name);
  if (statSync(path).isDirectory()) return sourceFiles(path);
  return /\.(?:js|jsx|ts|tsx)$/.test(path) ? [path] : [];
});

test('reachable frontend contains no browser Supabase client or legacy auth path', () => {
  const source = frontendRoots.flatMap(sourceFiles).map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /getBrowserSupabase|createBrowserClient|supabase\.(?:from|rpc|auth)\b|HUB_BROWSER_SUPABASE/);
  assert.equal(existsSync('utils/supabase.ts'), false);
  assert.equal(existsSync('components/MobileLogin.tsx'), false);
  assert.equal(existsSync('hooks/useAdminCheck.ts'), false);
});

test('finished canary and operator bootstrap artifacts are absent', () => {
  for (const path of [
    'cloudflare/schedule-stage2c-canary-router.ts',
    'cloudflare/staff-auth-canary-router.ts',
    'cloudflare/wrangler.schedule-stage2c-canary.jsonc',
    'cloudflare/wrangler.staff-auth-canary-router.jsonc',
    'scripts/bootstrap-synthetic-auditor-credential.mjs',
    'scripts/provision-temp-stage2c-auditor.mjs',
    'scripts/cleanup-temp-stage2c-auditor.mjs',
  ]) assert.equal(existsSync(path), false, path);
});

test('public profile directory reads only enabled D1 profiles', async () => {
  const statements: Array<{ sql: string; bindings: unknown[] }> = [];
  const row = {
    id: '11111111-1111-4111-8111-111111111111', student_code: '12345678',
    full_name: 'Fixture', profile_tags_json: '["tag"]', public_profile_enabled: 1,
    show_profile_stats: 0,
  };
  const db = {
    prepare(sql: string) {
      const entry = { sql, bindings: [] as unknown[] };
      statements.push(entry);
      return {
        bind(...bindings: unknown[]) { entry.bindings = bindings; return this; },
        async all() { return { results: [row] }; },
        async first() { return row; },
      };
    },
  } as unknown as D1Database;
  const env = { DB: db };
  const search = await searchPublicProfiles(new URL('https://app/api/public/v1/profiles/search?q=Fixture&limit=6'), env);
  const profile = await readPublicProfile('12345678', env);
  assert.equal(search.data.length, 1);
  assert.deepEqual(search.data[0].profile_tags, ['tag']);
  assert.equal(profile.data.student_code, '12345678');
  assert.ok(statements.every(({ sql }) => /public_profile_enabled = 1/.test(sql)));
});

test('donation directory reads only the public D1 donation projection in amount-desc order', async () => {
  let query = '';
  let bindings: unknown[] = [];
  const db = {
    prepare(sql: string) {
      query = sql;
      return {
        bind(...values: unknown[]) { bindings = values; return this; },
        async all() {
          return { results: [{
            id: 'donation-id', name: 'Fixture', amount: 250000, message: 'Cảm ơn',
            student_id: '12345678', created_at: '2026-09-15T00:00:00.000Z',
          }] };
        },
      };
    },
  } as unknown as D1Database;
  const result = await readPublicDonations({ DB: db });
  assert.deepEqual(result.data, [{
    id: 'donation-id', name: 'Fixture', amount: 250000, message: 'Cảm ơn',
    student_id: '12345678', created_at: '2026-09-15T00:00:00.000Z',
  }]);
  assert.match(query, /FROM protected_submissions/);
  assert.match(query, /WHERE kind = 'donation'/);
  assert.match(query, /ORDER BY CAST\(json_extract\(payload_json, '\$\.amount'\) AS INTEGER\) DESC/);
  assert.deepEqual(bindings, [500]);
  assert.doesNotMatch(query, /\buser_id\b|\bcontact_key\b|\bsource_table\b|\bsource_id\b|AS\s+payload_json\b/i);
});
