import assert from 'node:assert/strict';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import {
  processCourseNotificationOutboxItem,
  runCourseNotificationRecovery,
  signalCourseRequestDecision,
} from '../cloudflare/worker/src/course-notification-push.ts';

const requestId = '11111111-1111-4111-8111-111111111111';
const approvedId = '22222222-2222-4222-8222-222222222222';
const failedSignalId = '33333333-3333-4333-8333-333333333333';
const recoveryId = '44444444-4444-4444-8444-444444444444';

const createDb = async () => {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const db = await mf.getD1Database('DB');
  await db.exec(`CREATE TABLE user_course_requests (id TEXT PRIMARY KEY, course_code TEXT, subject_name TEXT);
    CREATE TABLE course_mutation_outbox (
      id TEXT PRIMARY KEY, dedupe_key TEXT UNIQUE, event_type TEXT, course_id TEXT, request_id TEXT, user_id TEXT,
      payload_json TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, created_at TEXT, delivered_at TEXT,
      lease_expires_at TEXT, next_retry_at TEXT, last_error TEXT
    );
    CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT, updated_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z');
    CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, system INTEGER, events INTEGER, lost_found INTEGER, schedule INTEGER, school INTEGER);
    CREATE TABLE push_delivery_attempts (
      source_type TEXT, source_id TEXT, subscription_id TEXT, state TEXT, attempts INTEGER, last_status INTEGER,
      updated_at TEXT, next_retry_at TEXT, PRIMARY KEY(source_type, source_id, subscription_id)
    );`.replace(/\s+/g, ' '));
  await db.prepare('INSERT INTO user_course_requests VALUES (?,?,?)').bind(requestId, 'FIN101', 'Tài chính').run();
  return { mf, db };
};

const insertDecision = (db: D1Database, id: string, eventType: string, owner = 'better-auth-owner') =>
  db.prepare(`INSERT INTO course_mutation_outbox
    (id,dedupe_key,event_type,request_id,user_id,payload_json,status,attempts,created_at)
    VALUES (?,?,?,?,?,?, 'pending', 0, ?)`)
    .bind(id, `decision:${id}`, eventType, requestId, owner, '{}', new Date().toISOString()).run();

test('approved course request signals exactly once and duplicate queue delivery stays idempotent', async () => {
  const { mf, db } = await createDb();
  try {
    await insertDecision(db, approvedId, 'course_request.approved');
    const messages: unknown[] = [];
    const env = {
      DB: db, SCHEDULE_PUSH_CUTOFF: '2000-01-01T00:00:00Z', VITE_VAPID_PUBLIC_KEY: 'unused', VAPID_PRIVATE_KEY: 'unused',
      PUSH_EVENTS_QUEUE: { send: async (message: unknown) => { messages.push(message); } },
    };
    assert.equal(await signalCourseRequestDecision(env, approvedId), true);
    assert.deepEqual(messages, [{ v: 1, type: 'schedule', sourceId: approvedId }]);

    const [first, duplicate] = await Promise.all([
      processCourseNotificationOutboxItem(env, approvedId),
      processCourseNotificationOutboxItem(env, approvedId),
    ]);
    assert.equal([first.state, duplicate.state].includes('sent'), true);
    const saved = await db.prepare('SELECT status,attempts,user_id FROM course_mutation_outbox WHERE id=?').bind(approvedId)
      .first<{ status: string; attempts: number; user_id: string }>();
    assert.equal(saved?.status, 'delivered');
    assert.equal(saved?.attempts, 1);
    assert.equal(saved?.user_id, 'better-auth-owner');
  } finally { await mf.dispose(); }
});

test('failed Queue signal leaves durable decision outbox for hourly recovery and empty recovery stays write-free', async () => {
  const { mf, db } = await createDb();
  try {
    await insertDecision(db, failedSignalId, 'course_request.rejected');
    const brokenEnv = { PUSH_EVENTS_QUEUE: { send: async () => { throw new Error('unavailable'); } } };
    assert.equal(await signalCourseRequestDecision(brokenEnv, failedSignalId), false);
    const before = await db.prepare('SELECT status,attempts FROM course_mutation_outbox WHERE id=?').bind(failedSignalId)
      .first<{ status: string; attempts: number }>();
    assert.deepEqual(before, { status: 'pending', attempts: 0 });

    await insertDecision(db, recoveryId, 'course_request.approved');
    const env = { DB: db, SCHEDULE_PUSH_CUTOFF: '2000-01-01T00:00:00Z', VITE_VAPID_PUBLIC_KEY: 'unused', VAPID_PRIVATE_KEY: 'unused' };
    const first = await runCourseNotificationRecovery(env);
    assert.equal(first.state, 'sent');
    await runCourseNotificationRecovery(env);
    const emptyBefore = await db.prepare('SELECT id,status,attempts FROM course_mutation_outbox ORDER BY id').all();
    const empty = await runCourseNotificationRecovery(env);
    const emptyAfter = await db.prepare('SELECT id,status,attempts FROM course_mutation_outbox ORDER BY id').all();
    assert.equal(empty.state, 'idle');
    assert.deepEqual(emptyAfter.results, emptyBefore.results);
  } finally { await mf.dispose(); }
});
