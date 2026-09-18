import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { handlePushTest, PushTestError } from '../cloudflare/worker/src/push-test.ts';
import { handlePushSubscription } from '../cloudflare/worker/src/push-subscriptions.ts';
import { sendWebPush, WebPushError } from '../cloudflare/worker/src/web-push.ts';
import { completeCurrentDevicePushRegistration, PushRegistrationError } from '../utils/pushRegistrationFlow.ts';

const read = (path: string) => readFileSync(path, 'utf8');
const createPushDb = async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const db = await mf.getD1Database('DB');
  await db.exec(`CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, binding_started_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, system INTEGER, events INTEGER, lost_found INTEGER, schedule INTEGER, school INTEGER);
    CREATE TABLE push_delivery_attempts (source_type TEXT, source_id TEXT, subscription_id TEXT, state TEXT, attempts INTEGER,
    last_status INTEGER, updated_at TEXT, next_retry_at TEXT, PRIMARY KEY(source_type, source_id, subscription_id));`.replace(/\s+/g, ' '));
  return { mf, db };
};
const subscriptionKeys = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    p256dh: Buffer.from(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))).toString('base64url'),
    auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  };
};
const vapidKeys = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return {
    VITE_VAPID_PUBLIC_KEY: Buffer.from(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))).toString('base64url'),
    VAPID_PRIVATE_KEY: String(jwk.d),
  };
};
const auth = (userId = '11111111-1111-4111-8111-111111111111') => ({
  AUTH_SERVICE: { fetch: async () => Response.json({ userId, email: 'member@example.invalid', role: 'user' }) },
});
const endpointFingerprint = async (endpoint: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Buffer.from(new Uint8Array(digest)).toString('hex');
};

test('production frontend has public VAPID key and no private key', () => {
  const source = read('.env.production');
  assert.match(source, /^VITE_VAPID_PUBLIC_KEY=B[A-Za-z0-9_-]{86}$/m);
  assert.doesNotMatch(source, /VAPID_PRIVATE_KEY/);
});

