import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatScoreValue,
  mapScholarshipErrorCode,
  ScholarshipApiError,
  fetchAllPublicCampaigns,
  fetchCampaignRecipients,
  searchCampaignRecipients,
  fetchMyScholarships,
  fetchCampaignFacets,
  type Campaign,
  type OwnAward,
} from '../utils/scholarshipApi.ts';
import { approvedScoreColumns, scholarshipPage, updateScholarshipParams, scholarshipLoginReturn, resetScholarshipFilters } from '../utils/scholarshipListModel.ts';
import { celebrationScoreLines, refreshedOwnAward } from '../utils/scholarshipCelebrationModel.ts';

test('celebration wraps all approved score values without dropping Vietnamese or long source text', () => {
  const parts = ['GPA: 9.5', 'ACADEMICRANK: Giỏi', 'TRAININGSCORE: 90', 'TRAININGRANK: Xuất sắc', 'CREDITS: 18'];
  const lines = celebrationScoreLines(parts, text => Array.from(text).length * 14, 920);
  assert.ok(lines.length > 1);
  assert.deepEqual(lines.join('  |  ').split('  |  '), parts);
  assert.ok(lines.every(line => Array.from(line).length * 14 <= 920));
  const longValue = 'Nguồn ghi nguyên văn '.repeat(20);
  assert.deepEqual(celebrationScoreLines([longValue, 'Điểm: 0'], text => text.length * 14, 920), [longValue, 'Điểm: 0']);
  assert.deepEqual(celebrationScoreLines([], text => text.length, 920), []);
});

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

test('backend failure stays an error with Vietnamese text rather than an empty published list', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [502, 503]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Dev backend unavailable' }), { status, headers: { 'Content-Type': 'application/json' } });
      await assert.rejects(fetchAllPublicCampaigns(), (error: unknown) => error instanceof ScholarshipApiError && error.status === status && /Không thể kết nối/.test(error.message) && !/Dev backend/.test(error.message));
      await assert.rejects(fetchCampaignRecipients('hk1'), (error: unknown) => error instanceof ScholarshipApiError && error.status === status);
    }
  } finally { globalThis.fetch = original; }
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

test('Canva list has merged accurate names, approved score columns and no decorative row badges', () => {
  const listPage = readFileSync('features/scholarships/ScholarshipList.tsx', 'utf8');

  // 1 & 2: Title & One-sentence description
  assert.match(listPage, /Danh sách sinh viên nhận học bổng/);
  assert.match(listPage, /Tra cứu danh sách sinh viên nhận học bổng theo từng học kỳ/);

  // 3: Search input
  assert.match(listPage, /placeholder="Nhập mã sinh viên hoặc họ tên\.\.\."/);
  assert.match(listPage, /searchCampaignRecipients/);

  // Search input debounce and cancellation
  assert.match(listPage, /setTimeout/);
  assert.match(listPage, /controller\.abort/);

  // Minimum 2-character requirement guard (does not dispatch 1-char queries to search API)
  assert.match(listPage, /query\.length === 1/);

  // 4: Filters
  assert.match(listPage, /Học kỳ \/ Năm học/);
  assert.match(listPage, /Họ và tên/);
  assert.doesNotMatch(listPage, /ScholarshipBadge|ScoreBadges|ConfettiOverlay/);

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

  assert.match(me, /fetchMyScholarships\(controller.signal\)/);
  assert.match(me, /verified === false/);
  assert.match(me, /verified === true && awards\.length === 0/);
  assert.match(me, /verified === true && awards\.length > 0/);

  // Does not accept client-provided fake MSSV or overrides
  assert.doesNotMatch(me, /studentCodeOverride|customAward/);
});

