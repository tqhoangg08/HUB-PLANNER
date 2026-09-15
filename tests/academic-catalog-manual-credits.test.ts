import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ACADEMIC_COHORT_OPTIONS,
  getMajors,
  isManualTotalCreditsCohort,
  resolveTotalCreditsRequired,
} from '../utils/programs.ts';

const names = (program: string, cohort: string) => getMajors(program, cohort).map(major => major.name);

test('new cohorts use their own catalog instead of historical fallbacks', () => {
  assert.equal(getMajors('standard', 'K42').length, 20);
  assert.deepEqual(getMajors('standard', 'K42')[0].specializations.map(item => item.name), [
    'Tài chính', 'Ngân hàng số và chuỗi khối', 'Tài chính định lượng và quản trị rủi ro', 'Tài chính và quản trị doanh nghiệp',
  ]);
  assert.deepEqual(names('tabp', 'CLCK14'), ['Tài chính – Ngân hàng', 'Kế toán', 'Kinh doanh quốc tế', 'Quản trị kinh doanh', 'Hệ thống thông tin quản lý', 'Kinh tế quốc tế', 'Thương mại điện tử', 'Luật kinh tế']);
  assert.deepEqual(names('special', 'CTDBK3'), ['Ngôn ngữ Anh']);
  assert.deepEqual(names('elite', 'K1'), ['Tài chính – Ngân hàng']);
  assert.deepEqual(names('elite', 'K2'), ['Tài chính – Ngân hàng']);
  assert.deepEqual(names('international-dual-degree', 'K7'), ['Quản trị kinh doanh', 'Tài chính – Ngân hàng']);
  assert.deepEqual(names('international-dual-degree', 'K8'), ['Quản trị kinh doanh', 'Tài chính – Ngân hàng']);
  assert.deepEqual(ACADEMIC_COHORT_OPTIONS.standard, ['K38', 'K39', 'K40', 'K41', 'K42']);
  assert.deepEqual(ACADEMIC_COHORT_OPTIONS.tabp, ['CLCK10', 'CLCK11', 'CLCK12', 'CLCK13', 'CLCK14']);
});

test('old cohorts retain automatic credits while every new cohort is manual', () => {
  for (const [program, cohort] of [['standard', 'K42'], ['tabp', 'CLCK14'], ['special', 'CTDBK3'], ['elite', 'K1'], ['elite', 'K2'], ['international-dual-degree', 'K7'], ['international-dual-degree', 'K8']] as const) {
    assert.equal(isManualTotalCreditsCohort(program, cohort), true);
  }
  assert.equal(isManualTotalCreditsCohort('standard', 'K41'), false);
  assert.equal(isManualTotalCreditsCohort('tabp', 'CLCK13'), false);
  assert.equal(isManualTotalCreditsCohort('special', 'CTDBK2'), false);
  for (const [program, cohort] of [['standard', 'K38'], ['standard', 'K39'], ['standard', 'K40'], ['standard', 'K41'], ['tabp', 'CLCK10'], ['tabp', 'CLCK11'], ['tabp', 'CLCK12'], ['tabp', 'CLCK13'], ['special', 'CTDBK1'], ['special', 'CTDBK2']] as const) {
    assert.ok(getMajors(program, cohort).length > 0);
    assert.ok(getMajors(program, cohort).every(major => major.specializations.every(item => Number.isInteger(item.credits) && item.credits! > 0)));
  }
  const old = getMajors('standard', 'K40')[0].specializations[0];
  assert.equal(resolveTotalCreditsRequired({ programName: 'Đại học chính quy chuẩn', cohort: 'K40', specializationName: old.name, storedCredits: 0 }), old.credits);
  assert.equal(resolveTotalCreditsRequired({ programName: 'Đại học chính quy chuẩn', cohort: 'K42', specializationName: 'Tài chính', storedCredits: 0 }), 0);
  assert.equal(resolveTotalCreditsRequired({ programName: 'ĐHCQ Tiếng Anh bán phần (TABP/CLC)', cohort: 'CLCK14', specializationName: 'Kế toán', storedCredits: 0 }), 0);
  assert.equal(resolveTotalCreditsRequired({ programName: 'ĐHCQ Chương trình đặc biệt', cohort: 'CTDBK3', specializationName: 'Ngôn ngữ Anh', storedCredits: 0 }), 0);
});

test('manual total credits are preserved across specialization changes and legacy derived values do not cross cohorts', () => {
  const manual = resolveTotalCreditsRequired({ programName: 'Đại học chính quy chuẩn', cohort: 'K42', specializationName: 'Tài chính', storedCredits: 137 });
  assert.equal(resolveTotalCreditsRequired({ programName: 'Đại học chính quy chuẩn', cohort: 'K42', specializationName: 'Ngân hàng số và chuỗi khối', storedCredits: manual }), 137);
  assert.equal(resolveTotalCreditsRequired({ programName: 'Đại học chính quy chuẩn', cohort: 'K42', specializationName: 'Tài chính', storedCredits: 0 }), 0);
  const old = getMajors('standard', 'K41')[0].specializations[0];
  assert.equal(resolveTotalCreditsRequired({ programName: 'Đại học chính quy chuẩn', cohort: 'K41', specializationName: old.name, storedCredits: 0 }), old.credits);
  const onboarding = readFileSync('components/Onboarding.tsx', 'utf8');
  const profile = readFileSync('hooks/useAccountProfileDraft.ts', 'utf8');
  assert.match(onboarding, /Tổng số tín chỉ chương trình \(nếu biết\)/);
  assert.match(profile, /draftManualTotalCredits/);
});
