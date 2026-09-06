import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchProfileForRoute, isOwnProfileRoute } from '../utils/profileRouteApi.ts';

const STUDENT_CODE = '030123456789';
const OTHER_CODE = '030123456788';

const ownProfilePayload = {
  success: true,
  publicProfile: {
    id: '11111111-1111-4111-8111-111111111111',
    student_code: STUDENT_CODE,
    full_name: 'Own profile',
    public_profile_enabled: false,
  },
  privateProfile: { data: { studentId: STUDENT_CODE } },
};

test('own profile uses only the authenticated private profile API, including reload', async () => {
  const calls: string[] = [];
  const fetchers = {
    fetchOwnProfile: async () => { calls.push('private'); return ownProfilePayload; },
    fetchPublicProfile: async () => { calls.push('public'); throw new Error('must not run'); },
  };
  assert.equal(isOwnProfileRoute(STUDENT_CODE, STUDENT_CODE), true);
  const first = await fetchProfileForRoute(STUDENT_CODE, STUDENT_CODE, 'user-id', fetchers);
  const reload = await fetchProfileForRoute(STUDENT_CODE, STUDENT_CODE, 'user-id', fetchers);
  assert.equal(first.student_code, STUDENT_CODE);
  assert.equal(first.isPrivatePreview, true);
  assert.equal(reload.isOwnProfile, true);
  assert.deepEqual(calls, ['private', 'private']);
});

test('OAuth user resolves own MSSV from the private profile instead of the email local part', async () => {
  const calls: string[] = [];
  const result = await fetchProfileForRoute(STUDENT_CODE, 'google-account', 'user-id', {
    fetchOwnProfile: async () => { calls.push('private'); return ownProfilePayload; },
    fetchPublicProfile: async () => { calls.push('public'); throw new Error('must not run'); },
  });
  assert.equal(result.isOwnProfile, true);
  assert.deepEqual(calls, ['private']);
});

test('other profiles remain restricted to the public API', async () => {
  const calls: string[] = [];
  const fetchers = {
    fetchOwnProfile: async () => { calls.push('private'); return ownProfilePayload; },
    fetchPublicProfile: async (studentCode: string) => {
      calls.push(`public:${studentCode}`);
      if (studentCode === OTHER_CODE) return { student_code: OTHER_CODE, public_profile_enabled: true };
      throw new Error('Không tìm thấy hồ sơ công khai.');
    },
  };
  const visible = await fetchProfileForRoute(OTHER_CODE, STUDENT_CODE, 'user-id', fetchers);
  assert.equal(visible.student_code, OTHER_CODE);
  assert.equal(visible.isOwnProfile, false);

  await assert.rejects(fetchProfileForRoute(STUDENT_CODE, '', null, fetchers), /Không tìm thấy hồ sơ công khai/);
  assert.deepEqual(calls, ['private', `public:${OTHER_CODE}`, `public:${STUDENT_CODE}`]);
});

test('student-code ownership matching is exact', () => {
  assert.equal(isOwnProfileRoute(STUDENT_CODE, STUDENT_CODE), true);
  assert.equal(isOwnProfileRoute(`${STUDENT_CODE}0`, STUDENT_CODE), false);
  assert.equal(isOwnProfileRoute(STUDENT_CODE.slice(0, -1), STUDENT_CODE), false);
  assert.equal(isOwnProfileRoute(STUDENT_CODE, ''), false);
});
