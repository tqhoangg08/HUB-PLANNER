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
  handleAiAdvisor as handleAiAdvisorImplementation,
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
  type AdvisorShadowEvent,
  type AdvisorCanaryEvent,
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
import type { AiAdvisorProviders, GroundedDocumentAnswerProvider } from '../cloudflare/worker/src/ai-advisor-providers.ts';
import {
  buildAnswerCacheKey,
  buildRetrievalCacheKey,
  fingerprintDocumentRevisions,
  MemoryAdvisorCache,
} from '../cloudflare/worker/src/ai-advisor-cache.ts';
import { evaluateAdvisorQuota } from '../cloudflare/worker/src/ai-advisor-quota.ts';
import { resolveZeroAiStructuredAnswer } from '../cloudflare/worker/src/ai-advisor-zero-ai.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOCUMENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOCUMENT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOCUMENT_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

// These older fixtures isolate routing/D1 authority, not provider grounding.
// Their mocked provider explicitly attests grounding. The quality suite tests
// the real grounding parser and rejects missing/false attestations separately.
const handleAiAdvisor: typeof handleAiAdvisorImplementation = async (request, url, env, lifetime) => {
  const answer = env.fileSearchAnswer;
  const provider = env.advisorProviders?.groundedDocument;
  const copy = Object.defineProperties({}, Object.getOwnPropertyDescriptors(env));
  return handleAiAdvisorImplementation(request, url, Object.assign(copy, {
    ...(answer ? { fileSearchAnswer: async (...args: Parameters<NonNullable<typeof answer>>) => {
      const result = await answer(...args);
      return result ? { ...result, groundingVerified: true } : null;
    } } : {}),
    ...(provider ? { advisorProviders: { ...env.advisorProviders, groundedDocument: {
      ...provider, retrieve: async (...args: Parameters<typeof provider.retrieve>) => {
        const result = await provider.retrieve(...args);
        return result ? { ...result, groundingVerified: true } : null;
      },
    } } } : {}),
  }), lifetime);
};

const v2RequestFor = (question: string) => new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
  method: 'POST',
  headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
  body: JSON.stringify({ question }),
});

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
  updatedAt?: string; publicViewPolicy?: 'none' | 'local_rehost' | 'official_link';
}) => {
  const now = input.updatedAt || '2026-09-20T00:00:00.000Z';
  fixture.sql.prepare(`INSERT INTO ai_documents (
    id,title,original_file_name,storage_path,mime_type,file_size,content_hash,
    category,academic_year,program_code,visibility,version,indexing_status,public_view_policy,uploaded_by,
    created_at,updated_at,deleted_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    input.id, input.title, `${input.title}.pdf`, `ai-documents/${input.id}.pdf`, 'application/pdf', 100,
    input.id.replace(/-/g, '').slice(0, 64).padEnd(64, '0'), input.category ?? 'grading', input.academicYear ?? null,
    'all', input.visibility || 'public', input.version || 1, input.indexingStatus || 'completed', input.publicViewPolicy || 'none', USER,
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
    assert.equal(result.every((source) => source.inferredCurrent === false), true);
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

test('D1 selection reads all authorized documents before provider relevance scoring', async () => {
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
    assert.deepEqual(new Set(grading.map((candidate) => candidate.id)), new Set([DOCUMENT_A, training, handbook, tuition]));
    assert.equal(grading.some((candidate) => candidate.id === tuition), true);
    assert.equal(grading.find((candidate) => candidate.id === training)?.category, 'training_regulation');
    assertCandidateFilter(buildDocumentCandidateMetadataFilter(grading.map((candidate) => candidate.id)) || '', [DOCUMENT_A, training, handbook]);
    assert.equal(fixture.queries.filter((query) => query.includes('FROM ai_documents')).length, 1);
  } finally { fixture.sql.close(); }
});

test('scholarship selection does not discard authorized documents based on category hints', async () => {
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
    assert.deepEqual(new Set(candidates.map((candidate) => candidate.id)), new Set([DOCUMENT_A, handbook, general, grading, tuition]));
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
    assert.deepEqual(sources.map((source) => source.documentId), [DOCUMENT_A, DOCUMENT_A]);
    assert.deepEqual(sources[0]?.locators, ['Điều 21, khoản 2, điểm a']);
    assert.deepEqual(sources[1]?.locators, ['Điều 21, khoản 2, điểm b']);
    assert.deepEqual(sources[0]?.pageNumbers, [18]);
    assert.deepEqual(sources[1]?.pageNumbers, [19]);
    assert.equal(sources[0]?.applicability?.[0]?.cohortYear, 2026);
    assert.equal(sources[1]?.applicability?.[0]?.fromCohortYear, 2027);
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

test('Gemini citations use source snippets, never attributed model output, for locator metadata', async () => {
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
    assert.equal(citations[0]?.locators, undefined);
    assert.equal(citations[0]?.evidenceText, undefined);
    const snippetCitation = extractGeminiDocumentSources({ annotations: [{
      type: 'file_citation', customMetadata: { document_id: DOCUMENT_A }, fileName: 'quy-che.pdf',
      snippet: 'Điều 21.\n2. Thang điểm đánh giá học phần.\na) Áp dụng cho khóa tuyển sinh năm 2026.',
    }] });
    assert.deepEqual(snippetCitation[0]?.locators, ['Điều 21, khoản 2, điểm a']);
    const resolution = await resolveDocumentSourcesWithDiagnostics(
      env(fixture.DB), snippetCitation as unknown as Array<Record<string, unknown>>, routeAdvisorDocuments('Quy đổi điểm ở HUB'),
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
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading', publicViewPolicy: 'local_rehost' });
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
        documentSources: [{ documentId: DOCUMENT_A, fileName: 'Quy chế đào tạo.pdf', title: 'Quy chế đào tạo', pageNumber: 1, locators: ['Điều 21, khoản 2, điểm a'] }],
        };
      },
    }) as { reply: string; documentSources: Array<{ documentId: string; locators?: string[]; publicView: string; publicUrl?: string }>; answerSources: Array<{ type: string }> };
    assert.equal(result.reply, 'Theo Điều 21, khoản 2, điểm a của quy chế chính thức.');
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.deepEqual(result.documentSources[0]?.locators, ['Điều 21, khoản 2, điểm a']);
    assert.equal(result.documentSources[0]?.publicView, 'local_rehost');
    assert.equal(result.documentSources[0]?.publicUrl, `/tai-lieu/${DOCUMENT_A}`);
    assert.equal(result.answerSources.some((source) => source.type === 'document'), true);
    assert.equal(groqCalls, 0);
    assert.equal(fileSearchCalls, 1);
    const persisted = fixture.sql.prepare('SELECT document_sources_json FROM ai_chat_logs ORDER BY id DESC LIMIT 1').get() as { document_sources_json: string };
    assert.deepEqual(JSON.parse(persisted.document_sources_json)[0]?.locators, ['Điều 21, khoản 2, điểm a']);
    assert.equal(JSON.parse(persisted.document_sources_json)[0]?.publicView, undefined);
    assert.equal(JSON.parse(persisted.document_sources_json)[0]?.publicUrl, undefined);
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
    assert.match(String(filters[0]), new RegExp(`document_id = "${DOCUMENT_D}"`));
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
    assert.equal(fixture.queries.filter((query) => query.includes('FROM ai_documents')).length, 2);
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

test('provider abstraction injects the document adapter and passes D1 candidate IDs unchanged', async () => {
  const fixture = makeDatabase();
  const receivedCandidateIds: string[][] = [];
  let generalCalls = 0;
  const groundedDocument: GroundedDocumentAnswerProvider = {
    id: 'test-grounded-document',
    isConfigured: () => true,
    hasUsableCandidateIds: (ids) => ids.length > 0,
    disabledReason: 'CONFIG_DISABLED',
    timeoutReason: 'GEMINI_REQUEST_TIMEOUT',
    noCitationReason: 'GEMINI_NO_FILE_CITATION',
    unknownFailureReason: 'GEMINI_REQUEST_FAILED',
    shouldUsePublicFallback: () => false,
    classifyError: () => ({ reason: 'GEMINI_REQUEST_FAILED', errorClass: 'unknown' }),
    async retrieve(request) {
      receivedCandidateIds.push([...(request.allowedDocumentIds || [])]);
      return { reply: 'Nguồn từ adapter test.', documentSources: [{ documentId: DOCUMENT_A, fileName: 'quy-che.pdf', title: null, pageNumber: null }], groundingChunkCount: 0, documentIdMetadataCount: 0, pageNumberCount: 0 };
    },
  };
  const providers: Partial<AiAdvisorProviders> = {
    groundedDocument,
    generalGeneration: {
      id: 'test-general',
      isConfigured: () => true,
      async generate() { generalCalls += 1; return { reply: 'Không được gọi.', lastStatus: 200 }; },
    },
  };
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Quy đổi điểm ở HUB như nào?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), { ...env(fixture.DB), advisorProviders: providers }) as { reply: string; documentSources: Array<{ documentId: string }> };
    assert.equal(result.reply, 'Nguồn từ adapter test.');
    assert.deepEqual(receivedCandidateIds, [[DOCUMENT_A]]);
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.equal(generalCalls, 0);
  } finally { fixture.sql.close(); }
});

test('provider abstraction injects the general adapter without a network call', async () => {
  const fixture = makeDatabase();
  let generationCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network should not be called'); };
  try {
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Phương pháp Pomodoro là gì?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB),
      advisorProviders: {
        generalGeneration: {
          id: 'test-general',
          isConfigured: () => true,
          async generate({ messages }) {
            generationCalls += 1;
            assert.equal(messages.at(-1)?.content, 'Phương pháp Pomodoro là gì?');
            return { reply: 'Trả lời từ adapter test.', lastStatus: 200 };
          },
        },
      },
    }) as { reply: string };
    assert.equal(result.reply, 'Trả lời từ adapter test.');
    assert.equal(generationCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    fixture.sql.close();
  }
});

test('provider adapters contain no Advisor auth or D1 authority code; V2 remains explicit and feature-gated', () => {
  const core = readFileSync('cloudflare/worker/src/ai-advisor.ts', 'utf8');
  const adapters = readFileSync('cloudflare/worker/src/ai-advisor-providers.ts', 'utf8');
  assert.doesNotMatch(adapters, /requireBetterAuthSession|ai_documents|R2Bucket/);
  assert.match(core, /readAiAdvisorV2RuntimeConfig/);
  assert.match(core, /v2Config\.mode !== 'off'/);
  assert.doesNotMatch(adapters, /CloudflareAiSearchRetrievalProvider/);
});

test('Stage 2 zero-AI router returns only exact authoritative structured answers', async () => {
  const fixture = makeDatabase();
  let providerCalls = 0;
  const providers: Partial<AiAdvisorProviders> = {
    generalGeneration: {
      id: 'test-general', isConfigured: () => true,
      async generate() { providerCalls += 1; return { reply: 'Provider response', lastStatus: 200 }; },
    },
  };
  try {
    fixture.sql.prepare(`INSERT INTO course_schedules VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'course-en101', 'EN101', 'Advanced Writing', 3, null, null, 'HK1', 'Ngoại ngữ', 'Sáng', 'Thứ 2', 'A101', 'Cơ sở A',
      'published', null, 'en101', 'advanced writing', 1,
    );
    fixture.sql.prepare('INSERT INTO user_schedules VALUES (?,?,?,?,?)').run('schedule-1', USER, 'course-en101', 'HK1', '2026-09-20T00:00:00.000Z');
    const requestFor = (question: string) => new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' }, body: JSON.stringify({ question }),
    });
    const courseRequest = requestFor('EN101 có mấy tín chỉ?');
    const course = await handleAiAdvisor(courseRequest, new URL(courseRequest.url), { ...env(fixture.DB), advisorProviders: providers }) as { reply: string; documentSources: unknown[]; answerSources: unknown[] };
    assert.equal(course.reply, 'Môn Advanced Writing (EN101) có 3 tín chỉ.');
    assert.deepEqual(course.documentSources, []);
    assert.equal(course.answerSources.length, 1);
    const scheduleRequest = requestFor('Lịch học của tôi?');
    const schedule = await handleAiAdvisor(scheduleRequest, new URL(scheduleRequest.url), { ...env(fixture.DB), advisorProviders: providers }) as { reply: string };
    assert.match(schedule.reply, /Lịch học hiện có của bạn/);
    assert.match(schedule.reply, /Advanced Writing/);
    assert.equal(providerCalls, 0, 'eligible deterministic answers must bypass all providers');

    const explanatoryRequest = requestFor('Giải thích lịch học của tôi?');
    const explanatory = await handleAiAdvisor(explanatoryRequest, new URL(explanatoryRequest.url), { ...env(fixture.DB), advisorProviders: providers }) as { reply: string };
    assert.equal(explanatory.reply, 'Provider response');
    assert.equal(providerCalls, 1, 'explanatory structured questions retain the legacy generation path');
  } finally { fixture.sql.close(); }
});

