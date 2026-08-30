import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  requireBetterAuthStaff,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface AdminSupportEnv extends BetterAuthIdentityEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DB?: D1Database;
  SUPPORT_ATTACHMENTS_BUCKET?: R2Bucket;
}
type SupportStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 502 | 503;
export class AdminSupportError extends Error {
  readonly status: SupportStatus;
  constructor(status: SupportStatus, message: string) { super(message); this.status = status; this.name = 'AdminSupportError'; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 64 * 1024;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_ACTIVE = 3;
const TICKET_COLUMNS = 'id,user_id,assigned_to,subject,category,priority,status,initial_message,last_message_at,resolved_at,resolved_by,resolved_by_role,created_at,updated_at';
const MESSAGE_COLUMNS = 'id,ticket_id,sender_id,sender_role,body,is_internal_note,created_at,metadata,attachments:support_ticket_attachments(id,ticket_id,message_id,uploaded_by,file_name,mime_type,size_bytes,storage_provider,status,metadata,created_at)';
const STAFF_ROLES = new Set(['admin', 'auditor']);
const TICKET_STATUSES = new Set(['open', 'pending', 'resolved', 'closed']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const CATEGORIES = new Set(['login', 'grades', 'events', 'schedule', 'lost_found', 'feedback', 'other']);

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isStaff = (identity: BetterAuthIdentity) => identity.role === 'admin' || identity.role === 'auditor';
const requireAdmin = (identity: BetterAuthIdentity) => { if (identity.role !== 'admin') throw new AdminSupportError(403, 'Không có quyền thực hiện thao tác này.'); return identity; };
const source = (env: AdminSupportEnv) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new AdminSupportError(503, 'Dịch vụ hỗ trợ chưa sẵn sàng.');
  return { base: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
};
const rest = async (env: AdminSupportEnv, path: string, init: RequestInit = {}) => {
  const { base, key } = source(env); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(new URL(path, base), { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', ...init.headers }, signal: controller.signal });
    if (!response.ok) throw new AdminSupportError(response.status === 404 ? 404 : response.status === 409 ? 409 : response.status < 500 ? 400 : 502, 'Không thể xử lý ticket hỗ trợ.');
    return response;
  } catch (error) { if (error instanceof AdminSupportError) throw error; throw new AdminSupportError(503, 'Dịch vụ hỗ trợ tạm thời chưa sẵn sàng.'); }
  finally { clearTimeout(timer); }
};
const body = async (request: Request) => {
  const length = Number(request.headers.get('content-length') || 0); if (Number.isFinite(length) && length > MAX_BODY) throw new AdminSupportError(413, 'Dữ liệu gửi lên quá lớn.');
  const text = await request.text(); if (new TextEncoder().encode(text).byteLength > MAX_BODY) throw new AdminSupportError(413, 'Dữ liệu gửi lên quá lớn.');
  try { const parsed = JSON.parse(text); if (!isRecord(parsed)) throw new Error(); return parsed; } catch { throw new AdminSupportError(400, 'Dữ liệu ticket không hợp lệ.'); }
};
const ticket = async (env: AdminSupportEnv, ticketId: string) => {
  if (!isUuid(ticketId)) throw new AdminSupportError(400, 'Ticket không hợp lệ.');
  const response = await rest(env, `/rest/v1/support_tickets?id=eq.${encodeURIComponent(ticketId)}&select=${encodeURIComponent(TICKET_COLUMNS)}&limit=1`);
  return ((await response.json()) as Record<string, unknown>[])[0] || null;
};
const access = async (env: AdminSupportEnv, identity: BetterAuthIdentity, ticketId: string, requireOpen = false) => {
  const row = await ticket(env, ticketId); if (!row) throw new AdminSupportError(404, 'Ticket không tồn tại.');
  if (!isStaff(identity) && row.user_id !== identity.userId) throw new AdminSupportError(403, 'Bạn không có quyền truy cập ticket này.');
  if (requireOpen && (row.status === 'resolved' || row.status === 'closed')) throw new AdminSupportError(409, 'Ticket đã đóng, không thể gửi thêm phản hồi.');
  return row;
};
const safePage = (value: unknown, fallback: number, maximum: number) => Number.isSafeInteger(Number(value)) ? Math.max(1, Math.min(maximum, Number(value))) : fallback;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const json = async <T>(response: Response): Promise<T> => response.json() as Promise<T>;
const hydrateTicketProfiles = async (env: AdminSupportEnv, rows: unknown[]) => {
  const tickets = rows.filter(isRecord);
  const ids = [...new Set(tickets.flatMap((row) => [row.user_id, row.assigned_to]).filter(isUuid))];
  if (!ids.length) return tickets;
  const query = new URL('/rest/v1/profiles', 'https://supabase.invalid');
  query.searchParams.set('select', 'id,full_name,email,student_code');
  query.searchParams.set('id', `in.(${ids.join(',')})`);
  const profiles = await json<Array<Record<string, unknown>>>(await rest(env, `${query.pathname}${query.search}`));
  const byId = new Map(profiles.filter((profile) => isUuid(profile.id)).map((profile) => [String(profile.id), profile]));
  return tickets.map((row) => ({
    ...row,
    user: isUuid(row.user_id) ? byId.get(row.user_id) || null : null,
    assignee: isUuid(row.assigned_to) ? byId.get(row.assigned_to) || null : null,
  }));
};
const readSupportStaff = async (env: AdminSupportEnv) => {
  const roles = await json<Array<Record<string, unknown>>>(await rest(env, '/rest/v1/user_roles?role=in.(admin,auditor,support)&select=id:user_id,role'));
  const ids = [...new Set(roles.map((row) => row.id).filter(isUuid))];
  if (!ids.length) return [];
  const query = new URL('/rest/v1/profiles', 'https://supabase.invalid');
  query.searchParams.set('select', 'id,full_name,email');
  query.searchParams.set('id', `in.(${ids.join(',')})`);
  const profiles = await json<Array<Record<string, unknown>>>(await rest(env, `${query.pathname}${query.search}`));
  const byId = new Map(profiles.filter((profile) => isUuid(profile.id)).map((profile) => [String(profile.id), profile]));
  return roles.map((role) => {
    const id = typeof role.id === 'string' ? role.id : '';
    const profile = byId.get(id);
    return profile ? { id, role: role.role, full_name: profile.full_name || null, email: profile.email || null } : null;
  }).filter(Boolean);
};
const attachmentInput = (input: Record<string, unknown>) => {
  const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : '';
  const fileName = text(input.file_name, 180).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  const mimeType = typeof input.mime_type === 'string' ? input.mime_type : '';
  const size = Number(input.size);
  if (!isUuid(ticketId) || !fileName || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType) || !Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.');
  if ((mimeType === 'application/pdf' && size > 10 * 1024 * 1024) || (mimeType !== 'application/pdf' && size > 5 * 1024 * 1024)) throw new AdminSupportError(400, 'Tệp đính kèm vượt quá dung lượng cho phép.');
  return { ticketId, fileName, mimeType, size };
};
const attachmentStore = (env: AdminSupportEnv) => { if (!env.DB || !env.SUPPORT_ATTACHMENTS_BUCKET) throw new AdminSupportError(503, 'Dịch vụ tệp hỗ trợ chưa sẵn sàng.'); return { db: env.DB, bucket: env.SUPPORT_ATTACHMENTS_BUCKET }; };

const list = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const size = safePage(input.paged ? input.pageSize : input.limit, isStaff(identity) ? 100 : 50, isStaff(identity) ? 200 : 80);
  const offset = input.paged ? (safePage(input.page, 1, 10_000) - 1) * size : 0;
  const query = new URL('/rest/v1/support_tickets', 'https://supabase.invalid');
  query.searchParams.set('select', TICKET_COLUMNS); query.searchParams.set('order', 'last_message_at.desc'); query.searchParams.set('limit', String(size)); query.searchParams.set('offset', String(offset));
  if (!isStaff(identity)) query.searchParams.set('user_id', `eq.${identity.userId}`);
  for (const [key, allowed] of [['status', TICKET_STATUSES], ['category', CATEGORIES], ['priority', PRIORITIES]] as const) { const value = input[key]; if (typeof value === 'string' && value !== 'all' && allowed.has(value)) query.searchParams.set(key, `eq.${value}`); }
  const search = text(input.search, 80); if (search) query.searchParams.set('subject', `ilike.*${search.replace(/[,*()]/g, '')}*`);
  const response = await rest(env, `${query.pathname}${query.search}`, { headers: { Prefer: 'count=exact' } });
  const range = /\/(\d+)$/.exec(response.headers.get('content-range') || '');
  return { success: true, data: await hydrateTicketProfiles(env, await json<unknown[]>(response)), total: range ? Number(range[1]) + 1 : 0, role: identity.role };
};

const createTicket = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const subject = text(input.subject, 160); const message = typeof input.message === 'string' ? input.message.trim().slice(0, 4000) : '';
  const category = typeof input.category === 'string' && CATEGORIES.has(input.category) ? input.category : ''; const priority = typeof input.priority === 'string' && PRIORITIES.has(input.priority) ? input.priority : '';
  if (subject.length < 3 || !message || !category || !priority) throw new AdminSupportError(400, 'Dữ liệu ticket không hợp lệ.');
  const countResponse = await rest(env, `/rest/v1/support_tickets?user_id=eq.${identity.userId}&status=in.(open,pending)&select=id`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
  const active = /\/(\d+)$/.exec(countResponse.headers.get('content-range') || '')?.[1]; await countResponse.body?.cancel(); if (Number(active || 0) >= MAX_ACTIVE) throw new AdminSupportError(409, 'Bạn đang có 3 phiếu hỗ trợ chưa xử lý.');
  const now = new Date().toISOString();
  const ticketResponse = await rest(env, '/rest/v1/support_tickets', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ user_id: identity.userId, subject, category, priority, initial_message: message, status: 'open', last_message_at: now }) });
  const created = (await json<Record<string, unknown>[]>(ticketResponse))[0]; if (!created?.id) throw new AdminSupportError(502, 'Không thể tạo ticket hỗ trợ.');
  const messageResponse = await rest(env, '/rest/v1/support_ticket_messages', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ ticket_id: created.id, sender_id: identity.userId, sender_role: 'user', body: message, is_internal_note: false, metadata: isRecord(input.metadata) ? input.metadata : {} }) });
  const messageRow = (await json<Record<string, unknown>[]>(messageResponse))[0]; return { ...created, initial_message_id: messageRow?.id };
};

