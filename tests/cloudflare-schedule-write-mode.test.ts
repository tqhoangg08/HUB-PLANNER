import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from '../cloudflare/worker/src/index.ts';
import {
  allowsLegacyScheduleWrites,
  allowsSupabaseCourseSync,
  allowsSupabaseUserScheduleSync,
  isScheduleMutationRequest,
  readScheduleWriteMode,
} from '../cloudflare/worker/src/schedule-write-mode.ts';

const COURSE_ID = '1368d47c-f0cb-47da-aa8a-cb650078b2e2';
const ENTRY_ID = 'f26257a2-f98b-4bf7-a7c3-54866cded95a';
const ORIGIN = 'https://hotrosinhvienhub.id.vn';

const mutationRequests = () => [
  new Request(`${ORIGIN}/api/user/v1/schedules/courses/${COURSE_ID}`, { method: 'PUT' }),
  new Request(`${ORIGIN}/api/user/v1/schedules/courses/${COURSE_ID}`, { method: 'DELETE' }),
  new Request(`${ORIGIN}/api/user/v1/schedules/entries/${ENTRY_ID}`, { method: 'PATCH' }),
  new Request(`${ORIGIN}/api/user/v1/schedules/replace`, { method: 'PUT' }),
];

const blockedEnv = (mode: string) => {
  let authCalls = 0;
  let d1Calls = 0;
  return {
    env: {
      ALLOWED_ORIGINS: ORIGIN,
      SCHEDULE_WRITE_MODE: mode,
      AUTH_SERVICE: { fetch: async () => { authCalls += 1; throw new Error('unexpected auth'); } },
      DB: { prepare: () => { d1Calls += 1; throw new Error('unexpected D1'); } },
    } as never,
    counts: () => ({ authCalls, d1Calls }),
  };
};

test('schedule write mode defaults to legacy and accepts only explicit modes', () => {
  assert.equal(readScheduleWriteMode({}), 'legacy');
  assert.equal(readScheduleWriteMode({ SCHEDULE_WRITE_MODE: 'legacy' }), 'legacy');
  assert.equal(readScheduleWriteMode({ SCHEDULE_WRITE_MODE: 'frozen' }), 'frozen');
  assert.equal(readScheduleWriteMode({ SCHEDULE_WRITE_MODE: 'd1' }), 'd1');
  assert.equal(readScheduleWriteMode({ SCHEDULE_WRITE_MODE: '' }), 'invalid');
  assert.equal(readScheduleWriteMode({ SCHEDULE_WRITE_MODE: 'LEGACY' }), 'invalid');
  assert.equal(allowsLegacyScheduleWrites({}), true);
  assert.equal(allowsSupabaseUserScheduleSync({}), true);
  assert.equal(allowsSupabaseCourseSync({}), true);
  assert.equal(allowsLegacyScheduleWrites({ SCHEDULE_WRITE_MODE: 'd1' }), false);
  assert.equal(allowsSupabaseUserScheduleSync({ SCHEDULE_WRITE_MODE: 'frozen' }), false);
  assert.equal(allowsSupabaseUserScheduleSync({ SCHEDULE_WRITE_MODE: 'd1' }), false);
  assert.equal(allowsSupabaseCourseSync({ SCHEDULE_WRITE_MODE: 'frozen' }), false);
  assert.equal(allowsSupabaseCourseSync({ SCHEDULE_WRITE_MODE: 'd1' }), true);
  assert.equal(allowsSupabaseCourseSync({ SCHEDULE_WRITE_MODE: 'd1', COURSE_SUPABASE_TO_D1_SYNC_ENABLED: 'false' }), false);
  assert.equal(allowsSupabaseCourseSync({ SCHEDULE_WRITE_MODE: 'invalid' }), false);
});

test('matcher covers exactly the four legacy schedule mutation shapes', () => {
  for (const request of mutationRequests()) {
    const url = new URL(request.url);
    assert.equal(isScheduleMutationRequest(url.pathname, request.method), true);
  }
  assert.equal(isScheduleMutationRequest('/api/user/v1/schedules', 'GET'), false);
  assert.equal(isScheduleMutationRequest(`/api/user/v1/schedules/courses/${COURSE_ID}`, 'GET'), false);
  assert.equal(isScheduleMutationRequest('/api/user/v1/schedules/replace/extra', 'PUT'), false);
});

