import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AccountDeleteError, handleAccountDelete } from '../cloudflare/worker/src/account-delete.ts';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

test('normal frontend deletion flow uses the Better Auth and Worker endpoints', () => {
  const hook = read('hooks/useDeleteAccount.ts');
  assert.doesNotMatch(hook, /tạm bảo trì trong giai đoạn kiểm thử an toàn/);
  assert.doesNotMatch(hook, /Authorization:\s*`Bearer|sessionAccessToken|apiUrl\('\/auth'\)/);
  assert.match(hook, /\/api\/private\/v1\/account-delete\/request-otp/);
  assert.match(hook, /\/api\/private\/v1\/account-delete\/confirm/);
  assert.match(hook, /\/api\/private\/v1\/account-delete\/preflight/);
  assert.match(hook, /privateApiRequest/);
});

test('account deletion rejects staff from the server-resolved Better Auth role', async () => {
  const calls: string[] = [];
  const env = {
    AUTH_SERVICE: {
      async fetch(input: RequestInfo | URL) {
        const request = input instanceof Request ? input : new Request(input);
        calls.push(new URL(request.url).pathname);
        return Response.json({
          userId: '11111111-1111-4111-8111-111111111111',
          email: 'redacted@example.test',
          role: 'admin',
        });
      },
    },
  };
  const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/account-delete/request-otp', {
    method: 'POST',
    headers: { Cookie: 'hubplanner_auth.session_token=redacted', 'x-turnstile-token': 'redacted' },
    body: '{}',
  });
  await assert.rejects(
    handleAccountDelete(request, new URL(request.url), env as never),
    (error: unknown) => error instanceof AccountDeleteError && error.status === 403,
  );
  assert.deepEqual(calls, ['/internal/auth/session']);
});

test('temporary synthetic page is server-guarded and cannot expose fixture credentials', () => {
  const worker = read('cloudflare/worker/src/account-delete.ts');
  assert.match(worker, /ACCOUNT_DELETE_SYNTHETIC_TEST_USER_ID/);
  assert.match(worker, /requireBetterAuthSession/);
  assert.match(worker, /ACCOUNT_DELETE_SYNTHETIC_MAILTM_TOKEN/);
  assert.match(worker, /isSyntheticFixture/);
  assert.doesNotMatch(worker, /SYNTHETIC_TEST_USER_ID=.*Response/i);
});

test('delete OTP keeps Turnstile enabled with a dedicated action', () => {
  const modal = read('components/account/DeleteAccountModal.tsx');
  const auth = read('cloudflare/auth-production-worker/src/auth-production.ts');
  assert.match(modal, /action="account_delete"/);
  assert.match(auth, /validateTurnstile\(request, config, ACCOUNT_DELETE_OTP_PURPOSE\)/);
  assert.match(auth, /ACCOUNT_DELETE_MAX_ATTEMPTS = 5/);
  assert.doesNotMatch(auth, /plaintext.*otp/i);
});

test('auth commit deletes Better Auth identity state and verifies postconditions', () => {
  const auth = read('cloudflare/auth-production-worker/src/auth-production.ts');
  for (const table of ['auth_session', 'auth_account', 'app_auth_identifiers', 'app_user_roles', 'auth_user']) {
    assert.match(auth, new RegExp(`DELETE FROM ${table}`));
  }
  assert.match(auth, /ACCOUNT_DELETE_AUTH_POSTCONDITION_FAILED/);
  assert.doesNotMatch(auth, /supabase\.auth|auth\.admin\.deleteUser/);
});

test('owner cleanup covers D1 data without deleting shared public courses', () => {
  const worker = read('cloudflare/worker/src/account-delete.ts');
  for (const table of [
    'user_schedule_course_snapshots', 'user_schedules', 'user_schedule_revisions',
    'user_schedule_mutation_receipts', 'user_schedule_rollback_outbox',
    'user_course_requests', 'user_event_participations', 'benchmark_ranking_users',
    'lost_found_items', 'public_lost_found_items', 'support_attachment_uploads', 'user_profile_private', 'user_profiles',
    'practice_attempts', 'practice_pro_access', 'practice_sets',
  ]) assert.match(worker, new RegExp(`DELETE FROM ${table}`));
  assert.doesNotMatch(worker, /DELETE FROM course_schedules/);
  assert.doesNotMatch(worker, /anonymize_deleted_user_logs/);
  assert.doesNotMatch(worker, /payment_requests|ai_documents/);
  assert.match(worker, /preflightServerSideUserData/);
  assert.match(worker, /preflightD1UserData/);
  assert.match(worker, /account_delete_step/);
  assert.match(worker, /source_delete:/);
  assert.match(worker, /source_preflight:/);
  assert.match(worker, /SELECT file_key FROM support_attachment_uploads WHERE user_id = \?/);
  assert.match(worker, /cleanupServerSideUserData\(env, identity\.userId, telemetry\)[\s\S]*d1_cleanup[\s\S]*auth_teardown/);
  assert.match(worker, /account_delete_step_telemetry/);
  assert.match(worker, /persistedDeleteStep\(env, telemetry, step, 'source', table/);
  assert.doesNotMatch(worker, /delete_practice_pro_access_for_account_cleanup/);
  assert.doesNotMatch(worker, /source_delete:practice_sets|source_patch:practice_sets|source_preflight:practice_sets/);
  assert.match(worker, /DELETE FROM practice_sets WHERE owner_id = \? AND visibility = 'private'/);
  assert.match(worker, /UPDATE practice_sets SET owner_id = NULL/);
  assert.doesNotMatch(worker, /deleteSourceRows\(env, telemetry, 'user_schedules'/);
});

test('deleted or malformed session state cannot dereference frontend user metadata', () => {
  const studyData = read('hooks/useStudyData.ts');
  assert.match(studyData, /session\?\.user\?\.user_metadata\?\.full_name/);
  assert.doesNotMatch(studyData, /session\?\.user\.user_metadata/);
});

test('request-otp requires a Better Auth session and forwards only through the internal auth binding', async () => {
  const calls: string[] = [];
  const env = {
    AUTH_SERVICE: {
      async fetch(input: RequestInfo | URL) {
        const request = input instanceof Request ? input : new Request(input);
        calls.push(new URL(request.url).pathname);
        if (new URL(request.url).pathname === '/internal/auth/session') {
          return Response.json({
            userId: '11111111-1111-4111-8111-111111111111',
            email: 'synthetic@invalid.example',
            role: 'user',
          });
        }
        return Response.json({ ok: true, expiresInSeconds: 600 });
      },
    },
  };
  const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/account-delete/request-otp', {
    method: 'POST',
    headers: { Cookie: 'hubplanner_auth.session_token=redacted', 'x-turnstile-token': 'redacted' },
    body: '{}',
  });
  const result = await handleAccountDelete(request, new URL(request.url), env as never);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['/internal/auth/session', '/internal/account-delete/request-otp']);
});
