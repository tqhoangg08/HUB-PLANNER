import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isIntegrationPreviewStage2AuthRequest,
  isProductionRecoveryAuthRequest,
  proxyAuthServiceIfEnabled,
} from '../cloudflare/worker/src/index.ts';

const request = (path: string, method = 'GET', host = 'hotrosinhvienhub.id.vn') =>
  new Request(`https://${host}${path}`, {
    method,
    headers: method === 'POST'
      ? { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10' }
      : undefined,
    body: method === 'POST' ? '{}' : undefined,
  });

const envWith = (fetcher: (request: Request) => Promise<Response> | Response, limiter?: () => boolean) =>
  ({
    AUTH_SERVICE_PROXY_ENABLED: 'true',
    AUTH_SERVICE: { fetch: fetcher },
    AUTH_INGRESS_IP_RATE_LIMIT: {
      limit: async () => ({ success: limiter ? limiter() : true }),
    },
  }) as never;

const previewEnvWith = (fetcher: (request: Request) => Promise<Response> | Response, limiter?: () => boolean) => ({
  ...envWith(fetcher, limiter),
  AUTH_SERVICE_PROXY_MODE: 'integration-stage2',
}) as never;

test('Production allowlist exposes only the Better Auth student and recovery route shapes', () => {
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/sign-in/social', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/callback/google?code=x&state=y')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/get-session')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/sign-out', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/sign-in/email', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/login/dispatch', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/mssv/sign-in', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/mssv/request-password-reset', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/student/sign-up/start', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/student/sign-up/verify', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/student/sign-up/resend', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/registration/status')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/registration/set-password', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/request-password-reset', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/staff/request-password-reset', 'POST')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/reset-password/opaque-token?callbackURL=%2Freset-password')), true);
  assert.equal(isProductionRecoveryAuthRequest(request('/api/auth/reset-password', 'POST')), true);
  for (const [path, method] of [
    ['/api/auth/sign-up/email', 'POST'],
    ['/api/auth/staff/request-password-reset/extra', 'POST'],
    ['/api/auth/reset-password/token/extra', 'GET'],
    ['/api/auth/reset-password/', 'GET'],
    ['/api/auth/reset-password/token', 'POST'],
    ['/api/auth/reset-password', 'GET'],
    ['/api/auth/send-verification-email', 'POST'],
    ['/api/auth/sign-up/email', 'POST'],
    ['/api/auth/sign-out', 'GET'],
  ]) {
    assert.equal(isProductionRecoveryAuthRequest(request(path, method)), false);
  }
});

test('exact host gate denies workers.dev and other hosts before service binding', async () => {
  let forwarded = 0;
  const env = envWith(() => {
    forwarded += 1;
    return new Response('unexpected');
  });
  for (const host of ['hub-planner-public-dev-api.tqhoangg2.workers.dev', 'example.com']) {
    const response = await proxyAuthServiceIfEnabled(request('/api/auth/get-session', 'GET', host), env);
    assert.equal(response?.status, 404);
  }
  assert.equal(forwarded, 0);
});

test('Preview Stage-2 policy accepts exactly six route shapes on the exact Preview host', async () => {
  const host = 'hub-planner-public-dev-api-preview.tqhoangg2.workers.dev';
  for (const [path, method] of [
    ['/api/auth/request-password-reset', 'POST'],
    ['/api/auth/reset-password/opaque?callbackURL=%2Freset-password', 'GET'],
    ['/api/auth/reset-password', 'POST'],
    ['/api/auth/sign-in/email', 'POST'],
    ['/api/auth/get-session', 'GET'],
    ['/api/auth/sign-out', 'POST'],
  ]) assert.equal(isIntegrationPreviewStage2AuthRequest(request(path, method, host)), true);

  for (const [path, method] of [
    ['/api/auth/sign-in/social', 'POST'],
    ['/api/auth/sign-up/email', 'POST'],
    ['/api/auth/reset-password/token/extra', 'GET'],
    ['/api/auth/reset-password/', 'GET'],
    ['/api/auth/reset-password/token', 'POST'],
    ['/api/auth/get-session', 'POST'],
  ]) assert.equal(isIntegrationPreviewStage2AuthRequest(request(path, method, host)), false);

  assert.equal(isIntegrationPreviewStage2AuthRequest(request('/api/auth/get-session', 'GET', 'hotrosinhvienhub.id.vn')), false);
  let forwarded = 0;
  const response = await proxyAuthServiceIfEnabled(
    request('/api/auth/get-session', 'GET', host),
    previewEnvWith(() => { forwarded += 1; return new Response('ok'); }),
  );
  assert.equal(response?.status, 200);
  assert.equal(forwarded, 1);
});