for (const mode of ['frozen', 'unknown']) {
  test(`${mode} mode fails all schedule mutations before auth or database access`, async () => {
    for (const request of mutationRequests()) {
      const harness = blockedEnv(mode);
      const response = await worker.fetch(request, harness.env, {} as never);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(harness.counts(), { authCalls: 0, d1Calls: 0 });
    }
  });
}

test('d1 mode routes every private schedule mutation through Better Auth before D1', async () => {
  const requests = mutationRequests();
  for (const request of requests.slice(0, 2)) {
    const harness = blockedEnv('d1');
    const response = await worker.fetch(request, harness.env, {} as never);
    assert.equal(response.status, 401);
    assert.deepEqual(harness.counts(), { authCalls: 0, d1Calls: 0 });
  }
  for (const request of requests.slice(2)) {
    const harness = blockedEnv('d1');
    const response = await worker.fetch(request, harness.env, {} as never);
    assert.equal(response.status, 401);
    assert.deepEqual(harness.counts(), { authCalls: 0, d1Calls: 0 });
  }
});

test('legacy mode keeps the existing mutation implementation reachable', async () => {
  const request = mutationRequests()[0];
  const response = await worker.fetch(
    request,
    {
      ALLOWED_ORIGINS: ORIGIN,
      SCHEDULE_WRITE_MODE: 'legacy',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      DB: {} as never,
    } as never,
    {} as never,
  );
  assert.notEqual(response.status, 503);
  assert.equal(response.status, 401);
});

test('scheduled user sync freezes permanently while course sync resumes in d1', () => {
  const source = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  assert.match(source, /if \(allowsSupabaseUserScheduleSync\(env\)\) \{[\s\S]*syncUserSchedules\(env\)/);
  assert.match(source, /if \(!allowsSupabaseUserScheduleSync\(env\)\) return;[\s\S]*syncUserSchedules\(env\)/);
  assert.match(source, /if \(allowsSupabaseCourseSync\(env\)\) \{[\s\S]*syncCourseSchedules\(env, reconcileCourseDeletes\)/);
  assert.match(source, /announcement_crawl_enqueue_failed[\s\S]*ANNOUNCEMENT_CRAWLER_WORKFLOW\.create/);
  assert.doesNotMatch(source, /syncPublicEvents|syncAdminEvents/);
  assert.match(source, /runEventPush\(env\)/);
  assert.doesNotMatch(source, /syncEventParticipations\(env\)/);
  assert.match(source, /syncPublicLostFound\(env\)/);
});

test('migration candidate is additive and contains the write-safety schema only', () => {
  const sql = readFileSync('cloudflare/migrations/0014_add_user_schedule_write_safety.sql', 'utf8');
  assert.match(sql, /ALTER TABLE user_schedules ADD COLUMN updated_at TEXT/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS user_schedule_revisions/i);
  assert.match(sql, /PRIMARY KEY \(user_id, semester\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS user_schedule_mutation_receipts/i);
  assert.match(sql, /PRIMARY KEY \(user_id, idempotency_key\)/i);
  assert.doesNotMatch(sql, /\b(?:DELETE|DROP|RENAME|UPDATE|INSERT)\b/i);
  assert.doesNotMatch(sql, /custom_course/i);
});

test('private course snapshot migration is additive and cannot feed the public catalogue', () => {
  const sql = readFileSync('cloudflare/migrations/0017_create_user_schedule_course_snapshots.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS user_schedule_course_snapshots/i);
  assert.match(sql, /schedule_id TEXT PRIMARY KEY/i);
  assert.match(sql, /FOREIGN KEY \(schedule_id\) REFERENCES user_schedules\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS user_schedule_rollback_outbox/i);
  const withoutCascade = sql.replace(/ON DELETE CASCADE/gi, '');
  assert.doesNotMatch(withoutCascade, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
  assert.doesNotMatch(sql, /course_schedules/i);
});

test('Courses Edge no longer directly mutates the legacy user schedule table', () => {
  const source = readFileSync('supabase/functions/courses/index.ts', 'utf8');
  assert.match(source, /callScheduleAuthorityInternal\([\s\S]*update_user_schedule_custom_data/);
  assert.doesNotMatch(source, /\.from\('user_schedules'\)[\s\S]{0,220}\.update\(/);
});
