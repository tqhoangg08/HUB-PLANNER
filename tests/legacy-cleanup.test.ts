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

test('donation directory keeps Supabase access server-side and returns only response rows', async () => {
  const originalFetch = globalThis.fetch;
  let authorization = '';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get('Authorization') || '';
    return Response.json([{ id: 1, name: 'Fixture', amount: 1 }]);
  }) as typeof fetch;
  try {
    const result = await readPublicDonations({ SUPABASE_URL: 'https://source.example', SUPABASE_ANON_KEY: 'server-key' });
    assert.equal(result.data.length, 1);
    assert.equal(authorization, 'Bearer server-key');
    assert.doesNotMatch(JSON.stringify(result), /server-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
