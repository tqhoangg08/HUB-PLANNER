import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  PRODUCTION_AUTH_PROFILE,
  createAuthForProfile,
  getRuntimeConfig,
  removeGoogleOAuthLoginHint,
  type AuthProductionEnv,
} from '../cloudflare/auth-production-worker/src/auth-production.ts';

const ORIGIN = 'https://hotrosinhvienhub.id.vn';

const createTestAuth = () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE auth_verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const env = {
    AUTH_DB: database as unknown as D1Database,
    AUTH_BETTER_AUTH_SECRET: 'test-better-auth-secret-that-is-long-enough-for-oauth-state',
    AUTH_ORIGIN: ORIGIN,
    AUTH_TURNSTILE_EXPECTED_HOSTNAME: 'hotrosinhvienhub.id.vn',
    AUTH_TURNSTILE_SITE_KEY: 'test-public-site-key',
    AUTH_TURNSTILE_SECRET: 'test-turnstile-secret',
    AUTH_GOOGLE_CLIENT_ID: 'test-google-client-id.apps.googleusercontent.com',
    AUTH_GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    AUTH_EMAIL_FROM: 'HUB Planner <no-reply@hotrosinhvienhub.id.vn>',
    AUTH_RESEND_API_KEY: 'test-resend-api-key',
    AUTH_RESET_EMAIL_DAILY_BUDGET: '80',
  } as AuthProductionEnv;
  const context = { waitUntil() {} } as unknown as ExecutionContext;
  return {
    auth: createAuthForProfile(env, context, PRODUCTION_AUTH_PROFILE, getRuntimeConfig(env, PRODUCTION_AUTH_PROFILE)),
    database,
  };
};

const authorizationUrl = async (requestSignUp: boolean) => {
  const { auth, database } = createTestAuth();
  try {
    const body: Record<string, unknown> = {
      provider: 'google',
      requestSignUp,
      callbackURL: requestSignUp ? '/complete-registration' : '/dashboard',
      newUserCallbackURL: '/complete-registration',
      errorCallbackURL: `/login?oauth=${requestSignUp ? 'signup' : 'login'}-error`,
      loginHint: 'previous-account@st.buh.edu.vn',
      login_hint: 'previous-account@st.buh.edu.vn',
    };
    removeGoogleOAuthLoginHint(body);
    const response = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(body),
    }));
    assert.equal(response.status, 200);
    const payload = await response.json() as { url?: unknown };
    assert.equal(typeof payload.url, 'string');
    return new URL(payload.url as string);
  } finally {
    database.close();
  }
};

test('Google login and signup authorization URLs always force account selection', async () => {
  for (const requestSignUp of [false, true]) {
    const url = await authorizationUrl(requestSignUp);
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('prompt'), 'select_account');
    assert.equal(url.searchParams.get('hd'), 'st.buh.edu.vn');
    assert.equal(url.searchParams.has('login_hint'), false);
  }
});

test('ordinary Google clients do not send a login hint or override the provider prompt', () => {
  const clients = [
    readFileSync('app/auth/studentAuthClient.ts', 'utf8'),
    readFileSync('app/auth/recoveryAuthClient.ts', 'utf8'),
  ].join('\n');
  assert.doesNotMatch(clients, /login[_-]?hint|loginHint/i);
  assert.doesNotMatch(clients, /additionalParams[\s\S]*prompt/i);

  const worker = readFileSync('cloudflare/auth-production-worker/src/auth-production.ts', 'utf8');
  assert.match(worker, /google:\s*\{[\s\S]*?hd:\s*"st\.buh\.edu\.vn"[\s\S]*?prompt:\s*"select_account"/);
  assert.match(worker, /sign-in\/social[\s\S]*removeGoogleOAuthLoginHint\(body\)/);
});

test('server-side Google request sanitization removes both login-hint spellings only', () => {
  const body: Record<string, unknown> = {
    provider: 'google',
    requestSignUp: true,
    callbackURL: '/complete-registration',
    loginHint: 'one@st.buh.edu.vn',
    login_hint: 'two@st.buh.edu.vn',
  };
  removeGoogleOAuthLoginHint(body);
  assert.deepEqual(body, {
    provider: 'google',
    requestSignUp: true,
    callbackURL: '/complete-registration',
  });
});
