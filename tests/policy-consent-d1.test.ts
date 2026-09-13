import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { BetterAuthIdentityError } from '../cloudflare/worker/src/better-auth-identity.ts';
import { handlePrivatePolicyConsent } from '../cloudflare/worker/src/private-policy-consent.ts';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const migration = readFileSync('cloudflare/migrations/0034_policy_consents_d1_authority.sql', 'utf8')
  // Miniflare's D1 exec parser treats an initial SQL comment as a separate
  // empty statement; Wrangler applies the source migration unchanged.
  .replace(/^--.*\r?\n/gm, '');
const D1_SCHEMA = `CREATE TABLE policy_consents (user_id TEXT NOT NULL, policy_type TEXT NOT NULL, policy_version TEXT NOT NULL, consent_context TEXT NOT NULL, accepted INTEGER NOT NULL, source TEXT NOT NULL, metadata_json TEXT NOT NULL, accepted_at TEXT NOT NULL, PRIMARY KEY (user_id, policy_type, policy_version, consent_context));`;

const fixture = async (userId = USER_A) => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const DB = await mf.getD1Database('DB');
  await DB.exec(D1_SCHEMA);
  return {
    mf,
    env: { DB, AUTH_SERVICE: { fetch: async () => Response.json({ userId, email: 'member@example.invalid', role: 'user' }) } },
  };
};
const accept = (env: unknown, body: Record<string, unknown> = {}) => handlePrivatePolicyConsent(
  new Request('https://app.example/api/user/v1/policy-consents', {
    method: 'POST', headers: { Cookie: 'better-auth.session_token=opaque' },
    body: JSON.stringify({ policyType: 'terms_of_use', policyVersion: '2026-06-11', context: 'registration', ...body }),
  }), env as never,
);

test('D1 policy consent persists an owner-scoped acceptance and reads it back', async () => {
  const { mf, env } = await fixture();
  try {
    assert.deepEqual(await accept(env), { success: true, changed: true });
    const response = await handlePrivatePolicyConsent(new Request(
      'https://app.example/api/user/v1/policy-consents?policyType=terms_of_use&policyVersion=2026-06-11&context=registration',
      { headers: { Cookie: 'better-auth.session_token=opaque' } },
    ), env);
    assert.equal(response.success, true);
    assert.equal(response.consent?.accepted, true);
    assert.equal(response.consent?.policyType, 'terms_of_use');
  } finally { await mf.dispose(); }
});

test('same consent is a no-op; a new policy version is a separate acceptance', async () => {
  const { mf, env } = await fixture();
  try {
    assert.equal((await accept(env)).changed, true);
    const before = await env.DB.prepare('SELECT accepted_at FROM policy_consents').first<{ accepted_at: string }>();
    assert.equal((await accept(env)).changed, false);
    const after = await env.DB.prepare('SELECT accepted_at FROM policy_consents').first<{ accepted_at: string }>();
    assert.deepEqual(after, before);
    assert.equal((await accept(env, { policyVersion: '2026-09-13' })).changed, true);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM policy_consents').first<{ n: number }>())?.n, 2);
  } finally { await mf.dispose(); }
});

test('policy consent denies an unauthenticated request and any caller-supplied owner', async () => {
  const { mf, env } = await fixture();
  try {
    await assert.rejects(accept(env, { userId: USER_B }), (error: unknown) =>
      error instanceof Error && error.name === 'PrivatePolicyConsentError');
    const unauthenticated = { DB: env.DB, AUTH_SERVICE: { fetch: async () => new Response(null, { status: 401 }) } };
    await assert.rejects(accept(unauthenticated), (error: unknown) =>
      error instanceof BetterAuthIdentityError && error.status === 401);
  } finally { await mf.dispose(); }
});

test('policy authority has no Supabase runtime path and the operator migration is explicit', () => {
  const worker = readFileSync('cloudflare/worker/src/private-policy-consent.ts', 'utf8');
  const sourceAuth = readFileSync('supabase/functions/auth/index.ts', 'utf8');
  const script = readFileSync('scripts/migrate-policy-consents-to-d1.mjs', 'utf8');
  const sourceCleanup = readFileSync('supabase/migrations/20260913101500_remove_policy_consents_from_account_delete_preflight.sql', 'utf8');
  assert.doesNotMatch(worker, /SUPABASE|rest\/v1\/policy_consents/i);
  assert.doesNotMatch(sourceAuth, /record-policy-consent|from\('policy_consents'\)/);
  assert.doesNotMatch(sourceCleanup, /policy_consents/);
  assert.match(script, /--apply --remote/);
  assert.match(script, /ON CONFLICT\(user_id, policy_type, policy_version, consent_context\)/);
});
