import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  beginGoogleStudentAuth,
  completeGoogleRegistration,
  requestStudentPasswordReset,
  signInWithLoginDispatch,
  signInStudent,
  startStudentSignup,
  studentAuthMessage,
  verifyStudentSignup,
} from '../app/auth/studentAuthClient.ts';
import {
  normalizeStudentIdentity,
} from '../cloudflare/auth-production-worker/src/auth-production.ts';

const response = (body: object, status = 200) => Response.json(body, { status });

test('MSSV identity is canonical and full student email is accepted server-side', () => {
  assert.deepEqual(normalizeStudentIdentity('030841250048'), { studentCode: '030841250048', email: '030841250048@st.buh.edu.vn' });
  assert.deepEqual(normalizeStudentIdentity(' 030841250048@ST.BUH.EDU.VN '), { studentCode: '030841250048', email: '030841250048@st.buh.edu.vn' });
  for (const invalid of ['030841250048@gmail.com', '30841250048', 'admin@st.buh.edu.vn', '030841250048@st.buh.edu.vn.evil']) {
    assert.equal(normalizeStudentIdentity(invalid), null);
  }
});

test('password login sends MSSV only to same-origin Better Auth and discards token-shaped response', async () => {
  let captured: RequestInit | undefined;
  await signInStudent('030841250048', 'safe-password-123', 'turnstile', async (input, init) => {
    assert.equal(String(input), '/api/auth/mssv/sign-in'); captured = init;
    return response({ token: 'must-not-be-retained' });
  });
  assert.equal(captured?.credentials, 'include');
  assert.deepEqual(JSON.parse(String(captured?.body)), { mssv: '030841250048', password: 'safe-password-123', rememberMe: true });
});

test('the unchanged login page dispatches credentials server-side without a browser role', async () => {
  let captured: RequestInit | undefined;
  await signInWithLoginDispatch('admin@example.invalid', 'safe-password-123', 'turnstile', async (input, init) => {
    assert.equal(String(input), '/api/auth/login/dispatch'); captured = init;
    return response({ ok: true });
  });
  assert.equal(captured?.credentials, 'include');
  assert.equal((captured?.headers as Record<string, string>)['x-turnstile-token'], 'turnstile');
  assert.deepEqual(JSON.parse(String(captured?.body)), {
    identifier: 'admin@example.invalid', password: 'safe-password-123', rememberMe: true,
  });
  assert.equal(String(captured?.body).includes('role'), false);
});

