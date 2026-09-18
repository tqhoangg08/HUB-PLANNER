import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import worker from '../cloudflare/worker/src/index.ts';
import { runNotificationQueueControl } from '../cloudflare/worker/src/notification-cron.ts';
import { ANNOUNCEMENT_SOURCES } from '../cloudflare/worker/src/announcement-crawler.ts';

const configEnv = {
  NOTIFICATION_REENABLE_CUTOFF: '2026-08-31T11:23:39Z', NOTIFICATION_JOBS_ENABLED: 'true', NOTIFICATION_JOBS_MODE: 'enabled',
  EVENT_PUSH_CUTOFF: '2026-09-09T14:30:00Z', SCHEDULE_PUSH_CUTOFF: '2026-09-16T00:00:00Z',
};
const createDb = async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const db = await mf.getD1Database('DB');
  await db.exec(`CREATE TABLE school_announcements (id INTEGER PRIMARY KEY, title TEXT, link TEXT, created_at TEXT, is_hidden INTEGER, is_new INTEGER);
    CREATE TABLE public_lost_found_items (id INTEGER PRIMARY KEY, title TEXT, location TEXT, user_name TEXT, type TEXT, status TEXT, is_deleted INTEGER, created_at TEXT);
    CREATE TABLE school_announcement_push_queue (id INTEGER PRIMARY KEY, announcement_id INTEGER UNIQUE, title TEXT, link TEXT, scheduled_at TEXT,
      sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT, lease_expires_at TEXT, next_retry_at TEXT);
    CREATE TABLE lost_found_push_queue (id INTEGER PRIMARY KEY, lost_found_item_id INTEGER UNIQUE, title TEXT, body TEXT, url TEXT, scheduled_at TEXT,
      sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT, lease_expires_at TEXT, next_retry_at TEXT);
    CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT, updated_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z');
    CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, system INTEGER, events INTEGER, lost_found INTEGER, schedule INTEGER, school INTEGER);
    CREATE TABLE push_delivery_attempts (source_type TEXT, source_id TEXT, subscription_id TEXT, state TEXT, attempts INTEGER, last_status INTEGER,
    updated_at TEXT, next_retry_at TEXT, PRIMARY KEY(source_type, source_id, subscription_id));
    CREATE TABLE public_events (id INTEGER PRIMARY KEY, title TEXT, status TEXT, is_deleted INTEGER, created_at TEXT);
    CREATE TABLE event_push_deliveries (event_id INTEGER PRIMARY KEY, event_created_at TEXT, state TEXT, attempted_at TEXT, sent_at TEXT,
      attempts INTEGER, last_error TEXT, last_subscription_id TEXT, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0, lease_expires_at TEXT, next_retry_at TEXT);
    CREATE TABLE course_mutation_outbox (id TEXT PRIMARY KEY, event_type TEXT, request_id TEXT, user_id TEXT, status TEXT, attempts INTEGER,
      created_at TEXT, lease_expires_at TEXT, next_retry_at TEXT, last_error TEXT, delivered_at TEXT);
    CREATE TABLE user_course_requests (id TEXT PRIMARY KEY, course_code TEXT, subject_name TEXT);`.replace(/\s+/g, ' '));
  return { mf, db };
};

test('Cloudflare scheduled handler preserves crawler and push cadence', () => {
  const config = JSON.parse(readFileSync('cloudflare/wrangler.jsonc', 'utf8'));
  assert.deepEqual(config.triggers.crons.sort(), ['*/15 * * * *', '7 * * * *', '37 19 * * *'].sort());
  assert.deepEqual(config.queues, {
    producers: [{ binding: 'PUSH_EVENTS_QUEUE', queue: 'hub-planner-push-events' }],
    consumers: [{ queue: 'hub-planner-push-events', max_batch_size: 10, max_batch_timeout: 1, max_retries: 3, dead_letter_queue: 'hub-planner-push-events-dlq', max_concurrency: 2 }],
  });
  assert.equal(config.workflows.find((item: { binding: string }) => item.binding === 'ANNOUNCEMENT_CRAWLER_WORKFLOW')?.class_name, 'AnnouncementCrawlerWorkflow');
  for (const key of Object.keys(configEnv)) assert.equal(config.vars[key], configEnv[key as keyof typeof configEnv]);
});

test('queue control is D1-native and backlog-safe', async () => {
  const { mf, db } = await createDb();
  try {
    const result = await runNotificationQueueControl({ DB: db, ...configEnv }, 'dry_run');
    assert.equal(result.success, true);
    assert.deepEqual(result.pending, { announcements: 0, lostFound: 0 });
    const source = readFileSync('cloudflare/worker/src/notification-cron.ts', 'utf8');
    assert.doesNotMatch(source, /functions\/v1\/push|SUPABASE/);
    assert.match(source, /NOTIFICATION_REENABLE_CUTOFF/);
    assert.match(source, /INSERT OR IGNORE/);
  } finally { await mf.dispose(); }
});

test('scheduled push dispatches only when enabled', async () => {
  const { mf, db } = await createDb();
  try {
    for (const enabled of ['true', 'false']) {
      const pending: Promise<unknown>[] = [];
      await worker.scheduled({ cron: '7 * * * *', scheduledTime: 0 } as never,
        { DB: db, ...configEnv, NOTIFICATION_JOBS_ENABLED: enabled } as never,
        { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as never);
      await Promise.all(pending);
    }
    const school = await db.prepare('SELECT COUNT(*) AS count FROM school_announcement_push_queue').first<{ count: number }>();
    assert.equal(Number(school?.count), 0);
  } finally { await mf.dispose(); }
});

test('scheduled crawler fans out one bounded Workflow instance per source', async () => {
  const sourceIds: string[] = []; const pending: Promise<unknown>[] = [];
  const workflow = { create: async ({ params }: { params: { sourceId: string } }) => { sourceIds.push(params.sourceId); return { id: `fixture-${params.sourceId}` }; } };
  await worker.scheduled({ cron: '*/15 * * * *', scheduledTime: 0 } as never,
    { ...configEnv, ANNOUNCEMENT_CRAWLER_WORKFLOW: workflow } as never,
    { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as never);
  await Promise.all(pending);
  assert.deepEqual(sourceIds.sort(), ANNOUNCEMENT_SOURCES.map(([id]) => id).sort());
});