test('Stage 2 answer cache is injectable, public-only in runtime, and a cache hit bypasses providers', async () => {
  const fixture = makeDatabase();
  const cache = new MemoryAdvisorCache<{ reply: string; answerSources: Array<{ type: string; title: string }> }>();
  const telemetry: string[] = [];
  let providerCalls = 0;
  try {
    fixture.sql.prepare(`INSERT INTO course_schedules VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'course-en101', 'EN101', 'Advanced Writing', 3, null, null, 'HK1', 'Ngoại ngữ', null, null, null, null,
      'published', null, 'en101', 'advanced writing', 1,
    );
    const requestFor = () => new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'EN101 có mấy tín chỉ?' }),
    });
    const runtimeEnv = {
      ...env(fixture.DB),
      advisorAnswerCache: cache,
      advisorTelemetry: { record(event: { answerPath: string }) { telemetry.push(event.answerPath); } },
      advisorProviders: { generalGeneration: { id: 'test-general', isConfigured: () => true, async generate() { providerCalls += 1; return { reply: 'not used', lastStatus: 200 }; } } },
    };
    const first = requestFor();
    await handleAiAdvisor(first, new URL(first.url), runtimeEnv);
    const second = requestFor();
    const cached = await handleAiAdvisor(second, new URL(second.url), runtimeEnv) as { reply: string };
    assert.equal(cached.reply, 'Môn Advanced Writing (EN101) có 3 tín chỉ.');
    assert.deepEqual(telemetry, ['D1', 'CACHE']);
    assert.equal(providerCalls, 0);
  } finally { fixture.sql.close(); }
});

test('Stage 2 zero-AI router remains owner-scoped and never treats policy or explanatory prompts as direct facts', () => {
  const personal = resolveZeroAiStructuredAnswer({
    question: 'Tôi đã tích lũy bao nhiêu tín chỉ?', intents: ['student_academic'], documentSearch: false, userId: USER,
    context: { studentAcademic: { summary: { accumulatedCredits: 42 } } },
  });
  assert.equal(personal?.reply, 'Bạn đã tích lũy 42 tín chỉ.');
  assert.deepEqual(personal?.cacheScope, { kind: 'USER', userId: USER });
  assert.equal(resolveZeroAiStructuredAnswer({
    question: 'Tại sao tôi đã tích lũy bao nhiêu tín chỉ?', intents: ['student_academic'], documentSearch: false, userId: USER,
    context: { studentAcademic: { summary: { accumulatedCredits: 42 } } },
  }), null);
  assert.equal(resolveZeroAiStructuredAnswer({
    question: 'Theo quy chế, EN101 có mấy tín chỉ?', intents: ['course_catalog', 'regulation_document'], documentSearch: true, userId: USER,
    context: { courses: [{ subject_name: 'Advanced Writing', course_code: 'EN101', credits: 3 }] },
  }), null);
});

test('Stage 2 cache keys isolate scope and naturally invalidate on a revision change', async () => {
  const publicA = await buildAnswerCacheKey({
    question: ' EN101 có mấy tín chỉ? ', scope: { kind: 'PUBLIC' }, sourceRevisionFingerprint: 'source-r1',
    providerOrFormatterVersion: 'zero-ai-formatter-v1', promptVersion: 'none', answerPathVersion: 'd1-direct-v1',
  });
  const publicEquivalent = await buildAnswerCacheKey({
    question: 'en101 có mấy tín chỉ', scope: { kind: 'PUBLIC' }, sourceRevisionFingerprint: 'source-r1',
    providerOrFormatterVersion: 'zero-ai-formatter-v1', promptVersion: 'none', answerPathVersion: 'd1-direct-v1',
  });
  const userA = await buildAnswerCacheKey({
    question: 'en101 có mấy tín chỉ', scope: { kind: 'USER', userId: USER }, sourceRevisionFingerprint: 'source-r1',
    providerOrFormatterVersion: 'zero-ai-formatter-v1', promptVersion: 'none', answerPathVersion: 'd1-direct-v1',
  });
  const userB = await buildAnswerCacheKey({
    question: 'en101 có mấy tín chỉ', scope: { kind: 'USER', userId: '22222222-2222-4222-8222-222222222222' }, sourceRevisionFingerprint: 'source-r1',
    providerOrFormatterVersion: 'zero-ai-formatter-v1', promptVersion: 'none', answerPathVersion: 'd1-direct-v1',
  });
  const role = await buildAnswerCacheKey({
    question: 'en101 có mấy tín chỉ', scope: { kind: 'ROLE', role: 'admin' }, sourceRevisionFingerprint: 'source-r1',
    providerOrFormatterVersion: 'zero-ai-formatter-v1', promptVersion: 'none', answerPathVersion: 'd1-direct-v1',
  });
  const anotherRole = await buildAnswerCacheKey({
    question: 'en101 có mấy tín chỉ', scope: { kind: 'ROLE', role: 'student' }, sourceRevisionFingerprint: 'source-r1',
    providerOrFormatterVersion: 'zero-ai-formatter-v1', promptVersion: 'none', answerPathVersion: 'd1-direct-v1',
  });
  assert.equal(publicA, publicEquivalent);
  assert.notEqual(publicA, userA);
  assert.notEqual(userA, userB);
  assert.notEqual(role, publicA);
  assert.notEqual(role, anotherRole);
  const revisionOne = await fingerprintDocumentRevisions([{
    id: DOCUMENT_A, version: 1, contentHash: 'hash-a', indexSourceKind: 'ocr_text', derivedSourceKind: 'ocr',
    extractionPipelineVersion: 'ocr-page-markdown-v2-pinned', derivedContentHash: 'derived-a', indexingStatus: 'completed',
  }]);
  const revisionSameDifferentOrder = await fingerprintDocumentRevisions([
    { id: DOCUMENT_B, version: 1, contentHash: 'hash-b', indexingStatus: 'completed' },
    { id: DOCUMENT_A, version: 1, contentHash: 'hash-a', indexingStatus: 'completed' },
  ]);
  const revisionSameReordered = await fingerprintDocumentRevisions([
    { id: DOCUMENT_A, version: 1, contentHash: 'hash-a', indexingStatus: 'completed' },
    { id: DOCUMENT_B, version: 1, contentHash: 'hash-b', indexingStatus: 'completed' },
  ]);
  const revisionChanged = await fingerprintDocumentRevisions([{ id: DOCUMENT_A, version: 2, contentHash: 'hash-a', indexingStatus: 'completed' }]);
  const pipelineChanged = await fingerprintDocumentRevisions([{
    id: DOCUMENT_A, version: 1, contentHash: 'hash-a', indexSourceKind: 'ocr_text', derivedSourceKind: 'ocr',
    extractionPipelineVersion: 'ocr-page-markdown-v3-pinned', derivedContentHash: 'derived-a', indexingStatus: 'completed',
  }]);
  const derivedHashChanged = await fingerprintDocumentRevisions([{
    id: DOCUMENT_A, version: 1, contentHash: 'hash-a', indexSourceKind: 'ocr_text', derivedSourceKind: 'ocr',
    extractionPipelineVersion: 'ocr-page-markdown-v2-pinned', derivedContentHash: 'derived-b', indexingStatus: 'completed',
  }]);
  assert.notEqual(revisionOne, revisionChanged);
  assert.notEqual(revisionOne, pipelineChanged);
  assert.notEqual(revisionOne, derivedHashChanged);
  assert.equal(revisionSameDifferentOrder, revisionSameReordered);
  const retrievalOne = await buildRetrievalCacheKey({ question: 'quy đổi điểm', scope: { kind: 'PUBLIC' }, allowedDocumentRevisionFingerprint: revisionOne, retrievalConfigVersion: 'v1' });
  const retrievalChanged = await buildRetrievalCacheKey({ question: 'quy đổi điểm', scope: { kind: 'PUBLIC' }, allowedDocumentRevisionFingerprint: revisionChanged, retrievalConfigVersion: 'v1' });
  assert.notEqual(retrievalOne, retrievalChanged);
  const cache = new MemoryAdvisorCache<string>();
  await cache.put(retrievalOne, 'old retrieval', 60);
  assert.equal(await cache.get(retrievalChanged), null, 'a revision change must naturally miss without a global purge');
});

test('Stage 2 quota governor calculates modes from supplied measurements and defaults to NORMAL without one', () => {
  assert.deepEqual(evaluateAdvisorQuota(undefined), {
    mode: 'NORMAL', measured: false, highestUsageRatio: null, preferCache: false, preferDirectAnswer: false, allowGeneration: true,
  });
  assert.equal(evaluateAdvisorQuota({ generationUsageRatio: 0.7 }).mode, 'ECONOMY');
  assert.equal(evaluateAdvisorQuota({ searchUsageRatio: 0.85 }).mode, 'CONSERVATIVE');
  const survival = evaluateAdvisorQuota({ ingestionUsageRatio: 0.95 });
  assert.equal(survival.mode, 'SURVIVAL');
  assert.equal(survival.allowGeneration, false);
  assert.deepEqual(evaluateAdvisorQuota({ generationUsageRatio: 1.2 }), {
    mode: 'NORMAL', measured: false, highestUsageRatio: null, preferCache: false, preferDirectAnswer: false, allowGeneration: true,
  });
});

test('Stage 6 OFF preserves the legacy document provider and makes zero V2 searches', async () => {
  const fixture = makeDatabase();
  let legacyCalls = 0;
  let searchCalls = 0;
  let workersAiCalls = 0;
  let backgroundTasks = 0;
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => {
        legacyCalls += 1;
        return { reply: 'Legacy grounded', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] };
      },
      advisorV2AiSearchClient: { async search() { searchCalls += 1; return { chunks: [] }; } },
      advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
      AI: { async run() { workersAiCalls += 1; return { choices: [] }; } },
    }, { waitUntil() { backgroundTasks += 1; } }) as { reply: string };
    assert.equal(result.reply, 'Legacy grounded');
    assert.equal(legacyCalls, 1);
    assert.equal(searchCalls, 0);
    assert.equal(workersAiCalls, 0);
    assert.equal(backgroundTasks, 0);
  } finally { fixture.sql.close(); }
});

test('Stage 7B1C ON uses the configured local bindings and validates Workers AI citations', async () => {
  const fixture = makeDatabase();
  let searchCalls = 0;
  let workersAiCalls = 0;
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB),
      AI_ADVISOR_V2_MODE: 'on',
      AI_ADVISOR_SEARCH: {
        get(instance) {
          assert.equal(instance, 'hub-ai-text-production');
          return {
            async search() {
              searchCalls += 1;
              return { chunks: [{ id: 'chunk', score: 0.7, text: 'Điều 10 quy định thang điểm 4.', item: { key: 'safe-part.md', metadata: { document_id: DOCUMENT_A, active: true } } }] };
            },
          };
        },
      },
      AI: {
        async run(_model, input) {
          workersAiCalls += 1;
          assert.equal(input.tool_choice, 'required');
          assert.equal(input.max_completion_tokens, 300);
          return { choices: [{ message: { tool_calls: [{ type: 'function', function: { name: 'submit_grounded_answer', arguments: JSON.stringify({ supported: true, answer: 'V2 có dẫn nguồn.', source_ids: ['S1'], support_spans: [{ source_id: 'S1', quote: 'Điều 10' }] }) } }] } }] };
        },
      },
    }) as { reply: string };
    assert.match(result.reply, /Đoạn nguồn liên quan/);
    assert.doesNotMatch(result.reply, /V2 có dẫn nguồn/);
    assert.equal(searchCalls, 1);
    assert.equal(workersAiCalls, 1);
  } finally { fixture.sql.close(); }
});

test('Stage 6 SHADOW discards V2 success or failure and keeps the legacy user response', async () => {
  const fixture = makeDatabase();
  let legacyCalls = 0;
  let searchCalls = 0;
  const background: Promise<unknown>[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const runtime = {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow', GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => {
        legacyCalls += 1;
        return { reply: 'Legacy wins in shadow', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] };
      },
      advisorV2AiSearchClient: { async search() { searchCalls += 1; throw new Error('injected V2 failure'); } },
      advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
      advisorV2EvidenceGenerator: { id: 'fake-v2', isConfigured: () => true, async generate() { return { supported: true, answer: 'must not expose', sourceIds: ['S1'] }; } },
    };
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const result = await handleAiAdvisor(request, new URL(request.url), runtime, { waitUntil(task) { background.push(task); } }) as { reply: string };
    await Promise.all(background);
    assert.equal(result.reply, 'Legacy wins in shadow');
    assert.equal(searchCalls, 1);
    assert.equal(legacyCalls, 1);
  } finally { fixture.sql.close(); }
});

test('Stage 7B2A1 SHADOW returns legacy before pending V2 and emits one content-free final event', async () => {
  const fixture = makeDatabase();
  const background: Promise<unknown>[] = [];
  const events: AdvisorShadowEvent[] = [];
  let releaseSearch!: (value: { chunks: Array<Record<string, unknown>> }) => void;
  let searchCalls = 0;
  let generatorCalls = 0;
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const question = 'Quy đổi điểm ở HUB như nào?';
    const request = v2RequestFor(question);
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow', GEMINI_FILE_SEARCH_ENABLED: 'true',
      GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => ({ reply: 'Legacy only', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] }),
      advisorV2AiSearchClient: { search() { searchCalls += 1; return new Promise((resolve) => { releaseSearch = resolve; }); } },
      advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
      advisorV2EvidenceGenerator: { id: 'test-v2', isConfigured: () => true, async generate() { generatorCalls += 1; return { supported: true, answer: 'V2 secret answer', sourceIds: ['S1'] }; } },
      advisorShadowTelemetry: { record(event) { events.push(event); } },
    }, { waitUntil(task) { background.push(task); } }) as { reply: string };
    assert.equal(result.reply, 'Legacy only');
    assert.equal(background.length, 1);
    for (let step = 0; step < 200 && searchCalls === 0; step += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(searchCalls, 1, 'V2 should still be pending after the legacy response');
    assert.equal(events.length, 0, 'final event is emitted only after V2 settles');
    releaseSearch({ chunks: [{ id: 'chunk', score: 0.7, text: 'Điểm SECRET_EVIDENCE_SENTINEL', item: { key: 'private-r2-path', metadata: { document_id: DOCUMENT_A, active: true } } }] });
    await Promise.all(background);
    assert.equal(generatorCalls, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'SUPPORTED_VALID_CITATIONS');
    assert.equal(events[0].search_calls, 1);
    assert.equal(events[0].generator_calls, 1);
    assert.equal(events[0].citation_validation, 'pass');
    assert.equal(events[0].retrieval_error_stage, null);
    assert.equal(events[0].retrieval_error_name, null);
    assert.equal(events[0].retrieval_status, null);
    assert.equal(events[0].retrieval_provider_error_count, 0);
    assert.equal(events[0].retrieval_timeout, false);
    const logged = JSON.stringify(events[0]);
    for (const forbidden of [question, 'V2 secret answer', 'SECRET_EVIDENCE_SENTINEL', USER, 'private-r2-path', 'student@example.test']) {
      assert.ok(!logged.includes(forbidden), `shadow telemetry leaked ${forbidden}`);
    }
  } finally { fixture.sql.close(); }
});

test('Stage 7B2A3C shadow safely classifies instance resolution failure without changing legacy output', async () => {
  const fixture = makeDatabase();
  const background: Promise<unknown>[] = [];
  const events: AdvisorShadowEvent[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow', GEMINI_FILE_SEARCH_ENABLED: 'true',
      GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => ({ reply: 'Legacy remains visible', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] }),
      AI_ADVISOR_SEARCH: { get() { throw new Error('PRIVATE_PROVIDER_MESSAGE'); } },
      advisorV2EvidenceGenerator: { id: 'fake', isConfigured: () => true, async generate() { throw new Error('must not run'); } },
      advisorShadowTelemetry: { record(event) { events.push(event); } },
    }, { waitUntil(task) { background.push(task); } }) as { reply: string };
    assert.equal(result.reply, 'Legacy remains visible');
    await Promise.all(background);
    assert.equal(events.length, 1);
    assert.equal(events[0].safe_error_class, 'retrieval');
    assert.equal(events[0].retrieval_error_stage, 'INSTANCE_RESOLUTION');
    assert.equal(events[0].retrieval_error_name, 'Error');
    assert.equal(events[0].retrieval_provider_error_count, 0);
    assert.equal(events[0].search_calls, 1);
    assert.equal(events[0].generator_calls, 0);
    assert.equal(JSON.stringify(events[0]).includes('PRIVATE_PROVIDER_MESSAGE'), false);
  } finally { fixture.sql.close(); }
});

test('Stage 7B2A3C shadow classifies provider, timeout, normalization and post-auth errors without content leakage', async () => {
  const secret = 'PRIVATE_QUERY_EVIDENCE_USER_STACK_PROVIDER_MESSAGE';
  const scenarios = [
    { expected: 'SEARCH_INVOCATION', name: 'Error', status: 503, timeout: false, run: () => { throw Object.assign(new Error(secret), { status: 503 }); } },
    { expected: 'SEARCH_INVOCATION', name: 'TypeError', status: null, timeout: false, run: () => { throw new TypeError(secret); } },
    { expected: 'SEARCH_INVOCATION', name: 'AbortError', status: null, timeout: true, run: () => { throw new DOMException(secret, 'AbortError'); } },
    { expected: 'SEARCH_RESPONSE', name: 'TypeError', status: null, timeout: false, run: () => ({ chunks: 'bad' }) },
    { expected: 'POST_AUTHORIZATION', name: 'Error', status: null, timeout: false, run: () => ({ chunks: [{ item: { metadata: { get document_id() { throw new Error(secret); } } } }] }) },
    { expected: 'RESPONSE_NORMALIZATION', name: 'Error', status: null, timeout: false, run: () => ({ chunks: [{
      id: 'chunk', item: { key: 'PRIVATE_R2_PATH', metadata: { document_id: DOCUMENT_A, active: true } },
      get text() { throw new Error(secret); },
    }] }) },
  ] as const;
  for (const scenario of scenarios) {
    const fixture = makeDatabase();
    const background: Promise<unknown>[] = [];
    const events: AdvisorShadowEvent[] = [];
    let providerCalls = 0;
    try {
      insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
      const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
      const result = await handleAiAdvisor(request, new URL(request.url), {
        ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow', GEMINI_FILE_SEARCH_ENABLED: 'true',
        GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
        fileSearchAnswer: async () => ({ reply: 'Legacy remains visible', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] }),
        advisorV2AiSearchClient: { async search() { providerCalls += 1; return scenario.run() as { chunks: never[] }; } },
        advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
        advisorV2EvidenceGenerator: { id: 'fake', isConfigured: () => true, async generate() { throw new Error('must not run'); } },
        advisorShadowTelemetry: { record(event) { events.push(event); } },
      }, { waitUntil(task) { background.push(task); } }) as { reply: string };
      assert.equal(result.reply, 'Legacy remains visible');
      await Promise.all(background);
      assert.equal(providerCalls, 1);
      assert.equal(events.length, 1);
      assert.equal(events[0].safe_error_class, 'retrieval');
      assert.equal(events[0].retrieval_error_stage, scenario.expected);
      assert.equal(events[0].retrieval_error_name, scenario.name);
      assert.equal(events[0].retrieval_status, scenario.status);
      assert.equal(events[0].retrieval_timeout, scenario.timeout);
      assert.equal(events[0].retrieval_provider_error_count, scenario.expected === 'SEARCH_INVOCATION' ? 1 : 0);
      assert.equal(events[0].search_calls, 1);
      assert.equal(events[0].generator_calls, 0);
      assert.equal(JSON.stringify(events[0]).includes(secret), false);
      assert.equal(JSON.stringify(events[0]).includes('PRIVATE_R2_PATH'), false);
    } finally { fixture.sql.close(); }
  }
});

test('Stage 7B2A1 SHADOW isolates identity, retrieval, generator, citation and telemetry failures', async () => {
  const cases = [
    { name: 'identity', identityFails: true, expected: 'V2_INTERNAL_ERROR', searches: 0, generations: 0 },
    { name: 'setup', expected: 'V2_INTERNAL_ERROR', searches: 0, generations: 0 },
    { name: 'search', searchFails: true, expected: 'RETRIEVAL_ERROR', searches: 1, generations: 0 },
    { name: 'empty', chunks: [], expected: 'RETRIEVAL_EMPTY', searches: 1, generations: 0 },
    { name: 'generator', generatorFails: true, expected: 'GENERATOR_ERROR', searches: 1, generations: 1 },
    { name: 'citation', citation: 'S9', expected: 'INVALID_CITATIONS', searches: 1, generations: 1 },
    { name: 'abstention', supported: false, expected: 'INSUFFICIENT_EVIDENCE', searches: 1, generations: 1 },
    { name: 'survival', survival: true, expected: 'QUOTA_ABSTENTION', searches: 0, generations: 0 },
  ] as const;
  for (const scenario of cases) {
    const fixture = makeDatabase();
    const background: Promise<unknown>[] = [];
    const events: AdvisorShadowEvent[] = [];
    let searches = 0;
    let generations = 0;
    try {
      insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
      const db = scenario.name === 'identity' ? {
        prepare(query: string) {
          if (query.includes('derived_content_hash')) throw new Error('identity failure');
          return fixture.DB.prepare(query);
        },
      } as D1Database : fixture.DB;
      const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
      const runtime = {
        ...env(db), AI_ADVISOR_V2_MODE: 'shadow',
        ...(scenario.name === 'survival' ? { advisorQuotaUsage: { searchUsageRatio: 0.95 } } : {}),
        GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
        fileSearchAnswer: async () => ({ reply: 'Legacy survives', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] }),
        advisorV2AiSearchClient: { async search() {
          searches += 1;
          if (scenario.name === 'search') throw new Error('provider detail must not be logged');
          return { chunks: scenario.name === 'empty' ? [] : [{ id: 'chunk', score: 0.7, text: 'Thang điểm Public support', item: { key: 'r2-secret-path', metadata: { document_id: DOCUMENT_A, active: true } } }] };
        } },
        advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
        advisorV2EvidenceGenerator: { id: 'fake', isConfigured: () => true, async generate() {
          generations += 1;
          if (scenario.name === 'generator') throw new Error('generator detail must not be logged');
          return { supported: scenario.name !== 'abstention', answer: 'V2 answer', sourceIds: [scenario.name === 'citation' ? 'S9' : 'S1'] };
        } },
        advisorShadowTelemetry: { async record(event) { events.push(event); throw new Error('sink failure'); } },
      };
      if (scenario.name === 'setup') Object.defineProperty(runtime, 'advisorV2AiSearchClient', { get() { throw new Error('V2 setup failed'); } });
      const result = await handleAiAdvisor(request, new URL(request.url), runtime, { waitUntil(task) { background.push(task); } }) as { reply: string };
      if (scenario.name === 'survival') assert.match(result.reply, /chưa thể xác minh/i);
      else assert.equal(result.reply, 'Legacy survives', scenario.name);
      await Promise.all(background);
      assert.equal(events.length, 1, scenario.name);
      assert.equal(events[0].outcome, scenario.expected, scenario.name);
      assert.equal(events[0].search_calls, scenario.searches, scenario.name);
      assert.equal(events[0].generator_calls, scenario.generations, scenario.name);
      assert.equal(searches, scenario.searches, scenario.name);
      assert.equal(generations, scenario.generations, scenario.name);
      assert.ok(!JSON.stringify(events[0]).includes('r2-secret-path'));
    } finally { fixture.sql.close(); }
  }
});

test('Stage 7B2A1 SHADOW with no authorized documents makes no provider calls', async () => {
  const fixture = makeDatabase();
  const background: Promise<unknown>[] = [];
  const events: AdvisorShadowEvent[] = [];
  let calls = 0;
  try {
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow',
      advisorV2AiSearchClient: { async search() { calls += 1; return { chunks: [] }; } },
      advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
      advisorV2EvidenceGenerator: { id: 'fake', isConfigured: () => true, async generate() { calls += 1; return { supported: false, answer: '', sourceIds: [] }; } },
      advisorShadowTelemetry: { record(event) { events.push(event); } },
    }, { waitUntil(task) { background.push(task); } });
    await Promise.all(background);
    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'NO_AUTHORIZED_DOCUMENTS');
    assert.equal(events[0].search_calls, 0);
    assert.equal(events[0].generator_calls, 0);
    assert.equal(calls, 0);
  } finally { fixture.sql.close(); }
});

test('Stage 7B2A1 SHADOW scheduling failure never starts V2 or changes legacy', async () => {
  const fixture = makeDatabase();
  let searches = 0;
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow', GEMINI_FILE_SEARCH_ENABLED: 'true',
      GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => ({ reply: 'Legacy despite scheduler', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] }),
      advisorV2AiSearchClient: { async search() { searches += 1; return { chunks: [] }; } },
    }, { waitUntil() { throw new Error('scheduler unavailable'); } }) as { reply: string };
    await Promise.resolve();
    assert.equal(result.reply, 'Legacy despite scheduler');
    assert.equal(searches, 0);
  } finally { fixture.sql.close(); }
});

test('Stage 7B2A2 synthetic public-document shapes schedule correlated content-free shadow lifecycle events', async () => {
  const fixture = makeDatabase();
  const originalInfo = console.info;
  const logs: Array<Record<string, unknown>> = [];
  const background: Promise<unknown>[] = [];
  const questions = [
    'Theo sổ tay sinh viên, cần chuẩn bị giấy tờ gì?',
    'Theo quy chế đào tạo, điều kiện bảo lưu học phần là gì?',
    'Theo quy định học bổng, điều kiện xét học bổng là gì?',
    'Theo quy chế, có học bổng cho sinh viên trên sao Hỏa không?',
  ];
  try {
    console.info = (value: unknown) => {
      if (typeof value !== 'string') return;
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        if (String(parsed.event).startsWith('ai_advisor_v2_shadow')) logs.push(parsed);
      } catch { /* unrelated console message */ }
    };
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    for (const question of questions) {
      const route = routeAdvisorDocuments(question);
      const intents = classifyAdvisorIntents(question);
      assert.equal(route.documentSearch, true);
      assert.equal(intents.includes('regulation_document'), true);
      assert.equal(resolveZeroAiStructuredAnswer({ question, intents, documentSearch: route.documentSearch, context: {}, userId: USER }), null);
      const start = logs.length;
      const request = v2RequestFor(question);
      const result = await handleAiAdvisor(request, new URL(request.url), {
        ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow', GEMINI_FILE_SEARCH_ENABLED: 'true',
        GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
        fileSearchAnswer: async () => ({ reply: 'Legacy only', documentSources: [] }),
        advisorV2AiSearchClient: { async search() { return { chunks: [] }; } },
        advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
        advisorV2EvidenceGenerator: { id: 'fake', isConfigured: () => true, async generate() { return { supported: false, answer: '', sourceIds: [] }; } },
      }, { waitUntil(task) { background.push(task); } }) as { reply: string };
      assert.ok(result.reply.length > 0);
      assert.notEqual(result.reply, 'V2 text');
      assert.equal(background.length, 1);
      await Promise.all(background.splice(0));
      const events = logs.slice(start);
      assert.deepEqual(events.map((event) => event.event), [
        'ai_advisor_v2_shadow_dispatch', 'ai_advisor_v2_shadow_scheduled',
        'ai_advisor_v2_shadow_started', 'ai_advisor_v2_shadow',
      ]);
      assert.equal(new Set(events.map((event) => event.shadow_trace_id)).size, 1);
      assert.equal(events[3].mode, 'shadow');
      assert.ok(!JSON.stringify(events).includes(question));
    }
  } finally { console.info = originalInfo; fixture.sql.close(); }
});

test('Stage 7B2A3A fixed public handbook and scholarship questions schedule document shadow work', async () => {
  const fixture = makeDatabase();
  const questions = [
    'Theo sổ tay sinh viên, cần chuẩn bị giấy tờ gì?',
    'Theo quy định học bổng, điều kiện xét học bổng là gì?',
  ];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Cẩm nang sinh viên', category: 'student_handbook' });
    insertOfficialDocument(fixture, { id: DOCUMENT_B, title: 'Quy chế học bổng', category: 'scholarship' });
    for (const [index, question] of questions.entries()) {
      const route = routeAdvisorDocuments(question);
      const intents = classifyAdvisorIntents(question);
      assert.equal(route.documentSearch, true);
      assert.equal(route.domain, index === 0 ? 'student_handbook' : 'scholarship');
      assert.equal(intents.includes('regulation_document'), true);
      assert.equal(resolveZeroAiStructuredAnswer({ question, intents, documentSearch: route.documentSearch, context: {}, userId: USER }), null);
      const candidates = await selectAdvisorDocumentCandidates(env(fixture.DB), route);
      assert.ok(candidates.some((candidate) => candidate.id === (index === 0 ? DOCUMENT_A : DOCUMENT_B)));
      const background: Promise<unknown>[] = [];
      const request = v2RequestFor(question);
      const result = await handleAiAdvisor(request, new URL(request.url), {
        ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow', GEMINI_FILE_SEARCH_ENABLED: 'true',
        GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
        fileSearchAnswer: async () => ({ reply: 'Legacy answer', documentSources: [] }),
        advisorV2AiSearchClient: { async search() { return { chunks: [] }; } },
        advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
      }, { waitUntil(task) { background.push(task); } }) as { reply: string };
      assert.ok(result.reply.length > 0);
      assert.equal(background.length, 1);
      await Promise.all(background);
    }
  } finally { fixture.sql.close(); }
});

test('Stage 7B2A2 shadow emits safe skip events for zero-AI and non-document requests, but never OFF or anonymous', async () => {
  const fixture = makeDatabase();
  const originalInfo = console.info;
  const logs: Array<Record<string, unknown>> = [];
  try {
    console.info = (value: unknown) => {
      if (typeof value !== 'string') return;
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        if (String(parsed.event).startsWith('ai_advisor_v2_shadow')) logs.push(parsed);
      } catch { /* unrelated console message */ }
    };
    fixture.sql.prepare(`INSERT INTO course_schedules VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'course-en101', 'EN101', 'Advanced Writing', 3, null, null, 'HK1', 'Ngoại ngữ', null, null, null, null,
      'published', null, 'en101', 'advanced writing', 1,
    );
    const zeroRequest = v2RequestFor('EN101 có mấy tín chỉ?');
    await handleAiAdvisor(zeroRequest, new URL(zeroRequest.url), { ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow' });
    assert.equal(logs.at(-1)?.event, 'ai_advisor_v2_shadow_skip');
    assert.equal(logs.at(-1)?.skip_reason, 'ZERO_AI');

    const generalRequest = v2RequestFor('Xin chào');
    await handleAiAdvisor(generalRequest, new URL(generalRequest.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow',
      advisorProviders: { generalGeneration: { id: 'fake', isConfigured: () => true, async generate() { return { reply: 'Legacy greeting', lastStatus: 200 }; } } },
    });
    assert.equal(logs.at(-1)?.event, 'ai_advisor_v2_shadow_skip');
    assert.equal(logs.at(-1)?.skip_reason, 'NON_DOCUMENT_INTENT');
    const beforeOff = logs.length;
    const offRequest = v2RequestFor('Xin chào');
    await handleAiAdvisor(offRequest, new URL(offRequest.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'off',
      advisorProviders: { generalGeneration: { id: 'fake', isConfigured: () => true, async generate() { return { reply: 'Legacy greeting', lastStatus: 200 }; } } },
    });
    assert.equal(logs.length, beforeOff);
    const anonymous = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Xin chào' }),
    });
    await assert.rejects(() => handleAiAdvisor(anonymous, new URL(anonymous.url), { ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow' }));
    assert.equal(logs.length, beforeOff);
    const printed = JSON.stringify(logs);
    for (const forbidden of ['EN101 có mấy tín chỉ?', 'Xin chào', USER, 'student@example.test', 'private-r2-path']) {
      assert.ok(!printed.includes(forbidden));
    }
  } finally { console.info = originalInfo; fixture.sql.close(); }
});

test('Stage 7B2A2 shadow lifecycle and final console failures cannot change the legacy answer', async () => {
  const fixture = makeDatabase();
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const background: Promise<unknown>[] = [];
  let searchCalls = 0;
  try {
    const failShadowLog = (value: unknown) => {
      if (typeof value === 'string' && value.includes('"event":"ai_advisor_v2_shadow')) throw new Error('telemetry failed');
    };
    console.info = failShadowLog;
    console.warn = failShadowLog;
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'shadow', GEMINI_FILE_SEARCH_ENABLED: 'true',
      GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => ({ reply: 'Legacy survives telemetry failure', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] }),
      advisorV2AiSearchClient: { async search() { searchCalls += 1; throw new Error('provider unavailable'); } },
      advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
      advisorV2EvidenceGenerator: { id: 'fake', isConfigured: () => true, async generate() { return { supported: false, answer: '', sourceIds: [] }; } },
    }, { waitUntil(task) { background.push(task); } }) as { reply: string };
    await Promise.all(background);
    assert.equal(result.reply, 'Legacy survives telemetry failure');
    assert.equal(searchCalls, 1);
  } finally { console.info = originalInfo; console.warn = originalWarn; fixture.sql.close(); }
});