test('URL model preserves unrelated deep-link params, resets page and bounds invalid pagination', () => {
  const params = updateScholarshipParams(new URLSearchParams('q=old&page=3&campaign=hk1&ref=canva'), { q: 'Nguyễn', page: '' });
  assert.equal(params.get('ref'), 'canva'); assert.equal(params.get('campaign'), 'hk1');
  assert.equal(params.get('q'), 'Nguyễn'); assert.equal(params.has('page'), false);
  for (const value of ['0', '-1', '1e2', '10001', '', null]) assert.equal(scholarshipPage(value), 1);
  assert.equal(scholarshipPage('9999'), 9999);
});

test('score fields require individual explicit approval even if metadata contains a stale private column', () => {
  const campaign = { approvedFields: ['scores.gpa'], scoreColumns: [{ key: 'gpa', label: 'Điểm' }, { key: 'private', label: 'Private' }] } as Campaign;
  assert.deepEqual(approvedScoreColumns(campaign), [{ key: 'gpa', label: 'Điểm' }]);
});

test('login return only permits scholarship paths; rejects external and protocol-relative redirects', () => {
  assert.equal(scholarshipLoginReturn('/scholarships/celebrate?awardId=1'), '/scholarships/celebrate?awardId=1');
  for (const path of ['https://evil.test/scholarships', '//evil.test/scholarships', '/admin', '/scholarships/../admin', '/\\evil.test', null]) assert.equal(scholarshipLoginReturn(path), '/dashboard');
});

test('celebration uses refreshed approved record and denies unverified, removed or changed ownership', () => {
  const selected = { id: 1, campaignSlug: 'hk1', studentCode: '000000000001', scores: { gpa: 9 } } as OwnAward;
  const fresh = { ...selected, scores: {} };
  assert.equal(refreshedOwnAward({ verified: true, awards: [fresh] }, selected), fresh);
  assert.equal(refreshedOwnAward({ verified: false, awards: [fresh] }, selected), null);
  assert.equal(refreshedOwnAward({ verified: true, awards: [] }, selected), null);
  assert.equal(refreshedOwnAward({ verified: true, awards: [{ ...fresh, studentCode: '000000000002' }] }, selected), null);
});

test('campaign client paginates beyond 50 and fails incomplete pagination rather than silently truncating', async () => {
  const originalFetch = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = (async input => {
    calls.push(String(input));
    return Response.json({ campaigns: Array.from({ length: calls.length === 1 ? 50 : 1 }, (_, i) => ({ slug: String(i) })), total: 51, page: calls.length, limit: 50 });
  }) as typeof fetch;
  try {
    assert.equal((await fetchAllPublicCampaigns()).length, 51);
    assert.match(calls[1], /page=2/);
    globalThis.fetch = (async () => Response.json({ campaigns: [], total: 51, page: 1, limit: 50 })) as typeof fetch;
    await assert.rejects(fetchAllPublicCampaigns(), /Incomplete/);
  } finally { globalThis.fetch = originalFetch; }
});

test('search sends filters to backend and personal API sends cookies without client identity selectors', async () => {
  const originalFetch = globalThis.fetch; const calls: { url: string; init: RequestInit }[] = [];
  const controller = new AbortController();
  globalThis.fetch = (async (input, init) => { calls.push({ url: String(input), init: init || {} }); return Response.json({}); }) as typeof fetch;
  try {
    await searchCampaignRecipients('hk1', { q: 'Nguyễn', page: 2, limit: 20, awardType: 'Giỏi' }, controller.signal);
    const url = new URL(calls[0].url, 'https://test.invalid');
    assert.equal(url.searchParams.get('q'), 'Nguyễn'); assert.equal(url.searchParams.get('awardType'), 'Giỏi');
    assert.equal(url.searchParams.get('page'), '2'); assert.equal(calls[0].init.signal, controller.signal);
    await fetchMyScholarships(controller.signal);
    assert.equal(calls[1].url, '/api/me/scholarships'); assert.equal(calls[1].init.credentials, 'include');
  } finally { globalThis.fetch = originalFetch; }
});

