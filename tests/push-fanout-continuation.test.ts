import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { deliverPushBatch, sourceDeliveryProgress } from '../cloudflare/worker/src/push-delivery.ts';
import { WebPushError } from '../cloudflare/worker/src/web-push.ts';

const now = () => new Date().toISOString();
const eventId = 391;
const requestId = '11111111-1111-4111-8111-111111111111';
const courseOutboxId = '22222222-2222-4222-8222-222222222222';

const schema = `
  CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT);
  CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, system INTEGER, events INTEGER, lost_found INTEGER, schedule INTEGER, school INTEGER);
  CREATE TABLE push_delivery_attempts (source_type TEXT, source_id TEXT, subscription_id TEXT, state TEXT, attempts INTEGER, last_status INTEGER, updated_at TEXT, next_retry_at TEXT, PRIMARY KEY(source_type, source_id, subscription_id));
  CREATE TABLE public_events (id INTEGER PRIMARY KEY, title TEXT, status TEXT, is_deleted INTEGER, created_at TEXT);
  CREATE TABLE event_push_deliveries (event_id INTEGER PRIMARY KEY, event_created_at TEXT, state TEXT, attempted_at TEXT, sent_at TEXT, attempts INTEGER, last_error TEXT, last_subscription_id TEXT, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, lease_expires_at TEXT, next_retry_at TEXT);
  CREATE TABLE school_announcement_push_queue (id INTEGER PRIMARY KEY, announcement_id INTEGER UNIQUE, title TEXT, link TEXT, scheduled_at TEXT, sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT, lease_expires_at TEXT, next_retry_at TEXT);
  CREATE TABLE lost_found_push_queue (id INTEGER PRIMARY KEY, lost_found_item_id INTEGER UNIQUE, title TEXT, body TEXT, url TEXT, scheduled_at TEXT, sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT, lease_expires_at TEXT, next_retry_at TEXT);
  CREATE TABLE user_course_requests (id TEXT PRIMARY KEY, course_code TEXT, subject_name TEXT);
  CREATE TABLE course_mutation_outbox (id TEXT PRIMARY KEY, dedupe_key TEXT UNIQUE, event_type TEXT, course_id TEXT, request_id TEXT, user_id TEXT, payload_json TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, created_at TEXT, delivered_at TEXT, lease_expires_at TEXT, next_retry_at TEXT, last_error TEXT);
`.replace(/\s+/g, ' ');

const fixture = async (count: number) => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const DB = await mf.getD1Database('DB');
  await DB.exec(schema);
  const vapidPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const recipientPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const VITE_VAPID_PUBLIC_KEY = Buffer.from(new Uint8Array(await crypto.subtle.exportKey('raw', vapidPair.publicKey))).toString('base64url');
  const VAPID_PRIVATE_KEY = String((await crypto.subtle.exportKey('jwk', vapidPair.privateKey)).d);
  const p256dh = Buffer.from(new Uint8Array(await crypto.subtle.exportKey('raw', recipientPair.publicKey))).toString('base64url');
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
  const subscriptions = [];
  for (let index = 1; index <= count; index += 1) {
    const id = String(index).padStart(3, '0');
    subscriptions.push(DB.prepare('INSERT INTO push_subscriptions VALUES (?,?,?,?,?)')
      .bind(id, 'owner', `https://push.example.invalid/${id}`, p256dh, auth));
  }
  for (let offset = 0; offset < subscriptions.length; offset += 80) await DB.batch(subscriptions.slice(offset, offset + 80));
  return { mf, DB, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY };
};

const senderFor = (failFirst = 50) => async (subscription: { id: string }) => {
  const id = Number(subscription.id);
  if (id > 0 && id <= failFirst) throw new WebPushError('fixture temporary failure', 503);
  return 201;
};

test('250 subscriptions drain unseen targets immediately before failed-target backoff, without duplicate successes', async () => {
  const { mf, DB, ...keys } = await fixture(250);
  try {
    const payload = { title: 'Event', body: 'Event', url: '/events/391', category: 'events' as const };
    const first = await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'event', id: String(eventId) }, sender: senderFor() });
    assert.deepEqual({ targeted: first.targeted, sent: first.sent, failed: first.failed, hasMore: first.hasMore, retryAt: first.retryAt }, { targeted: 100, sent: 50, failed: 50, hasMore: true, retryAt: null });
    const second = await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'event', id: String(eventId) }, sender: senderFor() });
    assert.deepEqual({ targeted: second.targeted, sent: second.sent, hasMore: second.hasMore, retryAt: second.retryAt }, { targeted: 100, sent: 100, hasMore: true, retryAt: null });
    const third = await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'event', id: String(eventId) }, sender: senderFor() });
    assert.deepEqual({ targeted: third.targeted, sent: third.sent, hasMore: third.hasMore }, { targeted: 50, sent: 50, hasMore: false });
    assert.ok(third.retryAt, 'only after unseen devices drain does the failed target backoff surface');
    const attempts = await DB.prepare("SELECT state, attempts FROM push_delivery_attempts WHERE subscription_id='050'").first<{ state: string; attempts: number }>();
    assert.deepEqual(attempts, { state: 'failed', attempts: 1 });
    const before = await DB.prepare("SELECT attempts,next_retry_at FROM push_delivery_attempts WHERE subscription_id='050'").first();
    const waiting = await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'event', id: String(eventId) }, sender: senderFor() });
    assert.deepEqual({ targeted: waiting.targeted, hasMore: waiting.hasMore, retryAt: waiting.retryAt }, { targeted: 0, hasMore: false, retryAt: third.retryAt });
    assert.deepEqual(await DB.prepare("SELECT attempts,next_retry_at FROM push_delivery_attempts WHERE subscription_id='050'").first(), before);
    assert.equal(Number((await DB.prepare("SELECT COUNT(*) AS count FROM push_delivery_attempts WHERE state='sent'").first<{ count: number }>())?.count), 200);
  } finally { await mf.dispose(); }
});

test('event, school, lost-found and schedule share continuation priority and Queue retries it immediately', () => {
  assert.deepEqual(sourceDeliveryProgress({ hasMore: true, retryAt: '2099-01-01T00:00:00.000Z' }), {
    continuation: true, retryAt: null, completed: false,
  });
  assert.deepEqual(sourceDeliveryProgress({ hasMore: false, retryAt: '2099-01-01T00:00:00.000Z' }), {
    continuation: false, retryAt: '2099-01-01T00:00:00.000Z', completed: false,
  });
  assert.deepEqual(sourceDeliveryProgress({ hasMore: false, retryAt: null }), {
    continuation: false, retryAt: null, completed: true,
  });
  for (const source of [
    'cloudflare/worker/src/event-push.ts',
    'cloudflare/worker/src/notification-cron.ts',
    'cloudflare/worker/src/course-notification-push.ts',
  ]) assert.match(readFileSync(source, 'utf8'), /sourceDeliveryProgress/);
  assert.match(readFileSync('cloudflare/worker/src/index.ts', 'utf8'), /const delaySeconds = hasMore \? 1/);
});
