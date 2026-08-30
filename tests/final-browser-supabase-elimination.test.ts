import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('the six reachable legacy areas use only same-origin Better Auth Worker bridges', () => {
  const files = [
    'components/AIAdvisor.tsx',
    'components/MobileAIAdvisor.tsx',
    'utils/aiAdvisorApi.ts',
    'components/MobileLostFound.tsx',
    'utils/activityLogger.ts',
    'utils/pushNotifications.ts',
    'components/Onboarding.tsx',
    'hooks/useDeleteAccount.ts',
    'hooks/useAccountPassword.ts',
  ];
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /from ['"]\.\.\/utils\/supabase|from ['"]\.\/supabase/);
  assert.doesNotMatch(source, /supabase\s*\.(?:from|rpc|auth|storage)/);
  assert.match(source, /\/api\/private\/v1\/ai-advisor/);
  assert.match(source, /\/api\/private\/v1\/activity-log/);
  assert.match(source, /\/api\/private\/v1\/push-subscription/);
  assert.match(source, /signOutBetterAuth/);
});

test('Worker owns actor, push owner, AI owner and mobile lost-found admin mutations', () => {
  const worker = [
    read('cloudflare/worker/src/activity-log.ts'),
    read('cloudflare/worker/src/push-subscriptions.ts'),
    read('cloudflare/worker/src/ai-advisor.ts'),
    read('cloudflare/worker/src/admin-legacy-data.ts'),
  ].join('\n');
  assert.match(worker, /requireBetterAuthSession/);
  assert.match(worker, /requireBetterAuthStaff/);
  assert.match(worker, /identity\.userId/);
  assert.match(worker, /app_user_roles|staff\.role/);
  assert.doesNotMatch(worker, /body\.user_id\s*\|\||body\.role\s*\|\|/);
  assert.match(worker, /operation !== 'upload-image'/);
});

test('admin event auth error mapping preserves 401 instead of converting it to 500', () => {
  const worker = read('cloudflare/worker/src/index.ts');
  assert.match(worker, /error instanceof BetterAuthIdentityError/);
  assert.match(worker, /adminEventMutationErrorResponse/);
});
