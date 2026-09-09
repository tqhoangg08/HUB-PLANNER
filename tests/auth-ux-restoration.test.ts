import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  beginGoogleStudentAuth,
  completeGoogleRegistration,
  getRegistrationStatus,
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

test('server password state globally gates Google-only sessions before dashboard and survives reload', async () => {
  let credentials: RequestCredentials | undefined;
  const status = await getRegistrationStatus(async (_input, init) => {
    credentials = init?.credentials;
    return response({
      complete: false,
      pending: true,
      needsPasswordSetup: true,
      email: '030841250048@st.buh.edu.vn',
    });
  });
  assert.equal(credentials, 'include');
  assert.equal(status.needsPasswordSetup, true);

  const lifecycle = readFileSync('hooks/useSessionLifecycle.ts', 'utf8');
  const app = readFileSync('LegacyApp.tsx', 'utf8');
  const routes = readFileSync('app/routing/AppRoutes.tsx', 'utf8');
  const completion = readFileSync('components/RegistrationPasswordScreen.tsx', 'utf8');
  assert.match(lifecycle, /getRegistrationStatus\(\)/);
  assert.match(lifecycle, /status\.needsPasswordSetup \? null : 'better-auth-managed'/);
  assert.doesNotMatch(lifecycle, /setPasswordSetAt\(sessionUserId \? 'better-auth-managed'/);
  assert.match(app, /if \(requiresPasswordSetup\) \{[\s\S]*?<Navigate to="\/complete-registration" replace \/>/);
  assert.ok(
    app.indexOf('if (requiresPasswordSetup)') < app.indexOf('if (session && requiresRequiredProfileSetup)'),
    'password setup must take precedence over profile onboarding',
  );
  assert.match(routes, /RegistrationPasswordScreen onComplete=\{onPasswordSetupComplete\}/);
  assert.match(completion, /await completeGoogleRegistration\(password, token\);[\s\S]*?onComplete\?\.\(\);[\s\S]*?navigate\('\/dashboard'/);
  assert.doesNotMatch(`${lifecycle}\n${app}`, /localStorage[^\n]*password/i);
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

test('student identity lookups use bounded exact indexes instead of LEFT JOIN OR scans', () => {
  const worker = readFileSync('cloudflare/auth-production-worker/src/auth-production.ts', 'utf8');
  const signIn = worker.slice(
    worker.indexOf('async function handleMssvSignIn'),
    worker.indexOf('async function handleStaffEmailSignIn'),
  );
  const signupLookup = worker.slice(
    worker.indexOf('async function existingStudentUserId'),
    worker.indexOf('async function pendingStudentEmailSignupUserId'),
  );

  assert.doesNotMatch(signIn, /LEFT JOIN app_auth_identifiers/);
  assert.doesNotMatch(signupLookup, /LEFT JOIN app_auth_identifiers/);
  assert.doesNotMatch(`${signIn}\n${signupLookup}`, /WHERE[^;`]*(?:student_code|email)[^;`]*\sOR\s/i);
  assert.match(signIn, /FROM app_auth_identifiers[\s\S]*WHERE student_code = \?1/);
  assert.match(signIn, /FROM auth_user[\s\S]*WHERE id IN/);
  assert.match(signIn, /FROM auth_user[\s\S]*WHERE email = \?2/);
  assert.match(signupLookup, /FROM auth_user[\s\S]*WHERE email = \?1/);
  assert.match(signupLookup, /FROM app_auth_identifiers[\s\S]*WHERE student_code = \?2/);

  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE auth_user (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE);
      CREATE TABLE app_auth_identifiers (
        student_code TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES auth_user(id)
      );
    `);
    const signInSql = signIn.match(/`(SELECT email FROM auth_user[\s\S]*?)`/)![1];
    const signupSql = signupLookup.match(/`(SELECT id FROM auth_user[\s\S]*?)`/)![1];
    const plans = [signInSql, signupSql].map(sql => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all('student', 'email@example.invalid'));
    for (const plan of plans) {
      const details = plan.map((row) => String((row as { detail: string }).detail)).join('\n');
      assert.match(details, /SEARCH .* USING (?:COVERING )?INDEX|SEARCH .* USING INTEGER PRIMARY KEY/);
      assert.doesNotMatch(details, /^SCAN /m);
    }
    db.exec(`INSERT INTO auth_user VALUES ('first', 'first@st.buh.edu.vn'), ('second', 'second@st.buh.edu.vn');
      INSERT INTO app_auth_identifiers VALUES ('00000001', 'first'), ('00000002', 'second');`);
    const oldSignIn = db.prepare(`SELECT u.email FROM auth_user u LEFT JOIN app_auth_identifiers i ON i.user_id=u.id
      WHERE i.student_code=?1 OR u.email=?2 LIMIT 1`);
    const oldSignup = db.prepare(`SELECT u.id FROM auth_user u LEFT JOIN app_auth_identifiers i ON i.user_id=u.id
      WHERE u.email=?1 OR i.student_code=?2 LIMIT 1`);
    for (const [code, email] of [
      ['00000001', 'first@st.buh.edu.vn'],
      ['00000002', 'first@st.buh.edu.vn'],
      ['00000001', 'second@st.buh.edu.vn'],
      ['missing', 'second@st.buh.edu.vn'],
      ['00000002', 'missing@invalid.example'],
      ['missing', 'missing@invalid.example'],
    ]) {
      assert.deepEqual(db.prepare(signInSql).get(code, email), oldSignIn.get(code, email));
      assert.deepEqual(db.prepare(signupSql).get(email, code), oldSignup.get(email, code));
    }
  } finally {
    db.close();
  }
});
