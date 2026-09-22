import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  buildResolvedDocumentRetrievalQuestion,
  buildPolicyRetrievalInput,
  classifyAdvisorIntents,
  extractCourseCode,
  extractAdvisorPolicyScope,
  extractSearchTerms,
  handleAiAdvisor,
  isGroundedPolicyDeflection,
  resolveDocumentSources,
  resolveDocumentSourcesWithDiagnostics,
  retrieveAdvisorContext,
  routeAdvisorDocuments,
  selectAdvisorDocumentCandidates,
  selectDocumentSearchStrategy,
  sourceCoversRequestedScope,
  shouldUseDocumentSearch,
  withFileSearchDeadline,
} from '../cloudflare/worker/src/ai-advisor.ts';
import {
  buildDocumentCandidateMetadataFilter,
  buildGeminiPolicyContents,
  classifyGeminiInvalidArgument,
  extractGenerateContentDocumentSources,
  extractGeminiDocumentSources,
  extractOfficialDocumentApplicability,
  extractOfficialDocumentLocators,
  extractSafeGeminiApiErrorDiagnostics,
  GeminiFileSearchError,
} from '../cloudflare/worker/src/gemini-file-search.ts';
import { normalizeAiDocumentCategory } from '../shared/ai-document-categories.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOCUMENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOCUMENT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOCUMENT_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const assertCandidateFilter = (filter: string | undefined, ids: string[]) => {
  assert.match(String(filter), /^visibility = "public" AND \(/);
  for (const id of ids) assert.match(String(filter), new RegExp(`document_id = "${id}"`));
};

const makeDatabase = () => {
  const sql = new DatabaseSync(':memory:');
  const queries: string[] = [];
  sql.exec(`
    CREATE TABLE user_profile_private (
      user_id TEXT PRIMARY KEY, student_name TEXT, cohort TEXT, major_name TEXT,
      specialization_name TEXT, program_name TEXT, target_gpa REAL,
      total_credits_required INTEGER, has_onboarded INTEGER, semesters_json TEXT
    );
    CREATE TABLE user_schedules (id TEXT PRIMARY KEY, user_id TEXT, course_id TEXT, semester TEXT, created_at TEXT);
    CREATE TABLE course_schedules (
      id TEXT PRIMARY KEY, course_code TEXT, subject_name TEXT, credits INTEGER,
      prerequisite TEXT, instructor TEXT, semester TEXT, managing_faculty TEXT,
      shift TEXT, day_of_week TEXT, room TEXT, campus TEXT, catalogue_visibility TEXT,
      retired_at TEXT, course_code_search TEXT, subject_name_search TEXT, source_position INTEGER
    );
    CREATE TABLE public_events (
      id INTEGER PRIMARY KEY, title TEXT, organizer TEXT, deadline TEXT, event_date TEXT,
      location_type TEXT, status TEXT, link TEXT, is_deleted INTEGER, title_search TEXT, created_at TEXT
    );
    CREATE TABLE school_announcements (
      id INTEGER PRIMARY KEY, title TEXT, link TEXT, date TEXT, is_hidden INTEGER,
      title_search TEXT, created_at TEXT
    );
    CREATE TABLE public_lost_found_items (
      id INTEGER PRIMARY KEY, title TEXT, type TEXT, location TEXT, created_at TEXT,
      is_deleted INTEGER, status TEXT, title_search TEXT
    );
  `);
  sql.exec(readFileSync('cloudflare/migrations/0032_ai_documents_chat_d1_r2_authority.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0043_ai_chat_conversations.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0045_ai_document_public_view_policy.sql', 'utf8'));
  const prepare = (query: string) => {
    let bindings: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { bindings = values; return statement; },
      async first<T>() { queries.push(`${query}\n-- ${JSON.stringify(bindings)}`); return (sql.prepare(query).get(...bindings) || null) as T | null; },
      async all<T>() { queries.push(`${query}\n-- ${JSON.stringify(bindings)}`); return { results: sql.prepare(query).all(...bindings) as T[] }; },
      async run() {
        queries.push(`${query}\n-- ${JSON.stringify(bindings)}`);
        const result = sql.prepare(query).run(...bindings);
        return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
    return statement;
  };
  return { sql, queries, DB: { prepare } as unknown as D1Database };
};

const env = (DB: D1Database) => ({
  DB,
  AUTH_SERVICE: {
    async fetch() {
      return Response.json({ userId: USER, role: 'user', email: 'student@example.test' });
    },
  },
}) as never;

test('intent routing is deterministic and document retrieval is reserved for official-document questions', () => {
  assert.deepEqual(classifyAdvisorIntents('IT101 có mấy tín chỉ?'), ['course_catalog']);
  assert.deepEqual(classifyAdvisorIntents('Môn Advanced Writing có mấy tín chỉ?'), ['course_catalog']);
  assert.deepEqual(classifyAdvisorIntents('Tôi đã tích lũy bao nhiêu tín chỉ?'), ['student_academic']);
  assert.equal(extractCourseCode('ABC-123 có mở không?'), 'abc-123');
  assert.deepEqual(extractSearchTerms('Môn Advanced Writing có mấy tín chỉ?'), ['advanced', 'writing']);
  assert.deepEqual(extractSearchTerms('Sự kiện hiến máu sắp tới?'), ['hiến', 'máu']);
  assert.deepEqual(extractSearchTerms('Thông báo học phí mới nhất?'), ['học', 'phí']);
  assert.deepEqual(classifyAdvisorIntents('Sự kiện ĐRL và thông báo trường mới nhất'), ['school_announcement', 'event']);
  assert.equal(shouldUseDocumentSearch(classifyAdvisorIntents('Quy chế tốt nghiệp hiện hành')), true);
  assert.equal(shouldUseDocumentSearch(classifyAdvisorIntents('Lịch học của mình')), false);
  assert.deepEqual(routeAdvisorDocuments('hi bạn biết quy đổi điểm ở hub như nào không?'), {
    documentSearch: true,
    domain: 'grading',
    scope: { academicYear: null, cohortYear: null, fromCohortYear: null },
    coverageMode: true,
    academicYear: null,
  });
  assert.deepEqual(classifyAdvisorIntents('GPA của tôi 3.5 thì theo quy chế HUB xếp loại học lực gì?'), ['student_academic', 'regulation_document']);
  assert.equal(routeAdvisorDocuments('Điểm môn này là bao nhiêu?').documentSearch, false);
});

test('document routing carries only bounded prior user context for short policy follow-ups', () => {
  const history = [
    { role: 'user', content: 'quy đổi điểm thang 4 HUB như nào?' },
    { role: 'assistant', content: 'Một câu trả lời không phải authority.' },
  ];
  const followup2025 = routeAdvisorDocuments('còn khóa 2025 thì sao?', history);
  const followup2027 = routeAdvisorDocuments('2027 thì sao?', [...history, { role: 'user', content: 'còn khóa 2025 thì sao?' }]);
  assert.equal(followup2025.documentSearch, true);
  assert.equal(followup2025.domain, 'grading');
  assert.equal(followup2025.scope.cohortYear, 2025);
  assert.equal(followup2027.documentSearch, true);
  assert.equal(followup2027.domain, 'grading');
  assert.equal(followup2027.scope.cohortYear, 2027);
  const resolved = buildResolvedDocumentRetrievalQuestion('2027 thì sao?', followup2027);
  assert.match(resolved, /bảng quy đổi điểm/i);
  assert.match(resolved, /thang điểm 10/i);
  assert.match(resolved, /điểm chữ/i);
  assert.match(resolved, /hệ 4/i);
  assert.match(resolved, /khóa tuyển sinh=2027/i);
});

test('policy retrieval collapses bounded user-only context into exactly one GenerateContent user Content', () => {
  const current = 'mình khóa 2026 á, bạn có bảng quy đổi điểm không';
  const history = [
    { role: 'user', content: 'quy đổi điểm ở HUB như nào?' },
    { role: 'assistant', content: 'Không được dùng câu trả lời này làm nguồn.' },
    { role: 'user', content: 'khóa 2026 thì sao?' },
    { role: 'user', content: current },
  ];
  const route = routeAdvisorDocuments(current, history);
  const retrievalInput = buildPolicyRetrievalInput(history, current, route);
  const contents = buildGeminiPolicyContents(retrievalInput);
  assert.equal(route.domain, 'grading');
  assert.equal(route.scope.cohortYear, 2026);
  assert.equal(contents.length, 1);
  assert.equal(contents[0]?.role, 'user');
  assert.match(contents[0]?.parts[0]?.text || '', /quy đổi điểm ở HUB như nào\?/);
  assert.match(contents[0]?.parts[0]?.text || '', /khóa 2026 thì sao\?/);
  assert.match(contents[0]?.parts[0]?.text || '', /Miền chính sách đã xác định: grading/);
  assert.match(contents[0]?.parts[0]?.text || '', /cohortYear=2026/);
  assert.match(contents[0]?.parts[0]?.text || '', /bảng quy đổi điểm gồm thang điểm 10, điểm chữ và thang điểm hệ 4/);
  assert.doesNotMatch(contents[0]?.parts[0]?.text || '', /Không được dùng câu trả lời này làm nguồn/);
  assert.equal((contents[0]?.parts[0]?.text.match(/mình khóa 2026 á, bạn có bảng quy đổi điểm không/g) || []).length, 1);
});

test('elliptical grading and scholarship retrieval both keep a single user Content', () => {
  const history = [{ role: 'user', content: 'quy đổi điểm ở HUB như nào?' }];
  const gradingRoute = routeAdvisorDocuments('2027 thì sao?', history);
  const gradingContents = buildGeminiPolicyContents(buildPolicyRetrievalInput(history, '2027 thì sao?', gradingRoute));
  assert.equal(gradingRoute.domain, 'grading');
  assert.equal(gradingRoute.scope.cohortYear, 2027);
  assert.equal(gradingContents.length, 1);
  assert.match(gradingContents[0]?.parts[0]?.text || '', /khóa tuyển sinh=2027/);
  const scholarshipRoute = routeAdvisorDocuments('các loại học bổng ở HUB?');
  const scholarshipContents = buildGeminiPolicyContents(buildPolicyRetrievalInput([], 'các loại học bổng ở HUB?', scholarshipRoute));
  assert.equal(scholarshipRoute.domain, 'scholarship');
  assert.equal(scholarshipContents.length, 1);
  assert.equal(scholarshipContents[0]?.role, 'user');
});

test('policy scope keeps academic year distinct from intake/cohort year', () => {
  assert.deepEqual(extractAdvisorPolicyScope('khóa tuyển sinh năm 2026'), {
    academicYear: null, cohortYear: 2026, fromCohortYear: null,
  });
  assert.deepEqual(extractAdvisorPolicyScope('từ khóa 2027'), {
    academicYear: null, cohortYear: null, fromCohortYear: 2027,
  });
  assert.deepEqual(extractAdvisorPolicyScope('Cẩm nang sinh viên năm học 2025-2026'), {
    academicYear: '2025-2026', cohortYear: null, fromCohortYear: null,
  });
});

test('document search strategy is broad-first for coverage or scope and narrow-first for focused policy questions', () => {
  assert.equal(selectDocumentSearchStrategy(routeAdvisorDocuments('quy đổi điểm ở HUB như nào?')), 'broad_first');
  assert.equal(selectDocumentSearchStrategy(routeAdvisorDocuments('2027 thì sao?', [{ role: 'user', content: 'quy đổi điểm ở HUB như nào?' }])), 'broad_first');
  assert.equal(selectDocumentSearchStrategy(routeAdvisorDocuments('điểm F ở HUB là gì?')), 'narrow_first');
  assert.equal(selectDocumentSearchStrategy(routeAdvisorDocuments('học bổng tài năng là gì?')), 'narrow_first');
});

test('File Search deadline is bounded and classified without waiting indefinitely', async () => {
  await assert.rejects(
    withFileSearchDeadline(new Promise<never>(() => undefined), 10, 'test-model'),
    (error: unknown) => error instanceof GeminiFileSearchError && error.reason === 'GEMINI_REQUEST_TIMEOUT',
  );
});

test('Gemini API error diagnostics retain only bounded structural INVALID_ARGUMENT evidence', () => {
  const secretStore = 'fileSearchStores/private-production-store';
  const secretDocumentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const error = {
    name: 'ApiError',
    status: 400,
    message: JSON.stringify({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: `Invalid metadata_filter for ${secretStore}: document_id=${secretDocumentId}`,
        details: [{ reason: 'INVALID_METADATA_FILTER', domain: 'generativelanguage.googleapis.com' }],
      },
    }),
  };
  const diagnostic = extractSafeGeminiApiErrorDiagnostics(error, [secretStore]);
  assert.equal(diagnostic.status, 400);
  assert.equal(diagnostic.apiErrorStatusText, 'INVALID_ARGUMENT');
  assert.equal(diagnostic.apiErrorReason, 'INVALID_METADATA_FILTER@generativelanguage.googleapis.com');
  assert.equal(diagnostic.google400Classification, 'INVALID_ARGUMENT_METADATA_FILTER');
  assert.ok((diagnostic.apiErrorMessage || '').length <= 300);
  assert.doesNotMatch(diagnostic.apiErrorMessage || '', /private-production-store/);
  assert.doesNotMatch(diagnostic.apiErrorMessage || '', /aaaaaaaa-aaaa/);
});