test('Stage 6 CANARY zero percent remains legacy and ON exposes only citation-validated V2 evidence', async () => {
  const fixture = makeDatabase();
  let legacyCalls = 0;
  let searchCalls = 0;
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const common = {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => {
        legacyCalls += 1;
        return { reply: 'Legacy canary', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] };
      },
      advisorV2AiSearchClient: {
        async search() {
          searchCalls += 1;
          return { chunks: [{ id: 'chunk', score: 0.7, text: 'Điều 10 quy định thang điểm 4.', item: { key: 'private-key-never-returned', metadata: { document_id: DOCUMENT_A, active: true } } }] };
        },
      },
      advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
      advisorV2EvidenceGenerator: { id: 'fake-v2', isConfigured: () => true, async generate() { return { supported: true, answer: 'V2 grounded', sourceIds: ['S1'] }; } },
    };
    const canaryRequest = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const canary = await handleAiAdvisor(canaryRequest, new URL(canaryRequest.url), { ...common, AI_ADVISOR_V2_MODE: 'canary', AI_ADVISOR_V2_CANARY_PERCENT: '0' }) as { reply: string };
    assert.equal(canary.reply, 'Legacy canary');
    assert.equal(searchCalls, 0);
    const onRequest = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const on = await handleAiAdvisor(onRequest, new URL(onRequest.url), { ...common, AI_ADVISOR_V2_MODE: 'on' }) as { reply: string; documentSources: unknown[] };
    assert.match(on.reply, /Đoạn nguồn liên quan/);
    assert.doesNotMatch(on.reply, /V2 grounded/);
    assert.equal(searchCalls, 1);
    assert.equal(legacyCalls, 1);
    assert.equal(on.documentSources.length, 1);
  } finally { fixture.sql.close(); }
});