const createMessage = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : ''; const row = await access(env, identity, ticketId, true);
  const content = typeof input.body === 'string' ? input.body.trim().slice(0, 4000) : ''; if (!content && input.allow_empty_body !== true) throw new AdminSupportError(400, 'Không thể gửi phản hồi rỗng.');
  if (identity.role === 'auditor') throw new AdminSupportError(403, 'Auditor chỉ có quyền đọc.');
  const internal = input.is_internal_note === true; if (internal && identity.role !== 'admin') throw new AdminSupportError(403, 'Không có quyền tạo ghi chú nội bộ.');
  const response = await rest(env, '/rest/v1/support_ticket_messages', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ ticket_id: ticketId, sender_id: identity.userId, sender_role: identity.role === 'admin' ? 'admin' : 'user', body: content, is_internal_note: internal, metadata: isRecord(input.metadata) ? input.metadata : {} }) });
  const message = (await json<Record<string, unknown>[]>(response))[0]; await rest(env, `/rest/v1/support_tickets?id=eq.${encodeURIComponent(String(row.id))}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ last_message_at: new Date().toISOString(), status: row.status === 'open' ? 'pending' : row.status }) }); return { message };
};

export const handleAdminSupport = async (request: Request, url: URL, env: AdminSupportEnv) => {
  // Retain the former REST-shaped admin list endpoint for existing callers.
  if (url.pathname.startsWith('/api/admin/v1/support/')) {
    const identity = await requireBetterAuthStaff(request, env);
    if (url.pathname === '/api/admin/v1/support/tickets' && request.method === 'GET') return list(env, identity, Object.fromEntries(url.searchParams));
    const id = /^\/api\/admin\/v1\/support\/tickets\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1];
    if (id && request.method === 'PATCH') { const input = await body(request); return { success: true, ticket: await update(env, requireAdmin(identity), id, input) }; }
    if (url.pathname === '/api/admin/v1/support/resolve-all' && request.method === 'POST') return resolveAll(env, requireAdmin(identity));
    throw new AdminSupportError(405, 'Phương thức hỗ trợ không được hỗ trợ.');
  }
  if (request.method !== 'POST') throw new AdminSupportError(405, 'Phương thức hỗ trợ không được hỗ trợ.');
  const identity = await requireBetterAuthSession(request, env); const input = await body(request); const action = typeof input.action === 'string' ? input.action : '';
  if (action === 'list') return list(env, identity, input);
  if (action === 'get-ticket') { const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : ''; return { success: true, ticket: await access(env, identity, ticketId) }; }
  if (action === 'messages') { const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : ''; await access(env, identity, ticketId); const query = new URL('/rest/v1/support_ticket_messages', 'https://supabase.invalid'); query.searchParams.set('select', MESSAGE_COLUMNS); query.searchParams.set('ticket_id', `eq.${ticketId}`); if (!isStaff(identity)) query.searchParams.set('is_internal_note', 'eq.false'); query.searchParams.set('order', 'created_at.desc'); query.searchParams.set('limit', String(safePage(input.limit, 50, 100))); if (typeof input.before_created_at === 'string') query.searchParams.set('created_at', `lt.${input.before_created_at}`); return { success: true, data: await json<unknown[]>(await rest(env, `${query.pathname}${query.search}`)) }; }
  if (action === 'create-ticket') return createTicket(env, identity, input);
  if (action === 'create-message') return createMessage(env, identity, input);
  if (action === 'update-ticket') { const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : ''; return { success: true, ticket: await update(env, requireAdmin(identity), ticketId, isRecord(input.updates) ? input.updates : {}) }; }
  if (action === 'resolve-ticket') return { success: true, ticket: await resolve(env, identity, typeof input.ticket_id === 'string' ? input.ticket_id : '') };
  if (action === 'resolve-all-open-tickets') return resolveAll(env, requireAdmin(identity));
  if (action === 'delete-ticket') return remove(env, identity, typeof input.ticket_id === 'string' ? input.ticket_id : '');
  if (action === 'staff') { const staff = await requireBetterAuthStaff(request, env); return { success: true, data: await readSupportStaff(env), role: staff.role }; }
  if (action === 'attachment:create-upload-url') return createAttachmentUpload(env, identity, input);
  if (action === 'attachment:complete-upload') return completeAttachmentUpload(env, identity, input);
  if (action === 'attachment:link-message-attachments') return linkAttachments(env, identity, input);
  if (action === 'attachment:create-download-url') return attachmentDownloadUrl(env, identity, input);
  throw new AdminSupportError(400, 'Thao tác ticket hỗ trợ không hợp lệ.');
};

const update = async (env: AdminSupportEnv, _identity: BetterAuthIdentity, ticketId: string, changes: Record<string, unknown>) => { await access(env, _identity, ticketId); const patch: Record<string, unknown> = {}; if (typeof changes.status === 'string' && TICKET_STATUSES.has(changes.status)) patch.status = changes.status; if (typeof changes.priority === 'string' && PRIORITIES.has(changes.priority)) patch.priority = changes.priority; if (changes.assigned_to === null || isUuid(changes.assigned_to)) patch.assigned_to = changes.assigned_to; if (!Object.keys(patch).length) throw new AdminSupportError(400, 'Dữ liệu cập nhật không hợp lệ.'); const response = await rest(env, `/rest/v1/support_tickets?id=eq.${encodeURIComponent(ticketId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(patch) }); return (await json<Record<string, unknown>[]>(response))[0] || null; };
const resolve = async (env: AdminSupportEnv, identity: BetterAuthIdentity, ticketId: string) => { const row = await access(env, identity, ticketId); if (identity.role === 'auditor') throw new AdminSupportError(403, 'Auditor chỉ có quyền đọc.'); const response = await rest(env, `/rest/v1/support_tickets?id=eq.${encodeURIComponent(ticketId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: identity.userId, resolved_by_role: isStaff(identity) ? 'admin' : 'user' }) }); return (await json<Record<string, unknown>[]>(response))[0] || row; };
const resolveAll = async (env: AdminSupportEnv, identity: BetterAuthIdentity) => { const response = await rest(env, '/rest/v1/support_tickets?status=in.(open,pending)', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: identity.userId, resolved_by_role: 'admin' }) }); return { success: true, resolved_count: (await json<unknown[]>(response)).length }; };
const remove = async (env: AdminSupportEnv, identity: BetterAuthIdentity, ticketId: string) => { const row = await access(env, identity, ticketId); if (row.user_id !== identity.userId || isStaff(identity)) throw new AdminSupportError(403, 'Bạn không có quyền xóa ticket này.'); const response = await rest(env, `/rest/v1/support_tickets?id=eq.${encodeURIComponent(ticketId)}&user_id=eq.${encodeURIComponent(identity.userId)}`, { method: 'DELETE' }); await response.body?.cancel(); return { deleted: true }; };

const createAttachmentUpload = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const file = attachmentInput(input); await access(env, identity, file.ticketId, true); const store = attachmentStore(env); const uploadId = crypto.randomUUID(); const extension = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType.split('/')[1] === 'jpeg' ? 'jpg' : file.mimeType.split('/')[1]; const key = `support-tickets/${file.ticketId}/${uploadId}.${extension}`; const now = new Date(); const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  await store.db.prepare(`INSERT INTO support_attachment_uploads (upload_id,ticket_id,user_id,file_key,file_name,mime_type,size_bytes,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(uploadId, file.ticketId, identity.userId, key, file.fileName, file.mimeType, file.size, now.toISOString(), expiresAt).run();
  return { upload_url: `/api/private/v1/support/attachment-upload/${uploadId}`, file_key: key, expires_at: expiresAt };
};
const completeAttachmentUpload = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const file = attachmentInput(input); const uploadId = typeof input.file_key === 'string' ? input.file_key.split('/').at(-1)?.split('.')[0] : ''; if (!uploadId || !isUuid(uploadId)) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.'); await access(env, identity, file.ticketId, true); const store = attachmentStore(env);
  const row = await store.db.prepare(`SELECT upload_id,file_key,file_name,mime_type,size_bytes,uploaded_at,completed_at,expires_at FROM support_attachment_uploads WHERE upload_id = ? AND ticket_id = ? AND user_id = ?`).bind(uploadId, file.ticketId, identity.userId).first<{ upload_id: string; file_key: string; file_name: string; mime_type: string; size_bytes: number; uploaded_at: string | null; completed_at: string | null; expires_at: string }>();
  if (!row || row.completed_at || !row.uploaded_at || Date.parse(row.expires_at) <= Date.now() || row.file_name !== file.fileName || row.mime_type !== file.mimeType || Number(row.size_bytes) !== file.size) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.'); const object = await store.bucket.head(row.file_key); if (!object || object.size !== file.size || object.httpMetadata?.contentType !== file.mimeType) throw new AdminSupportError(400, 'Tệp tải lên không hợp lệ.');
  const response = await rest(env, '/rest/v1/support_ticket_attachments', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ ticket_id: file.ticketId, uploaded_by: identity.userId, file_key: row.file_key, file_name: row.file_name, mime_type: row.mime_type, size_bytes: row.size_bytes, storage_provider: 'cloudflare_r2', status: 'uploaded', metadata: isRecord(input.metadata) ? input.metadata : {} }) }); const attachment = (await json<Record<string, unknown>[]>(response))[0]; if (!attachment?.id) throw new AdminSupportError(502, 'Không thể lưu tệp đính kèm.'); await store.db.prepare(`UPDATE support_attachment_uploads SET completed_at = ? WHERE upload_id = ? AND completed_at IS NULL`).bind(new Date().toISOString(), uploadId).run(); return { attachment };
};
const linkAttachments = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : ''; const messageId = typeof input.message_id === 'string' ? input.message_id : ''; const ids = Array.isArray(input.attachment_ids) ? input.attachment_ids.filter(isUuid).slice(0, 3) : []; if (!isUuid(ticketId) || !isUuid(messageId) || !ids.length) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.'); const row = await access(env, identity, ticketId, true); if (identity.role === 'auditor') throw new AdminSupportError(403, 'Auditor chỉ có quyền đọc.');
  const messageResponse = await rest(env, `/rest/v1/support_ticket_messages?id=eq.${messageId}&ticket_id=eq.${ticketId}&select=id,sender_id,is_internal_note&limit=1`); const message = (await json<Record<string, unknown>[]>(messageResponse))[0]; if (!message || message.is_internal_note || (!isStaff(identity) && message.sender_id !== identity.userId)) throw new AdminSupportError(403, 'Không có quyền gắn tệp đính kèm.'); const response = await rest(env, `/rest/v1/support_ticket_attachments?id=in.(${ids.join(',')})&ticket_id=eq.${ticketId}&uploaded_by=eq.${identity.userId}&message_id=is.null`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ message_id: messageId, status: 'linked' }) }); const attachments = await json<unknown[]>(response); if (attachments.length !== ids.length) throw new AdminSupportError(400, 'Không thể gắn tệp đính kèm.'); return { attachments, ticket: row.id };
};
const attachmentDownloadUrl = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const attachmentId = typeof input.attachment_id === 'string' ? input.attachment_id : ''; if (!isUuid(attachmentId)) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.'); const response = await rest(env, `/rest/v1/support_ticket_attachments?id=eq.${attachmentId}&select=id,ticket_id,status&limit=1`); const attachment = (await json<Record<string, unknown>[]>(response))[0]; if (!attachment || attachment.status === 'deleted') throw new AdminSupportError(404, 'Không tìm thấy tệp đính kèm.'); await access(env, identity, String(attachment.ticket_id)); return { download_url: `/api/private/v1/support/attachment-download/${attachmentId}`, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() };
};
export const handleAdminSupportAttachmentObject = async (request: Request, url: URL, env: AdminSupportEnv): Promise<Response> => {
  const identity = await requireBetterAuthSession(request, env); const store = attachmentStore(env); const upload = /^\/api\/private\/v1\/support\/attachment-upload\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1];
  if (upload) { if (request.method !== 'PUT') throw new AdminSupportError(405, 'Phương thức không được hỗ trợ.'); const row = await store.db.prepare(`SELECT ticket_id,user_id,file_key,mime_type,size_bytes,expires_at,uploaded_at,completed_at FROM support_attachment_uploads WHERE upload_id = ?`).bind(upload).first<{ ticket_id: string; user_id: string; file_key: string; mime_type: string; size_bytes: number; expires_at: string; uploaded_at: string | null; completed_at: string | null }>(); if (!row || row.user_id !== identity.userId || row.uploaded_at || row.completed_at || Date.parse(row.expires_at) <= Date.now()) throw new AdminSupportError(403, 'Tệp đính kèm không hợp lệ.'); await access(env, identity, row.ticket_id, true); const contentLength = Number(request.headers.get('content-length') || 0); if (!request.body || contentLength !== row.size_bytes || request.headers.get('content-type')?.split(';', 1)[0] !== row.mime_type) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.'); await store.bucket.put(row.file_key, request.body, { httpMetadata: { contentType: row.mime_type } }); await store.db.prepare(`UPDATE support_attachment_uploads SET uploaded_at = ? WHERE upload_id = ? AND uploaded_at IS NULL`).bind(new Date().toISOString(), upload).run(); return new Response(null, { status: 204 }); }
  const download = /^\/api\/private\/v1\/support\/attachment-download\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1]; if (download) { if (request.method !== 'GET') throw new AdminSupportError(405, 'Phương thức không được hỗ trợ.'); const response = await rest(env, `/rest/v1/support_ticket_attachments?id=eq.${download}&select=id,ticket_id,message_id,file_key,file_name,mime_type,status&limit=1`); const attachment = (await json<Record<string, unknown>[]>(response))[0]; if (!attachment || attachment.status === 'deleted') throw new AdminSupportError(404, 'Không tìm thấy tệp đính kèm.'); await access(env, identity, String(attachment.ticket_id)); if (!isStaff(identity) && attachment.message_id) { const messageResponse = await rest(env, `/rest/v1/support_ticket_messages?id=eq.${attachment.message_id}&select=is_internal_note&limit=1`); const message = (await json<Record<string, unknown>[]>(messageResponse))[0]; if (message?.is_internal_note) throw new AdminSupportError(403, 'Không có quyền xem tệp này.'); } const object = await store.bucket.get(String(attachment.file_key)); if (!object) throw new AdminSupportError(404, 'Không tìm thấy tệp đính kèm.'); return new Response(object.body, { headers: { 'content-type': String(attachment.mime_type), 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(String(attachment.file_name))}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }); }
  throw new AdminSupportError(404, 'Không tìm thấy endpoint.');
};
export const adminSupportErrorStatus = (error: unknown) => error instanceof AdminSupportError || error instanceof BetterAuthIdentityError ? error.status : 500;
