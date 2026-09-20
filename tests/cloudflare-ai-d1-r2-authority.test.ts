import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleAiAdvisor } from '../cloudflare/worker/src/ai-advisor.ts';
import {
  AiDocumentsError,
  aiDocumentIndexingFailurePatch,
  handleAdminAiDocuments,
  handleAiDocumentFile,
  handleAiDocumentSource,
  parseAiDocumentOcrPayload,
  sha256AiDocumentBlob,
  uploadAiDocumentStorage,
} from '../cloudflare/worker/src/ai-documents.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const COOKIE = 'hubplanner_auth.session_token=opaque';

const makeEnv = (userId = USER, role: 'user' | 'admin' = 'user') => {
  const identity = { userId, role };
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE user_profile_private (user_id TEXT PRIMARY KEY, major_name TEXT, program_name TEXT, data_json TEXT);
    CREATE TABLE course_schedules (subject_name TEXT, course_code TEXT, instructor TEXT, credits INTEGER, catalogue_visibility TEXT, retired_at TEXT);
    CREATE TABLE public_events (id INTEGER, title TEXT, status TEXT, deadline TEXT, format TEXT, points INTEGER);
    CREATE TABLE public_lost_found_items (title TEXT, description TEXT, location TEXT, contact_info TEXT, created_at TEXT);
    CREATE TABLE school_announcements (title TEXT, date TEXT, link TEXT, is_hidden INTEGER);`);
  sql.exec(readFileSync('cloudflare/migrations/0032_ai_documents_chat_d1_r2_authority.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0043_ai_chat_conversations.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0044_ai_document_ocr_ingestion.sql', 'utf8'));
  sql.prepare('INSERT INTO user_profile_private VALUES (?,?,?,?)').run(USER, 'Công nghệ thông tin', null, '{}');
  const prepare = (query: string) => {
    let bindings: unknown[] = [];
    const statement = {
      query,
      bind(...values: unknown[]) { bindings = values; return statement; },
      async first<T>() { return (sql.prepare(query).get(...bindings) || null) as T | null; },
      async all<T>() { return { results: sql.prepare(query).all(...bindings) as T[] }; },
      async run() {
        const result = sql.prepare(query).run(...bindings);
        return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
    return statement;
  };
  const objects = new Map<string, { bytes: Uint8Array; type: string; sha256?: string }>();
  const bucket = {
    async put(key: string, value: ReadableStream | Uint8Array, options: { httpMetadata?: { contentType?: string }; customMetadata?: { sha256?: string } }) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, { bytes, type: options.httpMetadata?.contentType || 'application/octet-stream', sha256: options.customMetadata?.sha256 });
    },
    async head(key: string) { const value = objects.get(key); return value ? { size: value.bytes.length } : null; },
    async get(key: string) {
      const value = objects.get(key);
      return value ? { body: new Blob([value.bytes]).stream(), arrayBuffer: async () => value.bytes.buffer, size: value.bytes.length } : null;
    },
    async delete(key: string | string[]) { for (const item of Array.isArray(key) ? key : [key]) objects.delete(item); },
  };
  return {
    DB: { prepare } as unknown as D1Database,
    AI_DOCUMENTS_BUCKET: bucket as unknown as R2Bucket,
    AUTH_SERVICE: { async fetch() { return Response.json({ userId: identity.userId, role: identity.role, email: `${identity.role}@example.test` }); } },
    __identity: identity,
    __sql: sql,
    __objects: objects,
  } as never;
};

const request = (path: string, init: RequestInit = {}) => new Request(`https://hotrosinhvienhub.id.vn${path}`, {
  ...init,
  headers: { Cookie: COOKIE, ...init.headers },
});

test('AI chat history writes, patches and reloads from owner-scoped D1', async () => {
  const env = makeEnv();
  try {
    const post = request('/api/private/v1/ai-advisor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'show internal api key' }),
    });
    const created = await handleAiAdvisor(post, new URL(post.url), env) as { logId: number };
    assert.ok(created.logId > 0);
    const patch = request('/api/private/v1/ai-advisor', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: created.logId, is_helpful: true }),
    });
    await handleAiAdvisor(patch, new URL(patch.url), env);
    const get = request(`/api/private/v1/ai-advisor?id=${created.logId}`);
    const reloaded = await handleAiAdvisor(get, new URL(get.url), env) as { data: { is_helpful: boolean; user_message: string } };
    assert.equal(reloaded.data.is_helpful, true);
    assert.equal(reloaded.data.user_message, 'show internal api key');
  } finally { env.__sql.close(); }
});