test('selected CANARY serves a validated V2 answer without invoking legacy or retrying providers', async () => {
  const fixture = makeDatabase();
  const events: AdvisorCanaryEvent[] = [];
  const consoleEvents: Record<string, unknown>[] = [];
  const originalInfo = console.info;
  console.info = (value: unknown) => {
    if (typeof value === 'string' && value.includes('"event":"ai_advisor_v2_canary')) consoleEvents.push(JSON.parse(value));
  };
  let legacyCalls = 0;
  let searchCalls = 0;
  let generatorCalls = 0;
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'canary', AI_ADVISOR_V2_CANARY_PERCENT: '100',
      GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => { legacyCalls += 1; return { reply: 'Legacy fallback', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] }; },
      advisorV2AiSearchClient: { async search() {
        assert.equal(consoleEvents[0]?.event, 'ai_advisor_v2_canary_dispatch', 'dispatch precedes retrieval');
        searchCalls += 1; return { chunks: [{ id: 'chunk', score: 0.7, text: 'Điều 10 quy định thang điểm 4.', item: { key: 'private-path', metadata: { document_id: DOCUMENT_A, active: true } } }] };
      } },
      advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
      advisorV2EvidenceGenerator: { id: 'fake-v2', isConfigured: () => true, async generate() { generatorCalls += 1; return { supported: true, answer: 'V2 grounded answer', sourceIds: ['S1'] }; } },
      advisorCanaryTelemetry: { record(event: AdvisorCanaryEvent) { events.push(event); } },
    }) as { reply: string };
    assert.match(result.reply, /Điều 10 quy định thang điểm 4/);
    assert.doesNotMatch(result.reply, /V2 grounded answer/);
    assert.equal(legacyCalls, 0);
    assert.equal(searchCalls, 1);
    assert.equal(generatorCalls, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.response_source, 'v2');
    assert.equal(events[0]?.v2_result_class, 'SUPPORTED_VALID_CITATIONS');
    assert.equal(events[0]?.fallback_reason, null);
    assert.equal(events[0]?.search_calls, 1);
    assert.equal(events[0]?.generator_calls, 1);
    assert.deepEqual(consoleEvents.map(event => event.event), ['ai_advisor_v2_canary_dispatch', 'ai_advisor_v2_canary']);
    assert.match(events[0]!.trace_id, /^[0-9a-f-]{36}$/);
    assert.equal(consoleEvents[0]?.trace_id, events[0]?.trace_id);
    assert.deepEqual(Object.keys(consoleEvents[0]!).sort(), ['canary_selected', 'event', 'mode', 'trace_id']);
    assert.ok(events[0]!.retrieval_duration_ms >= 0);
    assert.ok(events[0]!.generator_duration_ms >= 0);
    const safeEvent = JSON.stringify(events[0]);
    for (const forbidden of ['Quy đổi điểm', 'V2 grounded answer', 'Điều 10', USER, 'private-path']) {
      assert.equal(safeEvent.includes(forbidden), false);
    }
  } finally { console.info = originalInfo; fixture.sql.close(); }
});