test('Preview mode does not alter the default Production host policy', async () => {
  let productionCalls = 0;
  const production = await proxyAuthServiceIfEnabled(
    request('/api/auth/sign-in/social', 'POST'),
    envWith(() => { productionCalls += 1; return new Response('ok'); }),
  );
  assert.equal(production?.status, 200);
  assert.equal(productionCalls, 1);

  let previewCalls = 0;
  const denied = await proxyAuthServiceIfEnabled(
    request('/api/auth/sign-in/social', 'POST', 'hub-planner-public-dev-api-preview.tqhoangg2.workers.dev'),
    previewEnvWith(() => { previewCalls += 1; return new Response('unexpected'); }),
  );
  assert.equal(denied?.status, 404);
  assert.equal(previewCalls, 0);
});

test('callback query and original Request are forwarded unchanged', async () => {
  const original = request('/api/auth/callback/google?code=abc&state=xyz');
  let forwarded: Request | undefined;
  const responseHeaders = new Headers({ 'cache-control': 'no-store' });
  responseHeaders.append('set-cookie', 'hubplanner_auth_a=opaque-a; HttpOnly; Secure');
  responseHeaders.append('set-cookie', 'hubplanner_auth_b=opaque-b; HttpOnly; Secure');
  const expected = new Response('callback', {
    headers: responseHeaders,
  });
  const response = await proxyAuthServiceIfEnabled(original, envWith((incoming) => {
    forwarded = incoming;
    return expected;
  }));
  assert.equal(forwarded, original);
  assert.equal(new URL(forwarded!.url).search, '?code=abc&state=xyz');
  assert.equal(response, expected);
  assert.equal(response?.headers.get('cache-control'), 'no-store');
  assert.equal(response?.headers.has('set-cookie'), true);
  const getSetCookie = (response?.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (getSetCookie) assert.equal(getSetCookie.call(response!.headers).length, 2);
});

test('coarse ingress limiter applies to Stage-2 sensitive POSTs, not GET session/callback', async () => {
  let limiterCalls = 0;
  let serviceCalls = 0;
  const env = envWith(() => {
    serviceCalls += 1;
    return new Response('ok', { headers: { 'cache-control': 'no-store' } });
  }, () => {
    limiterCalls += 1;
    return true;
  });
  await proxyAuthServiceIfEnabled(request('/api/auth/sign-in/social', 'POST'), env);
  await proxyAuthServiceIfEnabled(request('/api/auth/sign-in/email', 'POST'), env);
  await proxyAuthServiceIfEnabled(request('/api/auth/login/dispatch', 'POST'), env);
  await proxyAuthServiceIfEnabled(request('/api/auth/request-password-reset', 'POST'), env);
  await proxyAuthServiceIfEnabled(request('/api/auth/staff/request-password-reset', 'POST'), env);
  await proxyAuthServiceIfEnabled(request('/api/auth/reset-password', 'POST'), env);
  await proxyAuthServiceIfEnabled(request('/api/auth/get-session'), env);
  await proxyAuthServiceIfEnabled(request('/api/auth/callback/google?code=a&state=b'), env);
  await proxyAuthServiceIfEnabled(request('/api/auth/reset-password/opaque?callbackURL=%2Freset-password'), env);
  assert.equal(limiterCalls, 6);
  assert.equal(serviceCalls, 9);
});

test('production bindings and enablement are explicit and isolated', () => {
  const publicConfig = readFileSync('cloudflare/wrangler.jsonc', 'utf8');
  const authConfig = readFileSync('cloudflare/wrangler.auth-production.jsonc', 'utf8');
  assert.match(publicConfig, /"service": "hub-planner-auth-production"/);
  assert.match(publicConfig, /"namespace_id": "45871911"/);
  assert.match(publicConfig, /"limit": 120/);
  assert.match(authConfig, /"AUTH_ENABLED": "true"/);
  assert.match(authConfig, /"database_id": "4f42d86e-f924-4ecc-b3af-fc947b48810b"/);
  assert.match(authConfig, /"workers_dev": false/);
  assert.match(authConfig, /"preview_urls": false/);
  assert.doesNotMatch(authConfig, /"routes"|"services"|"assets"|"triggers"/);
});
