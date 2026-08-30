import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PRODUCTION_AUTH_PROFILE,
  allowsIntegrationStage2Request,
  getRuntimeConfig,
  isIntegrationSyntheticPasswordResetEligible,
} from '../cloudflare/auth-production-worker/src/auth-production.ts';
import {
  AUTH_INTEGRATION_STAGE2_HOSTNAME,
  AUTH_INTEGRATION_STAGE2_ORIGIN,
  INTEGRATION_STAGE2_AUTH_PROFILE,
} from '../cloudflare/auth-production-worker/src/auth-integration-stage2-profile.ts';

const INTEGRATION_ID = '7a29a608-b44c-4a55-895b-d96ed26c52b8';
const PRODUCTION_ID = '4f42d86e-f924-4ecc-b3af-fc947b48810b';
const SYNTHETIC_ID = '1cfc34fe-cdfa-46f2-ad5f-42474383b054';

const request = (path: string, method = 'GET') =>
  new Request(`${AUTH_INTEGRATION_STAGE2_ORIGIN}${path}`, { method });

test('Integration Stage-2 profile is statically isolated from Production', () => {
  assert.equal(INTEGRATION_STAGE2_AUTH_PROFILE.kind, 'integration-stage2');
  assert.equal(INTEGRATION_STAGE2_AUTH_PROFILE.origin, AUTH_INTEGRATION_STAGE2_ORIGIN);
  assert.deepEqual(INTEGRATION_STAGE2_AUTH_PROFILE.trustedOrigins, [AUTH_INTEGRATION_STAGE2_ORIGIN]);
  assert.equal(INTEGRATION_STAGE2_AUTH_PROFILE.expectedHostname, AUTH_INTEGRATION_STAGE2_HOSTNAME);
  assert.equal(INTEGRATION_STAGE2_AUTH_PROFILE.resetPage, `${AUTH_INTEGRATION_STAGE2_ORIGIN}/reset-password`);
  assert.equal(INTEGRATION_STAGE2_AUTH_PROFILE.eligibilityPolicy, 'integration-synthetic-user');
  assert.equal(INTEGRATION_STAGE2_AUTH_PROFILE.providers, 'email-only');
  assert.notEqual(INTEGRATION_STAGE2_AUTH_PROFILE.cookiePrefix, PRODUCTION_AUTH_PROFILE.cookiePrefix);
  assert.equal(PRODUCTION_AUTH_PROFILE.origin, 'https://hotrosinhvienhub.id.vn');
  assert.equal(PRODUCTION_AUTH_PROFILE.eligibilityPolicy, 'production-student');
});

test('Integration runtime requires exact deployment origin, exact UUID and only email providers', () => {
  const config = getRuntimeConfig({
    AUTH_DB: {} as D1Database,
    AUTH_BETTER_AUTH_SECRET: 'integration-better-auth-secret-value',
    AUTH_ORIGIN: AUTH_INTEGRATION_STAGE2_ORIGIN,
    AUTH_TURNSTILE_EXPECTED_HOSTNAME: AUTH_INTEGRATION_STAGE2_HOSTNAME,
    AUTH_TURNSTILE_SITE_KEY: 'integration-public-site-key',
    AUTH_TURNSTILE_SECRET: 'integration-turnstile-secret',
    AUTH_EMAIL_FROM: 'HUB Planner Integration <no-reply@hotrosinhvienhub.id.vn>',
    AUTH_RESEND_API_KEY: 'integration-resend-secret',
    AUTH_RESET_EMAIL_DAILY_BUDGET: '1',
    AUTH_INTEGRATION_SYNTHETIC_USER_ID: SYNTHETIC_ID,
  }, INTEGRATION_STAGE2_AUTH_PROFILE);

  assert.equal(config.syntheticUserId, SYNTHETIC_ID);
  assert.equal(config.origin, AUTH_INTEGRATION_STAGE2_ORIGIN);
  assert.equal(config.resetEmailDailyBudget, 1);
  assert.equal(config.google, undefined);

  for (const override of [
    { AUTH_INTEGRATION_SYNTHETIC_USER_ID: undefined },
    { AUTH_INTEGRATION_SYNTHETIC_USER_ID: 'not-a-uuid' },
    { AUTH_ORIGIN: 'https://hotrosinhvienhub.id.vn' },
    { AUTH_TURNSTILE_EXPECTED_HOSTNAME: 'hotrosinhvienhub.id.vn' },
    { AUTH_RESET_EMAIL_DAILY_BUDGET: '80' },
  ]) {
    assert.throws(() => getRuntimeConfig({
      AUTH_DB: {} as D1Database,
      AUTH_BETTER_AUTH_SECRET: 'integration-better-auth-secret-value',
      AUTH_ORIGIN: AUTH_INTEGRATION_STAGE2_ORIGIN,
      AUTH_TURNSTILE_EXPECTED_HOSTNAME: AUTH_INTEGRATION_STAGE2_HOSTNAME,
      AUTH_TURNSTILE_SITE_KEY: 'integration-public-site-key',
      AUTH_TURNSTILE_SECRET: 'integration-turnstile-secret',
      AUTH_EMAIL_FROM: 'HUB Planner Integration <no-reply@hotrosinhvienhub.id.vn>',
      AUTH_RESEND_API_KEY: 'integration-resend-secret',
      AUTH_RESET_EMAIL_DAILY_BUDGET: '1',
      AUTH_INTEGRATION_SYNTHETIC_USER_ID: SYNTHETIC_ID,
      ...override,
    }, INTEGRATION_STAGE2_AUTH_PROFILE), /AUTH_CONFIGURATION_REQUIRED/);
  }
});