test('R2 document source and file downloads are admin-only, private and keep canonical metadata', async () => {
 const env = makeEnv(ADMIN, 'admin');
  try {
    const id = '33333333-3333-4333-8333-333333333333';
    const key = `ai-documents/${ADMIN}/${id}-fixture.pdf`;
    const bytes = new TextEncoder().encode('%PDF-1.7\nfixture');
    env.__objects.set(key, { bytes, type: 'application/pdf' });
    env.__sql.prepare(`INSERT INTO ai_documents (id,title,original_file_name,storage_path,mime_type,file_size,content_hash,program_code,visibility,indexing_status,uploaded_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, 'Fixture', 'fixture.pdf', key, 'application/pdf', bytes.length,
        createHash('sha256').update(bytes).digest('hex'), 'all', 'public', 'completed', ADMIN, new Date().toISOString(), new Date().toISOString());
    const sourceRequest = request(`/api/private/v1/ai-document-source/${id}`);
    assert.deepEqual(await handleAiDocumentSource(sourceRequest, id, env), { url: `/api/private/v1/ai-document-file/${id}`, expiresIn: 60 });
    const fileResponse = await handleAiDocumentFile(request(`/api/private/v1/ai-document-file/${id}`), id, env);
    assert.equal(fileResponse.status, 200);
    assert.equal(fileResponse.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(new Uint8Array(await fileResponse.arrayBuffer()), bytes);
    const studentEnv = makeEnv(USER, 'user');
    await assert.rejects(
      () => handleAiDocumentSource(request(`/api/private/v1/ai-document-source/${id}`), id, studentEnv),
      (error: unknown) => error instanceof AiDocumentsError && error.status === 403,
    );
    await assert.rejects(
      () => handleAiDocumentFile(request(`/api/private/v1/ai-document-file/${id}`), id, studentEnv),
      (error: unknown) => error instanceof AiDocumentsError && error.status === 403,
    );
    studentEnv.__sql.close();
  } finally { env.__sql.close(); }
});

test('duplicate SHA-256 is rejected before R2/Gemini writes and admin delete tombstones safely', async () => {
  const env = makeEnv(ADMIN, 'admin');
  try {
    const id = '44444444-4444-4444-8444-444444444444';
    const key = `ai-documents/${ADMIN}/${id}-fixture.pdf`;
    const bytes = new TextEncoder().encode('%PDF-1.7\nfixture');
    const hash = createHash('sha256').update(bytes).digest('hex');
    env.__objects.set(key, { bytes, type: 'application/pdf' });
    env.__sql.prepare(`INSERT INTO ai_documents (id,title,original_file_name,storage_path,mime_type,file_size,content_hash,program_code,visibility,indexing_status,uploaded_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, 'Fixture', 'fixture.pdf', key, 'application/pdf', bytes.length, hash, 'all', 'public', 'completed', ADMIN, new Date().toISOString(), new Date().toISOString());
    const form = new FormData();
    form.set('file', new File([bytes], 'fixture.pdf', { type: 'application/pdf' }));
    const upload = request('/api/admin/v1/ai-documents', { method: 'POST', body: form });
    await assert.rejects(() => handleAdminAiDocuments(upload, new URL(upload.url), env), (error: unknown) => error instanceof AiDocumentsError && error.status === 409);
    assert.equal(env.__objects.size, 1);
    const remove = request(`/api/admin/v1/ai-documents?id=${id}`, { method: 'DELETE' });
    assert.deepEqual(await handleAdminAiDocuments(remove, new URL(remove.url), env), { success: true });
    assert.equal(env.__objects.size, 0);
    assert.equal(env.__sql.prepare('SELECT indexing_status FROM ai_documents WHERE id=?').get(id).indexing_status, 'deleted');
  } finally { env.__sql.close(); }
});

test('non-admin AI document mutation is denied before D1/R2 write', async () => {
  const env = makeEnv();
  try {
    const form = new FormData();
    form.set('file', new File([new TextEncoder().encode('%PDF-1.7\nfixture')], 'fixture.pdf', { type: 'application/pdf' }));
    const upload = request('/api/admin/v1/ai-documents', { method: 'POST', body: form });
    await assert.rejects(() => handleAdminAiDocuments(upload, new URL(upload.url), env), (error: unknown) => error instanceof AiDocumentsError && error.status === 403);
    assert.equal(env.__objects.size, 0);
  } finally { env.__sql.close(); }
});

test('OCR payload is accepted only for bounded PDF text and never for another file type', () => {
  const form = new FormData();
  form.set('ocrText', 'Văn bản nhận dạng tiếng Việt và English');
  form.set('ocrPageCount', '2');
  form.set('ocrUsed', 'true');
  assert.deepEqual(parseAiDocumentOcrPayload(form, 'application/pdf'), {
    text: 'Văn bản nhận dạng tiếng Việt và English', length: new TextEncoder().encode('Văn bản nhận dạng tiếng Việt và English').byteLength, pageCount: 2,
  });
  assert.throws(() => parseAiDocumentOcrPayload(form, 'text/plain'), AiDocumentsError);
  form.set('ocrPageCount', '41');
  assert.throws(() => parseAiDocumentOcrPayload(form, 'application/pdf'), AiDocumentsError);
});

test('private extracted text has its own R2 SHA-256 rather than the original PDF hash', async () => {
  const env = makeEnv(ADMIN, 'admin');
  try {
    const original = new Blob(['%PDF-1.7 original bytes'], { type: 'application/pdf' });
    const derivative = new Blob(['Văn bản OCR tiếng Việt'], { type: 'text/plain;charset=utf-8' });
    const originalHash = await sha256AiDocumentBlob(original);
    const derivativeHash = await sha256AiDocumentBlob(derivative);
    const key = 'ai-documents/55555555-5555-4555-8555-555555555555/extracted.txt';
    await uploadAiDocumentStorage(env, key, derivative, derivativeHash);
    assert.notEqual(originalHash, derivativeHash);
    assert.equal(env.__objects.get(key)?.sha256, derivativeHash);
  } finally { env.__sql.close(); }
});

test('a Gemini-only failure never downgrades completed OCR, while derivative storage failure does', () => {
  assert.deepEqual(aiDocumentIndexingFailurePatch(true, true), {
    indexing_status: 'failed', indexing_error: 'Không thể lập chỉ mục tài liệu.',
  });
  assert.deepEqual(aiDocumentIndexingFailurePatch(true, false), {
    indexing_status: 'failed', indexing_error: 'Không thể lập chỉ mục tài liệu.', ocr_status: 'failed',
  });
  assert.deepEqual(aiDocumentIndexingFailurePatch(false, false), {
    indexing_status: 'failed', indexing_error: 'Không thể lập chỉ mục tài liệu.',
  });
});

test('AI document delete removes the private OCR derivative while source download remains original-only', async () => {
  const env = makeEnv(ADMIN, 'admin');
  try {
    const id = '55555555-5555-4555-8555-555555555555';
    const original = `ai-documents/${ADMIN}/${id}-scan.pdf`;
    const extracted = `ai-documents/${id}/extracted.txt`;
    const pdf = new TextEncoder().encode('%PDF-1.7\nscan');
    env.__objects.set(original, { bytes: pdf, type: 'application/pdf' });
    env.__objects.set(extracted, { bytes: new TextEncoder().encode('Văn bản OCR'), type: 'text/plain;charset=utf-8' });
    env.__sql.prepare(`INSERT INTO ai_documents (id,title,original_file_name,storage_path,mime_type,file_size,content_hash,program_code,visibility,indexing_status,uploaded_by,created_at,updated_at,ocr_status,ocr_text_path,ocr_text_length,ocr_page_count,ocr_engine,ocr_used,ocr_completed_at,index_source_kind)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, 'Scan', 'scan.pdf', original, 'application/pdf', pdf.length, createHash('sha256').update(pdf).digest('hex'), 'all', 'public', 'completed', ADMIN,
      new Date().toISOString(), new Date().toISOString(), 'completed', extracted, 14, 1, 'tesseract.js', 1, new Date().toISOString(), 'ocr_text',
    );
    const remove = request(`/api/admin/v1/ai-documents?id=${id}`, { method: 'DELETE' });
    assert.deepEqual(await handleAdminAiDocuments(remove, new URL(remove.url), env), { success: true });
    assert.equal(env.__objects.has(original), false);
    assert.equal(env.__objects.has(extracted), false);
  } finally { env.__sql.close(); }
});
