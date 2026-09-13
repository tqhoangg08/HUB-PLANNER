import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { deliverPushBatch } from '../cloudflare/worker/src/push-delivery.ts';
import { runEventPush } from '../cloudflare/worker/src/event-push.ts';
import { runNotificationQueueControl } from '../cloudflare/worker/src/notification-cron.ts';

const DB_SCHEMA = `
  CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT);
  CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, system INTEGER, events INTEGER, lost_found INTEGER, schedule INTEGER, school INTEGER);
  CREATE TABLE push_delivery_attempts (source_type TEXT, source_id TEXT, subscription_id TEXT, state TEXT, attempts INTEGER, last_status INTEGER, updated_at TEXT, next_retry_at TEXT, PRIMARY KEY(source_type, source_id, subscription_id));
  CREATE TABLE public_events (id INTEGER PRIMARY KEY, title TEXT, status TEXT, is_deleted INTEGER, created_at TEXT);
  CREATE TABLE event_push_deliveries (event_id INTEGER PRIMARY KEY, event_created_at TEXT, state TEXT, attempted_at TEXT, sent_at TEXT, attempts INTEGER, last_error TEXT, last_subscription_id TEXT, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, lease_expires_at TEXT, next_retry_at TEXT);
  CREATE TABLE school_announcements (id INTEGER PRIMARY KEY, title TEXT, link TEXT, created_at TEXT, is_hidden INTEGER, is_new INTEGER);
  CREATE TABLE public_lost_found_items (id INTEGER PRIMARY KEY, title TEXT, location TEXT, user_name TEXT, type TEXT, status TEXT, is_deleted INTEGER, created_at TEXT);
  CREATE TABLE school_announcement_push_queue (id INTEGER PRIMARY KEY, announcement_id INTEGER UNIQUE, title TEXT, link TEXT, scheduled_at TEXT, sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT, lease_expires_at TEXT, next_retry_at TEXT);
  CREATE TABLE lost_found_push_queue (id INTEGER PRIMARY KEY, lost_found_item_id INTEGER UNIQUE, title TEXT, body TEXT, url TEXT, scheduled_at TEXT, sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT, lease_expires_at TEXT, next_retry_at TEXT);
`.replace(/\s+/g, ' ');

const fixture = async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const DB = await mf.getD1Database('DB');
  await DB.exec(DB_SCHEMA);
  return { mf, DB };
};

const vapid = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = Buffer.from(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))).toString('base64url');
  const privateKey = String((await crypto.subtle.exportKey('jwk', pair.privateKey)).d);
  return { VITE_VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey };
};

const subscription = async (id: string) => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    id,
    endpoint: `https://push.example.invalid/${id}`,
    p256dh: Buffer.from(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))).toString('base64url'),
    auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  };
};

const payload = { title: 'Test', body: 'Test', url: '/events', category: 'events' as const };
const ok = async () => new Response(null, { status: 201 });
const failed = async () => new Response(null, { status: 503 });

test('terminal delivery is written once; repeated cron scans make zero additional ledger writes', async () => {
  const { mf, DB } = await fixture(); const keys = await vapid(); const device = await subscription('one');
  await DB.prepare('INSERT INTO push_subscriptions VALUES (?,?,?,?,?)').bind(device.id, 'user', device.endpoint, device.p256dh, device.auth).run();
  try {
    const first = await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'event', id: '1' }, fetcher: ok });
    const before = await DB.prepare('SELECT attempts,updated_at FROM push_delivery_attempts').first<{ attempts: number; updated_at: string }>();
    const second = await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'event', id: '1' }, fetcher: ok });
    const after = await DB.prepare('SELECT attempts,updated_at FROM push_delivery_attempts').first<{ attempts: number; updated_at: string }>();
    assert.equal(first.sent, 1); assert.equal(second.targeted, 0);
    assert.deepEqual(after, before); // isolated D1 benchmark: 1 write vs legacy 2 writes for this workload
  } finally { await mf.dispose(); }
});

