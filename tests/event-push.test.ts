import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import {
  buildEventPushPayload, isEventPushEligible, processEventPushItem, runEventPush, signalNewPublicEvent,
  type PublicEventPushCandidate,
} from '../cloudflare/worker/src/event-push.ts';

const cutoff = '2026-09-09T13:45:00.000Z';
const published = (overrides: Partial<PublicEventPushCandidate> = {}): PublicEventPushCandidate => ({
  id: 42, title: 'Ngày hội nghề nghiệp HUB', status: 'Đang mở', is_deleted: 0,
  created_at: '2026-09-09T13:46:00.000Z', ...overrides,
});

test('only newly public events after cutoff are eligible', () => {
  assert.equal(isEventPushEligible(published(), cutoff), true);
  for (const status of ['pending', 'draft', 'rejected', 'deleted', 'hidden']) assert.equal(isEventPushEligible(published({ status }), cutoff), false);
  assert.equal(isEventPushEligible(published({ is_deleted: 1 }), cutoff), false);
  assert.equal(isEventPushEligible(published({ created_at: '2026-09-09T13:44:59Z' }), cutoff), false);
});

test('event payload is bounded, safe and deep-links to an existing route', () => {
  const payload = buildEventPushPayload(published({ title: ` Sự kiện ${'x'.repeat(300)} ` }));
  assert.equal(payload.body.length, 240);
  assert.equal(payload.url, '/events/42');
  assert.doesNotMatch(JSON.stringify(payload), /user_id|email|student|subscription/i);
  assert.match(readFileSync('components/EventsBoard.tsx', 'utf8'), /`\/events\/\$\{encodeURIComponent\(id\)\}`/);
});

test('D1 event delivery is deduplicated and uses native sender', async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const db = await mf.getD1Database('DB');
  await db.exec(`CREATE TABLE public_events (id INTEGER PRIMARY KEY, title TEXT, status TEXT, is_deleted INTEGER, created_at TEXT);
    CREATE TABLE event_push_deliveries (event_id INTEGER PRIMARY KEY, event_created_at TEXT, state TEXT, attempted_at TEXT,
      sent_at TEXT, attempts INTEGER, last_error TEXT, last_subscription_id TEXT, sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, lease_expires_at TEXT, next_retry_at TEXT);
    CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT, updated_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z');
    CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, system INTEGER, events INTEGER, lost_found INTEGER, schedule INTEGER, school INTEGER);
    CREATE TABLE push_delivery_attempts (source_type TEXT, source_id TEXT, subscription_id TEXT, state TEXT, attempts INTEGER,
      last_status INTEGER, updated_at TEXT, next_retry_at TEXT, PRIMARY KEY(source_type, source_id, subscription_id));`.replace(/\s+/g, ' '));
  await db.prepare('INSERT INTO public_events VALUES (?, ?, ?, ?, ?)').bind(42, published().title, 'published', 0, published().created_at).run();
  try {
    const first = await runEventPush({ DB: db, EVENT_PUSH_CUTOFF: cutoff, VITE_VAPID_PUBLIC_KEY: 'unused', VAPID_PRIVATE_KEY: 'unused' });
    const second = await runEventPush({ DB: db, EVENT_PUSH_CUTOFF: cutoff, VITE_VAPID_PUBLIC_KEY: 'unused', VAPID_PRIVATE_KEY: 'unused' });
    assert.equal(first.state, 'skipped');
    assert.equal(second.state, 'idle');
    const ledger = await db.prepare('SELECT state FROM event_push_deliveries WHERE event_id = 42').first<{ state: string }>();
    assert.equal(ledger?.state, 'skipped');
  } finally { await mf.dispose(); }
});

test('new eligibility signals the queue once while exact duplicate messages share the D1 lease', async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const db = await mf.getD1Database('DB');
  await db.exec(`CREATE TABLE public_events (id INTEGER PRIMARY KEY, title TEXT, status TEXT, is_deleted INTEGER, created_at TEXT);
    CREATE TABLE event_push_deliveries (event_id INTEGER PRIMARY KEY, event_created_at TEXT, state TEXT, attempted_at TEXT,
      sent_at TEXT, attempts INTEGER, last_error TEXT, last_subscription_id TEXT, sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, lease_expires_at TEXT, next_retry_at TEXT);
    CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT, updated_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z');
    CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, system INTEGER, events INTEGER, lost_found INTEGER, schedule INTEGER, school INTEGER);
    CREATE TABLE push_delivery_attempts (source_type TEXT, source_id TEXT, subscription_id TEXT, state TEXT, attempts INTEGER,
      last_status INTEGER, updated_at TEXT, next_retry_at TEXT, PRIMARY KEY(source_type, source_id, subscription_id));`.replace(/\s+/g, ' '));
  try {
    const messages: unknown[] = [];
    const env = {
      DB: db, EVENT_PUSH_CUTOFF: cutoff, VITE_VAPID_PUBLIC_KEY: 'unused', VAPID_PRIVATE_KEY: 'unused',
      PUSH_EVENTS_QUEUE: { send: async (message: unknown) => { messages.push(message); } },
    };
    await db.prepare('INSERT INTO public_events VALUES (?,?,?,?,?)').bind(42, published().title, 'published', 0, published().created_at).run();
    assert.equal(await signalNewPublicEvent(env, published()), true);
    assert.equal(await signalNewPublicEvent(env, published(), published()), false);
    assert.deepEqual(messages, [{ v: 1, type: 'event', sourceId: 42 }]);
    const [first, duplicate] = await Promise.all([processEventPushItem(env, 42), processEventPushItem(env, 42)]);
    assert.equal([first.state, duplicate.state].includes('skipped'), true);
    const delivery = await db.prepare('SELECT state,attempts FROM event_push_deliveries WHERE event_id=42').first<{ state: string; attempts: number }>();
    assert.deepEqual(delivery, { state: 'skipped', attempts: 1 });
  } finally { await mf.dispose(); }
});

test('stale cleanup and preferences belong to native D1 delivery', () => {
  const sender = readFileSync('cloudflare/worker/src/push-delivery.ts', 'utf8');
  const event = readFileSync('cloudflare/worker/src/event-push.ts', 'utf8');
  assert.match(sender, /status === 404 \|\| status === 410/);
  assert.match(sender, /notification_preferences/);
  assert.doesNotMatch(event, /functions\/v1\/push|SUPABASE/);
});
