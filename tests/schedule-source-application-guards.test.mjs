import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertScheduleSourceWriteSucceeded,
  INTERNAL_SERVER_ERROR_MESSAGE,
  SCHEDULE_SOURCE_BARRIER_CODE,
  SCHEDULE_SOURCE_BARRIER_MESSAGE,
  SCHEDULE_SOURCE_UNAVAILABLE_MESSAGE,
  ScheduleSourceUnavailableError,
  isScheduleSourceBarrierError,
  safeHttpError,
} from '../server/api-handlers/schedule-source-barrier.js';

const source = (file) => readFileSync(file, 'utf8');

test('only the exact database barrier is classified as temporary unavailability', () => {
  const barrier = { code: SCHEDULE_SOURCE_BARRIER_CODE, message: SCHEDULE_SOURCE_BARRIER_MESSAGE };
  assert.equal(isScheduleSourceBarrierError(barrier), true);
  assert.equal(isScheduleSourceBarrierError({ ...barrier, code: '23505' }), false);
  assert.equal(isScheduleSourceBarrierError({ ...barrier, message: 'unrelated' }), false);
  assert.equal(isScheduleSourceBarrierError({ code: '55000', message: 'other PostgreSQL state' }), false);
  assert.equal(isScheduleSourceBarrierError({ code: '23505', message: SCHEDULE_SOURCE_BARRIER_MESSAGE }), false);
  assert.equal(new ScheduleSourceUnavailableError().statusCode, 503);
});

test('central error contract preserves deliberate 4xx and sanitizes every unexpected 5xx', () => {
  const barrier = safeHttpError({
    code: SCHEDULE_SOURCE_BARRIER_CODE,
    message: `trigger: ${SCHEDULE_SOURCE_BARRIER_MESSAGE}`,
  });
  assert.deepEqual(barrier, { status: 503, message: SCHEDULE_SOURCE_UNAVAILABLE_MESSAGE });

  const sensitive = 'relation public.user_schedules violates SQL near DELETE FROM secret_table';
  const databaseFailure = safeHttpError({ code: '23505', message: sensitive });
  const ordinaryFailure = safeHttpError(new Error(sensitive));
  assert.deepEqual(databaseFailure, { status: 500, message: INTERNAL_SERVER_ERROR_MESSAGE });
  assert.deepEqual(ordinaryFailure, { status: 500, message: INTERNAL_SERVER_ERROR_MESSAGE });
  assert.doesNotMatch(JSON.stringify([databaseFailure, ordinaryFailure]), /user_schedules|DELETE FROM|secret_table/);

  const validation = safeHttpError(
    Object.assign(new Error('Invalid semester'), { statusCode: 400 }),
    { allowClient4xx: true },
  );
  assert.deepEqual(validation, { status: 400, message: 'Invalid semester' });

  const untrusted4xx = safeHttpError(Object.assign(new Error(sensitive), { statusCode: 400 }));
  assert.deepEqual(untrusted4xx, { status: 500, message: INTERNAL_SERVER_ERROR_MESSAGE });
});

