import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { handlePushTest, PushTestError } from '../cloudflare/worker/src/push-test.ts';

const read = (path: string) => readFileSync(path, 'utf8');

test('production frontend embeds a valid public VAPID key while private material stays server-only', () => {
  const productionEnv = read('.env.production');
  const match = productionEnv.match(/^VITE_VAPID_PUBLIC_KEY=(.+)$/m);
  assert.ok(match, 'production build is missing VITE_VAPID_PUBLIC_KEY');
  assert.match(match[1].trim(), /^B[A-Za-z0-9_-]{86}$/);
  assert.doesNotMatch(productionEnv, /VAPID_PRIVATE_KEY/);
  assert.match(read('.env.example'), /^VITE_VAPID_PUBLIC_KEY=$/m);
});

test('generated Workbox worker keeps custom background push and deep-link handlers', () => {
  const vite = read('vite.config.ts');
  const worker = read('public/hub-sw.js');
  assert.match(vite, /importScripts:\s*\['\/hub-sw\.js'\]/);
  assert.match(vite, /display:\s*["']standalone["']/);
  assert.match(vite, /start_url:\s*["']\/["']/);
  assert.match(worker, /addEventListener\(['"]push['"]/);
  assert.match(worker, /showNotification\(/);
  assert.match(worker, /addEventListener\(['"]notificationclick['"]/);
  assert.match(worker, /clients\.openWindow\(/);
});

test('mobile permission UX requires a gesture and explains the iOS Home Screen requirement', () => {
  const prompt = read('components/PushNotificationPrompt.tsx');
  const nudge = read('components/NotificationNudge.tsx');
  const mobileHome = read('components/MobileHome.tsx');
  const mobileEvents = read('components/MobileEvents.tsx');
  assert.match(prompt, /onClick=\{handleAllow\}/);
  assert.match(prompt, /Notification\.requestPermission\(\)/);
  assert.match(prompt, /requiresIosHomeScreenInstallForPush/);
  assert.match(prompt, /Thêm vào Màn hình chính/);
  assert.match(nudge, /requiresIosHomeScreenInstallForPush/);
  assert.match(nudge, /Thông báo đang bị chặn trong cài đặt trình duyệt/);
  assert.match(mobileHome, /<PushNotificationPrompt/);
  assert.match(mobileEvents, /<NotificationNudge variant="events"/);
});

test('device subscription is Better Auth-owned, resilient to server cleanup, and never cached across logout', () => {
  const client = read('utils/pushNotifications.ts');
  const bridge = read('cloudflare/worker/src/push-subscriptions.ts');
  const delivery = read('supabase/functions/push/index.ts');
  assert.match(client, /pushManager\.getSubscription\(\)/);
  assert.match(client, /pushManager\.subscribe\(/);
  assert.match(client, /applicationServerKey/);
  assert.match(client, /privateApiRequest\('\/api\/private\/v1\/push-subscription'\)/);
  assert.match(client, /await existingSubscription\.unsubscribe\(\)/);
  assert.doesNotMatch(client, /hasRecentPushSync|PUSH_SYNC_CACHE/);
  assert.match(bridge, /requireBetterAuthSession\(request, env\)/);
  assert.match(bridge, /on_conflict=endpoint/);
  assert.match(delivery, /statusCode === 404 \|\| error\?\.statusCode === 410/);
});

test('private test push derives its target from Better Auth and strips provider details', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  let downstreamBody: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    downstreamBody = JSON.parse(String(init?.body || '{}'));
    return Response.json({
      success: true,
      sent: 2,
      failed: 0,
      skipped: 0,
      results: [{ endpoint: 'https://push.invalid/sensitive', id: 123 }],
    });
  };

  try {
    const env = {
      AUTH_SERVICE: {
        fetch: async () => Response.json({ userId, email: 'member@example.invalid', role: 'user' }),
      },
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(64),
    };
    const result = await handlePushTest(new Request('https://example.test/api/private/v1/push/test', {
      method: 'POST',
      headers: { Cookie: 'session=opaque', 'Content-Type': 'application/json' },
      body: '{}',
    }), env);

    assert.equal(downstreamBody?.targetUserId, userId);
    assert.equal(downstreamBody?.resource, 'send');
    assert.deepEqual(result, {
      success: true,
      sent: 2,
      failed: 0,
      skipped: 0,
      targeted: 2,
      targeting: 'authenticated_user_active_subscriptions',
    });
    assert.doesNotMatch(JSON.stringify(result), /"endpoint"|"p256dh"|"auth"|"results"|11111111/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('private test push rejects client-selected recipients before delivery', async () => {
  let downstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    downstreamCalls += 1;
    return Response.json({ success: true, sent: 1 });
  };

  try {
    await assert.rejects(
      handlePushTest(new Request('https://example.test/api/private/v1/push/test', {
        method: 'POST',
        headers: { Cookie: 'session=opaque', 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'another-user' }),
      }), {
        AUTH_SERVICE: { fetch: async () => Response.json({}) },
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(64),
      }),
      (error: unknown) => error instanceof PushTestError && error.status === 400,
    );
    assert.equal(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('test push UI checks mobile prerequisites and never sends automatically', () => {
  const bell = read('components/NotificationBell.jsx');
  assert.match(bell, /Gửi thông báo thử/);
  assert.match(bell, /requiresIosHomeScreenInstallForPush\(\)/);
  assert.match(bell, /Notification\.permission/);
  assert.match(bell, /navigator\.serviceWorker\.ready/);
  assert.match(bell, /getCurrentPushSubscription\(\)/);
  assert.match(bell, /subscribeToDeviceNotifications\(currentUserId\)/);
  assert.match(bell, /privateApiRequest\('\/api\/private\/v1\/push\/test'/);
  assert.doesNotMatch(bell, /useEffect\([^]*handleTestPush\(/);
});
