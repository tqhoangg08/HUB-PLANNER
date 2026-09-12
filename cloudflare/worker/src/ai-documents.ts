import { GoogleGenAI } from '@google/genai';
import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface AiDocumentsEnv extends BetterAuthIdentityEnv {
  DB?: D1Database;
  AI_DOCUMENTS_BUCKET?: R2Bucket;
  GEMINI_FILE_SEARCH_API_KEY?: string;
  GEMINI_FILE_SEARCH_STORE?: string;
}

export class AiDocumentsError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AiDocumentsError';
    this.status = status;
  }
}

type AiDocumentRow = Record<string, unknown> & {
  id: string;
  title: string;
  original_file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  content_hash: string;
  visibility: string;
  program_code: string;
  indexing_status: string;
  gemini_document_name?: string | null;
  gemini_operation_name?: string | null;
};

const MAX_BYTES = 20 * 1024 * 1024;
const MIME_BY_EXTENSION = new Map([
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['txt', 'text/plain'],
  ['csv', 'text/csv'],
]);

const cleanName = (value: string) => value.normalize('NFKC')
  .replace(/[\\/\0-\x1f\x7f]+/g, '-')
  .replace(/\.\.+/g, '.')
  .replace(/[^\p{L}\p{N}._ -]+/gu, '-')
  .replace(/\s+/g, ' ').trim().slice(0, 180);

const requireStorage = (env: AiDocumentsEnv) => {
  if (!env.DB || !env.AI_DOCUMENTS_BUCKET) throw new AiDocumentsError(503, 'Kho tài liệu tạm thời chưa sẵn sàng.');
  return { db: env.DB, bucket: env.AI_DOCUMENTS_BUCKET };
};

const requireAdmin = async (request: Request, env: AiDocumentsEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  if (identity.role !== 'admin') throw new AiDocumentsError(403, 'Chỉ quản trị viên được quản lý kho tài liệu AI.');
  return identity;
};

const extensionOf = (name: string) => cleanName(name).split('.').pop()?.toLowerCase() || '';
export const validateAiDocumentFile = async (file: File) => {
  if (!file.size || file.size > MAX_BYTES) throw new AiDocumentsError(400, 'Tài liệu phải có dung lượng từ 1 byte đến 20 MB.');
  const extension = extensionOf(file.name);
  const expected = MIME_BY_EXTENSION.get(extension);
  if (!expected || file.type !== expected) throw new AiDocumentsError(400, 'Định dạng tài liệu không được hỗ trợ.');
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = new TextDecoder().decode(header);
  const valid = extension === 'pdf' ? ascii.startsWith('%PDF-')
    : ['docx', 'pptx', 'xlsx'].includes(extension) ? header[0] === 0x50 && header[1] === 0x4b
      : extension === 'doc' ? header[0] === 0xd0 && header[1] === 0xcf
        : !header.includes(0);
  if (!valid) throw new AiDocumentsError(400, 'Nội dung tài liệu không khớp định dạng file.');
  return { extension, mimeType: expected, safeName: cleanName(file.name) };
};

const sha256 = async (file: File) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const isSafeAiDocumentObjectKey = (key: string) =>
  key.startsWith('ai-documents/') && !key.includes('..') && !key.includes('\\') && !/[\0-\x1f\x7f]/.test(key);

const uploadStorage = async (env: AiDocumentsEnv, path: string, file: File, contentHash: string) => {
  const { bucket } = requireStorage(env);
  if (!isSafeAiDocumentObjectKey(path)) throw new AiDocumentsError(400, 'Đường dẫn tài liệu không hợp lệ.');
  await bucket.put(path, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { sha256: contentHash } });
  const stored = await bucket.head(path);
  if (!stored || stored.size !== file.size) {
    if (stored) await bucket.delete(path);
    throw new AiDocumentsError(502, 'Không thể xác nhận tài liệu đã lưu.');
  }
};

const removeStorage = async (env: AiDocumentsEnv, path: string) => {
  const { bucket } = requireStorage(env);
  if (!isSafeAiDocumentObjectKey(path)) throw new AiDocumentsError(400, 'Đường dẫn tài liệu không hợp lệ.');
  await bucket.delete(path);
};

