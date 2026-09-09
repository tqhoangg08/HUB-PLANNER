import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