test('Gemini INVALID_ARGUMENT classification requires field evidence', () => {
  assert.equal(classifyGeminiInvalidArgument(400, 'INVALID_ARGUMENT', 'contents[1].role is invalid', undefined), 'INVALID_ARGUMENT_CONTENTS');
  assert.equal(classifyGeminiInvalidArgument(400, 'INVALID_ARGUMENT', 'thinkingConfig.thinkingLevel is invalid', undefined), 'INVALID_ARGUMENT_THINKING_CONFIG');
  assert.equal(classifyGeminiInvalidArgument(400, 'INVALID_ARGUMENT', 'Invalid request', undefined), 'INVALID_ARGUMENT_UNKNOWN');
  assert.equal(
    classifyGeminiInvalidArgument(400, 'FAILED_PRECONDITION', 'User location is not supported for the API use.', undefined),
    'GEMINI_LOCATION_UNSUPPORTED',
  );
  assert.equal(classifyGeminiInvalidArgument(503, 'UNAVAILABLE', 'high demand', undefined), undefined);
});

const insertOfficialDocument = (fixture: ReturnType<typeof makeDatabase>, input: {
  id: string; title: string; category?: string | null; academicYear?: string | null;
  version?: number; indexingStatus?: string; visibility?: string; deletedAt?: string | null;
  updatedAt?: string;
}) => {
  const now = input.updatedAt || '2026-09-20T00:00:00.000Z';
  fixture.sql.prepare(`INSERT INTO ai_documents (
    id,title,original_file_name,storage_path,mime_type,file_size,content_hash,
    category,academic_year,program_code,visibility,version,indexing_status,uploaded_by,
    created_at,updated_at,deleted_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    input.id, input.title, `${input.title}.pdf`, `ai-documents/${input.id}.pdf`, 'application/pdf', 100,
    input.id.replace(/-/g, '').slice(0, 64).padEnd(64, '0'), input.category ?? 'grading', input.academicYear ?? null,
    'all', input.visibility || 'public', input.version || 1, input.indexingStatus || 'completed', USER,
    '2026-01-01T00:00:00.000Z', now, input.deletedAt ?? null,
  );
};

test('document citations are D1-validated and ordered by applicable academic-year then version', async () => {
  const fixture = makeDatabase();
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế 2026', academicYear: '2026-2027', version: 1 });
    insertOfficialDocument(fixture, { id: DOCUMENT_B, title: 'Quy chế 2027', academicYear: '2027-2028', version: 2 });
    const route = routeAdvisorDocuments('Quy đổi điểm cho năm học 2026-2027');
    const result = await resolveDocumentSources(env(fixture.DB), [
      { documentId: DOCUMENT_B, fileName: 'Quy chế 2027.pdf', pageNumber: 3 },
      { documentId: DOCUMENT_A, fileName: 'Quy chế 2026.pdf', pageNumber: 2 },
      { documentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', fileName: 'Không tồn tại.pdf' },
    ], route);
    assert.deepEqual(result.map((source) => source.documentId), [DOCUMENT_A, DOCUMENT_B]);
    assert.equal(result[0]?.title, 'Quy chế 2026');
    assert.equal(result.every((source) => source.inferredCurrent), true);
  } finally { fixture.sql.close(); }
});

test('deleted, non-completed and non-public Gemini citations are rejected by D1', async () => {
  const fixture = makeDatabase();
  try {
    const deleted = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const processing = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const adminOnly = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    insertOfficialDocument(fixture, { id: deleted, title: 'Đã xóa', deletedAt: '2026-09-20T00:00:00.000Z' });
    insertOfficialDocument(fixture, { id: processing, title: 'Đang lập chỉ mục', indexingStatus: 'processing' });
    insertOfficialDocument(fixture, { id: adminOnly, title: 'Nội bộ', visibility: 'admin' });
    const result = await resolveDocumentSources(env(fixture.DB), [
      { documentId: deleted, fileName: 'deleted.pdf', locators: ['Điều 21, khoản 2, điểm a'] },
      { documentId: processing, fileName: 'processing.pdf' },
      { documentId: adminOnly, fileName: 'admin.pdf' },
    ], routeAdvisorDocuments('Quy đổi điểm ở HUB'));
    assert.deepEqual(result, []);
  } finally { fixture.sql.close(); }
});

test('D1 citation resolution classifies unknown, inactive, and category-incompatible citations without writes', async () => {
  const fixture = makeDatabase();
  try {
    const inactive = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const unrelated = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    insertOfficialDocument(fixture, { id: inactive, title: 'Đã xóa', deletedAt: '2026-09-20T00:00:00.000Z' });
    insertOfficialDocument(fixture, { id: unrelated, title: 'Học phí', category: 'tuition' });
    const route = routeAdvisorDocuments('Quy đổi điểm ở HUB');
    const notFound = await resolveDocumentSourcesWithDiagnostics(env(fixture.DB), [
      { documentId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', fileName: 'missing.pdf' },
    ], route);
    const notActive = await resolveDocumentSourcesWithDiagnostics(env(fixture.DB), [
      { documentId: inactive, fileName: 'deleted.pdf' },
    ], route);
    const categoryRejected = await resolveDocumentSourcesWithDiagnostics(env(fixture.DB), [
      { documentId: unrelated, fileName: 'tuition.pdf' },
    ], route);
    assert.equal(notFound.reason, 'D1_CITATION_NOT_FOUND');
    assert.equal(notActive.reason, 'D1_CITATION_NOT_ACTIVE');
    assert.equal(categoryRejected.reason, 'D1_CITATION_CATEGORY_REJECTED');
    assert.equal(fixture.queries.some((query) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(query) && !/ai_chat_logs/i.test(query)), false);
  } finally { fixture.sql.close(); }
});

test('canonical categories normalize legacy labels without an online migration', () => {
  assert.equal(normalizeAiDocumentCategory('Quy chế'), 'training_regulation');
  assert.equal(normalizeAiDocumentCategory('quy định'), 'training_regulation');
  assert.equal(normalizeAiDocumentCategory('quy dinh'), 'training_regulation');
  assert.equal(normalizeAiDocumentCategory('Quy đổi điểm'), 'grading');
  assert.equal(normalizeAiDocumentCategory('Học phí'), 'tuition');
  assert.equal(normalizeAiDocumentCategory('grading'), 'grading');
  assert.equal(normalizeAiDocumentCategory('unclassified legacy text'), 'general');
});

test('D1 candidate selection is bounded, normalized, and excludes unrelated official categories', async () => {
  const fixture = makeDatabase();
  try {
    const training = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const handbook = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const tuition = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Thang điểm', category: 'grading' });
    insertOfficialDocument(fixture, { id: training, title: 'Quy chế', category: 'Quy chế' });
    insertOfficialDocument(fixture, { id: handbook, title: 'Cẩm nang', category: 'student_handbook' });
    insertOfficialDocument(fixture, { id: tuition, title: 'Học phí', category: 'tuition' });
    const grading = await selectAdvisorDocumentCandidates(env(fixture.DB), routeAdvisorDocuments('quy đổi điểm ở HUB như nào?'));
    assert.deepEqual(new Set(grading.map((candidate) => candidate.id)), new Set([DOCUMENT_A, training, handbook]));
    assert.equal(grading.some((candidate) => candidate.id === tuition), false);
    assert.equal(grading.find((candidate) => candidate.id === training)?.category, 'training_regulation');
    assertCandidateFilter(buildDocumentCandidateMetadataFilter(grading.map((candidate) => candidate.id)) || '', [DOCUMENT_A, training, handbook]);
    assert.equal(fixture.queries.filter((query) => query.includes('FROM ai_documents')).length, 1);
  } finally { fixture.sql.close(); }
});

test('scholarship candidates include only its bounded official category set', async () => {
  const fixture = makeDatabase();
  try {
    const handbook = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const general = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const grading = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const tuition = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Học bổng', category: 'scholarship' });
    insertOfficialDocument(fixture, { id: handbook, title: 'Cẩm nang', category: 'student_handbook' });
    insertOfficialDocument(fixture, { id: general, title: 'Khác', category: 'general' });
    insertOfficialDocument(fixture, { id: grading, title: 'Thang điểm', category: 'grading' });
    insertOfficialDocument(fixture, { id: tuition, title: 'Học phí', category: 'tuition' });
    const candidates = await selectAdvisorDocumentCandidates(env(fixture.DB), routeAdvisorDocuments('các loại học bổng ở HUB?'));
    assert.deepEqual(new Set(candidates.map((candidate) => candidate.id)), new Set([DOCUMENT_A, handbook, general]));
  } finally { fixture.sql.close(); }
});

test('candidate metadata filters reject non-authoritative IDs and never interpolate arbitrary text', () => {
  assert.equal(buildDocumentCandidateMetadataFilter(['not-a-uuid', '" OR visibility = "admin']), null);
});

test('production File Search runtime uses GenerateContent, not Interactions', () => {
  const source = readFileSync('cloudflare/worker/src/gemini-file-search.ts', 'utf8');
  assert.match(source, /ai\.models\.generateContent/);
  assert.doesNotMatch(source, /ai\.interactions\.create/);
  assert.match(source, /maxOutputTokens:\s*FILE_SEARCH_MAX_OUTPUT_TOKENS/);
});

test('bounded official category compatibility accepts student handbooks but rejects unrelated domains', async () => {
  const fixture = makeDatabase();
  try {
    const regulation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const general = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const tuition = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const handbook = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const scholarship = '12121212-1212-4121-8121-121212121212';
    const directGrading = '34343434-3434-4343-8343-343434343434';
    insertOfficialDocument(fixture, { id: regulation, title: 'Quy chế', category: 'Quy chế' });
    insertOfficialDocument(fixture, { id: general, title: 'Khác', category: 'general' });
    insertOfficialDocument(fixture, { id: tuition, title: 'Học phí', category: 'tuition' });
    insertOfficialDocument(fixture, { id: handbook, title: 'Cẩm nang', category: 'student_handbook' });
    insertOfficialDocument(fixture, { id: scholarship, title: 'Học bổng', category: 'scholarship' });
    insertOfficialDocument(fixture, { id: directGrading, title: 'Thang điểm', category: 'grading' });
    const cited = [
      { documentId: regulation, fileName: 'regulation.pdf' },
      { documentId: general, fileName: 'general.pdf' },
      { documentId: tuition, fileName: 'tuition.pdf' },
      { documentId: handbook, fileName: 'handbook.pdf' },
      { documentId: scholarship, fileName: 'scholarship.pdf' },
      { documentId: directGrading, fileName: 'grading.pdf' },
    ];
    const grading = await resolveDocumentSourcesWithDiagnostics(env(fixture.DB), cited, routeAdvisorDocuments('Quy đổi điểm ở HUB'));
    const graduation = await resolveDocumentSourcesWithDiagnostics(env(fixture.DB), cited, routeAdvisorDocuments('Điều kiện tốt nghiệp ở HUB'));
    const scholarships = await resolveDocumentSourcesWithDiagnostics(env(fixture.DB), cited, routeAdvisorDocuments('các loại học bổng ở HUB?'));
    assert.deepEqual(grading.sources.map((source) => source.documentId), [directGrading, regulation, handbook, general]);
    assert.deepEqual(graduation.sources.map((source) => source.documentId), [regulation, handbook, general]);
    assert.deepEqual(scholarships.sources.map((source) => source.documentId), [scholarship, handbook, general]);
    assert.equal(grading.sources[0]?.category, 'grading');
  } finally { fixture.sql.close(); }
});

test('camelCase Gemini citations are extracted then resolved through the same bounded D1 authority lookup', async () => {
  const fixture = makeDatabase();
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const citations = extractGeminiDocumentSources({ modelOutput: { content: [{ type: 'text', annotations: [{
      type: 'file_citation', fileName: 'ignored-by-D1.pdf', pageNumber: 18,
      customMetadata: { document_id: DOCUMENT_A },
    }] }] } });
    const resolution = await resolveDocumentSourcesWithDiagnostics(
      env(fixture.DB), citations as unknown as Array<Record<string, unknown>>, routeAdvisorDocuments('Quy đổi điểm ở HUB'),
    );
    assert.equal(resolution.reason, 'SUCCESS');
    assert.deepEqual(resolution.sources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.equal(fixture.queries.filter((query) => query.includes('FROM ai_documents')).length, 1);
  } finally { fixture.sql.close(); }
});

test('GenerateContent camelCase grounding extracts only metadata-backed document sources with locators and scope', async () => {
  const fixture = makeDatabase();
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const sources = extractGenerateContentDocumentSources({ candidates: [{ groundingMetadata: { groundingChunks: [{
      retrievedContext: {
        title: 'Ignored presentation title', pageNumber: 18,
        customMetadata: [{ key: 'document_id', stringValue: DOCUMENT_A }],
        text: 'Điều 21. Thang điểm đánh giá học phần\n2. Thang điểm áp dụng:\na) Áp dụng cho khóa tuyển sinh năm 2026.',
      },
    }, {
      retrievedContext: {
        title: 'Ignored presentation title', pageNumber: 19,
        customMetadata: [{ key: 'document_id', stringValue: DOCUMENT_A }],
        text: 'Điều 21. Thang điểm đánh giá học phần\n2. Thang điểm áp dụng:\nb) Áp dụng cho các khóa tuyển sinh từ năm 2027.',
      },
    }] } }] });
    assert.deepEqual(sources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.deepEqual(sources[0]?.locators, ['Điều 21, khoản 2, điểm a', 'Điều 21, khoản 2, điểm b']);
    assert.deepEqual(sources[0]?.pageNumbers, [18, 19]);
    assert.equal(sources[0]?.applicability?.[0]?.cohortYear, 2026);
    assert.equal(sources[0]?.applicability?.[1]?.fromCohortYear, 2027);
    const resolution = await resolveDocumentSourcesWithDiagnostics(env(fixture.DB), sources as unknown as Array<Record<string, unknown>>, routeAdvisorDocuments('Quy đổi điểm ở HUB'));
    assert.equal(resolution.reason, 'SUCCESS');
  } finally { fixture.sql.close(); }
});

test('GenerateContent snake_case grounding is supported and never fabricates a document ID', () => {
  const valid = extractGenerateContentDocumentSources({ candidates: [{ grounding_metadata: { grounding_chunks: [{
    retrieved_context: {
      title: 'Ignored', page_number: 7,
      custom_metadata: [{ key: 'document_id', string_value: DOCUMENT_B }],
      text: 'Mục 4. Xếp loại kết quả rèn luyện.',
    },
  }] } }] });
  const missing = extractGenerateContentDocumentSources({ candidates: [{ groundingMetadata: { groundingChunks: [{
    retrievedContext: { title: 'Never an authority', pageNumber: 18, text: 'Điều 21.' },
  }] } }] });
  assert.deepEqual(valid.map((source) => source.documentId), [DOCUMENT_B]);
  assert.deepEqual(valid[0]?.locators, ['Mục 4']);
  assert.deepEqual(missing, []);
});

test('formal locators are extracted only from File Search-grounded text, never from pages or unrelated numbers', () => {
  assert.deepEqual(extractOfficialDocumentLocators(`Điều 21. Thang điểm đánh giá học phần\n2. Thang điểm áp dụng:\na) Áp dụng cho khóa tuyển sinh năm 2026`), [
    'Điều 21, khoản 2, điểm a',
  ]);
  assert.deepEqual(extractOfficialDocumentLocators('Chương IV\nĐiều 21. Quy định chung'), ['Chương IV, Điều 21']);
  assert.deepEqual(extractOfficialDocumentLocators('Mục 4. Xếp loại kết quả rèn luyện'), ['Mục 4']);
  assert.deepEqual(extractOfficialDocumentLocators('Áp dụng cho năm 2026, trang 18.'), []);
});

test('grounded applicability extraction distinguishes intake years from academic years', () => {
  assert.deepEqual(extractOfficialDocumentApplicability('Áp dụng cho khóa tuyển sinh năm 2026.'), [{
    cohortYear: 2026, rawLabel: 'Khóa tuyển sinh năm 2026',
  }]);
  assert.deepEqual(extractOfficialDocumentApplicability('Áp dụng cho các khóa tuyển sinh từ năm 2027.'), [{
    fromCohortYear: 2027, rawLabel: 'Từ khóa tuyển sinh năm 2027',
  }]);
  assert.deepEqual(extractOfficialDocumentApplicability('Cẩm nang sinh viên năm học 2025-2026.'), [{
    academicYear: '2025-2026', rawLabel: 'Năm học 2025-2026',
  }]);
  assert.deepEqual(extractOfficialDocumentApplicability('Trang 18, năm 2026.'), []);
});

test('Gemini citations use grounded snippets or attributed output spans for locator metadata', async () => {
  const fixture = makeDatabase();
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const reply = 'Theo Điều 21, khoản 2, điểm a, quy định này áp dụng cho khóa tuyển sinh năm 2026.';
    const citations = extractGeminiDocumentSources({ modelOutput: { content: [{ type: 'text', text: reply, annotations: [{
      type: 'file_citation',
      customMetadata: { document_id: DOCUMENT_A },
      fileName: 'quy-che.pdf',
      startIndex: 0,
      endIndex: new TextEncoder().encode(reply).byteLength,
      pageNumber: 18,
    }] }] } });
    assert.deepEqual(citations[0]?.locators, ['Điều 21, khoản 2, điểm a']);
    const snippetCitation = extractGeminiDocumentSources({ annotations: [{
      type: 'file_citation', customMetadata: { document_id: DOCUMENT_A }, fileName: 'quy-che.pdf',
      snippet: 'Điều 21.\n2. Thang điểm đánh giá học phần.\na) Áp dụng cho khóa tuyển sinh năm 2026.',
    }] });
    assert.deepEqual(snippetCitation[0]?.locators, ['Điều 21, khoản 2, điểm a']);
    const resolution = await resolveDocumentSourcesWithDiagnostics(
      env(fixture.DB), citations as unknown as Array<Record<string, unknown>>, routeAdvisorDocuments('Quy đổi điểm ở HUB'),
    );
    assert.deepEqual(resolution.sources[0]?.locators, ['Điều 21, khoản 2, điểm a']);
  } finally { fixture.sql.close(); }
});

test('grading policy question is grounded in a D1-validated Gemini citation and never calls Groq', async () => {
  const fixture = makeDatabase();
  const originalFetch = globalThis.fetch;
  let groqCalls = 0;
  let fileSearchCalls = 0;
  globalThis.fetch = async (input) => {
    const target = String(input);
    if (target.includes('api.groq.com')) {
      groqCalls += 1;
      return Response.json({ choices: [{ message: { content: 'Không được phép trả lời bằng Groq.' } }] });
    }
    throw new Error(`Unexpected provider call: ${target}`);
  };
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'hi bạn biết quy đổi điểm ở hub như nào không?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
      GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test', GROQ_API_KEY: 'test-key',
      fileSearchAnswer: async () => {
        fileSearchCalls += 1;
        return {
        reply: 'Theo Điều 21, khoản 2, điểm a của quy chế chính thức.',
        documentSources: [{ documentId: DOCUMENT_A, fileName: 'Quy chế đào tạo.pdf', title: 'Quy chế đào tạo', pageNumber: 1 }],
        };
      },
    }) as { reply: string; documentSources: Array<{ documentId: string; locators?: string[] }>; answerSources: Array<{ type: string }> };
    assert.equal(result.reply, 'Theo Điều 21, khoản 2, điểm a của quy chế chính thức.');
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.deepEqual(result.documentSources[0]?.locators, ['Điều 21, khoản 2, điểm a']);
    assert.equal(result.answerSources.some((source) => source.type === 'document'), true);
    assert.equal(groqCalls, 0);
    assert.equal(fileSearchCalls, 1);
    const persisted = fixture.sql.prepare('SELECT document_sources_json FROM ai_chat_logs ORDER BY id DESC LIMIT 1').get() as { document_sources_json: string };
    assert.deepEqual(JSON.parse(persisted.document_sources_json)[0]?.locators, ['Điều 21, khoản 2, điểm a']);
  } finally {
    globalThis.fetch = originalFetch;
    fixture.sql.close();
  }
});

test('empty or invalid Gemini citations block HUB policy answers without a Groq fallback', async () => {
  const fixture = makeDatabase();
  const originalFetch = globalThis.fetch;
  let groqCalls = 0;
  globalThis.fetch = async (input) => {
    const target = String(input);
    if (target.includes('api.groq.com')) {
      groqCalls += 1;
      return Response.json({ choices: [{ message: { content: 'Không được dùng.' } }] });
    }
    throw new Error(`Unexpected provider call: ${target}`);
  };
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Quy đổi điểm ở BUH như thế nào?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
      GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test', GROQ_API_KEY: 'test-key',
      fileSearchAnswer: async () => ({ reply: 'HUB dùng hệ điểm 4.', documentSources: [] }),
    }) as { reply: string; documentSources: unknown[]; answerSources: unknown[] };
    assert.match(result.reply, /chưa thể xác minh/i);
    assert.deepEqual(result.documentSources, []);
    assert.deepEqual(result.answerSources, []);
    assert.equal(groqCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    fixture.sql.close();
  }
});

test('grounded policy answers remain direct, preserve retrieved grading rows, and suppress website deflection', async () => {
  const fixture = makeDatabase();
  let system = '';
  let retrievalQuestion = '';
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo 2026', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'bảng quy đổi điểm cho khóa 2026?' }),
    });
    const groundedReply = [
      'Áp dụng cho khóa tuyển sinh năm 2026, Điều 21 khoản 2 điểm a quy định bảng quy đổi sau:',
      '',
      '| Thang điểm 10 | Điểm chữ | Hệ 4 |',
      '| --- | --- | --- |',
      '| 8.5–10 | A | 4.0 |',
      '| 7.0–8.4 | B | 3.0 |',
    ].join('\n');
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, capturedSystem, capturedQuestion) => {
        system = capturedSystem;
        retrievalQuestion = capturedQuestion;
        return {
          reply: groundedReply,
          documentSources: [{
            documentId: DOCUMENT_A,
            fileName: 'quy-che-2026.pdf',
            locators: ['Điều 21, khoản 2, điểm a'],
            applicability: [{ cohortYear: 2026, rawLabel: 'Khóa tuyển sinh năm 2026' }],
          }],
        };
      },
    }) as { reply: string; documentSources: Array<{ locators?: string[]; applicability?: Array<{ cohortYear?: number }> }> };
    assert.equal(result.reply, groundedReply);
    assert.match(result.reply, /^Áp dụng cho khóa tuyển sinh năm 2026/u);
    assert.match(result.reply, /\| Thang điểm 10 \| Điểm chữ \| Hệ 4 \|/u);
    assert.doesNotMatch(result.reply, /có thể tham khảo|truy cập website|để biết chính xác|thường được quy định/iu);
    assert.deepEqual(result.documentSources[0]?.locators, ['Điều 21, khoản 2, điểm a']);
    assert.equal(result.documentSources[0]?.applicability?.[0]?.cohortYear, 2026);
    assert.match(system, /câu đầu tiên phải trả lời trực tiếp/u);
    assert.match(system, /bảng Markdown hoặc danh sách ngắn/u);
    assert.match(retrievalQuestion, /bảng quy đổi điểm/u);
    assert.match(retrievalQuestion, /thang điểm 10/u);
    assert.match(retrievalQuestion, /điểm chữ/u);
    assert.match(retrievalQuestion, /hệ 4/u);
    assert.match(retrievalQuestion, /khóa tuyển sinh=2026/u);
  } finally { fixture.sql.close(); }
});

test('generic website advice is never returned after a D1-authorized policy citation', async () => {
  const fixture = makeDatabase();
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'bảng quy đổi điểm cho khóa 2026?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => ({
        reply: 'Bạn có thể tham khảo website chính thức hoặc mở quy chế để biết chính xác.',
        documentSources: [{ documentId: DOCUMENT_A, fileName: 'quy-che.pdf' }],
      }),
    }) as { reply: string; documentSources: Array<{ documentId: string }> };
    assert.match(result.reply, /đoạn nguồn truy xuất hiện chưa chứa đủ dữ liệu/i);
    assert.doesNotMatch(result.reply, /tham khảo|website|quy chế để biết/i);
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.equal(isGroundedPolicyDeflection('Các quy định thường được nêu trong cẩm nang.'), true);
    assert.equal(isGroundedPolicyDeflection('Điều 21 quy định trực tiếp bảng điểm.'), false);
  } finally { fixture.sql.close(); }
});

test('coverage-mode grading uses one broad File Search call and persists grounded applicability per source', async () => {
  const fixture = makeDatabase();
  const filters: string[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo 2026', category: 'grading' });
    insertOfficialDocument(fixture, { id: DOCUMENT_B, title: 'Quy chế đào tạo từ 2027', category: 'grading', version: 2 });
    insertOfficialDocument(fixture, { id: DOCUMENT_C, title: 'Cẩm nang sinh viên', category: 'student_handbook' });
    insertOfficialDocument(fixture, { id: DOCUMENT_D, title: 'Thông báo học phí', category: 'tuition' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'quy đổi điểm thang 4 HUB như nào?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, _system, _retrievalInput, options) => {
        filters.push(String(options.metadataFilter));
        return {
          reply: 'Có bảng riêng áp dụng cho khóa tuyển sinh năm 2026 và các khóa tuyển sinh từ năm 2027.',
          documentSources: [
            { documentId: DOCUMENT_A, fileName: 'quy-che-2026.pdf', applicability: [{ rawLabel: 'Khóa tuyển sinh năm 2026', cohortYear: 2026 }] },
            { documentId: DOCUMENT_B, fileName: 'quy-che-2027.pdf', applicability: [{ rawLabel: 'Từ khóa tuyển sinh năm 2027', fromCohortYear: 2027 }] },
          ],
        };
      },
    }) as { reply: string; documentSources: Array<{ documentId: string; applicability?: Array<{ cohortYear?: number; fromCohortYear?: number }> }> };
    assert.equal(filters.length, 1);
    assertCandidateFilter(filters[0], [DOCUMENT_A, DOCUMENT_B, DOCUMENT_C]);
    assert.doesNotMatch(String(filters[0]), new RegExp(`document_id = "${DOCUMENT_D}"`));
    assert.match(result.reply, /2026/);
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_B, DOCUMENT_A]);
    assert.equal(result.documentSources[0]?.applicability?.[0]?.fromCohortYear, 2027);
    assert.equal(result.documentSources[1]?.applicability?.[0]?.cohortYear, 2026);
    const persisted = fixture.sql.prepare('SELECT document_sources_json FROM ai_chat_logs ORDER BY id DESC LIMIT 1').get() as { document_sources_json: string };
    assert.equal(JSON.parse(persisted.document_sources_json)[0]?.applicability?.[0]?.fromCohortYear, 2027);
  } finally { fixture.sql.close(); }
});

test('scoped grading follow-up starts broad and retrieves a compatible 2025-2026 handbook', async () => {
  const fixture = makeDatabase();
  const filters: string[] = [];
  const policyInputs: string[] = [];
  const retrievalQueries: string[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế 2026', category: 'grading' });
    insertOfficialDocument(fixture, { id: DOCUMENT_B, title: 'Cẩm nang 2025-2026', category: 'student_handbook', academicYear: '2025-2026' });
    const history = [{ role: 'user', content: 'quy đổi điểm ở HUB như nào?' }];
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'còn khóa 2025 thì sao?', history }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, _system, retrievalInput, options) => {
        filters.push(String(options.metadataFilter));
        policyInputs.push(retrievalInput);
        retrievalQueries.push(retrievalInput);
        return {
          reply: 'Cẩm nang Sinh viên năm học 2025-2026 công bố bảng quy đổi điểm.',
          documentSources: [{ documentId: DOCUMENT_B, fileName: 'cam-nang.pdf', applicability: [{ academicYear: '2025-2026', rawLabel: 'Năm học 2025-2026' }] }],
        };
      },
    }) as { reply: string; documentSources: Array<{ documentId: string; applicability?: Array<{ cohortYear?: number; academicYear?: string; rawLabel: string }> }> };
    const route = routeAdvisorDocuments('còn khóa 2025 thì sao?', history);
    assert.equal(route.domain, 'grading');
    assert.equal(route.scope.cohortYear, 2025);
    assert.equal(sourceCoversRequestedScope({ applicability: [{ cohortYear: 2026, rawLabel: 'Khóa tuyển sinh năm 2026' }], academicYear: null }, route.scope), false);
    assertCandidateFilter(filters[0], [DOCUMENT_A, DOCUMENT_B]);
    assert.match(policyInputs[0], /Ngữ cảnh các câu hỏi trước của người dùng:/);
    assert.match(policyInputs[0], /quy đổi điểm ở HUB như nào\?/);
    assert.match(String(retrievalQueries[0]), /miền tài liệu chính thức=grading/);
    assert.match(String(retrievalQueries[0]), /khóa tuyển sinh=2025/);
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_B]);
    assert.match(result.reply, /năm học 2025-2026/i);
    assert.doesNotMatch(result.reply, /khóa tuyển sinh 2025/i);
  } finally { fixture.sql.close(); }
});

test('a scoped 2027 follow-up uses one broad search and preserves its confirmed range', async () => {
  const fixture = makeDatabase();
  const filters: string[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế từ 2027', category: 'grading' });
    const history = [{ role: 'user', content: 'quy đổi điểm ở HUB như nào?' }];
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'khóa 2027?', history }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, _system, _retrievalInput, options) => {
        filters.push(String(options.metadataFilter));
        return {
          reply: 'Áp dụng cho các khóa tuyển sinh từ năm 2027.',
          documentSources: [{ documentId: DOCUMENT_A, fileName: 'quy-che-2027.pdf', applicability: [{ fromCohortYear: 2027, rawLabel: 'Từ khóa tuyển sinh năm 2027' }] }],
        };
      },
    }) as { documentSources: Array<{ documentId: string }> };
    assertCandidateFilter(filters[0], [DOCUMENT_A]);
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
  } finally { fixture.sql.close(); }
});

test('scholarship overview routes to official documents without hardcoded scholarship content', async () => {
  const fixture = makeDatabase();
  const filters: string[] = [];
  const workerSource = readFileSync('cloudflare/worker/src/ai-advisor.ts', 'utf8');
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế học bổng', category: 'scholarship' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'các loại học bổng ở HUB?' }),
    });
    const groundedReply = 'Điều 2 nêu Học bổng Khuyến khích học tập, Học bổng Ngân hàng và Học bổng xã hội gồm Tương hỗ, Tài năng, Quốc tế, học bổng khác.';
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, _system, _retrievalInput, options) => {
        filters.push(String(options.metadataFilter));
        return { reply: groundedReply, documentSources: [{ documentId: DOCUMENT_A, fileName: 'hoc-bong.pdf' }] };
      },
    }) as { reply: string; documentSources: Array<{ documentId: string }> };
    assert.equal(routeAdvisorDocuments('các loại học bổng ở HUB?').domain, 'scholarship');
    assert.equal(routeAdvisorDocuments('các loại học bổng ở HUB?').coverageMode, true);
    assert.equal(filters.length, 1);
    assert.equal(result.reply, groundedReply);
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.doesNotMatch(workerSource, /Học bổng Ngân hàng|Học bổng Tương hỗ|Học bổng Quốc tế/u);
  } finally { fixture.sql.close(); }
});

test('legacy general-category documents remain reachable through one broad-first public search', async () => {
  const fixture = makeDatabase();
  const filters: string[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo cũ', category: 'general' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Quy đổi điểm ở HUB như nào?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
      GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, _system, _retrievalInput, options) => {
        filters.push(String(options.metadataFilter));
        return { reply: 'Theo quy chế chính thức.', documentSources: [{ documentId: DOCUMENT_A, fileName: 'Quy chế đào tạo.pdf', title: null, pageNumber: 1 }] };
      },
    }) as { reply: string; documentSources: Array<{ documentId: string }> };
    assert.equal(result.reply, 'Theo quy chế chính thức.');
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assertCandidateFilter(filters[0], [DOCUMENT_A]);
  } finally { fixture.sql.close(); }
});

test('a scoped current legacy Quy chế document is accepted by broad-first search without reindexing', async () => {
  const fixture = makeDatabase();
  const filters: string[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo hiện hành', category: 'Quy chế' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'quy đổi điểm thang 4 HUB khóa 2026 là gì?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
      GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, _system, _retrievalInput, options) => {
        filters.push(String(options.metadataFilter));
        return { reply: 'Theo quy chế hiện hành.', documentSources: [{ documentId: DOCUMENT_A, fileName: 'Quy-che.pdf' }] };
      },
    }) as { reply: string; documentSources: Array<{ documentId: string; category: string }> };
    assert.equal(result.reply, 'Theo quy chế hiện hành.');
    assertCandidateFilter(filters[0], [DOCUMENT_A]);
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.equal(result.documentSources[0]?.category, 'training_regulation');
    assert.equal(fixture.queries.some((query) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(query) && !/ai_chat_logs/i.test(query)), false);
  } finally { fixture.sql.close(); }
});

test('a focused narrow File Search miss is diagnosed and the broad public fallback runs', async () => {
  const fixture = makeDatabase();
  const previousWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message: unknown) => { warnings.push(String(message)); };
  const filters: string[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'điểm F ở HUB là gì?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
      GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, _system, _retrievalInput, options) => {
        filters.push(String(options.metadataFilter));
        return filters.length === 1
          ? { reply: 'Không có citation.', documentSources: [] }
          : { reply: 'Theo quy chế chính thức.', documentSources: [{ documentId: DOCUMENT_A, fileName: 'Quy-che.pdf' }] };
      },
    }) as { reply: string };
    assert.equal(result.reply, 'Theo quy chế chính thức.');
    assert.equal(filters.length, 2);
    assertCandidateFilter(filters[0], [DOCUMENT_A]);
    assert.equal(filters[1], 'visibility = "public"');
    assert.equal(warnings.some((warning) => warning.includes('GEMINI_NO_FILE_CITATION')), true);
  } finally {
    console.warn = previousWarn;
    fixture.sql.close();
  }
});

test('Gemini request errors are classified server-side and remain safe to the policy user', async () => {
  const fixture = makeDatabase();
  const previousWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message: unknown) => { warnings.push(String(message)); };
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Quy đổi điểm ở HUB như nào?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
      GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => { throw new GeminiFileSearchError('GEMINI_REQUEST_FAILED', { model: 'gemini-3.5-flash-lite', errorName: 'ApiError', status: 503 }); },
    }) as { reply: string; documentSearchUnavailable: boolean };
    assert.match(result.reply, /chưa thể xác minh/i);
    assert.equal(result.documentSearchUnavailable, true);
    assert.equal(warnings.some((warning) => warning.includes('GEMINI_REQUEST_FAILED')), true);
    assert.equal(warnings.some((warning) => warning.includes('test-key')), false);
  } finally {
    console.warn = previousWarn;
    fixture.sql.close();
  }
});

test('one transient Gemini 5xx is retried within the same budget and a grounded retry is returned', async () => {
  const fixture = makeDatabase();
  const previousWarn = console.warn;
  const warnings: string[] = [];
  let fileSearchCalls = 0;
  console.warn = (message: unknown) => { warnings.push(String(message)); };
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'bạn có bảng quy đổi điểm khóa 2026' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
      GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => {
        fileSearchCalls += 1;
        if (fileSearchCalls === 1) {
          throw new GeminiFileSearchError('GEMINI_REQUEST_FAILED', { model: 'gemini-3.1-flash-lite', status: 503 });
        }
        return { reply: 'Bảng quy đổi chính thức.', documentSources: [{ documentId: DOCUMENT_A, fileName: 'Quy-che.pdf' }] };
      },
    }) as { reply: string; documentSources: Array<{ documentId: string }> };
    assert.equal(result.reply, 'Bảng quy đổi chính thức.');
    assert.equal(fileSearchCalls, 2);
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.equal(warnings.some((warning) => warning.includes('"attempt":1') && warning.includes('"maxAttempts":2') && warning.includes('"providerStatus":503') && warning.includes('remainingBudgetMs')), true);
    assert.equal(warnings.some((warning) => warning.includes('"reason":"SUCCESS"') && warning.includes('"attempt":2') && warning.includes('"providerStatus":200')), true);
  } finally {
    console.warn = previousWarn;
    fixture.sql.close();
  }
});

test('400, 429, location, timeout, and D1 citation failures are never retried', async () => {
  const fixture = makeDatabase();
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const requestFor = () => new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'bạn có bảng quy đổi điểm khóa 2026' }),
    });
    const failures = [
      new GeminiFileSearchError('GEMINI_REQUEST_FAILED', { model: 'gemini-3.1-flash-lite', status: 400 }),
      new GeminiFileSearchError('GEMINI_REQUEST_FAILED', { model: 'gemini-3.1-flash-lite', status: 429 }),
      new GeminiFileSearchError('GEMINI_LOCATION_UNSUPPORTED', { model: 'gemini-3.1-flash-lite', status: 400 }),
      new GeminiFileSearchError('GEMINI_REQUEST_TIMEOUT', { model: 'gemini-3.1-flash-lite', status: 504 }),
    ];
    for (const failure of failures) {
      let calls = 0;
      const request = requestFor();
      const result = await handleAiAdvisor(request, new URL(request.url), {
        ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
        GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
        fileSearchAnswer: async () => { calls += 1; throw failure; },
      }) as { reply: string; documentSearchUnavailable: boolean };
      assert.equal(calls, 1);
      assert.equal(result.documentSearchUnavailable, true);
      assert.match(result.reply, /chưa thể xác minh/i);
    }

    let citationCalls = 0;
    const citationRequest = requestFor();
    const citationResult = await handleAiAdvisor(citationRequest, new URL(citationRequest.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
      GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => {
        citationCalls += 1;
        return { reply: 'Nguồn không hợp lệ.', documentSources: [{ documentId: DOCUMENT_B, fileName: 'unknown.pdf' }] };
      },
    }) as { reply: string; documentSearchUnavailable: boolean };
    assert.equal(citationCalls, 1);
    assert.equal(citationResult.documentSearchUnavailable, true);
    assert.match(citationResult.reply, /chưa thể xác minh/i);
  } finally { fixture.sql.close(); }
});

test('a timed-out policy File Search returns the safe response without Groq fallback and logs timing safely', async () => {
  const fixture = makeDatabase();
  const previousWarn = console.warn;
  const warnings: string[] = [];
  const originalFetch = globalThis.fetch;
  let groqCalls = 0;
  let fileSearchCalls = 0;
  console.warn = (message: unknown) => { warnings.push(String(message)); };
  globalThis.fetch = async (input) => {
    if (String(input).includes('api.groq.com')) groqCalls += 1;
    throw new Error('No provider fallback expected');
  };
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'điểm F ở HUB là gì?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      GROQ_API_KEY: 'test-key', fileSearchTimeoutMs: 10,
      fileSearchAnswer: async () => {
        fileSearchCalls += 1;
        return new Promise<never>(() => undefined);
      },
    }) as { reply: string; documentSearchUnavailable: boolean };
    assert.match(result.reply, /chưa thể xác minh/i);
    assert.equal(result.documentSearchUnavailable, true);
    assert.equal(groqCalls, 0);
    assert.equal(fileSearchCalls, 1);
    assert.equal(warnings.some((warning) => warning.includes('GEMINI_REQUEST_TIMEOUT') && warning.includes('durationMs') && warning.includes('candidate_ids')), true);
    assert.equal(warnings.some((warning) => warning.includes('test-key')), false);
  } finally {
    console.warn = previousWarn;
    globalThis.fetch = originalFetch;
    fixture.sql.close();
  }
});

test('an empty D1-authoritative candidate set returns safely without a broad store search', async () => {
  const fixture = makeDatabase();
  let fileSearchCalls = 0;
  try {
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'quy đổi điểm ở HUB như nào?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => { fileSearchCalls += 1; return null; },
    }) as { reply: string; documentSearchUnavailable: boolean };
    assert.match(result.reply, /chưa thể xác minh/i);
    assert.equal(result.documentSearchUnavailable, true);
    assert.equal(fileSearchCalls, 0);
    assert.equal(fixture.queries.filter((query) => query.includes('FROM ai_documents')).length, 1);
  } finally { fixture.sql.close(); }
});

test('a focused valid narrow result returns immediately without optional fallback work', async () => {
  const fixture = makeDatabase();
  const filters: string[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'điểm F ở HUB là gì?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, _system, _retrievalInput, options) => {
        filters.push(String(options.metadataFilter));
        return { reply: 'Theo quy chế chính thức.', documentSources: [{ documentId: DOCUMENT_A, fileName: 'quy-che.pdf' }] };
      },
    }) as { reply: string };
    assert.equal(result.reply, 'Theo quy chế chính thức.');
    assertCandidateFilter(filters[0], [DOCUMENT_A]);
  } finally { fixture.sql.close(); }
});

test('course retrieval is targeted and does not query unrelated event or lost-found tables', async () => {
  const fixture = makeDatabase();
  try {
    fixture.sql.prepare(`INSERT INTO course_schedules VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'course-1', 'IT101', 'Lập trình căn bản', 3, null, 'Cô A', 'HK1', 'CNTT', null, null, null, null,
      'published', null, 'it101', 'lap trinh can ban', 1,
    );
    const result = await retrieveAdvisorContext(env(fixture.DB), USER, 'Môn IT101 là gì?');
    assert.equal(result.context.courses instanceof Array, true);
    assert.equal((result.context.courses as Array<Record<string, unknown>>)[0]?.course_code, 'IT101');
    assert.deepEqual(result.sources.map((item) => item.type), ['course']);
    assert.equal(fixture.queries.some((query) => /public_events|public_lost_found_items|school_announcements/i.test(query)), false);
  } finally { fixture.sql.close(); }
});

