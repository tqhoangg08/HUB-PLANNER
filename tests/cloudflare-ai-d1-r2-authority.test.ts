import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleAiAdvisor } from '../cloudflare/worker/src/ai-advisor.ts';
import {
  AiDocumentsError,
  handleAdminAiDocuments,
  handleAiDocumentFile,
  handleAiDocumentSource,
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
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const bucket = {
    async put(key: string, value: ReadableStream | Uint8Array, options: { httpMetadata?: { contentType?: string } }) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, { bytes, type: options.httpMetadata?.contentType || 'application/octet-stream' });
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

test('R2 document source is owner-authenticated, private and keeps canonical metadata', async () => {
 const env = makeEnv();
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
