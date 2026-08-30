import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  handleAuthProductionRequest,
  type AuthProductionEnv,
} from '../cloudflare/auth-production-worker/src/auth-production.ts';

const env = {
  AUTH_ENABLED: 'true',
  AUTH_ORIGIN: 'https://hotrosinhvienhub.id.vn',
  AUTH_TURNSTILE_EXPECTED_HOSTNAME: 'hotrosinhvienhub.id.vn',
  AUTH_TURNSTILE_SITE_KEY: 'test-site-key',
  AUTH_GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  AUTH_EMAIL_FROM: 'HUB Planner <no-reply@hotrosinhvienhub.id.vn>',
  AUTH_RESET_EMAIL_DAILY_BUDGET: '80',
  AUTH_BETTER_AUTH_SECRET: 'test-only-better-auth-secret-long-enough',
  AUTH_TURNSTILE_SECRET: 'test-only-turnstile-secret',
  AUTH_GOOGLE_CLIENT_SECRET: 'test-only-google-secret',
  AUTH_RESEND_API_KEY: 'test-only-resend-secret',
  AUTH_DB: {
    prepare() { throw new Error('internal mail route must not query auth D1'); },
  } as unknown as D1Database,
} satisfies AuthProductionEnv;

const context = { waitUntil() {} } as ExecutionContext;
const payload = { email: 'authorized.staff@example.test', otp: '123456' };

test('internal Excel OTP mail route invokes the existing provider without returning the OTP', async () => {
  const originalFetch = globalThis.fetch;
  let providerInvocations = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.resend.com/emails');
    assert.equal(init?.method, 'POST');
    const providerBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    assert.deepEqual(providerBody.to, [payload.email]);
    assert.match(String(providerBody.text), /123456/);
    providerInvocations += 1;
    return Response.json({ id: 'test-message' }, { status: 200 });
  };
  try {
    const response = await handleAuthProductionRequest(
      new Request('https://auth-service.internal/internal/admin-export/send-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env,
      context,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(providerInvocations, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public-host and wrong-method requests cannot invoke the internal mail route', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('mail provider must not be invoked'); };
  try {
    for (const request of [
      new Request('https://hotrosinhvienhub.id.vn/internal/admin-export/send-otp', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      }),
      new Request('https://auth-service.internal/internal/admin-export/send-otp'),
    ]) {
      const response = await handleAuthProductionRequest(request, env, context);
      assert.equal(response.status, 404);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Auth Worker and public proxy expose no browser route for internal OTP mail', () => {
  const config = readFileSync('cloudflare/wrangler.auth-production.jsonc', 'utf8');
  assert.match(config, /"workers_dev"\s*:\s*false/);
  assert.match(config, /"preview_urls"\s*:\s*false/);
  assert.doesNotMatch(config, /"routes"\s*:/);

  const publicWorker = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  const allowlist = publicWorker.slice(
    publicWorker.indexOf('const RECOVERY_AUTH_ROUTES'),
    publicWorker.indexOf('const isPasswordResetCallback'),
  );
  assert.doesNotMatch(allowlist, /internal\/admin-export\/send-otp/);
});