test('Workbox keeps background push and deep-link handlers', () => {
  assert.match(read('vite.config.ts'), /importScripts:\s*\['\/hub-sw\.js'\]/);
  const worker = read('public/hub-sw.js');
  assert.match(worker, /addEventListener\(['"]push['"]/);
  assert.match(worker, /showNotification\(/);
  assert.match(worker, /addEventListener\(['"]notificationclick['"]/);
  assert.match(worker, /clients\.openWindow\(/);
});

test('native Web Push classifies transport failures without exposing subscription material', async () => {
  const keys = await subscriptionKeys();
  await assert.rejects(
    sendWebPush({ ...await vapidKeys() }, { id: 'device', user_id: 'user', endpoint: 'https://push.example.invalid/device', ...keys }, { title: 'x' }, async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }),
    (error: unknown) => error instanceof WebPushError
      && error.statusCode === undefined
      && error.failureClass === 'transport_timeout'
      && !/p256dh|endpoint|auth/i.test(error.message),
  );
});

test('mobile permission UX requires a gesture and iOS Home Screen', () => {
  const prompt = read('components/PushNotificationPrompt.tsx');
  assert.match(prompt, /Notification\.requestPermission\(\)/);
  assert.match(prompt, /requiresIosHomeScreenInstallForPush/);
  assert.match(read('components/MobileHome.tsx'), /<PushNotificationPrompt/);
});

test('push runtime is D1 and Better Auth owned with native stale cleanup', () => {
  const subscription = read('cloudflare/worker/src/push-subscriptions.ts');
  const delivery = read('cloudflare/worker/src/push-delivery.ts');
  assert.match(subscription, /requireBetterAuthSession\(request, env\)/);
  assert.match(subscription, /ON CONFLICT\(endpoint\) DO UPDATE/);
  assert.doesNotMatch(subscription, /SUPABASE|resolveLegacyPushOwner/);
  assert.match(delivery, /status === 404 \|\| status === 410/);
  assert.doesNotMatch(delivery, /functions\/v1\/push|SUPABASE/);
});

test('private test push targets only authenticated Better Auth user', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const { mf, db } = await createPushDb();
  const keys = await subscriptionKeys();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('sub-1', userId, 'https://push.example.invalid/device', keys.p256dh, keys.auth, now, now, now).run();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 201 });
  try {
    const result = await handlePushTest(new Request('https://example.test/api/private/v1/push/test', {
      method: 'POST', headers: { Cookie: 'session=opaque', 'Content-Type': 'application/json' }, body: '{}',
    }), { DB: db, ...auth(userId), ...await vapidKeys() });
    assert.deepEqual(result, { success: true, sent: 1, failed: 0, skipped: 0, targeted: 1, targeting: 'authenticated_user_active_subscriptions' });
    assert.doesNotMatch(JSON.stringify(result), /"(?:endpoint|p256dh|auth|results)"/i);
  } finally { globalThis.fetch = originalFetch; await mf.dispose(); }
});

test('current-device test resolves only the authenticated server-matched fingerprint through the native sender', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const { mf, db } = await createPushDb();
  const keys = await subscriptionKeys();
  const now = new Date().toISOString();
  const currentEndpoint = 'https://fcm.googleapis.com/fcm/send/current-device';
  const otherEndpoint = 'https://fcm.googleapis.com/fcm/send/other-device';
  await db.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('current', userId, currentEndpoint, keys.p256dh, keys.auth, now, now, now).run();
  await db.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('other', userId, otherEndpoint, keys.p256dh, keys.auth, now, now, now).run();
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response(null, { status: 201 });
  };
  try {
    const result = await handlePushTest(new Request('https://example.test/api/private/v1/push/test', {
      method: 'POST', headers: { Cookie: 'session=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentDeviceFingerprint: await endpointFingerprint(currentEndpoint) }),
    }), { DB: db, ...auth(userId), ...await vapidKeys() });
    assert.deepEqual(result, {
      success: true, sent: 1, failed: 0, skipped: 0, targeted: 1,
      targeting: 'authenticated_user_current_device', provider: 'fcm',
    });
    assert.deepEqual(requests, [currentEndpoint]);
  } finally { globalThis.fetch = originalFetch; await mf.dispose(); }
});

test('current-device test returns a safe timeout classification without subscription material', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const { mf, db } = await createPushDb();
  const keys = await subscriptionKeys();
  const now = new Date().toISOString();
  const endpoint = 'https://fcm.googleapis.com/fcm/send/current-device';
  await db.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('current', userId, endpoint, keys.p256dh, keys.auth, now, now, now).run();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new DOMException('timed out', 'TimeoutError'); };
  try {
    await assert.rejects(handlePushTest(new Request('https://example.test/api/private/v1/push/test', {
      method: 'POST', headers: { Cookie: 'session=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentDeviceFingerprint: await endpointFingerprint(endpoint) }),
    }), { DB: db, ...auth(userId), ...await vapidKeys() }),
    (error: unknown) => error instanceof PushTestError
      && error.status === 502
      && error.code === 'PUSH_TRANSPORT_TIMEOUT'
      && !/fcm|endpoint|p256dh|auth/i.test(error.message));
  } finally { globalThis.fetch = originalFetch; await mf.dispose(); }
});

test('private test push rejects client-selected recipients', async () => {
  await assert.rejects(handlePushTest(new Request('https://example.test/api/private/v1/push/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"user_id":"other"}',
  }), { DB: {} as D1Database, ...auth() }), (error: unknown) => error instanceof PushTestError && error.status === 400);
});

test('test push UI validates registration before sending', () => {
  const source = read('components/NotificationBell.jsx');
  assert.match(source, /navigator\.serviceWorker\.ready/);
  assert.match(source, /getCurrentPushSubscription\(\)/);
  assert.match(source, /subscribeToDeviceNotifications\(currentUserId\)/);
  assert.match(source, /currentDeviceFingerprint: registration\.fingerprint/);
  assert.match(source, /privateApiRequest\('\/api\/private\/v1\/push\/test'/);
  assert.doesNotMatch(source, /useEffect\([^]*handleTestPush\(/);
});

const fakeSubscription = (name: string, unsubscribe = async () => true) => ({
  endpoint: `https://push.example.invalid/${name}`,
  toJSON: () => ({ endpoint: `https://push.example.invalid/${name}` }), unsubscribe,
});

test('missing local subscription is subscribed, persisted and confirmed', async () => {
  const created = fakeSubscription('created');
  const result = await completeCurrentDevicePushRegistration({ existingSubscription: null, forceRebind: false,
    createSubscription: async () => created,
    persistSubscription: async () => ({ currentDeviceMatched: true, fingerprint: 'server-fingerprint' }) });
  assert.equal(result.created, true);
  assert.equal(result.currentDeviceMatched, true);
});

test('stale local subscription is rebound once', async () => {
  let unsubscribed = 0; let subscribed = 0;
  const result = await completeCurrentDevicePushRegistration({
    existingSubscription: fakeSubscription('stale', async () => { unsubscribed += 1; return true; }), forceRebind: true,
    createSubscription: async () => { subscribed += 1; return fakeSubscription('fresh'); },
    persistSubscription: async () => ({ currentDeviceMatched: true, fingerprint: 'fresh' }),
  });
  assert.equal(unsubscribed, 1); assert.equal(subscribed, 1); assert.equal(result.rebound, true);
});

test('persistence failure or device mismatch never enables registration', async () => {
  const subscription = fakeSubscription('device');
  await assert.rejects(completeCurrentDevicePushRegistration({ existingSubscription: subscription, forceRebind: false,
    createSubscription: async () => subscription, persistSubscription: async () => { throw new Error('failure'); } }),
  (error: unknown) => error instanceof PushRegistrationError && error.code === 'persist_failed');
  await assert.rejects(completeCurrentDevicePushRegistration({ existingSubscription: subscription, forceRebind: false,
    createSubscription: async () => subscription, persistSubscription: async () => ({ currentDeviceMatched: false, fingerprint: 'other' }) }),
  (error: unknown) => error instanceof PushRegistrationError && error.code === 'device_mismatch');
});

test('D1 subscription upsert preserves Better Auth ownership and binding CAS', async () => {
  const { mf, db } = await createPushDb();
  const keys = await subscriptionKeys();
  const userId = '11111111-1111-4111-8111-111111111111';
  const request = (at: string) => new Request('https://example.test/api/private/v1/push-subscription', { method: 'POST',
    headers: { Cookie: 'session=opaque', 'Content-Type': 'application/json' }, body: JSON.stringify({ bindingStartedAt: at,
      subscription: { endpoint: 'https://push.example.invalid/device', keys } }) });
  try {
    await handlePushSubscription(request('2026-09-10T00:01:00Z'), { DB: db, ...auth(userId) });
    await assert.rejects(handlePushSubscription(request('2026-09-10T00:00:00Z'), { DB: db, ...auth('other-user') }));
    const row = await db.prepare('SELECT user_id, binding_started_at FROM push_subscriptions').first<Record<string, string>>();
    assert.equal(row?.user_id, userId);
    assert.equal(row?.binding_started_at, '2026-09-10T00:01:00.000Z');
  } finally { await mf.dispose(); }
});
