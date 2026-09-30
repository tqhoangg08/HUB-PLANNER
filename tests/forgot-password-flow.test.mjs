import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { getMigrations } from 'better-auth/db/migration';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('production forgot-password link and recovery routes share the enabled flag', () => {
  const productionEnv = source('.env.production');
  const login = source('components/LoginScreen.tsx');
  const routes = source('app/routing/AppRoutes.tsx');
  const forgot = source('components/RecoveryForgotPasswordScreen.tsx');
  const reset = source('components/RecoveryResetPasswordScreen.tsx');

  assert.match(productionEnv, /^VITE_PASSWORD_RECOVERY_ENABLED=true$/m);
  assert.match(login, /PASSWORD_RECOVERY_ENABLED && <Link to="\/forgot-password"/);
  assert.match(routes, /path="\/forgot-password"[\s\S]*?PASSWORD_RECOVERY_ENABLED[\s\S]*?<RecoveryForgotPasswordScreen \/>/);
  assert.match(routes, /path="\/reset-password"[\s\S]*?PASSWORD_RECOVERY_ENABLED[\s\S]*?<RecoveryResetPasswordScreen \/>/);
  assert.match(forgot, /requestStudentPasswordReset\(identifier, token\)/);
  assert.match(forgot, /GENERIC_PASSWORD_RESET_MESSAGE/);
  assert.match(forgot, /action: 'forgot_password'/);
  assert.match(forgot, /disabled=\{busy \|\| !token \|\| !siteKey\}/);
  assert.match(forgot, /<Link to="\/login"/);
  assert.match(reset, /action: 'reset_password'/);
  assert.match(reset, /submitRecoveryPasswordReset\(resetToken, password, turnstileToken\)/);
  assert.match(login, /params\.get\('password-reset'\) === 'success'/);
  assert.doesNotMatch(`${login}\n${forgot}\n${reset}`, /supabase\.auth|resetPasswordForEmail|localStorage.*(?:reset|token)/i);
});

test('production reset request is a same-origin MSSV flow with one generic public response', () => {
  const client = source('app/auth/studentAuthClient.ts');
  const server = source('cloudflare/auth-production-worker/src/auth-production.ts');
  const route = server.slice(
    server.indexOf('url.pathname === `${AUTH_BASE_PATH}/mssv/request-password-reset`'),
    server.indexOf('if (url.pathname === `${AUTH_BASE_PATH}/send-verification-email`)'),
  );
  assert.match(client, /passwordReset: '\/api\/auth\/mssv\/request-password-reset'/);
  assert.match(client, /requireToken\(token\)[\s\S]*?fetchImpl\(PATHS\.passwordReset/);
  assert.match(route, /normalizeStudentIdentity\(body\.identifier\)/);
  assert.match(route, /identifierRateLimiter\(env\)\.limit/);
  assert.match(route, /isPasswordResetEligible\(eligibility\)/);
  assert.match(route, /isStaffPasswordActivation \|\|\s*url\.pathname === `\$\{AUTH_BASE_PATH\}\/mssv\/request-password-reset`\s*\? new Request\(new URL\(`\$\{AUTH_BASE_PATH\}\/request-password-reset`, request\.url\)/);
  assert.match(route, /auth\.handler\(requestWithJsonBody\(betterAuthRequest, body\)\)/);
  assert.equal((route.match(/jsonResponse\(GENERIC_PASSWORD_RESET_RESPONSE\)/g) || []).length, 4);
  assert.doesNotMatch(route, /jsonResponse\([^\n]*(?:email|studentCode|userId|token)/);
});

test('Better Auth reset tokens are single-use and expiring; new password replaces old', async () => {
  const database = new DatabaseSync(':memory:');
  const sent = [];
  const emailAndPassword = {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    password: { hash: hashPassword, verify: verifyPassword },
    sendResetPassword: async ({ token }) => { sent.push(token); },
  };
  const options = {
    baseURL: 'http://localhost:3000',
    secret: 'test-only-better-auth-secret-long-enough',
    database,
    rateLimit: { enabled: false },
    logger: { level: 'error' },
    emailAndPassword,
  };
  try {
    const auth = betterAuth(options);
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();

    const email = 'student@st.buh.edu.vn';
    const oldPassword = 'old-password-12345';
    const newPassword = 'new-password-67890';
    await auth.api.signUpEmail({ body: { name: 'Test Student', email, password: oldPassword } });

    const requestReset = (path, targetEmail) => auth.handler(new Request(`http://localhost:3000${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, redirectTo: '/reset-password' }),
    }));
    const alias = await requestReset('/api/auth/mssv/request-password-reset', email);
    assert.equal(alias.status, 404);
    assert.equal(sent.length, 0);

    const existing = await requestReset('/api/auth/request-password-reset', email);
    const missing = await requestReset('/api/auth/request-password-reset', 'missing@st.buh.edu.vn');
    assert.equal(existing.status, 200);
    assert.equal(missing.status, 200);
    assert.deepEqual(await existing.json(), await missing.json());
    assert.equal(sent.length, 1);

    const token = sent[0];
    assert.deepEqual(await auth.api.resetPassword({ body: { token, newPassword } }), { status: true });
    await assert.rejects(auth.api.resetPassword({ body: { token, newPassword } }));
    await assert.rejects(auth.api.signInEmail({ body: { email, password: oldPassword } }));
    assert.ok((await auth.api.signInEmail({ body: { email, password: newPassword } })).user);

    const expiringAuth = betterAuth({
      ...options,
      emailAndPassword: { ...emailAndPassword, resetPasswordTokenExpiresIn: -1 },
    });
    await expiringAuth.api.requestPasswordReset({ body: { email } });
    assert.equal(sent.length, 2);
    await assert.rejects(expiringAuth.api.resetPassword({
      body: { token: sent[1], newPassword: 'another-password-12345' },
    }));
  } finally {
    database.close();
  }
});