test('Integration Auth allows exactly six Stage-2 route shapes', () => {
  for (const [path, method] of [
    ['/api/auth/request-password-reset', 'POST'],
    ['/api/auth/reset-password/opaque-token?callbackURL=%2Freset-password', 'GET'],
    ['/api/auth/reset-password', 'POST'],
    ['/api/auth/sign-in/email', 'POST'],
    ['/api/auth/get-session', 'GET'],
    ['/api/auth/sign-out', 'POST'],
  ]) assert.equal(allowsIntegrationStage2Request(request(path, method)), true);

  for (const [path, method] of [
    ['/api/auth/sign-up/email', 'POST'],
    ['/api/auth/sign-in/social', 'POST'],
    ['/api/auth/reset-password/token/extra', 'GET'],
    ['/api/auth/reset-password/', 'GET'],
    ['/api/auth/reset-password/token', 'POST'],
    ['/api/auth/get-session', 'POST'],
    ['/api/auth/sign-out', 'GET'],
  ]) assert.equal(allowsIntegrationStage2Request(request(path, method)), false);
});

test('Integration Wrangler config has one isolated D1 and no public trigger', () => {
  const config = readFileSync('cloudflare/wrangler.auth-integration-stage2.jsonc', 'utf8');
  assert.match(config, /"name": "hub-planner-auth-integration"/);
  assert.match(config, new RegExp(INTEGRATION_ID));
  assert.doesNotMatch(config, new RegExp(PRODUCTION_ID));
  assert.match(config, /"workers_dev": false/);
  assert.match(config, /"preview_urls": false/);
  assert.doesNotMatch(config, /"routes"|"services"|"assets"|"triggers"/);
  assert.match(config, /"AUTH_RESET_EMAIL_DAILY_BUDGET": "1"/);
  assert.match(config, /"AUTH_TURNSTILE_SITE_KEY": "0x[^"]+"/);
  assert.doesNotMatch(config, /CONFIGURE_INTEGRATION/);
  assert.match(config, /"ratelimits"/);
  assert.match(config, /"name": "AUTH_IDENTIFIER_RATE_LIMIT"/);
  assert.match(config, /"namespace_id": "45871914"/);
  assert.match(config, /"limit": 8/);
  assert.match(config, /"period": 60/);
  for (const name of [
    'AUTH_BETTER_AUTH_SECRET',
    'AUTH_TURNSTILE_SECRET',
    'AUTH_RESEND_API_KEY',
    'AUTH_INTEGRATION_SYNTHETIC_USER_ID',
  ]) assert.match(config, new RegExp(`"${name}"`));
});

test('Integration entrypoint hard-binds the Stage-2 profile', () => {
  const entry = readFileSync('cloudflare/auth-production-worker/src/auth-integration-stage2.ts', 'utf8');
  assert.match(entry, /handleAuthIntegrationStage2Request/);
  assert.doesNotMatch(entry, /PRODUCTION_AUTH_PROFILE|request\.(?:headers|json)|URLSearchParams/);
});

test('Integration eligibility is bound to the configured UUID as well as email and role', () => {
  const source = readFileSync('cloudflare/auth-production-worker/src/auth-production.ts', 'utf8');
  const eligibility = source.slice(
    source.indexOf('async function passwordResetEligibilityForEmail'),
    source.indexOf('async function integrationSyntheticEmailMatches'),
  );
  const signInGuard = source.slice(
    source.indexOf('async function integrationSyntheticEmailMatches'),
    source.indexOf('function utcDayStartedAt'),
  );
  assert.match(eligibility, /WHERE u\.email = \?1[\s\S]*u\.id = \?2/);
  assert.match(eligibility, /\.bind\(email, exactUserId \?\? null\)/);
  assert.match(signInGuard, /WHERE u\.id = \?1[\s\S]*u\.email = \?2[\s\S]*r\.role = 'user'/);
  assert.match(signInGuard, /\.bind\(syntheticUserId, email\)/);
  assert.doesNotMatch(signInGuard, /INSERT|UPDATE|DELETE/);
});

test('Integration activation permits no-provider or credential-only state, never Google overlap', () => {
  const base = {
    userFound: true,
    role: 'user' as const,
    totalProviders: 0,
    credentialProviders: 0,
    googleProviders: 0,
    unexpectedProviders: 0,
  };
  assert.equal(isIntegrationSyntheticPasswordResetEligible(base), true);
  assert.equal(isIntegrationSyntheticPasswordResetEligible({
    ...base,
    totalProviders: 1,
    credentialProviders: 1,
  }), true);
  assert.equal(isIntegrationSyntheticPasswordResetEligible({
    ...base,
    totalProviders: 1,
    googleProviders: 1,
  }), false);
  assert.equal(isIntegrationSyntheticPasswordResetEligible({
    ...base,
    totalProviders: 2,
    credentialProviders: 1,
    googleProviders: 1,
  }), false);
});

test('Integration reset/email implementation cannot generate a Production reset URL', () => {
  const profile = readFileSync('cloudflare/auth-production-worker/src/auth-integration-stage2-profile.ts', 'utf8');
  assert.doesNotMatch(profile, /hotrosinhvienhub\.id\.vn/);
  assert.match(profile, /hub-planner-public-dev-api-preview\.tqhoangg2\.workers\.dev/);
  const source = readFileSync('cloudflare/auth-production-worker/src/auth-production.ts', 'utf8');
  assert.match(source, /body\.redirectTo = config\.resetPage/);
  assert.match(source, /HUB Planner Integration authentication test/);
});