const downloadStorage = async (env: AiDocumentsEnv, path: string) => {
  const { bucket } = requireStorage(env);
  if (!isSafeAiDocumentObjectKey(path)) throw new AiDocumentsError(400, 'Đường dẫn tài liệu không hợp lệ.');
  const object = await bucket.get(path);
  if (!object) throw new AiDocumentsError(404, 'Không tìm thấy file tài liệu.');
  return object;
};

const aiClient = (env: AiDocumentsEnv) => {
  const apiKey = String(env.GEMINI_FILE_SEARCH_API_KEY || '').trim();
  const store = String(env.GEMINI_FILE_SEARCH_STORE || '').trim();
  if (!apiKey || !store) throw new AiDocumentsError(503, 'Gemini File Search chưa được cấu hình.');
  return { ai: new GoogleGenAI({ apiKey }), store };
};

const findDocument = async (env: AiDocumentsEnv, id: string, includeDeleted = false) => {
  const { db } = requireStorage(env);
  return db.prepare(`SELECT * FROM ai_documents WHERE id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'} LIMIT 1`)
    .bind(id).first<AiDocumentRow>();
};

const UPDATE_FIELDS = new Set([
  'category', 'academic_year', 'program_code', 'visibility', 'version',
  'gemini_store_name', 'gemini_document_name', 'gemini_operation_name',
  'indexing_status', 'indexing_error', 'deleted_at',
]);

const updateDocument = async (env: AiDocumentsEnv, id: string, patch: Record<string, unknown>) => {
  const { db } = requireStorage(env);
  const entries = Object.entries(patch).filter(([key]) => UPDATE_FIELDS.has(key));
  if (!entries.length) return findDocument(env, id, true);
  const assignments = entries.map(([key], index) => `${key} = ?${index + 2}`).join(', ');
  await db.prepare(`UPDATE ai_documents SET ${assignments}, updated_at = ?${entries.length + 2} WHERE id = ?1`)
    .bind(id, ...entries.map(([, value]) => value), new Date().toISOString()).run();
  return findDocument(env, id, true);
};

const refreshOperation = async (env: AiDocumentsEnv, document: AiDocumentRow) => {
  if (!document.gemini_operation_name || !['uploading', 'processing'].includes(String(document.indexing_status))) return document;
  try {
    const { ai } = aiClient(env);
    const operation = await ai.operations.get({ operation: { name: String(document.gemini_operation_name) } as never });
    if (!operation.done) return document;
    return await updateDocument(env, String(document.id), operation.error
      ? { indexing_status: 'failed', indexing_error: 'Gemini không thể lập chỉ mục tài liệu.' }
      : { indexing_status: 'completed', indexing_error: null, gemini_document_name: (operation.response as { documentName?: string } | undefined)?.documentName || document.gemini_document_name });
  } catch {
    return updateDocument(env, String(document.id), { indexing_status: 'failed', indexing_error: 'Không thể kiểm tra trạng thái lập chỉ mục.' });
  }
};