test('course, event and announcement retrieval use meaningful phrases rather than domain labels', async () => {
  const fixture = makeDatabase();
  try {
    fixture.sql.prepare(`INSERT INTO course_schedules VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'course-advanced', 'EN101', 'Học phần Advanced Writing', 3, null, null, 'HK1', 'Ngoại ngữ', null, null, null, null,
      'published', null, 'en101', 'học phần advanced writing', 2,
    );
    fixture.sql.prepare('INSERT INTO public_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      1, 'Chương trình hiến máu nhân đạo', null, null, null, null, 'published', null, 0, 'chương trình hiến máu nhân đạo', '2026-09-20T00:00:00.000Z',
    );
    fixture.sql.prepare('INSERT INTO school_announcements VALUES (?,?,?,?,?,?,?)').run(
      1, 'Thông báo học phí học kỳ 1', '/notice/1', '2026-09-20', 0, 'thông báo học phí học kỳ 1', '2026-09-20T00:00:00.000Z',
    );
    fixture.sql.prepare('INSERT INTO public_lost_found_items VALUES (?,?,?,?,?,?,?,?)').run(
      1, 'Mất đồ ví da màu xanh', 'lost', 'Cơ sở A', '2026-09-20T00:00:00.000Z', 0, 'approved', 'mất đồ ví da màu xanh',
    );
    await retrieveAdvisorContext(env(fixture.DB), USER, 'Môn Advanced Writing có mấy tín chỉ?');
    await retrieveAdvisorContext(env(fixture.DB), USER, 'Sự kiện hiến máu sắp tới?');
    await retrieveAdvisorContext(env(fixture.DB), USER, 'Thông báo học phí mới nhất?');
    await retrieveAdvisorContext(env(fixture.DB), USER, 'Tìm đồ ví da');
    assert.equal(fixture.queries.some((query) => query.includes('user_profile_private')), false);
    assert.equal(fixture.queries.some((query) => query.includes('["advanced writing%"]')), true);
    assert.equal(fixture.queries.some((query) => query.includes('["hiến máu%"]')), true);
    assert.equal(fixture.queries.some((query) => query.includes('["học phí%"]')), true);
    assert.equal(fixture.queries.some((query) => query.includes('["đồ ví da%"]')), true);
    assert.equal(fixture.queries.some((query) => query.includes('["%advanced writing%"]')), true);
    assert.equal(fixture.queries.some((query) => query.includes('["%hiến máu%"]')), true);
    assert.equal(fixture.queries.some((query) => query.includes('["%học phí%"]')), true);
    assert.equal(fixture.queries.some((query) => query.includes('["%đồ ví da%"]')), true);
  } finally { fixture.sql.close(); }
});

test('private advisor retrieval is scoped to the authenticated Better Auth user and never reads another profile', async () => {
  const fixture = makeDatabase();
  try {
    fixture.sql.prepare('INSERT INTO user_profile_private VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      USER, 'Sinh viên A', 'K42', 'Công nghệ thông tin', null, 'standard', 3.2, 130, 1, '[]',
    );
    fixture.sql.prepare('INSERT INTO user_profile_private VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      '22222222-2222-4222-8222-222222222222', 'Sinh viên B', 'K41', 'Tài chính', null, 'standard', 3.8, 130, 1, '[]',
    );
    const result = await retrieveAdvisorContext(env(fixture.DB), USER, 'GPA và tiến độ tốt nghiệp của mình');
    const profile = (result.context.studentAcademic as { profile: { name: string } }).profile;
    assert.equal(profile.name, 'Sinh viên A');
    assert.equal(JSON.stringify(result.context).includes('Sinh viên B'), false);
    assert.match(fixture.queries.find((query) => query.includes('FROM user_profile_private')) || '', /WHERE user_id = \?1/);
  } finally { fixture.sql.close(); }
});

test('missing private profile does not emit a fictional student-academic source', async () => {
  const fixture = makeDatabase();
  try {
    const result = await retrieveAdvisorContext(env(fixture.DB), USER, 'Tôi còn thiếu bao nhiêu tín chỉ?');
    assert.deepEqual(result.context.studentAcademic, { available: false });
    assert.equal(result.sources.some((item) => item.type === 'student_academic'), false);
  } finally { fixture.sql.close(); }
});

test('academic summary reuses grade rules while keeping raw transcript data out of advisor context', async () => {
  const fixture = makeDatabase();
  try {
    const semesters = JSON.stringify([{ subjects: [
      { id: 'pass', name: 'Đã qua', credits: 3, scoreCC: 8, scoreProcess: 8, scoreMid: 8, scoreFinal: 8, isNonGPA: false },
      { id: 'fail', name: 'Chưa qua', credits: 2, scoreCC: 3, scoreProcess: 3, scoreMid: 3, scoreFinal: 3, isNonGPA: false },
      { id: 'non-gpa', name: 'Giáo dục thể chất', credits: 1, scoreCC: 10, scoreProcess: 10, scoreMid: 10, scoreFinal: 10, isNonGPA: true },
    ] }]);
    fixture.sql.prepare('INSERT INTO user_profile_private VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      USER, 'Sinh viên A', 'K42', 'CNTT', null, 'standard', 3.2, 130, 1, semesters,
    );
    const result = await retrieveAdvisorContext(env(fixture.DB), USER, 'Tôi đã tích lũy bao nhiêu tín chỉ?');
    const academic = result.context.studentAcademic as { available: boolean; summary: Record<string, unknown> };
    assert.equal(academic.available, true);
    assert.deepEqual(academic.summary, {
      currentGpa4: 1.9,
      currentGpa10: 6,
      gradedCredits: 5,
      passedCredits: 3,
      accumulatedCredits: 3,
      totalCreditsRequired: 130,
      remainingCredits: 127,
      failedSubjectNames: ['Chưa qua'],
    });
    assert.equal(JSON.stringify(result.context).includes('scoreFinal'), false);
  } finally { fixture.sql.close(); }
});

test('empty HUB domains return the deterministic authoritative response without calling Groq, while general questions may use it', async () => {
  const fixture = makeDatabase();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return Response.json({ choices: [{ message: { content: 'General answer' } }] });
  };
  try {
    const requestFor = (question: string) => new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST',
      headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const runtimeEnv = { ...env(fixture.DB), GROQ_API_KEY: 'test-key' };
    for (const question of ['IT999 có mấy tín chỉ?', 'Sự kiện không tồn tại nào đang diễn ra?', 'Thông báo không tồn tại mới nhất?']) {
      const request = requestFor(question);
      const result = await handleAiAdvisor(request, new URL(request.url), runtimeEnv) as { reply: string };
      assert.match(result.reply, /chưa tìm thấy thông tin này/i);
    }
    assert.equal(providerCalls, 0);
    const generalRequest = requestFor('Phương pháp Pomodoro là gì?');
    const general = await handleAiAdvisor(generalRequest, new URL(generalRequest.url), runtimeEnv) as { reply: string };
    assert.equal(general.reply, 'General answer');
    assert.equal(providerCalls, 1);
    assert.equal(fixture.queries.some((query) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(query) && !/ai_chat_logs/i.test(query)), false);
  } finally {
    globalThis.fetch = originalFetch;
    fixture.sql.close();
  }
});

test('advisor runtime keeps retrieval targeted and document-source resolution batched', () => {
  const source = readFileSync('cloudflare/worker/src/ai-advisor.ts', 'utf8');
  assert.doesNotMatch(source, /const d1Context/);
  assert.doesNotMatch(source, /sources\.map\(async/);
  assert.match(source, /WHERE user_id = \?1/);
});

test('unavailable official-document retrieval fails safely instead of asking the fallback provider to invent campus policy', async () => {
  const fixture = makeDatabase();
  try {
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST',
      headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Quy chế tốt nghiệp hiện hành là gì?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), env(fixture.DB)) as { reply: string; documentSearchUnavailable: boolean };
    assert.match(result.reply, /chưa thể xác minh/i);
    assert.equal(result.documentSearchUnavailable, true);
  } finally { fixture.sql.close(); }
});
