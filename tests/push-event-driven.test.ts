import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import { syncCrawledSchoolAnnouncements } from '../cloudflare/worker/src/announcement-store.ts';
import {
  enqueueLostFoundPush,
  processNotificationOutboxItem,
  runNotificationQueueControl,
  type PushEventMessage,
} from '../cloudflare/worker/src/notification-cron.ts';

const schema = `
  CREATE TABLE school_announcements (id INTEGER PRIMARY KEY, title TEXT, title_search TEXT, link TEXT UNIQUE, date TEXT, is_new INTEGER, created_at TEXT, is_hidden INTEGER, updated_at TEXT);
  CREATE TABLE announcement_id_sequence (singleton INTEGER PRIMARY KEY, last_id INTEGER NOT NULL);
  INSERT INTO announcement_id_sequence VALUES (1, 100);
  CREATE TABLE sync_metadata (resource TEXT PRIMARY KEY, source_row_count INTEGER, source_max_created_at TEXT, synced_at TEXT, visible_row_count INTEGER, source_cursor TEXT);
  CREATE TABLE school_announcement_push_queue (id INTEGER PRIMARY KEY, announcement_id INTEGER UNIQUE, title TEXT, link TEXT, scheduled_at TEXT, sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT, lease_expires_at TEXT, next_retry_at TEXT);
  CREATE TABLE lost_found_push_queue (id INTEGER PRIMARY KEY, lost_found_item_id INTEGER UNIQUE, title TEXT, body TEXT, url TEXT, scheduled_at TEXT, sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT, lease_expires_at TEXT, next_retry_at TEXT);
  CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT, updated_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z');
  CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, system INTEGER, events INTEGER, lost_found INTEGER, schedule INTEGER, school INTEGER);
  CREATE TABLE push_delivery_attempts (source_type TEXT, source_id TEXT, subscription_id TEXT, state TEXT, attempts INTEGER, last_status INTEGER, updated_at TEXT, next_retry_at TEXT, PRIMARY KEY(source_type, source_id, subscription_id));
`.replace(/\s+/g, ' ');

const fixture = async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const DB = await mf.getD1Database('DB');
  await DB.exec(schema);
  const sent: PushEventMessage[] = [];
  const queue = { send: async (message: PushEventMessage) => { sent.push(message); return {} as never; } };
  return { mf, DB, sent, queue };
};

const crawl = (items: Array<{ title: string; link: string; date: string }>) => ({ items, sources: [], complete: true });
const fresh = { title: 'Announcement', link: 'https://example.invalid/a', date: new Date().toISOString().slice(0, 10) };

test('new school content writes one immediate outbox and one Queue signal; repeats and metadata updates do neither', async () => {
  const { mf, DB, sent, queue } = await fixture();
  try {
    const first = await syncCrawledSchoolAnnouncements({ DB, PUSH_EVENTS_QUEUE: queue }, crawl([fresh]));
    const row = await DB.prepare('SELECT scheduled_at FROM school_announcement_push_queue WHERE announcement_id=101').first<{ scheduled_at: string }>();
    assert.equal(first.inserted, 1); assert.equal(sent.length, 1); assert.equal(sent[0]?.type, 'school');
    assert.ok(row?.scheduled_at && Math.abs(Date.parse(row.scheduled_at) - Date.now()) < 5_000);
    await syncCrawledSchoolAnnouncements({ DB, PUSH_EVENTS_QUEUE: queue }, crawl([fresh]));
    await syncCrawledSchoolAnnouncements({ DB, PUSH_EVENTS_QUEUE: queue }, crawl([{ ...fresh, title: 'Updated metadata' }]));
    assert.equal(sent.length, 1);
    assert.equal(Number((await DB.prepare('SELECT COUNT(*) AS n FROM school_announcement_push_queue').first<{ n: number }>())?.n), 1);
  } finally { await mf.dispose(); }
});

test('approved lost-found content signals once, while duplicate approval updates do not', async () => {
  const { mf, DB, sent, queue } = await fixture();
  try {
    const item = { id: 7, title: 'Ví', type: 'FOUND', userName: 'HUB', location: 'Cơ sở' };
    assert.equal((await enqueueLostFoundPush({ DB, PUSH_EVENTS_QUEUE: queue }, item)).inserted, true);
    assert.equal((await enqueueLostFoundPush({ DB, PUSH_EVENTS_QUEUE: queue }, item)).inserted, false);
    const row = await DB.prepare('SELECT scheduled_at FROM lost_found_push_queue WHERE lost_found_item_id=7').first<{ scheduled_at: string }>();
    assert.equal(sent.length, 1); assert.equal(sent[0]?.type, 'lost_found');
    assert.ok(row?.scheduled_at && Math.abs(Date.parse(row.scheduled_at) - Date.now()) < 5_000);
  } finally { await mf.dispose(); }
});

test('duplicate concurrent Queue wake-ups use one lease winner and a producer failure leaves the outbox recoverable', async () => {
  const { mf, DB } = await fixture();
  try {
    const now = new Date().toISOString();
    await DB.prepare('INSERT INTO school_announcement_push_queue VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(1, 9, 'New', '/announcements', now, null, null, 0, 0, 0, 0, null, null, null).run();
    const [first, second] = await Promise.all([
      processNotificationOutboxItem({ DB }, 'school', 9), processNotificationOutboxItem({ DB }, 'school', 9),
    ]);
    assert.equal([first, second].filter((result) => result.state === 'sent').length, 1);
    assert.ok((await DB.prepare('SELECT sent_at FROM school_announcement_push_queue WHERE announcement_id=9').first<{ sent_at: string }>())?.sent_at);

    const failedQueue = { send: async () => { throw new Error('queue unavailable'); } };
    const write = await enqueueLostFoundPush({ DB, PUSH_EVENTS_QUEUE: failedQueue }, { id: 8, title: 'Thẻ', type: 'LOST', userName: null, location: null });
    assert.deepEqual(write, { inserted: true, signaled: false });
    assert.equal((await processNotificationOutboxItem({ DB }, 'lost_found', 8)).state, 'sent');
  } finally { await mf.dispose(); }
});

test('hourly fallback only recovers pending outbox work and an empty run makes no outbox writes', async () => {
  const { mf, DB } = await fixture();
  try {
    const idle = await runNotificationQueueControl({ DB }, 'process');
    assert.equal(idle.announcements.state, 'idle'); assert.equal(idle.lostFound.state, 'idle');
    const now = new Date().toISOString();
    await DB.prepare('INSERT INTO school_announcement_push_queue VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(2, 10, 'Recovery', '/announcements', now, null, null, 0, 0, 0, 0, null, null, null).run();
    const recovered = await runNotificationQueueControl({ DB }, 'process');
    assert.equal(recovered.announcements.state, 'sent');
    assert.equal(Number((await DB.prepare('SELECT COUNT(*) AS n FROM school_announcement_push_queue').first<{ n: number }>())?.n), 1);
  } finally { await mf.dispose(); }
});
