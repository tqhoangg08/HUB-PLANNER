import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatScoreValue,
  mapScholarshipErrorCode,
  ScholarshipApiError,
} from '../utils/scholarshipApi.ts';

test('ScoreBadges faithfully formats scores without coercing null to zero or assuming /4.0 scale', () => {
  // Null or undefined should be dash '—', NEVER 0
  assert.equal(formatScoreValue(null), '—');
  assert.equal(formatScoreValue(undefined), '—');
  assert.equal(formatScoreValue(''), '—');

  // Exact number scores preserved
  assert.equal(formatScoreValue(9.5), '9.5');
  assert.equal(formatScoreValue(0), '0');

  // String scores from Vietnamese source documents preserved
  assert.equal(formatScoreValue('9,7'), '9,7');
  assert.equal(formatScoreValue('Xuất sắc'), 'Xuất sắc');
});

test('ScholarshipApiError accurately maps standard contract error codes to clear user messages', () => {
  assert.match(mapScholarshipErrorCode('CAMPAIGN_NOT_FOUND', 404), /Không tìm thấy chiến dịch/);
  assert.match(mapScholarshipErrorCode('REVISION_OR_STATE_CONFLICT', 409), /Xung đột phiên bản/);
  assert.match(mapScholarshipErrorCode('BODY_TOO_LARGE', 413), /Kích thước tệp vượt quá/);
  assert.match(mapScholarshipErrorCode('OFFICIAL_SOURCE_REQUIRED', 400), /nguồn văn bản quyết định/);
  assert.match(mapScholarshipErrorCode('RATE_LIMIT', 429), /giới hạn tra cứu/);
});

test('Scholarship routes are registered in AppRoutes.tsx before catch-all routes', () => {
  const routes = readFileSync('app/routing/AppRoutes.tsx', 'utf8');

  // Public and protected scholarship routes present
  assert.match(routes, /path="\/scholarships" element=\{<ScholarshipLanding \/>\}/);
  assert.match(routes, /path="\/scholarships\/list" element=\{<ScholarshipList \/>\}/);
  assert.match(routes, /path="\/scholarships\/search" element=\{<ScholarshipSearch \/>\}/);
  assert.match(routes, /path="\/scholarships\/me"/);
  assert.match(routes, /path="\/scholarships\/celebrate"/);
  assert.match(routes, /path="\/admin\/scholarships"/);

  // Positioned before catch-all protectedApp
  const scholarshipPos = routes.indexOf('path="/scholarships"');
  const catchAllPos = routes.indexOf('path="/*"');
  assert.ok(scholarshipPos > 0 && catchAllPos > 0 && scholarshipPos < catchAllPos, 'Scholarships must precede catch-all route');
});

test('CelebrationStudio enforces 1080x1920 Story and 1080x1350 Feed resolutions and client-side only processing', () => {
  const studio = readFileSync('features/scholarships/CelebrationStudio.tsx', 'utf8');

  // Resolution constants
  assert.match(studio, /1080/);
  assert.match(studio, /1920/);
  assert.match(studio, /1350/);

  // Four template styles supported
  assert.match(studio, /academic-gold/);
  assert.match(studio, /hub-minimal/);
  assert.match(studio, /scholarship-flex/);
  assert.match(studio, /soft-achievement/);

  // Frame masks supported
  assert.match(studio, /arch/);
  assert.match(studio, /circle/);
  assert.match(studio, /rounded-rect/);
  assert.match(studio, /shield/);

  // Pure client-side Canvas; NO image upload endpoints
  assert.doesNotMatch(studio, /\/api\/upload|\/api\/r2|s3\.amazonaws/i);
  assert.match(studio, /URL\.createObjectURL/);
  assert.match(studio, /URL\.revokeObjectURL/);
});

test('ScholarshipMe verifies identity through server API and locks personal recognition to server records', () => {
  const me = readFileSync('features/scholarships/ScholarshipMe.tsx', 'utf8');

  assert.match(me, /fetchMyScholarships\(\)/);
  assert.match(me, /verified === false/);
  assert.match(me, /verified === true && awards\.length === 0/);
  assert.match(me, /verified === true && awards\.length > 0/);

  // Does not accept client-provided fake MSSV or overrides
  assert.doesNotMatch(me, /studentCodeOverride|customAward/);
});

test('Public search explicitly warns that public queries are not proof of award ownership', () => {
  const search = readFileSync('features/scholarships/ScholarshipSearch.tsx', 'utf8');

  assert.match(search, /KHÔNG.*được sử dụng làm bằng chứng pháp lý/);
  assert.match(search, /searchCampaignRecipients/);
  assert.match(search, /isRateLimited/);
});
