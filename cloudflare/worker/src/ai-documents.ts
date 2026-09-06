import { GoogleGenAI } from '@google/genai';
import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface AiDocumentsEnv extends BetterAuthIdentityEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
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

const BUCKET = 'ai-documents';
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

const sourceConfig = (env: AiDocumentsEnv) => {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !key) throw new AiDocumentsError(503, 'Kho tài liệu tạm thời chưa sẵn sàng.');
  return { base, key };
};

const sourceRequest = async (env: AiDocumentsEnv, path: string, init: RequestInit = {}) => {
  const { base, key } = sourceConfig(env);
  return fetch(`${base}${path}`, {
    ...init,
    headers: { Accept: 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
};

const sourceJson = async <T>(env: AiDocumentsEnv, path: string, init: RequestInit = {}) => {
  const response = await sourceRequest(env, path, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T : null as T;
  if (!response.ok) throw new AiDocumentsError(response.status < 500 ? response.status : 502, 'Không thể xử lý kho tài liệu.');
  return { payload, response };
};

const requireAdmin = async (request: Request, env: AiDocumentsEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  if (identity.role !== 'admin') throw new AiDocumentsError(403, 'Chỉ quản trị viên được quản lý kho tài liệu AI.');
  return identity;
};

const extensionOf = (name: string) => cleanName(name).split('.').pop()?.toLowerCase() || '';
const validateFile = async (file: File) => {
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

const uploadStorage = async (env: AiDocumentsEnv, path: string, file: File) => {
  const response = await sourceRequest(env, `/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file,
  });
  if (!response.ok) throw new AiDocumentsError(502, 'Không thể lưu tài liệu.');
  await response.body?.cancel();
};

const removeStorage = async (env: AiDocumentsEnv, path: string) => {
  const response = await sourceRequest(env, `/storage/v1/object/${BUCKET}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }),
  });
  await response.body?.cancel();
};

const downloadStorage = async (env: AiDocumentsEnv, path: string) => {
  const response = await sourceRequest(env, `/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`);
  if (!response.ok) throw new AiDocumentsError(502, 'Không thể đọc tài liệu đã lưu.');
  return response.blob();
};

const aiClient = (env: AiDocumentsEnv) => {
  const apiKey = String(env.GEMINI_FILE_SEARCH_API_KEY || '').trim();
  const store = String(env.GEMINI_FILE_SEARCH_STORE || '').trim();
  if (!apiKey || !store) throw new AiDocumentsError(503, 'Gemini File Search chưa được cấu hình.');
  return { ai: new GoogleGenAI({ apiKey }), store };
};

const updateDocument = async (env: AiDocumentsEnv, id: string, patch: Record<string, unknown>) => {
  const { payload } = await sourceJson<Array<Record<string, unknown>>>(env, `/rest/v1/ai_documents?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(patch),
  });
  return payload?.[0] || null;
};

const refreshOperation = async (env: AiDocumentsEnv, document: Record<string, unknown>) => {
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
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') || 10)));
  const id = String(url.searchParams.get('id') || '');
  if (id) {
    const { payload } = await sourceJson<Array<Record<string, unknown>>>(env, `/rest/v1/ai_documents?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=*&limit=1`);
    if (!payload?.[0]) throw new AiDocumentsError(404, 'Không tìm thấy tài liệu.');
    return { document: await refreshOperation(env, payload[0]) };
  }
  const query = new URLSearchParams({ select: '*', deleted_at: 'is.null', order: 'created_at.desc', limit: String(pageSize), offset: String((page - 1) * pageSize) });
  const status = url.searchParams.get('status');
  if (status) query.set('indexing_status', `eq.${status}`);
  const search = String(url.searchParams.get('search') || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim().slice(0, 120);
  if (search) query.set('or', `(title.ilike.*${search}*,original_file_name.ilike.*${search}*)`);
  const { payload, response } = await sourceJson<Array<Record<string, unknown>>>(env, `/rest/v1/ai_documents?${query}`, { headers: { Prefer: 'count=exact' } });
  const total = Number(response.headers.get('content-range')?.split('/')[1] || payload.length);
  return { documents: payload, total: Number.isFinite(total) ? total : payload.length, page, pageSize };
};

const indexDocument = async (request: Request, env: AiDocumentsEnv, identity: BetterAuthIdentity) => {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new AiDocumentsError(400, 'Vui lòng chọn tài liệu.');
  const validated = await validateFile(file);
  const contentHash = await sha256(file);
  const { payload: duplicate } = await sourceJson<Array<Record<string, unknown>>>(env, `/rest/v1/ai_documents?content_hash=eq.${contentHash}&deleted_at=is.null&select=id,title&limit=1`);
  if (duplicate.length) throw new AiDocumentsError(409, 'Tài liệu này đã có trong kho.');
  const storagePath = `${identity.userId}/${crypto.randomUUID()}-${validated.safeName}`;
  await uploadStorage(env, storagePath, file);
  let row: Record<string, unknown> | null = null;
  try {
    const { store, ai } = aiClient(env);
    const base = {
      title: String(form.get('title') || validated.safeName).trim().slice(0, 240),
      original_file_name: validated.safeName, storage_path: storagePath, mime_type: validated.mimeType,
      file_size: file.size, content_hash: contentHash, category: String(form.get('category') || '') || null,
      academic_year: String(form.get('academicYear') || '') || null,
      program_code: String(form.get('programCode') || 'all').trim() || 'all',
      visibility: ['public', 'program', 'admin'].includes(String(form.get('visibility'))) ? String(form.get('visibility')) : 'public',
      gemini_store_name: store, indexing_status: 'uploading', indexing_error: null, uploaded_by: identity.userId,
    };
    const inserted = await sourceJson<Array<Record<string, unknown>>>(env, '/rest/v1/ai_documents?select=*', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(base),
    });
    row = inserted.payload[0] || null;
    if (!row) throw new AiDocumentsError(502, 'Không thể tạo tài liệu.');
    const operation = await ai.fileSearchStores.uploadToFileSearchStore({
      fileSearchStoreName: store, file,
      config: { mimeType: validated.mimeType, displayName: String(base.title), customMetadata: [
        { key: 'document_id', stringValue: String(row.id) }, { key: 'visibility', stringValue: String(base.visibility) },
        { key: 'program_code', stringValue: String(base.program_code) }, { key: 'category', stringValue: String(base.category || 'general') },
        { key: 'academic_year', stringValue: String(base.academic_year || 'all') },
      ] },
    });
    return updateDocument(env, String(row.id), {
      gemini_operation_name: operation.name || null,
      gemini_document_name: operation.response?.documentName || null,
      indexing_status: operation.done ? (operation.error ? 'failed' : 'completed') : 'processing',
      indexing_error: operation.error ? 'Gemini không thể lập chỉ mục tài liệu.' : null,
    });
  } catch (error) {
    if (row?.id) await updateDocument(env, String(row.id), { indexing_status: 'failed', indexing_error: 'Không thể lập chỉ mục tài liệu.' });
    else await removeStorage(env, storagePath);
    throw error;
  }
};

const retryDocument = async (request: Request, env: AiDocumentsEnv) => {
  const body = await request.json() as { id?: unknown };
  const id = String(body.id || '');
  const { payload } = await sourceJson<Array<Record<string, unknown>>>(env, `/rest/v1/ai_documents?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const document = payload[0];
  if (!document || document.indexing_status !== 'failed') throw new AiDocumentsError(409, 'Chỉ có thể thử lại tài liệu đang lỗi.');
  const blob = await downloadStorage(env, String(document.storage_path));
  const { ai, store } = aiClient(env);
  const operation = await ai.fileSearchStores.uploadToFileSearchStore({
    fileSearchStoreName: store,
    file: new Blob([blob], { type: String(document.mime_type) }),
    config: {
      mimeType: String(document.mime_type),
      displayName: String(document.title),
      customMetadata: [
        { key: 'document_id', stringValue: id },
        { key: 'visibility', stringValue: String(document.visibility || 'public') },
        { key: 'program_code', stringValue: String(document.program_code || 'all') },
        { key: 'category', stringValue: String(document.category || 'general') },
        { key: 'academic_year', stringValue: String(document.academic_year || 'all') },
      ],
    },
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
  const { payload } = await sourceJson<Array<Record<string, unknown>>>(env, `/rest/v1/ai_documents?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const document = payload[0];
  if (!document) throw new AiDocumentsError(404, 'Không tìm thấy tài liệu.');
  await updateDocument(env, id, { indexing_status: 'deleting' });
  try {
    if (document.gemini_document_name) await aiClient(env).ai.fileSearchStores.documents.delete({ name: String(document.gemini_document_name), config: { force: true } });
  } catch { /* Storage deletion and tombstone remain authoritative. */ }
  await removeStorage(env, String(document.storage_path));
  await updateDocument(env, id, { indexing_status: 'deleted', deleted_at: new Date().toISOString() });
  return { success: true };
};

export const handleAdminAiDocuments = async (request: Request, url: URL, env: AiDocumentsEnv) => {
  const identity = await requireAdmin(request, env);
  if (request.method === 'GET') return listDocuments(url, env);
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    return { document: contentType.includes('application/json')
      ? await retryDocument(request, env)
      : await indexDocument(request, env, identity) };
  }
  if (request.method === 'DELETE') return deleteDocument(url, env);
  throw new AiDocumentsError(405, 'Phương thức không được hỗ trợ.');
};

export const handleAiDocumentSource = async (request: Request, documentId: string, env: AiDocumentsEnv) => {
  if (request.method !== 'GET') throw new AiDocumentsError(405, 'Phương thức không được hỗ trợ.');
  const identity = await requireBetterAuthSession(request, env);
  const { payload } = await sourceJson<Array<Record<string, unknown>>>(env, `/rest/v1/ai_documents?id=eq.${encodeURIComponent(documentId)}&deleted_at=is.null&indexing_status=eq.completed&select=id,storage_path,original_file_name,visibility,program_code&limit=1`);
  const document = payload[0];
  if (!document || document.visibility === 'admin') throw new AiDocumentsError(404, 'Không tìm thấy tài liệu.');
  if (document.visibility === 'program') {
    const profile = await sourceJson<Array<{ data?: { majorName?: string; programName?: string } }>>(env, `/rest/v1/profile_private_data?user_id=eq.${identity.userId}&select=data&limit=1`);
    const userProgram = String(profile.payload[0]?.data?.majorName || profile.payload[0]?.data?.programName || '').trim().toLowerCase();
    const allowed = String(document.program_code || '').trim().toLowerCase();
    if (!userProgram || !allowed || (allowed !== 'all' && allowed !== userProgram)) throw new AiDocumentsError(403, 'Bạn không có quyền xem tài liệu này.');
  }
  const signed = await sourceJson<{ signedURL?: string }>(env, `/storage/v1/object/sign/${BUCKET}/${String(document.storage_path).split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60, download: String(document.original_file_name) }),
  });
  if (!signed.payload?.signedURL) throw new AiDocumentsError(502, 'Không thể mở tài liệu.');
  const { base } = sourceConfig(env);
  return { url: new URL(signed.payload.signedURL, base).toString(), expiresIn: 60 };
};

export const aiDocumentsErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof AiDocumentsError ? error.status : 500;
