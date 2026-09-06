import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Production keeps Better Auth recovery route wiring and mounts the protected shell', () => {
  const app = readFileSync('App.tsx', 'utf8');
  const bootstrap = readFileSync('index.tsx', 'utf8');
  const routes = readFileSync('app/routing/AppRoutes.tsx', 'utf8');
  const env = readFileSync('.env.production', 'utf8');
  assert.match(env, /^VITE_AUTH_MAINTENANCE_MODE=false$/m);
  assert.match(app, /AUTH_MAINTENANCE_MODE && location\.pathname === '\/login'/);
  assert.match(app, /AUTH_MAINTENANCE_MODE && location\.pathname === '\/forgot-password'/);
  assert.match(app, /AUTH_MAINTENANCE_MODE && location\.pathname === '\/reset-password'/);
  assert.match(app, /AUTH_MAINTENANCE_MODE && location\.pathname === '\/account'/);
  assert.doesNotMatch(app, /LegacyApp|React\.lazy/);
  assert.doesNotMatch(app, /useUserRole|useSessionLifecycle|supabase/i);
  assert.match(bootstrap, /import\('\.\/recovery-entry'\)/);
  assert.match(bootstrap, /import\('\.\/legacy-entry'\)/);
  assert.match(routes, /path="\/login" element={<LoginScreen/);
  assert.match(routes, /path="\/forgot-password"[\s\S]*PASSWORD_RECOVERY_ENABLED[\s\S]*RecoveryForgotPasswordScreen/);
  assert.match(routes, /path="\/reset-password"[\s\S]*PASSWORD_RECOVERY_ENABLED[\s\S]*RecoveryResetPasswordScreen/);
  assert.match(routes, /path="\/account" element={<RecoveryAccountScreen/);
  assert.match(routes, /path="\/login" element=\{<LoginScreen onRefreshAuth=\{onRefreshAuth\} \/>\}/);
  assert.match(routes, /path="\/\*" element=\{protectedApp\}/);
  for (const path of ['onboarding', 'learning', 'profile', 'profiles', 'admin', 'support']) {
    assert.match(routes, new RegExp(`path="\\/${path}`));
  }
  assert.match(routes, /AuthMaintenanceScreen/);
});

test('final Production password recovery release preserves Google and enables Stage-2 routes', () => {
  const app = readFileSync('App.tsx', 'utf8');
  const login = readFileSync('components/RecoveryLoginScreen.tsx', 'utf8');
  const rescueMode = readFileSync('utils/rescueMode.ts', 'utf8');

  assert.match(rescueMode, /VITE_PASSWORD_RECOVERY_ENABLED/);
  assert.match(login, /PASSWORD_RECOVERY_ENABLED && <>/);
  assert.match(login, /Đăng nhập bằng Google/);
  assert.match(login, /action: 'google_login'/);
  assert.ok(
    login.indexOf('Đăng nhập bằng Google') < login.indexOf('PASSWORD_RECOVERY_ENABLED && <>'),
    'Google sign-in must remain outside the password-recovery gate',
  );
  assert.match(login, /PASSWORD_RECOVERY_ENABLED && searchParams\.get\('password-reset'\)/);
  assert.match(login, /<form onSubmit=\{handleEmailSignIn\}/);
  assert.match(login, /<Link to="\/forgot-password"/);

  for (const path of ['forgot-password', 'reset-password']) {
    assert.match(
      app,
      new RegExp(`pathname === '\\/${path}'[\\s\\S]*PASSWORD_RECOVERY_ENABLED[\\s\\S]*<Navigate to="\\/login" replace`),
    );
  }
  assert.doesNotMatch(app, /Navigate to="\/login\?[^"\n]*token/);
  assert.doesNotMatch(`${app}\n${login}`, /localStorage|sessionStorage|console\.(?:log|error)/);
});

test('password screens use fixed Turnstile actions and do not persist reset secrets', () => {
  const login = readFileSync('components/RecoveryLoginScreen.tsx', 'utf8');
  const forgot = readFileSync('components/RecoveryForgotPasswordScreen.tsx', 'utf8');
  const reset = readFileSync('components/RecoveryResetPasswordScreen.tsx', 'utf8');
  assert.match(login, /action: 'google_login'/);
  assert.match(login, /action: 'login'/);
  assert.match(forgot, /action: 'forgot_password'/);
  assert.match(reset, /action: 'reset_password'/);
  assert.match(reset, /minLength=\{12\}/);
  assert.match(reset, /maxLength=\{128\}/);
  assert.match(reset, /history\.replaceState\(\{\}, '', returnTo\.split\('\?'\)\[0\]\)/);
  assert.match(reset, /navigate\(returnTo, \{ replace: true \}\)/);
  const source = `${login}\n${forgot}\n${reset}`;
  assert.doesNotMatch(source, /localStorage|sessionStorage|supabase|Authorization\s*:/i);
  assert.doesNotMatch(source, /console\.(?:log|error)/);
});

test('recovery account page does not mount legacy protected application data', () => {
  const app = readFileSync('App.tsx', 'utf8');
  assert.match(app, /location\.pathname === '\/account'[\s\S]*return <RecoveryAccountScreen \/>/);
  assert.doesNotMatch(app, /LegacyApp|ProtectedApp/);
  const account = readFileSync('components/RecoveryAccountScreen.tsx', 'utf8');
  assert.doesNotMatch(account, /useUserRole|useStudyData|ProtectedApp|Supabase|admin/i);
  assert.match(account, /<a href="\/dashboard"/);
  assert.doesNotMatch(account, /<Link to="\/dashboard"/);
});
