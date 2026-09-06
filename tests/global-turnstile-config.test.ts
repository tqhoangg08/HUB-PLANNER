import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all frontend Turnstile widgets use the canonical login site-key config', () => {
  const config = read('utils/turnstileConfig.ts');
  const sharedWidget = read('components/TurnstileBox.tsx');

  assert.match(config, /VITE_AUTH_TURNSTILE_SITE_KEY/);
  assert.doesNotMatch(config, /VITE_TURNSTILE_SITE_KEY(?![A-Z_])/);
  assert.match(sharedWidget, /siteKey=\{TURNSTILE_SITE_KEY\}/);
  assert.doesNotMatch(sharedWidget, /import\.meta\.env/);

  const directAuthConsumers = [
    'components/LoginScreen.tsx',
    'components/PasswordSetupModal.tsx',
    'components/RecoveryLoginScreen.tsx',
    'components/RegistrationPasswordScreen.tsx',
    'components/RecoveryForgotPasswordScreen.tsx',
    'components/RecoveryResetPasswordScreen.tsx',
    'components/StaffPasswordActivationScreen.tsx',
  ];
  for (const path of directAuthConsumers) {
    const source = read(path);
    assert.match(source, /TURNSTILE_SITE_KEY/, `${path} must use the canonical config`);
    assert.doesNotMatch(source, /import\.meta\.env\.VITE_.*TURNSTILE/, `${path} must not read env directly`);
  }
});

test('all protected mutation surfaces render the shared Turnstile widget', () => {
  const sharedWidgetConsumers = [
    'features/transcript-import/TranscriptImportOverlays.tsx',
    'components/ScheduleBoard.tsx',
    'components/MobileSchedule.tsx',
    'components/EventsBoard.tsx',
    'components/MobileEvents.tsx',
    'components/LostFoundBoard.tsx',
    'components/MobileLostFound.tsx',
    'components/Handbook.tsx',
    'components/MobileHandbook.tsx',
    'components/account/AccountPasswordPanel.tsx',
    'components/account/DeleteAccountModal.tsx',
  ];

  for (const path of sharedWidgetConsumers) {
    const source = read(path);
    assert.match(source, /<TurnstileBox\b/, `${path} must render the shared widget`);
  }
});
