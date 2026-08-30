import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { handleProfileAuthorityInternal } from '../cloudflare/worker/src/profile-authority-internal.ts';
import { handleStaffProfile, StaffProfileError } from '../cloudflare/worker/src/staff-profile.ts';
import { callProfileAuthorityInternal } from '../supabase/functions/_shared/profile-authority-client.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SECRET = 'test-only-profile-authority-secret-000000000000';
const NOW = Date.parse('2026-08-23T00:00:00.000Z');
const COOKIE = 'hubplanner_auth.session_token=opaque';

const publicRow = {
  user_id: USER_ID,
  student_code: '030800000001',
  full_name: 'Fixture Student',
  avatar_url: null,
  bio: null,
  class_name: null,
  class_name_overridden: 0,
  profile_tags_json: '[]',
  public_profile_enabled: 0,
  show_profile_stats: 0,
  public_gpa: null,
  public_completed_semesters: null,
  public_credits: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  canonical_hash: 'public-hash',
  row_version: 1,
};

const privateRow = {
  user_id: USER_ID,
  data_json: '{"studentName":"Fixture Student"}',
  student_name: 'Fixture Student',
  cohort: null,
  major_name: null,
  specialization_name: null,
  program_name: null,
  semesters_json: null,
  target_gpa: null,
  total_credits_required: null,
  has_onboarded: null,
  lookback_seen_json: null,
  updated_at: '2026-01-02T00:00:00.000Z',
  canonical_hash: 'private-hash',
  row_version: 1,
};

const fakeD1 = () => {
  const batches: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              if (sql.includes('COUNT(*)')) return { total: 1 };
              if (sql.includes('FROM user_profile_private')) return privateRow;
              if (sql.includes('FROM user_profiles')) return publicRow;
              return null;
            },
            async all() {
              if (sql.includes('FROM user_profiles p')) return { results: [{ ...publicRow, id: USER_ID }] };
              return { results: [] };
            },
            sql,
            values,
          };
        },
      };
    },
    async batch(statements: unknown[]) {
      batches.push(statements);
      return [];
    },
  };
  return { db: db as never, batches };
};

const authService = (role: 'user' | 'admin' | 'auditor') => ({
  fetch: async () => Response.json({
    userId: USER_ID,
    email: 'fixture@st.buh.edu.vn',
    role,
  }),
});

test('F2 staff Profile access is Better Auth server-side, allowlisted, and least privilege', async () => {
  const { db, batches } = fakeD1();
  const mapRequest = () => new Request('https://example.test/api/staff/v1/profiles', {
    method: 'POST',
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ action: 'map', userIds: [USER_ID], mode: 'full' }),
  });

  await assert.rejects(
    handleStaffProfile(mapRequest(), { DB: db, AUTH_SERVICE: authService('user') }),
    (error: unknown) => error instanceof Error && 'status' in error && error.status === 403,
  );

  const auditorRead = await handleStaffProfile(
    mapRequest(),
    { DB: db, AUTH_SERVICE: authService('auditor') },
  );
  assert.equal(auditorRead.data.length, 1);

  const patchRequest = () => new Request('https://example.test/api/staff/v1/profiles', {
    method: 'PATCH',
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ userId: USER_ID, privateProfile: { data: { studentName: 'Fixture Student' } } }),
  });
  await assert.rejects(
    handleStaffProfile(patchRequest(), { DB: db, AUTH_SERVICE: authService('auditor') }),
    (error: unknown) => error instanceof StaffProfileError && error.status === 403,
  );
  await handleStaffProfile(patchRequest(), { DB: db, AUTH_SERVICE: authService('admin') });
  assert.equal(batches.length, 1);
});