test('selected CANARY falls back once for abstention, retrieval/generator errors, timeout, and invalid grounding', async () => {
  const chunk = { id: 'chunk', score: 0.7, text: 'Điều 10 quy định thang điểm 4.', item: { key: 'private-path', metadata: { document_id: DOCUMENT_A, active: true } } };
  const scenarios = [
    { name: 'abstention', search: async () => ({ chunks: [chunk] }), generate: async () => ({ supported: false, answer: '', sourceIds: [] }), reason: 'abstention', searchCalls: 1, generatorCalls: 1 },
    { name: 'retrieval error', search: async () => { throw new Error('provider failed'); }, generate: async () => ({ supported: true, answer: 'bad', sourceIds: ['S1'] }), reason: 'retrieval_error', searchCalls: 1, generatorCalls: 0 },
    { name: 'generator error', search: async () => ({ chunks: [chunk] }), generate: async () => { throw new Error('provider failed'); }, reason: 'generator_error', searchCalls: 1, generatorCalls: 1 },
    { name: 'timeout', search: async () => ({ chunks: [chunk] }), generate: async () => { throw new DOMException('timed out', 'TimeoutError'); }, reason: 'timeout', searchCalls: 1, generatorCalls: 1 },
    { name: 'invalid citation', search: async () => ({ chunks: [chunk] }), generate: async () => ({ supported: true, answer: 'bad citation', sourceIds: ['S9'] }), reason: 'invalid_grounding', searchCalls: 1, generatorCalls: 1 },
  ] as const;
  for (const scenario of scenarios) {
    const fixture = makeDatabase();
    const events: AdvisorCanaryEvent[] = [];
    const lifecycle: Record<string, unknown>[] = [];
    const originalInfo = console.info;
    console.info = (value: unknown) => {
      if (typeof value === 'string' && value.includes('"event":"ai_advisor_v2_canary')) lifecycle.push(JSON.parse(value));
    };
    let legacyCalls = 0;
    let searchCalls = 0;
    let generatorCalls = 0;
    try {
      insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
      const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
      const result = await handleAiAdvisor(request, new URL(request.url), {
        ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'canary', AI_ADVISOR_V2_CANARY_PERCENT: '100',
        GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
        fileSearchAnswer: async () => { legacyCalls += 1; return { reply: 'Legacy fallback', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] }; },
        advisorV2AiSearchClient: { async search() { searchCalls += 1; return scenario.search(); } },
        advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
        advisorV2EvidenceGenerator: { id: 'fake-v2', isConfigured: () => true, async generate() { generatorCalls += 1; return scenario.generate(); } },
        advisorCanaryTelemetry: { record(event: AdvisorCanaryEvent) { events.push(event); } },
      }) as { reply: string };
      assert.equal(result.reply, 'Legacy fallback', scenario.name);
      assert.equal(legacyCalls, 1, scenario.name);
      assert.equal(searchCalls, scenario.searchCalls, scenario.name);
      assert.equal(generatorCalls, scenario.generatorCalls, scenario.name);
      assert.equal(events.length, 1, scenario.name);
      assert.deepEqual(lifecycle.map(event => event.event), ['ai_advisor_v2_canary_dispatch', 'ai_advisor_v2_canary'], scenario.name);
      assert.equal(lifecycle[0]?.trace_id, events[0]?.trace_id, scenario.name);
      assert.ok(events[0]!.retrieval_duration_ms >= 0 && events[0]!.generator_duration_ms >= 0);
      for (const forbidden of ['Quy đổi điểm', 'Điều 10', USER, 'private-path', 'provider failed']) {
        assert.equal(JSON.stringify(lifecycle).includes(forbidden), false, scenario.name);
      }
      assert.equal(events[0]?.response_source, 'legacy_fallback', scenario.name);
      assert.equal(events[0]?.fallback_reason, scenario.reason, scenario.name);
      assert.equal(events[0]?.search_calls, scenario.searchCalls, scenario.name);
      assert.equal(events[0]?.generator_calls, scenario.generatorCalls, scenario.name);
      assert.ok(searchCalls <= 1 && generatorCalls <= 1, scenario.name);
    } finally { console.info = originalInfo; fixture.sql.close(); }
  }
});