test('failed delivery is not rewritten before its persisted retry time, then transitions once when eligible', async () => {
  const { mf, DB } = await fixture(); const keys = await vapid(); const device = await subscription('retry');
  await DB.prepare('INSERT INTO push_subscriptions VALUES (?,?,?,?,?)').bind(device.id, 'user', device.endpoint, device.p256dh, device.auth).run();
  try {
    await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'event', id: '2' }, fetcher: failed });
    const before = await DB.prepare('SELECT attempts,next_retry_at FROM push_delivery_attempts').first<{ attempts: number; next_retry_at: string }>();
    const early = await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'event', id: '2' }, fetcher: failed });
    assert.equal(early.targeted, 0);
    assert.deepEqual(await DB.prepare('SELECT attempts,next_retry_at FROM push_delivery_attempts').first(), before);
    await DB.prepare("UPDATE push_delivery_attempts SET next_retry_at='2000-01-01T00:00:00.000Z'").run();
    await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'event', id: '2' }, fetcher: failed });
    assert.equal((await DB.prepare('SELECT attempts FROM push_delivery_attempts').first<{ attempts: number }>())?.attempts, 2);
  } finally { await mf.dispose(); }
});

test('event and queue claims admit one concurrent winner without resending a backlog item', async () => {
  const { mf, DB } = await fixture(); const keys = await vapid();
  const now = new Date().toISOString();
  await DB.prepare('INSERT INTO public_events VALUES (?,?,?,?,?)').bind(7, 'New event', 'published', 0, now).run();
  await DB.prepare('INSERT INTO school_announcements VALUES (?,?,?,?,?,?)').bind(9, 'New announcement', '/announcements', now, 0, 1).run();
  await DB.prepare('INSERT INTO school_announcement_push_queue VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(1, 9, 'New announcement', '/announcements', now, null, null, 0, 0, 0, 0, null, null, null).run();
  try {
    const events = await Promise.all([runEventPush({ DB, ...keys, EVENT_PUSH_CUTOFF: '2000-01-01T00:00:00.000Z' }), runEventPush({ DB, ...keys, EVENT_PUSH_CUTOFF: '2000-01-01T00:00:00.000Z' })]);
    assert.equal(events.filter((result) => result.queued === 1).length, 1);
    await Promise.all([runNotificationQueueControl({ DB, ...keys, NOTIFICATION_REENABLE_CUTOFF: '2000-01-01T00:00:00.000Z' }, 'process'), runNotificationQueueControl({ DB, ...keys, NOTIFICATION_REENABLE_CUTOFF: '2000-01-01T00:00:00.000Z' }, 'process')]);
    const queue = await DB.prepare('SELECT sent_at FROM school_announcement_push_queue WHERE id=1').first<{ sent_at: string }>();
    assert.ok(queue?.sent_at);
  } finally { await mf.dispose(); }
});

test('multi-device delivery and stale cleanup remain terminal and deduplicated', async () => {
  const { mf, DB } = await fixture(); const keys = await vapid(); const first = await subscription('first'); const stale = await subscription('stale');
  for (const device of [first, stale]) await DB.prepare('INSERT INTO push_subscriptions VALUES (?,?,?,?,?)').bind(device.id, 'user', device.endpoint, device.p256dh, device.auth).run();
  try {
    const result = await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'school', id: '1' }, fetcher: async (url) => String(url).endsWith('/stale') ? new Response(null, { status: 410 }) : ok() });
    assert.equal(result.sent, 1); assert.equal(result.staleRemoved, 1);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE id='stale'").first<{ n: number }>())?.n, 0);
    const repeat = await deliverPushBatch({ DB, ...keys }, payload, { deliveryKey: { type: 'school', id: '1' }, fetcher: ok });
    assert.equal(repeat.targeted, 0);
  } finally { await mf.dispose(); }
});