test('combined filters reset pagination and clearing preserves campaign and unrelated URL state', () => {
  const before=new URLSearchParams('campaign=hk1&q=An&scholarshipType=KKHT&scholarshipRank=Giỏi&major=Kế+toán&className=C1&cohort=K24&page=4&limit=30&ref=share');
  const changed=updateScholarshipParams(before,{cohort:'K23',page:''});assert.equal(changed.get('major'),'Kế toán');assert.equal(changed.has('page'),false);
  const cleared=resetScholarshipFilters(changed);assert.equal(cleared.get('campaign'),'hk1');assert.equal(cleared.get('ref'),'share');assert.equal(cleared.get('limit'),'30');assert.equal(cleared.has('q'),false);assert.equal(cleared.has('scholarshipType'),false);assert.equal(cleared.has('cohort'),false);
});

test('recipient/search clients send every independent AND filter without legacy alias inference', async () => {
  const original=globalThis.fetch;const calls:string[]=[];globalThis.fetch=(async input=>{calls.push(String(input));return Response.json({});}) as typeof fetch;
  try { const filters={q:'Đặng',scholarshipType:'KKHT',scholarshipRank:'Giỏi',major:'Kế toán',className:'C1',cohort:'K24',page:2,limit:20};
    await fetchCampaignRecipients('hk1',filters);await searchCampaignRecipients('hk1',filters);
    for(const path of calls){ const params=new URL(path,'https://test.invalid').searchParams;for(const [key,value] of Object.entries(filters))assert.equal(params.get(key),String(value));assert.equal(params.has('awardType'),false); }
  }finally{globalThis.fetch=original;}
});

test('facet adapter paginates metadata and rejects incompatible contracts rather than invent options', async () => {
  const original=globalThis.fetch;const calls:string[]=[];
  globalThis.fetch=(async input=>{calls.push(String(input));const page=calls.length;return Response.json({apiVersion:'1.1.0',campaign:{slug:'hk1'},supportedFilters:['className'],totalRecipients:201,facets:{...Object.fromEntries(['scholarshipType','scholarshipRank','major','cohort'].map(key=>[key,{options:[],total:0,page,limit:200}])),className:{options:page===1?Array.from({length:200},(_,i)=>'C'+i):['C200'],total:201,page,limit:200}}});}) as typeof fetch;
  try { const result=await fetchCampaignFacets('hk1',{major:'Kế toán',cohort:'K24'});assert.equal(result.facets.className.options.length,201);assert.match(calls[1],/facetPage=2/);assert.equal(new URL(calls[0],'https://test.invalid').searchParams.get('major'),'Kế toán');
    globalThis.fetch=async()=>Response.json({apiVersion:'1.0.0'});await assert.rejects(fetchCampaignFacets('hk1'),/chưa sẵn sàng/);
    globalThis.fetch=async()=>Response.json({apiVersion:'1.1.0',supportedFilters:[],facets:{}});await assert.rejects(fetchCampaignFacets('hk1'),/không hợp lệ/);
  }finally{globalThis.fetch=original;}
});

test('Better Auth display avatar/name survives role reconciliation without trusting a client role', async () => {
  const {fetchBetterAuthSession}=await import('../utils/privateApi.ts');const original=globalThis.fetch;
  globalThis.fetch=async path=>Response.json(String(path)==='/api/auth/get-session'?{session:{id:'synthetic'},user:{id:'owner',email:'student@st.buh.edu.vn',name:'Tên từ Better Auth',image:'https://example.test/avatar.png',role:'admin'}}:{userId:'owner',email:'student@st.buh.edu.vn',role:'user'});
  try { const result=await fetchBetterAuthSession();assert.equal(result?.user.user_metadata.name,'Tên từ Better Auth');assert.equal(result?.user.user_metadata.avatar_url,'https://example.test/avatar.png');assert.equal(result?.role,'user'); } finally {globalThis.fetch=original;}
});