const listDocuments = async (url: URL, env: AiDocumentsEnv) => {
  const { db } = requireStorage(env);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') || 10)));
  const id = String(url.searchParams.get('id') || '');
  if (id) {
    const document = await findDocument(env, id);
    if (!document) throw new AiDocumentsError(404, 'Không tìm thấy tài liệu.');
    return { document: await refreshOperation(env, document) };
  }
  const status = String(url.searchParams.get('status') || '').trim();
  const search = String(url.searchParams.get('search') || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim().slice(0, 120);
  const filters = ['deleted_at IS NULL'];
  const bindings: unknown[] = [];
  if (status) { filters.push(`indexing_status = ?${bindings.length + 1}`); bindings.push(status); }
  if (search) {
    filters.push(`(title LIKE ?${bindings.length + 1} ESCAPE '\\' OR original_file_name LIKE ?${bindings.length + 2} ESCAPE '\\')`);
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    bindings.push(pattern, pattern);
  }
  const where = filters.join(' AND ');
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM ai_documents WHERE ${where}`).bind(...bindings).first<{ total: number }>();
  const result = await db.prepare(`SELECT * FROM ai_documents WHERE ${where} ORDER BY created_at DESC LIMIT ?${bindings.length + 1} OFFSET ?${bindings.length + 2}`)
    .bind(...bindings, pageSize, (page - 1) * pageSize).all<AiDocumentRow>();
  return { documents: result.results || [], total: Number(count?.total || 0), page, pageSize };
};

const indexDocument = async (request: Request, env: AiDocumentsEnv, identity: BetterAuthIdentity) => {
  const { db } = requireStorage(env);
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new AiDocumentsError(400, 'Vui lòng chọn tài liệu.');
  const validated = await validateAiDocumentFile(file);
  const contentHash = await sha256(file);
  const duplicate = await db.prepare('SELECT id FROM ai_documents WHERE content_hash = ? AND deleted_at IS NULL LIMIT 1')
    .bind(contentHash).first<{ id: string }>();
  if (duplicate) throw new AiDocumentsError(409, 'Tài liệu này đã có trong kho.');
  const id = crypto.randomUUID();
  const storagePath = `ai-documents/${identity.userId}/${id}-${validated.safeName}`;
  await uploadStorage(env, storagePath, file, contentHash);
  let row: AiDocumentRow | null = null;
  try {
    const { store, ai } = aiClient(env);
    const now = new Date().toISOString();
    const base = {
      title: String(form.get('title') || validated.safeName).trim().slice(0, 240),
      original_file_name: validated.safeName,
      storage_path: storagePath,
      mime_type: validated.mimeType,
      file_size: file.size,
      content_hash: contentHash,
      category: String(form.get('category') || '') || null,
      academic_year: String(form.get('academicYear') || '') || null,
      program_code: String(form.get('programCode') || 'all').trim() || 'all',
      visibility: ['public', 'program', 'admin'].includes(String(form.get('visibility'))) ? String(form.get('visibility')) : 'public',
      gemini_store_name: store,
      uploaded_by: identity.userId,
    };
    await db.prepare(`INSERT INTO ai_documents (
      id, title, original_file_name, storage_path, mime_type, file_size, content_hash,
      category, academic_year, program_code, visibility, gemini_store_name,
      indexing_status, uploaded_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?, ?)`)
      .bind(id, base.title, base.original_file_name, base.storage_path, base.mime_type, base.file_size, base.content_hash,
        base.category, base.academic_year, base.program_code, base.visibility, base.gemini_store_name,
        base.uploaded_by, now, now).run();
    row = await findDocument(env, id);
    if (!row) throw new AiDocumentsError(502, 'Không thể tạo tài liệu.');
    const operation = await ai.fileSearchStores.uploadToFileSearchStore({
      fileSearchStoreName: store,
      file,
      config: { mimeType: validated.mimeType, displayName: String(base.title), customMetadata: [
        { key: 'document_id', stringValue: id },
        { key: 'visibility', stringValue: String(base.visibility) },
        { key: 'program_code', stringValue: String(base.program_code) },
        { key: 'category', stringValue: String(base.category || 'general') },
        { key: 'academic_year', stringValue: String(base.academic_year || 'all') },
      ] },
    });
    return updateDocument(env, id, {
      gemini_operation_name: operation.name || null,
      gemini_document_name: operation.response?.documentName || null,
      indexing_status: operation.done ? (operation.error ? 'failed' : 'completed') : 'processing',
      indexing_error: operation.error ? 'Gemini không thể lập chỉ mục tài liệu.' : null,
    });
  } catch (error) {
    if (row?.id) await updateDocument(env, id, { indexing_status: 'failed', indexing_error: 'Không thể lập chỉ mục tài liệu.' });
    else await removeStorage(env, storagePath);
    throw error;
  }
};

const retryDocument = async (request: Request, env: AiDocumentsEnv) => {
  const body = await request.json() as { id?: unknown };
  const id = String(body.id || '');
  const document = await findDocument(env, id);
  if (!document || document.indexing_status !== 'failed') throw new AiDocumentsError(409, 'Chỉ có thể thử lại tài liệu đang lỗi.');
  const object = await downloadStorage(env, document.storage_path);
  const { ai, store } = aiClient(env);
  const operation = await ai.fileSearchStores.uploadToFileSearchStore({
    fileSearchStoreName: store,
    file: new Blob([await object.arrayBuffer()], { type: document.mime_type }),
    config: { mimeType: document.mime_type, displayName: document.title, customMetadata: [
      { key: 'document_id', stringValue: id },
      { key: 'visibility', stringValue: document.visibility || 'public' },
      { key: 'program_code', stringValue: document.program_code || 'all' },
      { key: 'category', stringValue: String(document.category || 'general') },
      { key: 'academic_year', stringValue: String(document.academic_year || 'all') },
    ] },
  });
  return updateDocument(env, id, {
    gemini_store_name: store,
    gemini_operation_name: operation.name || null,
    gemini_document_name: operation.response?.documentName || null,
    indexing_status: operation.done ? (operation.error ? 'failed' : 'completed') : 'processing',
    indexing_error: operation.error ? 'Gemini không thể lập chỉ mục tài liệu.' : null,
  });
};

const deleteDocument = async (url: URL, env: AiDocumentsEnv) => {
  const id = String(url.searchParams.get('id') || '');
  const document = await findDocument(env, id);
  if (!document) throw new AiDocumentsError(404, 'Không tìm thấy tài liệu.');
  await updateDocument(env, id, { indexing_status: 'deleting' });
  try {
    if (document.gemini_document_name) await aiClient(env).ai.fileSearchStores.documents.delete({ name: String(document.gemini_document_name), config: { force: true } });
  } catch { /* D1 tombstone and R2 deletion remain authoritative. */ }
  await removeStorage(env, document.storage_path);
  await updateDocument(env, id, { indexing_status: 'deleted', deleted_at: new Date().toISOString() });
  return { success: true };
};

export const handleAdminAiDocuments = async (request: Request, url: URL, env: AiDocumentsEnv) => {
  const identity = await requireAdmin(request, env);
  if (request.method === 'GET') return listDocuments(url, env);
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    return { document: contentType.includes('application/json') ? await retryDocument(request, env) : await indexDocument(request, env, identity) };
  }
  if (request.method === 'DELETE') return deleteDocument(url, env);
  throw new AiDocumentsError(405, 'Phương thức không được hỗ trợ.');
};

const userProgram = async (env: AiDocumentsEnv, userId: string) => {
  const { db } = requireStorage(env);
  const profile = await db.prepare('SELECT major_name, program_name, data_json FROM user_profile_private WHERE user_id = ? LIMIT 1')
    .bind(userId).first<{ major_name?: string | null; program_name?: string | null; data_json?: string | null }>();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(String(profile?.data_json || '{}')) as Record<string, unknown>; } catch { /* Invalid legacy JSON has no authorization value. */ }
  return String(profile?.major_name || profile?.program_name || data.majorName || data.programName || '').trim().toLowerCase();
};

const readableDocument = async (request: Request, documentId: string, env: AiDocumentsEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  const document = await findDocument(env, documentId);
  if (!document || document.indexing_status !== 'completed' || document.visibility === 'admin') throw new AiDocumentsError(404, 'Không tìm thấy tài liệu.');
  if (document.visibility === 'program') {
    const program = await userProgram(env, identity.userId);
    const allowed = String(document.program_code || '').trim().toLowerCase();
    if (!program || !allowed || (allowed !== 'all' && allowed !== program)) throw new AiDocumentsError(403, 'Bạn không có quyền xem tài liệu này.');
  }
  return document;
};

export const handleAiDocumentSource = async (request: Request, documentId: string, env: AiDocumentsEnv) => {
  if (request.method !== 'GET') throw new AiDocumentsError(405, 'Phương thức không được hỗ trợ.');
  await readableDocument(request, documentId, env);
  return { url: `/api/private/v1/ai-document-file/${documentId}`, expiresIn: 60 };
};

export const handleAiDocumentFile = async (request: Request, documentId: string, env: AiDocumentsEnv) => {
  if (request.method !== 'GET') throw new AiDocumentsError(405, 'Phương thức không được hỗ trợ.');
  const document = await readableDocument(request, documentId, env);
  const object = await downloadStorage(env, document.storage_path);
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': document.mime_type,
      'Content-Length': String(object.size),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.original_file_name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

export const aiDocumentsErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof AiDocumentsError ? error.status : 500;