test('selected CANARY falls back for a support span rejected by the unchanged Workers AI validator', async () => {
  const fixture = makeDatabase();
  const events: AdvisorCanaryEvent[] = [];
  let legacyCalls = 0;
  let searchCalls = 0;
  let generatorCalls = 0;
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'canary', AI_ADVISOR_V2_CANARY_PERCENT: '100',
      GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => { legacyCalls += 1; return { reply: 'Legacy fallback', documentSources: [{ documentId: DOCUMENT_A, fileName: 'q.pdf', title: 'Quy chế' }] }; },
      advisorV2AiSearchClient: { async search() { searchCalls += 1; return { chunks: [{ id: 'chunk', score: 0.7, text: 'Điều 10 quy định thang điểm 4.', item: { key: 'private-path', metadata: { document_id: DOCUMENT_A, active: true } } }] }; } },
      advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
      AI: { async run() { generatorCalls += 1; return { choices: [{ message: { tool_calls: [{ type: 'function', function: { name: 'submit_grounded_answer', arguments: JSON.stringify({ supported: true, answer: 'unsupported', source_ids: ['S1'], support_spans: [{ source_id: 'S1', quote: 'fabricated quotation' }] }) } }] } }] }; } },
      advisorCanaryTelemetry: { record(event: AdvisorCanaryEvent) { events.push(event); } },
    }) as { reply: string };
    assert.equal(result.reply, 'Legacy fallback');
    assert.equal(legacyCalls, 1);
    assert.equal(searchCalls, 1);
    assert.equal(generatorCalls, 1);
    assert.equal(events[0]?.response_source, 'legacy_fallback');
    assert.equal(events[0]?.fallback_reason, 'invalid_grounding');
  } finally { fixture.sql.close(); }
});