test('active Edge and Vercel handlers never reflect raw unexpected errors in 5xx bodies', () => {
  for (const file of [
    'supabase/functions/auth/index.ts',
    'supabase/functions/courses/index.ts',
    'supabase/functions/scraper/index.ts',
    'server/api-handlers/auth.js',
    'server/api-handlers/courses.js',
    'server/api-handlers/scraper.js',
  ]) {
    const text = source(file);
    assert.match(text, /safeHttpError/, file);
    assert.doesNotMatch(text, /(?:json|\.json)\(\{[^\n}]*error:\s*(?:errorMessage\(|error\??\.message|String\(error\))/, file);
    assert.doesNotMatch(text, /status\(500\)\.json\(\{[^}]*R2_ACCOUNT_ID/s, file);
  }
});

test('scraper update sites assert success before recording a result', () => {
  for (const file of ['supabase/functions/scraper/index.ts', 'server/api-handlers/scraper.js']) {
    const text = source(file);
    const updateCount = (text.match(/\.from\('course_schedules'\)\.update|\.from\('course_schedules'\)\s*\n\s*\.update/g) || []).length;
    const assertionCount = (text.match(/assertScheduleSourceWriteSucceeded\(updateError\)/g) || []).length;
    assert.equal(updateCount, 3, file);
    assert.equal(assertionCount, updateCount, file);
    assert.doesNotMatch(text, /DB_ERROR|Lỗi lưu DB/, file);

    const assertionPositions = [...text.matchAll(/assertScheduleSourceWriteSucceeded\(updateError\)/g)].map((match) => match.index);
    const resultPositions = file.includes('supabase/')
      ? ['resultsLog.push(`[OK]', 'resultsLog.push(`[NO_INSTRUCTOR]', 'resultsLog.push(`[EMPTY_CLASS]'].map((value) => text.indexOf(value))
      : ['resultsLog.push(`✅', 'resultsLog.push(`⚠️ Chưa xếp GV', 'resultsLog.push(`👻'].map((value) => text.indexOf(value));
    assert.equal(resultPositions.length, assertionPositions.length, file);
    resultPositions.forEach((position, index) => assert.ok(position > assertionPositions[index], `${file} branch ${index + 1}`));
    assert.ok(text.lastIndexOf('safeHttpError(error)') > text.lastIndexOf('return response.status(200)') || file.includes('supabase/'), file);
  }
});

test('all three scraper update branches abort and sanitize injected write failures', () => {
  const branchNames = ['instructor found', 'no instructor', 'empty class'];
  const failures = [
    {
      expected: { status: 503, message: SCHEDULE_SOURCE_UNAVAILABLE_MESSAGE },
      error: { code: SCHEDULE_SOURCE_BARRIER_CODE, message: `trigger: ${SCHEDULE_SOURCE_BARRIER_MESSAGE}` },
    },
    {
      expected: { status: 500, message: INTERNAL_SERVER_ERROR_MESSAGE },
      error: { code: '23505', message: 'sensitive table/sql detail from course_schedules' },
    },
  ];

  for (const branch of branchNames) {
    for (const { error, expected } of failures) {
      const results = [];
      let laterWorkRan = false;
      let thrown;
      try {
        assertScheduleSourceWriteSucceeded(error);
        results.push(`success:${branch}`);
        laterWorkRan = true;
      } catch (caught) {
        thrown = caught;
      }

      assert.equal(thrown, error, branch);
      assert.deepEqual(results, [], branch);
      assert.equal(laterWorkRan, false, branch);
      const response = safeHttpError(thrown);
      assert.deepEqual(response, expected, branch);
      assert.doesNotMatch(JSON.stringify(response), /course_schedules|sensitive|sql detail/i, branch);
    }
  }
});

test('active Auth Edge account deletion performs D1 schedule cleanup before other destructive steps', () => {
  const text = source('supabase/functions/auth/index.ts');
  const handler = text.indexOf('const deleteAccount');
  const otp = text.indexOf('verifyOtpRecord', handler);
  const scheduleCleanup = text.indexOf("operation: 'delete_user_schedules'", otp);
  const avatarDelete = text.indexOf("storage.from('avatars')", otp);
  const authDelete = text.indexOf('auth.admin.deleteUser', otp);
  assert.ok(handler >= 0 && otp > handler && scheduleCleanup > otp);
  assert.ok(avatarDelete > scheduleCleanup && authDelete > avatarDelete);
  assert.doesNotMatch(text.slice(handler, authDelete), /deleteRows\('user_schedules'/);
  assert.match(text, /callScheduleAuthorityInternal/);
  assert.match(text, /safeHttpError/);
});

test('backend and scraper writers map the barrier without client-held leases', () => {
  for (const file of [
    'server/api-handlers/courses.js',
    'supabase/functions/courses/index.ts',
    'server/api-handlers/scraper.js',
    'supabase/functions/scraper/index.ts',
  ]) {
    const text = source(file);
    assert.match(text, /safeHttpError/, file);
    assert.doesNotMatch(text, /schedule_source_write_lease|withScheduleSourceWriteLease/, file);
  }
});

test('frontend import uses one Better Auth Worker call that owns source atomicity and D1 mirroring', () => {
  const text = source('utils/scheduleImportPreview.ts');
  assert.match(text, /replaceCloudflareUserScheduleSemester\(semester, \[\], importRows\)/);
  assert.doesNotMatch(text, /supabase\.rpc|replace_user_schedule_import_source['"]/);
  assert.doesNotMatch(text, /createImportedCourse|schedule_source_write_lease|withScheduleImportSourceLease/);
  assert.doesNotMatch(text, /\bretry\b|setInterval/i);
  assert.doesNotMatch(text, /p_user_id|userId:|Authorization|access_token/);

  const frontendGuard = source('utils/scheduleSourceBarrier.ts');
  assert.match(frontendGuard, /SCHEDULE_SOURCE_INTERNAL_ERROR_MESSAGE/);
  assert.doesNotMatch(frontendGuard, /throw error/);

  const api = source('utils/userSchedulesApi.ts');
  assert.doesNotMatch(api, /\bretry\b|setInterval/i);
  assert.match(api, /if \(!response\.ok\)[\s\S]*throw new Error/);
  assert.match(api, /credentials: 'include'/);
  assert.doesNotMatch(api, /supabase\.auth|getSession|Authorization/);
});

test('Cloudflare distinguishes user-schedule sync from long-lived course sync', () => {
  const index = source('cloudflare/worker/src/index.ts');
  const modes = source('cloudflare/worker/src/schedule-write-mode.ts');
  assert.match(modes, /allowsSupabaseUserScheduleSync[\s\S]*=== 'legacy'/);
  assert.match(modes, /allowsSupabaseCourseSync[\s\S]*mode === 'legacy' \|\| mode === 'd1'/);
  assert.match(index, /allowsSupabaseCourseSync\(env\)[\s\S]*syncCourseSchedules/);
  assert.match(index, /allowsSupabaseUserScheduleSync\(env\)[\s\S]*syncUserSchedules/);
  assert.match(index, /!allowsSupabaseUserScheduleSync\(env\)[\s\S]*return/);
});

test('migration has no lease surface and uses source-atomic import authority', () => {
  const sql = source('supabase/migrations/20260812120000_schedule_cutover_source_barrier.sql');
  assert.doesNotMatch(sql, /schedule_source_write_leases|acquire_schedule_source_write_lease|release_schedule_source_write_lease/i);
  assert.match(sql, /function public\.replace_user_schedule_import_source/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /grant execute on function public\.replace_user_schedule_import_source\(text, jsonb\) to authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.replace_user_schedule_import_source[^;]*service_role/i);
  assert.doesNotMatch(sql, /function\s+public\.(?:set|update|change).*schedule_source/i);
});
