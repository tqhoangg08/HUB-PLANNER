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

test('Scholarship routes are registered in AppRoutes.tsx with /scholarships as default and list/search redirected', () => {
  const routes = readFileSync('app/routing/AppRoutes.tsx', 'utf8');

  // Default /scholarships page mounts ScholarshipList
  assert.match(routes, /path="\/scholarships" element=\{<ScholarshipList \/>\}/);

  // Deep-links /scholarships/list and /scholarships/search redirect to /scholarships preserving query
  assert.match(routes, /path="\/scholarships\/list" element=\{<ScholarshipRedirect \/>\}/);
  assert.match(routes, /path="\/scholarships\/search" element=\{<ScholarshipRedirect \/>\}/);
  assert.match(routes, /ScholarshipRedirect/);
  assert.match(routes, /location\.search/);

  // Protected & admin routes
  assert.match(routes, /path="\/scholarships\/me"/);
  assert.match(routes, /path="\/scholarships\/celebrate"/);
  assert.match(routes, /path="\/admin\/scholarships"/);

  // Positioned before catch-all protectedApp
  const scholarshipPos = routes.indexOf('path="/scholarships"');
  const catchAllPos = routes.indexOf('path="/*"');
  assert.ok(scholarshipPos > 0 && catchAllPos > 0 && scholarshipPos < catchAllPos, 'Scholarships must precede catch-all route');
});

test('Unified ScholarshipList page follows the exact 8-part sequential information architecture and in-table search', () => {
  const listPage = readFileSync('features/scholarships/ScholarshipList.tsx', 'utf8');

  // 1 & 2: Title & One-sentence description
  assert.match(listPage, /Danh sách học bổng/);
  assert.match(listPage, /Tra cứu kết quả học bổng khuyến khích học tập/);

  // 3: Search input
  assert.match(listPage, /placeholder="Tìm theo họ tên hoặc mã sinh viên\.\.\."/);
  assert.match(listPage, /searchCampaignRecipients/);

  // Search input debounce and cancellation
  assert.match(listPage, /setTimeout/);
  assert.match(listPage, /abortCtrl/);

  // Minimum 2-character requirement guard (does not dispatch 1-char queries to search API)
  assert.match(listPage, /debouncedQuery\.length === 1/);

  // 4: Filters
  assert.match(listPage, /campaignSelectId/);
  assert.match(listPage, /categorySelectId/);

  // 5: Result count
  assert.match(listPage, /total\.toLocaleString\('vi-VN'\)/);

  // 6: Table & Mobile view with dynamic scoreColumns
  assert.match(listPage, /scoreColumns/);
  assert.match(listPage, /formatScoreValue/);

  // 7: Pagination
  assert.match(listPage, /totalPages/);

  // 8: Official provenance
  assert.match(listPage, /Nguồn văn bản quyết định/);
  assert.match(listPage, /sourceDocument/);
  assert.match(listPage, /sourceUrl/);
});

test('CelebrationStudio enforces 1080x1920 Story and 1080x1350 Feed resolutions and client-side only processing with server re-verification', () => {
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

  // Re-verifies scholarship before export/share
  assert.match(studio, /recheck = await fetchMyScholarships\(\)/);
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