test('Stage 6 keeps deterministic zero-AI answers ahead of V2 in every feature mode', async () => {
  const fixture = makeDatabase();
  let searchCalls = 0;
  let generationCalls = 0;
  try {
    fixture.sql.prepare(`INSERT INTO course_schedules VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'course-en101', 'EN101', 'Advanced Writing', 3, null, null, 'HK1', 'Ngoại ngữ', null, null, null, null,
      'published', null, 'en101', 'advanced writing', 1,
    );
    fixture.sql.prepare('INSERT INTO user_schedules VALUES (?,?,?,?,?)').run('schedule-1', USER, 'course-en101', 'HK1', '2026-09-20T00:00:00.000Z');
    for (const [mode, percent] of [['off', undefined], ['shadow', undefined], ['canary', '100'], ['on', undefined]] as const) {
      const request = v2RequestFor('EN101 có mấy tín chỉ?');
      const result = await handleAiAdvisor(request, new URL(request.url), {
        ...env(fixture.DB),
        AI_ADVISOR_V2_MODE: mode,
        AI_ADVISOR_V2_CANARY_PERCENT: percent,
        advisorV2AiSearchClient: { async search() { searchCalls += 1; return { chunks: [] }; } },
        advisorV2AiSearchInstances: { text: 'text', ocr: 'ocr' },
        advisorV2EvidenceGenerator: { id: 'fake-v2', isConfigured: () => true, async generate() { generationCalls += 1; return { supported: true, answer: 'must not run', sourceIds: ['S1'] }; } },
        advisorProviders: { generalGeneration: { id: 'legacy', isConfigured: () => true, async generate() { generationCalls += 1; return { reply: 'must not run', lastStatus: 200 }; } } },
      }) as { reply: string };
      assert.equal(result.reply, 'Môn Advanced Writing (EN101) có 3 tín chỉ.', `${mode} must retain zero-AI priority`);
    }
    assert.equal(searchCalls, 0);
    assert.equal(generationCalls, 0);
  } finally { fixture.sql.close(); }
});

test('Stage 6 ON fails closed when the optional AI Search binding is unavailable', async () => {
  const fixture = makeDatabase();
  let legacyCalls = 0;
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = v2RequestFor('Quy đổi điểm ở HUB như nào?');
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), AI_ADVISOR_V2_MODE: 'on',
      GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key', GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async () => { legacyCalls += 1; return { reply: 'must not expose', documentSources: [] }; },
    }) as { reply: string; documentSearchUnavailable: boolean };
    assert.match(result.reply, /chưa thể xác minh/i);
    assert.equal(result.documentSearchUnavailable, true);
    assert.equal(legacyCalls, 0, 'ON must not fall through to an ungrounded legacy provider');
  } finally { fixture.sql.close(); }
});
