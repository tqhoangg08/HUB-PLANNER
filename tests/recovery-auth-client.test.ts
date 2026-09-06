import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  beginGoogleRecoverySignIn,
  GENERIC_PASSWORD_RESET_MESSAGE,
  getRecoverySession,
  requestRecoveryPasswordReset,
  requestStaffPasswordActivation,
  signInRecoveryWithEmail,
  signOutRecovery,
  submitRecoveryPasswordReset,
} from '../app/auth/recoveryAuthClient.ts';

test('Google recovery sign-in is same-origin, Turnstile protected, and Google-only', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetchMock: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=safe' });
  };

  const redirect = await beginGoogleRecoverySignIn('turnstile-token', fetchMock);
  assert.equal(capturedUrl, '/api/auth/sign-in/social');
  assert.equal(capturedInit?.method, 'POST');
  assert.equal((capturedInit?.headers as Record<string, string>)['x-turnstile-token'], 'turnstile-token');
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    provider: 'google',
    callbackURL: '/dashboard',
    errorCallbackURL: '/login?error=oauth',
  });
  assert.equal(redirect.startsWith('https://accounts.google.com/'), true);
});

test('Google recovery sign-in refuses to send without a Turnstile token', async () => {
  let called = false;
  await assert.rejects(() =>
    beginGoogleRecoverySignIn('', async () => {
      called = true;
      return Response.json({});
    }),
  );
  assert.equal(called, false);
});

test('session lookup is cookie based and returns only safe identity fields', async () => {
  let init: RequestInit | undefined;
  const state = await getRecoverySession(async (_input, requestInit) => {
    init = requestInit;
    return Response.json({
      session: { token: 'must-not-escape' },
      user: { id: 'u1', email: 'user@example.invalid', name: 'User', role: 'admin' },
    });
  });
  assert.equal(init?.credentials, 'include');
  assert.equal(init?.cache, 'no-store');
  assert.deepEqual(state, {
    authenticated: true,
    user: { id: 'u1', email: 'user@example.invalid', name: 'User' },
  });
  assert.equal(JSON.stringify(state).includes('token'), false);
  assert.equal(JSON.stringify(state).includes('role'), false);
});

test('email sign-in uses Turnstile and the HttpOnly session instead of retaining response tokens', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const state = await signInRecoveryWithEmail(
    'student@st.buh.edu.vn',
    'fake-password-with-12-chars',
    'turnstile-login',
    async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith('/sign-in/email')) {
        return Response.json({ token: 'must-be-discarded' });
      }
      return Response.json({ user: { id: 'u1', email: 'student@st.buh.edu.vn', name: null } });
    },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/auth/sign-in/email');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.credentials, 'same-origin');
  assert.equal((calls[0].init?.headers as Record<string, string>)['x-turnstile-token'], 'turnstile-login');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    email: 'student@st.buh.edu.vn',
    password: 'fake-password-with-12-chars',
    rememberMe: true,
  });
  assert.equal(calls[1].url, '/api/auth/get-session');
  assert.equal(JSON.stringify(state).includes('token'), false);
});

test('password reset client uses exact same-origin routes and never exposes eligibility', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ status: true, message: GENERIC_PASSWORD_RESET_MESSAGE });
  };
  await requestRecoveryPasswordReset('student@st.buh.edu.vn', 'turnstile-forgot', fetchMock);
  await submitRecoveryPasswordReset('opaque-reset-token', 'fake-password-with-12-chars', 'turnstile-reset', fetchMock);
  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/auth/request-password-reset',
    '/api/auth/reset-password',
  ]);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    email: 'student@st.buh.edu.vn',
    redirectTo: '/reset-password',
  });
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    token: 'opaque-reset-token',
    newPassword: 'fake-password-with-12-chars',
  });
  assert.equal((calls[0].init?.headers as Record<string, string>)['x-turnstile-token'], 'turnstile-forgot');
  assert.equal((calls[1].init?.headers as Record<string, string>)['x-turnstile-token'], 'turnstile-reset');
});

test('staff activation uses a distinct same-origin endpoint and does not carry a role from the browser', async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  await requestStaffPasswordActivation('staff@example.invalid', 'turnstile-staff', async (input, init) => {
    captured = { url: String(input), init };
    return Response.json({ status: true, message: GENERIC_PASSWORD_RESET_MESSAGE });
  });
  assert.equal(captured?.url, '/api/auth/staff/request-password-reset');
  assert.equal(captured?.init?.method, 'POST');
  assert.equal(captured?.init?.credentials, 'same-origin');
  assert.equal((captured?.init?.headers as Record<string, string>)['x-turnstile-token'], 'turnstile-staff');
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), {
    email: 'staff@example.invalid', redirectTo: '/staff/reset-password',
  });
  assert.equal(JSON.stringify(captured?.init?.body).includes('role'), false);
});

test('logout verifies the resulting unauthenticated session', async () => {
  const calls: string[] = [];
  let signOutInit: RequestInit | undefined;
  await signOutRecovery(async (input, init) => {
    calls.push(String(input));
    if (String(input).endsWith('/sign-out')) {
      signOutInit = init;
      return Response.json({ success: true });
    }
    return Response.json(null);
  });
  assert.deepEqual(calls, ['/api/auth/sign-out', '/api/auth/get-session']);
  assert.equal(signOutInit?.method, 'POST');
  assert.equal(signOutInit?.credentials, 'same-origin');
  assert.deepEqual(signOutInit?.headers, {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
  const signOutBody = JSON.parse(String(signOutInit?.body));
  assert.deepEqual(signOutBody, {});
  for (const identityField of ['userId', 'email', 'sessionId', 'token']) {
    assert.equal(Object.hasOwn(signOutBody, identityField), false);
  }
});

test('recovery island has no Supabase auth or browser token storage', () => {
  const files = [
    'app/auth/recoveryAuthClient.ts',
    'components/RecoveryLoginScreen.tsx',
    'components/RecoveryForgotPasswordScreen.tsx',
    'components/RecoveryResetPasswordScreen.tsx',
    'components/RecoveryAccountScreen.tsx',
    'components/StaffPasswordActivationScreen.tsx',
  ];
  const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /supabase\.auth|Authorization\s*:|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /\/api\/auth\/(?:sign-up|mssv|send-verification-email|link-social)/i);
  assert.doesNotMatch(source, /console\.(?:log|error).*password|console\.(?:log|error).*token/i);
});
