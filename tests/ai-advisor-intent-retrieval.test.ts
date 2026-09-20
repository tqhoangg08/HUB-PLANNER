import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  classifyAdvisorIntents,
  extractCourseCode,
  extractSearchTerms,
  handleAiAdvisor,
  resolveDocumentSources,
  resolveDocumentSourcesWithDiagnostics,
  retrieveAdvisorContext,
  routeAdvisorDocuments,
  shouldUseDocumentSearch,
} from '../cloudflare/worker/src/ai-advisor.ts';
import { extractGeminiDocumentSources, GeminiFileSearchError } from '../cloudflare/worker/src/gemini-file-search.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOCUMENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
    documentSearch: true, domain: 'grading', academicYear: null,
  });
  assert.deepEqual(classifyAdvisorIntents('GPA của tôi 3.5 thì theo quy chế HUB xếp loại học lực gì?'), ['student_academic', 'regulation_document']);
  assert.equal(routeAdvisorDocuments('Điểm môn này là bao nhiêu?').documentSearch, false);
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
      { documentId: deleted, fileName: 'deleted.pdf' },
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
    assert.equal(fixture.queries.some((query) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(query)), false);
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

test('grading policy question is grounded in a D1-validated Gemini citation and never calls Groq', async () => {
  const fixture = makeDatabase();
  const originalFetch = globalThis.fetch;
  let groqCalls = 0;
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
      fileSearchAnswer: async () => ({
        reply: 'Quy đổi điểm được nêu trong quy chế chính thức.',
        documentSources: [{ documentId: DOCUMENT_A, fileName: 'Quy chế đào tạo.pdf', title: 'Quy chế đào tạo', pageNumber: 1 }],
      }),
    }) as { reply: string; documentSources: Array<{ documentId: string }>; answerSources: Array<{ type: string }> };
    assert.equal(result.reply, 'Quy đổi điểm được nêu trong quy chế chính thức.');
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.equal(result.answerSources.some((source) => source.type === 'document'), true);
    assert.equal(groqCalls, 0);
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

test('legacy general-category documents remain reachable through one bounded public fallback', async () => {
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
      fileSearchAnswer: async (_env, _system, _history, _question, options) => {
        filters.push(String(options.metadataFilter));
        return filters.length === 1
          ? { reply: 'Không có citation hẹp.', documentSources: [] }
          : { reply: 'Theo quy chế chính thức.', documentSources: [{ documentId: DOCUMENT_A, fileName: 'Quy chế đào tạo.pdf', title: null, pageNumber: 1 }] };
      },
    }) as { reply: string; documentSources: Array<{ documentId: string }> };
    assert.equal(result.reply, 'Theo quy chế chính thức.');
    assert.deepEqual(result.documentSources.map((source) => source.documentId), [DOCUMENT_A]);
    assert.deepEqual(filters, ['visibility = "public" AND category = "grading"', 'visibility = "public"']);
  } finally { fixture.sql.close(); }
});

test('a narrowed File Search failure is diagnosed and the broad public fallback still runs', async () => {
  const fixture = makeDatabase();
  const previousWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message: unknown) => { warnings.push(String(message)); };
  const filters: string[] = [];
  try {
    insertOfficialDocument(fixture, { id: DOCUMENT_A, title: 'Quy chế đào tạo', category: 'grading' });
    const request = new Request('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor', {
      method: 'POST', headers: { Cookie: 'hubplanner_auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Quy đổi điểm ở HUB như nào?' }),
    });
    const result = await handleAiAdvisor(request, new URL(request.url), {
      ...env(fixture.DB), GEMINI_FILE_SEARCH_ENABLED: 'true', GEMINI_FILE_SEARCH_API_KEY: 'test-key',
      GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/test',
      fileSearchAnswer: async (_env, _system, _history, _question, options) => {
        filters.push(String(options.metadataFilter));
        return filters.length === 1
          ? { reply: 'Không có citation.', documentSources: [] }
          : { reply: 'Theo quy chế chính thức.', documentSources: [{ documentId: DOCUMENT_A, fileName: 'Quy-che.pdf' }] };
      },
    }) as { reply: string };
    assert.equal(result.reply, 'Theo quy chế chính thức.');
    assert.deepEqual(filters, ['visibility = "public" AND category = "grading"', 'visibility = "public"']);
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