test('password login reconciles the existing Better Auth identity state before dashboard navigation', () => {
  const login = readFileSync('components/LoginScreen.tsx', 'utf8');
  const roles = readFileSync('hooks/useUserRole.ts', 'utf8');
  const routes = readFileSync('app/routing/AppRoutes.tsx', 'utf8');
  const legacyApp = readFileSync('LegacyApp.tsx', 'utf8');

  assert.match(login, /await signInWithLoginDispatch\([\s\S]*?await onRefreshAuth\?\.\(\{ preserveStateOnError: true \}\)[\s\S]*?navigate\('\/dashboard'/);
  assert.match(login, /!identity\?\.current \|\| !identity\.authenticated/);
  assert.match(roles, /fetchBetterAuthSession\(\)[\s\S]*?setState\(session \? stateForSession\(session\) : anonymousState\)/);
  assert.match(roles, /refreshGenerationRef[\s\S]*?requestGeneration === refreshGenerationRef\.current/);
  assert.match(roles, /SessionIdentityUnavailableError[\s\S]*?setState\(stateForSession\(error\.session\)\)/);
  assert.match(roles, /bootstrapUnavailable/);
  assert.match(legacyApp, /unavailable=\{bootstrapUnavailable && !session\}/);
  assert.doesNotMatch(roles, /setState\(anonymousState\)/);
  assert.match(routes, /<LoginScreen onRefreshAuth=\{onRefreshAuth\} \/>/);
  assert.match(legacyApp, /refreshAuth,[\s\S]*?<AppRoutes[\s\S]*?onRefreshAuth=\{refreshAuth\}/);
});

test('Google login and signup carry distinct server-signed Better Auth intent requests', async () => {
  const bodies: object[] = [];
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return response({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=signed' });
  };
  await beginGoogleStudentAuth('login', 'token', fetcher as typeof fetch);
  await beginGoogleStudentAuth('signup', 'token', fetcher as typeof fetch);
  assert.equal((bodies[0] as { requestSignUp: boolean }).requestSignUp, false);
  assert.equal((bodies[1] as { requestSignUp: boolean }).requestSignUp, true);
  for (const body of bodies as Array<{ callbackURL: string; newUserCallbackURL: string }>) {
    assert.equal(body.callbackURL, '/dashboard');
    assert.equal(body.newUserCallbackURL, '/complete-registration');
  }
  assert.doesNotMatch(
    readFileSync('cloudflare/auth-production-worker/src/auth-production.ts', 'utf8'),
    /shouldRejectGoogleSignupForExistingUser/,
  );
});

test('Google login missing produces the safe not-registered UX outcome', async () => {
  await assert.rejects(
    beginGoogleStudentAuth('login', 'token', async () => response({ code: 'SIGN_UP_NOT_ALLOWED' }, 403)),
    (error: unknown) => studentAuthMessage(error).includes('chưa được đăng ký'),
  );
});

test('email OTP signup, password completion and MSSV recovery use only fixed same-origin routes', async () => {
  const paths: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => { paths.push(String(input)); return response({ ok: true }); };
  await startStudentSignup('030841250048', 'safe-password-123', 'token', fetcher as typeof fetch);
  await verifyStudentSignup('030841250048', '123456', 'token', fetcher as typeof fetch);
  await completeGoogleRegistration('safe-password-123', 'token', fetcher as typeof fetch);
  await requestStudentPasswordReset('030841250048', 'token', fetcher as typeof fetch);
  assert.deepEqual(paths, [
    '/api/auth/student/sign-up/start', '/api/auth/student/sign-up/verify',
    '/api/auth/registration/set-password', '/api/auth/mssv/request-password-reset',
  ]);
});

test('restored old login presentation has no browser Supabase auth or bearer storage', () => {
  const login = readFileSync('components/LoginScreen.tsx', 'utf8');
  const completion = readFileSync('components/RegistrationPasswordScreen.tsx', 'utf8');
  const client = readFileSync('app/auth/studentAuthClient.ts', 'utf8');
  const combined = `${login}\n${completion}\n${client}`;
  assert.match(login, /auth-visual-panel/);
  assert.match(login, /Đăng nhập bằng Google HUB/);
  assert.match(login, /Đăng ký bằng Google HUB/);
  assert.match(login, /Mã số sinh viên/);
  assert.doesNotMatch(login, /Sinh viên\s*\/\s*Nhân sự|Đăng nhập nhân sự|staff email/i);
  assert.doesNotMatch(combined, /supabase\.auth|createClient|getSession\(|localStorage|Authorization\s*:|Bearer/i);
  assert.match(client, /credentials: 'include'/);
});

test('account linking is constrained to one provider row per Better Auth user', () => {
  const migration = readFileSync('cloudflare/auth-production-migrations/0002_unique_auth_account_user_provider.sql', 'utf8');
  assert.match(migration, /GROUP BY user_id, provider_id/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS auth_account_user_provider_unique/);
  assert.match(migration, /ON auth_account \(user_id, provider_id\)/);
  assert.doesNotMatch(migration, /DELETE|UPDATE|INSERT/i);
  const worker = readFileSync('cloudflare/auth-production-worker/src/auth-production.ts', 'utf8');
  assert.match(worker, /disableImplicitSignUp: true/);
  assert.match(worker, /disableImplicitLinking: false/);
  assert.match(worker, /trustedProviders: \[\]/);
  assert.match(worker, /requireStudentOAuthUser/);
  assert.match(worker, /SELECT email FROM auth_user WHERE id = \? LIMIT 1/);
  assert.match(worker, /oauthState !== null[\s\S]*requireStudentOAuthUser\(account\.userId\)/);
  assert.match(worker, /oauthState !== null[\s\S]*requireStudentOAuthUser\(session\.userId\)/);
  assert.match(worker, /requireLocalEmailVerified: false/);
  assert.match(worker, /email_verified = 0[\s\S]*r\.user_id IS NULL/);
  assert.match(worker, /afterEmailVerification:[\s\S]*INSERT INTO app_auth_identifiers[\s\S]*INSERT INTO app_user_roles/);
});

test('account linking index rejects a second credential for the same Better Auth user', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE auth_account (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL)');
    db.exec(readFileSync('cloudflare/auth-production-migrations/0002_unique_auth_account_user_provider.sql', 'utf8'));
    db.prepare('INSERT INTO auth_account VALUES (?, ?, ?, ?)').run('a1', 'user-a', 'credential', 'user-a');
    assert.throws(() => db.prepare('INSERT INTO auth_account VALUES (?, ?, ?, ?)').run('a2', 'user-a', 'credential', 'user-a'));
    db.prepare('INSERT INTO auth_account VALUES (?, ?, ?, ?)').run('a3', 'google-subject', 'google', 'user-a');
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM auth_account WHERE user_id = ?').get('user-a') as { count: number }).count, 2);
  } finally { db.close(); }
});