test('internal Profile authority rejects missing auth and accepts signed operation-scoped Auth/Courses calls', async () => {
  const { db, batches } = fakeD1();
  const env = {
    DB: db,
    PROFILE_D1_SHADOW_INTERNAL_ENABLED: 'true',
    PROFILE_D1_SHADOW_MIRROR_SECRET: SECRET,
  };
  const unsigned = new Request('https://example.test/internal/profile/v1/authority', {
    method: 'POST',
    body: JSON.stringify({ writer: 'auth_edge', operation: 'delete_profile', userId: USER_ID }),
  });
  await assert.rejects(handleProfileAuthorityInternal(unsigned, env, NOW), /Unauthorized/);

  const fetcher = async (request: RequestInfo | URL, init?: RequestInit) => {
    const result = await handleProfileAuthorityInternal(new Request(request, init), env, NOW);
    return Response.json(result);
  };
  await callProfileAuthorityInternal({
    writer: 'auth_edge',
    operation: 'ensure_student_profile',
    userId: USER_ID,
    email: 'fixture@st.buh.edu.vn',
  }, {
    url: 'https://example.test/internal/profile/v1/authority',
    secret: SECRET,
    fetcher: fetcher as typeof fetch,
    now: NOW,
    nonce: '22222222-2222-4222-8222-222222222222',
  });
  const map = await callProfileAuthorityInternal<{ success: true; data: unknown[] }>({
    writer: 'courses_edge',
    operation: 'read_profile_map',
    userIds: [USER_ID],
  }, {
    url: 'https://example.test/internal/profile/v1/authority',
    secret: SECRET,
    fetcher: fetcher as typeof fetch,
    now: NOW,
    nonce: '33333333-3333-4333-8333-333333333333',
  });
  assert.equal(map.data.length, 1);
  assert.equal(batches.length, 0, 'ensure on an existing row and read-map must be idempotent/read-only');
});

test('Auth/Courses and privileged browser Profile authority paths contain no Supabase write/fallback', () => {
  const auth = readFileSync(new URL('../supabase/functions/auth/index.ts', import.meta.url), 'utf8');
  const courses = readFileSync(new URL('../supabase/functions/courses/index.ts', import.meta.url), 'utf8');
  const utility = readFileSync(new URL('../utils/profilePrivate.ts', import.meta.url), 'utf8');
  const study = readFileSync(new URL('../hooks/useStudyData.ts', import.meta.url), 'utf8');
  const activityLogger = readFileSync(new URL('../utils/activityLogger.ts', import.meta.url), 'utf8');
  const moderatorNotifications = readFileSync(
    new URL('../supabase/functions/moderator-notifications/index.ts', import.meta.url),
    'utf8',
  );
  const dashboards = [
    '../components/Dashboard.tsx',
    '../components/MobileDashboard.tsx',
    '../components/AdminStudentExcelExportModal.tsx',
    '../components/AdminReports.tsx',
    '../components/ActivityLogModal.tsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

  const profileWrite = /\.from\(['"](?:profiles|profile_private_data)['"]\)(?:(?!\.from\().){0,300}\.(?:insert|upsert|update|delete)\(/gs;
  assert.equal([...auth.matchAll(profileWrite)].length, 0);
  assert.equal([...courses.matchAll(profileWrite)].length, 0);
  assert.doesNotMatch(courses, /ensureNotificationReceiverProfile|profile-private-map/);
  assert.doesNotMatch(utility, /from\(|getSession\(|falling back to Supabase|utils\/supabase/);
  assert.doesNotMatch(study, /fetchLegacyProfileData|STUDENT_PROFILE_TABLE|\.from\(['"]profiles['"]\)/);
  assert.doesNotMatch(activityLogger, /\.from\(['"](?:profiles|user_roles)['"]\)/);
  assert.doesNotMatch(moderatorNotifications, /\.from\(['"]profiles['"]\)/);
  assert.doesNotMatch(dashboards, /PROFILE_PRIVATE_TABLE|\.from\(['"]profiles['"]\)|\.from\(['"]profile_private_data['"]\)/);
});
