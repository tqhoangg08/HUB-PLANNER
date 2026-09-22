import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isStudentProfileComplete } from '../shared/student-profile-completeness.ts';

const source = (path: string) => readFileSync(path, 'utf8');

test('student profile completeness requires all public and private required fields', () => {
  const complete = {
    fullName: 'Nguyễn Văn A', className: 'DH26CNTT', programName: 'Chính quy',
    cohort: '2026', majorName: 'Công nghệ thông tin', specializationName: 'Kỹ thuật phần mềm',
  };
  assert.equal(isStudentProfileComplete(complete), true);
  assert.equal(isStudentProfileComplete({ ...complete, className: '' }), false);
  assert.equal(isStudentProfileComplete({ ...complete, majorName: '' }), false);
});

test('onboarding persists full name and class before local completion or navigation', () => {
  const hook = source('hooks/useStudyData.ts');
  const onboarding = source('components/Onboarding.tsx');
  const app = source('LegacyApp.tsx');
  assert.match(onboarding, /Họ tên sinh viên \*/);
  assert.match(onboarding, /Lớp \*/);
  assert.match(onboarding, /await onComplete\(/);
  assert.match(hook, /await updateOwnPrivateProfile\([\s\S]*full_name: fullName, class_name: className/);
  assert.ok(hook.indexOf('await updateOwnPrivateProfile') < hook.indexOf('loadDataIntoState(nextData)'));
  assert.match(app, /await completeOnboarding\(onboardingData\);[\s\S]*navigate/);
});

test('account settings expose one required canonical name and one required class', () => {
  const publicFields = source('components/account/AccountPublicProfileFields.tsx');
  const academicFields = source('components/account/AccountAcademicProfileFields.tsx');
  const draft = source('hooks/useAccountProfileDraft.ts');
  assert.match(publicFields, /Họ tên sinh viên/);
  assert.match(publicFields, /Lớp <span className="text-red-500">\*<\/span>/);
  assert.doesNotMatch(academicFields, /Tên sinh viên \(Tùy chọn\)/);
  assert.doesNotMatch(draft, /draftStudentName/);
  assert.match(draft, /studentName: draftFullName\.trim\(\)/);
});

test('admin and Worker derive status/name from canonical completeness rather than stale flags', () => {
  const worker = source('cloudflare/worker/src/profile-shadow.ts');
  const admin = source('cloudflare/worker/src/admin-students.ts');
  assert.match(worker, /derivePrivateAuthorityFields/);
  assert.match(worker, /normalized\.hasOnboarded = complete/);
  assert.match(admin, /canonicalName\(row\.full_name\) \|\| canonicalName\(row\.student_name\) \|\| names\.get/);
  assert.match(admin, /status: complete \? 'onboarded' : 'pending'/);
});
