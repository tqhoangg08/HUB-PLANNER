import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { addUserScheduleForBetterAuth, UserScheduleError } from '../cloudflare/worker/src/user-schedules.ts';
import { handlePrivateProfile, PrivateProfileError } from '../cloudflare/worker/src/private-profile.ts';
import { handlePrivateNotifications, PrivateNotificationsError } from '../cloudflare/worker/src/private-notifications.ts';
import { handlePrivatePolicyConsent, PrivatePolicyConsentError } from '../cloudflare/worker/src/private-policy-consent.ts';
import { privateApiRequest, PrivateApiError } from '../utils/privateApi.ts';
import { addCloudflareUserSchedule } from '../utils/userSchedulesApi.ts';

const USER_A = '11111111-1111-4111-8111-111111111111';
const COURSE = '22222222-2222-4222-8222-222222222222';

test('migrated private frontend clients use same-origin Better Auth cookies without Supabase bearer auth', () => {
  const schedules = readFileSync('utils/userSchedulesApi.ts', 'utf8');
  const rankings = readFileSync('utils/benchmarkRankingsApi.ts', 'utf8');
  const importFlow = readFileSync('utils/scheduleImportPreview.ts', 'utf8');
  const mobileProfile = readFileSync('components/MobileProfile.tsx', 'utf8');
  const desktopProfile = readFileSync('pages/ProfilePage.jsx', 'utf8');
  const profileRoute = readFileSync('utils/profileRouteApi.ts', 'utf8');
  const routes = readFileSync('app/routing/AppRoutes.tsx', 'utf8');
  assert.match(schedules, /fetch\(normalizedPath/);
  assert.match(schedules, /credentials: 'include'/);
  assert.doesNotMatch(schedules, /supabase\.auth|getSession|Authorization|workers\.dev/i);
  assert.match(rankings, /fetch\(path/);
  assert.match(rankings, /credentials: authenticated \? 'include'/);
  assert.doesNotMatch(rankings, /supabase\.auth|getSession|Authorization/);
  assert.match(importFlow, /replaceCloudflareUserScheduleSemester\(semester, \[\], importRows\)/);
  assert.doesNotMatch(importFlow, /replace_user_schedule_import_source['"]|supabase\.rpc/);
  assert.match(mobileProfile, /fetchBetterAuthSession\(\)/);
  assert.match(mobileProfile, /fetchOwnPrivateProfile\(\)/);
  assert.match(mobileProfile, /signOutBetterAuth\(\)/);
  assert.doesNotMatch(mobileProfile, /supabase\.auth|getSession|Authorization/);
  assert.match(desktopProfile, /fetchProfileForRoute\(id, currentStudentCode, currentUserId/);
  assert.match(desktopProfile, /fetchOwnProfile: fetchOwnPrivateProfile/);
  assert.match(profileRoute, /fetchers\.fetchOwnProfile\(\)/);
  assert.match(profileRoute, /fetchers\.fetchPublicProfile\(routeStudentCode\)/);
  assert.doesNotMatch(desktopProfile, /from\('profiles'\)/);
  assert.match(routes, /path="\/login" element=\{<LoginScreen onRefreshAuth=\{onRefreshAuth\} \/>\}/);
});

test('ordinary dashboard bootstrap helpers resolve identity through Better Auth', () => {
  const prompt = readFileSync('components/PushNotificationPrompt.tsx', 'utf8');
  const mobileHome = readFileSync('components/MobileHome.tsx', 'utf8');
  const dashboard = readFileSync('components/Dashboard.tsx', 'utf8');
  const lifecycle = readFileSync('hooks/useSessionLifecycle.ts', 'utf8');
  const push = readFileSync('utils/pushNotifications.ts', 'utf8');
  const clientSession = readFileSync('utils/clientSession.ts', 'utf8');
  const webError = readFileSync('utils/logWebError.ts', 'utf8');
  const notificationBell = readFileSync('components/NotificationBell.jsx', 'utf8');
  const notificationNudge = readFileSync('components/NotificationNudge.tsx', 'utf8');
  const notificationApi = readFileSync('utils/privateNotificationsApi.ts', 'utf8');
  const policyConsent = readFileSync('utils/policyConsent.ts', 'utf8');
  const mobileDashboard = readFileSync('components/MobileDashboard.tsx', 'utf8');
  const mobileHandbook = readFileSync('components/MobileHandbook.tsx', 'utf8');
  const lostFound = readFileSync('components/LostFoundBoard.tsx', 'utf8');
  const mobileLostFound = readFileSync('components/MobileLostFound.tsx', 'utf8');
  const lookback = readFileSync('hooks/useSemesterLookback.ts', 'utf8');

  for (const source of [prompt, mobileHome]) {
    assert.match(source, /fetchBetterAuthSession/);
    assert.doesNotMatch(source, /supabase\.auth\.getSession\(\)/);
  }
  assert.doesNotMatch(prompt, /supabase\.auth\.onAuthStateChange/);
  assert.doesNotMatch(mobileHome, /from\('school_announcements'\)|utils\/supabase/);
  assert.doesNotMatch(dashboard, /utils\/supabase|supabase\.(?:from|auth|rpc)/);
  assert.match(push, /isPushNotificationSyncAvailable/);
  assert.doesNotMatch(push, /isBrowserSupabaseConfigured|utils\/supabase/);
  assert.match(prompt, /isPushNotificationSyncAvailable\(\)/);
  assert.match(lifecycle, /isPushNotificationSyncAvailable\(\)/);
  assert.match(clientSession, /fetchBetterAuthSession\(\)/);
  assert.doesNotMatch(clientSession, /supabase\.auth|getSession/);
  assert.doesNotMatch(webError, /utils\/supabase|supabase\.(?:from|auth|rpc)/);
  assert.doesNotMatch(notificationBell, /utils\/supabase|supabase\.(?:from|auth|channel)/);
  assert.match(notificationBell, /fetchOwnNotifications/);
  assert.match(notificationBell, /markOwnNotificationRead/);
  assert.doesNotMatch(notificationNudge, /utils\/supabase|supabase\.auth/);
  assert.match(notificationNudge, /fetchBetterAuthSession/);
  assert.match(notificationApi, /privateApiRequest\('\/api\/user\/v1\/notifications'/);
  assert.doesNotMatch(notificationApi, /Authorization|supabase|workers\.dev/i);
  assert.match(policyConsent, /privateApiRequest\('\/api\/user\/v1\/policy-consents'/);
  assert.doesNotMatch(policyConsent, /supabase\.auth|getSession|Authorization|workers\.dev/i);
  for (const source of [mobileDashboard, mobileHandbook, lostFound, mobileLostFound]) {
    assert.doesNotMatch(source, /isBrowserSupabaseConfigured|utils\/supabase|supabase\.(?:from|auth|rpc)/);
  }
  assert.match(lookback, /fetchOwnPrivateProfile/);
  assert.match(lookback, /fetchCloudflareOwnRanking/);
  assert.doesNotMatch(lookback, /utils\/supabase|supabase\.(?:from|auth|rpc)/);
});

test('schedule import catalog lookup stays on the public course API without browser Supabase', () => {
  const source = readFileSync('utils/scheduleImportPreview.ts', 'utf8');
  assert.match(source, /fetchPublicCourses/);
  assert.doesNotMatch(source, /utils\/supabase|supabase\.(?:from|auth|rpc)/);
  assert.match(source, /replaceCloudflareUserScheduleSemester/);
});

test('notification private bridge scopes reads and mutations to Better Auth owner', async () => {
  const sourceCalls: Array<{ url: string; method: string; body: string }> = [];
  const env = {
    SUPABASE_URL: 'https://source.example', SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
    AUTH_SERVICE: { fetch: async () => Response.json({ userId: USER_A, email: 'a@st.buh.edu.vn', role: 'user' }) },
  } as never;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sourceCalls.push({ url: String(input), method: String(init?.method || 'GET'), body: String(init?.body || '') });
    if (String(input).includes('/notifications?')) return Response.json([]);
    if (String(input).includes('/notification_preferences?')) return Response.json([]);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    const requestHeaders = { Cookie: 'better-auth.session_token=opaque' };
    const result = await handlePrivateNotifications(new Request(
      'https://app.example/api/user/v1/notifications?userId=99999999-9999-4999-8999-999999999999',
      { headers: requestHeaders },
    ), env);
    assert.equal(result.success, true);
    assert.ok(sourceCalls.every((call) => call.url.includes(USER_A)));
    assert.ok(sourceCalls.every((call) => !call.url.includes('99999999')));

    sourceCalls.length = 0;
    await handlePrivateNotifications(new Request('https://app.example/api/user/v1/notifications', {
      method: 'PATCH', headers: requestHeaders,
      body: JSON.stringify({ action: 'read', notificationId: COURSE }),
    }), env);
    assert.equal(sourceCalls.length, 1);
    assert.match(sourceCalls[0].url, new RegExp(`receiver_id=eq\\.${USER_A}`));
    assert.doesNotMatch(sourceCalls[0].body, /user_id|receiver_id/);

    await assert.rejects(handlePrivateNotifications(new Request('https://app.example/api/user/v1/notifications', {
      method: 'PATCH', headers: requestHeaders,
      body: JSON.stringify({ action: 'read-all', userId: '99999999-9999-4999-8999-999999999999' }),
    }), env), (error: unknown) => error instanceof PrivateNotificationsError && error.status === 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('policy consent bridge derives identity server-side and rejects caller owner', async () => {
  const sourceBodies: string[] = [];
  const env = {
    SUPABASE_URL: 'https://source.example', SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
    AUTH_SERVICE: { fetch: async () => Response.json({ userId: USER_A, email: 'a@st.buh.edu.vn', role: 'user' }) },
  } as never;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sourceBodies.push(String(init?.body || ''));
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  try {
    await handlePrivatePolicyConsent(new Request('https://app.example/api/user/v1/policy-consents', {
      method: 'POST', headers: { Cookie: 'better-auth.session_token=opaque' },
      body: JSON.stringify({ policyType: 'terms_of_use', policyVersion: '2026-06-11', context: 'oauth_registration' }),
    }), env);
    const row = JSON.parse(sourceBodies[0]);
    assert.equal(row.user_id, USER_A);
    assert.equal(typeof row.user_id_hash, 'string');
    assert.equal(row.user_id_hash.length, 64);
    assert.ok(!sourceBodies[0].includes('server-only-key'));
    await assert.rejects(handlePrivatePolicyConsent(new Request('https://app.example/api/user/v1/policy-consents', {
      method: 'POST', headers: { Cookie: 'better-auth.session_token=opaque' },
      body: JSON.stringify({ userId: COURSE, policyType: 'terms_of_use', policyVersion: '2026-06-11', context: 'registration' }),
    }), env), (error: unknown) => error instanceof PrivatePolicyConsentError && error.status === 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legacy Better Auth schedule writes use only the server secret and server-resolved owner', async () => {
  const sourceRequests: Array<{ authorization: string; body: string }> = [];
  const env = {
    SUPABASE_URL: 'https://source.example',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
    DB: { prepare: () => ({ bind: () => ({}) }), batch: async () => [] },
  } as never;
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    sourceRequests.push({
      authorization: String(new Headers(init?.headers).get('Authorization') || ''),
      body: String(init?.body || ''),
    });
    if (init?.method === 'POST') return new Response(null, { status: 201 });
    return Response.json([{
      id: '33333333-3333-4333-8333-333333333333', user_id: USER_A,
      course_id: COURSE, semester: 'HK1', custom_data: null,
      created_at: '2026-08-13T00:00:00.000Z',
    }]);
  };
  const result = await addUserScheduleForBetterAuth(env, USER_A, COURSE, 'HK1', fetcher as typeof fetch);
  assert.equal(result.success, true);
  assert.ok(sourceRequests.every((request) => request.authorization === 'Bearer server-only-key'));
  assert.equal(JSON.parse(sourceRequests[0].body).user_id, USER_A);
});

test('source barrier maps to safe 503 and unrelated database errors do not leak', async () => {
  const env = {
    SUPABASE_URL: 'https://source.example', SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', DB: {},
  } as never;
  await assert.rejects(
    addUserScheduleForBetterAuth(env, USER_A, COURSE, 'HK1', async () => Response.json({
      code: '55000', message: 'HUB_SCHEDULE_SOURCE_WRITES_DISABLED',
    }, { status: 400 }) as never),
    (error: unknown) => error instanceof UserScheduleError && error.status === 503 && !error.message.includes('55000'),
  );
  await assert.rejects(
    addUserScheduleForBetterAuth(env, USER_A, COURSE, 'HK1', async () => Response.json({
      code: '23505', message: 'sensitive table/sql detail',
    }, { status: 400 }) as never),
    (error: unknown) => error instanceof UserScheduleError && error.status === 502 && !error.message.includes('sensitive'),
  );
});

test('server-only atomic import migration is least-privilege, owner-scoped, and transactional', () => {
  const sql = readFileSync('supabase/migrations/20260813120000_add_better_auth_schedule_import_bridge.sql', 'utf8');
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
  assert.match(sql, /security definer[\s\S]*set search_path = pg_catalog/i);
  assert.match(sql, /where user_id = p_user_id and semester = p_semester/i);
  assert.match(sql, /select p_user_id, course_id, p_semester/i);
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (anon|authenticated)/i);
  assert.doesNotMatch(sql, /execute\s+format|request\.jwt/i);
});

test('private profile bridge rejects caller ownership and scopes source reads to Better Auth UUID', async () => {
  const sourceUrls: string[] = [];
  const env = {
    SUPABASE_URL: 'https://source.example', SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
    AUTH_SERVICE: { fetch: async () => Response.json({ userId: USER_A, email: 'a@st.buh.edu.vn', role: 'user' }) },
  } as never;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    sourceUrls.push(String(input));
    return Response.json([]);
  }) as typeof fetch;
  try {
    const result = await handlePrivateProfile(new Request(
      'https://app.example/api/user/v1/profile?userId=99999999-9999-4999-8999-999999999999',
      { headers: { Cookie: 'better-auth.session_token=opaque' } },
    ), env);
    assert.equal(result.success, true);
    assert.ok(sourceUrls.every((url) => url.includes(`eq.${USER_A}`)));
    assert.ok(sourceUrls.every((url) => !url.includes('99999999')));
    await assert.rejects(handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
      method: 'PATCH', headers: { Cookie: 'better-auth.session_token=opaque' },
      body: JSON.stringify({ userId: '99999999-9999-4999-8999-999999999999' }),
    }), env), (error: unknown) => error instanceof PrivateProfileError && error.status === 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('migrated private clients hide server details, preserve safe client errors, and never retry', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), method: String(init?.method || 'GET') });
    return Response.json({ error: 'sensitive postgres table sqlstate stack detail' }, { status: 500 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      privateApiRequest('/api/user/v1/profile'),
      (error: unknown) => error instanceof PrivateApiError
        && error.status === 500
        && !error.message.includes('postgres'),
    );
    await assert.rejects(
      addCloudflareUserSchedule(COURSE, 'HK1'),
      (error: unknown) => error instanceof Error && !error.message.includes('postgres'),
    );
    assert.deepEqual(requests, [
      { url: '/api/user/v1/profile', method: 'GET' },
      { url: '/api/user/v1/schedules', method: 'GET' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('schedule barrier UX is fixed and deliberate validation messages remain available', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json(
    { error: 'HUB_SCHEDULE_SOURCE_WRITES_DISABLED postgres internal detail' },
    { status: 503 },
  )) as typeof fetch;
  try {
    await assert.rejects(
      addCloudflareUserSchedule(COURSE, 'HK1'),
      (error: unknown) => error instanceof Error
        && error.message.includes('tạm thời')
        && !error.message.includes('HUB_SCHEDULE'),
    );
  } finally {
    globalThis.fetch = (async () => Response.json(
      { error: 'Học kỳ không hợp lệ.' },
      { status: 400 },
    )) as typeof fetch;
  }
  try {
    await assert.rejects(
      privateApiRequest('/api/user/v1/profile'),
      (error: unknown) => error instanceof PrivateApiError
        && error.status === 400
        && error.message === 'Học kỳ không hợp lệ.',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('profile candidate does not log private update payloads', () => {
  const source = readFileSync('hooks/useAccountProfileDraft.ts', 'utf8');
  assert.doesNotMatch(source, /console\.(?:debug|log)\([^\n]*profileUpdatePayload/);
});

test('maintenance-off candidate keeps remaining intentionally unmigrated student mutations gated', () => {
  const productionEnv = readFileSync('.env.production', 'utf8');
  const password = readFileSync('hooks/useAccountPassword.ts', 'utf8');
  const deletion = readFileSync('hooks/useDeleteAccount.ts', 'utf8');
  const profile = readFileSync('hooks/useAccountProfileDraft.ts', 'utf8');
  const routes = readFileSync('app/routing/AppRoutes.tsx', 'utf8');
  assert.match(productionEnv, /^VITE_AUTH_MAINTENANCE_MODE=false$/m);
  assert.match(password, /startPasswordChange[\s\S]*setShowPasswordChange\(false\)[\s\S]*tạm bảo trì/);
  assert.doesNotMatch(deletion, /Xóa tài khoản đang tạm bảo trì[\s\S]*return;/);
  assert.match(profile, /if \(draftAvatarFile\)[\s\S]*Tải ảnh đại diện mới đang tạm bảo trì[\s\S]*return;/);
  assert.match(routes, /path="\/login" element=\{<LoginScreen onRefreshAuth=\{onRefreshAuth\} \/>\}/);
  assert.match(routes, /path="\/" element=\{<Navigate to=\{defaultPath\} replace \/>\}/);
});

test('exact rankings preserve public routing while private ranking uses same-origin cookie auth', () => {
  const rankings = readFileSync('utils/benchmarkRankingsApi.ts', 'utf8');
  assert.match(rankings, /fetch\(path/);
  assert.match(rankings, /credentials: authenticated \? 'include' : 'omit'/);
  assert.match(rankings, /\/api\/user\/v1\/rankings\/exact/);
  assert.doesNotMatch(rankings, /Authorization|supabase\.auth|getSession/);
});
