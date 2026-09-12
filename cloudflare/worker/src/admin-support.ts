import {
  BetterAuthIdentityError,
  listBetterAuthStaff,
  listBetterAuthStaffUserIds,
  requireBetterAuthSession,
  requireBetterAuthStaff,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface AdminSupportEnv extends BetterAuthIdentityEnv {
  DB?: D1Database;
  SUPPORT_ATTACHMENTS_BUCKET?: R2Bucket;
}

type SupportStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 502 | 503;
type StoredTicket = {
  id: string; user_id: string; assigned_to: string | null; subject: string;
  category: string; priority: string; status: string; initial_message: string | null;
  attachment_urls_json: string; last_message_at: string; resolved_at: string | null;
  resolved_by: string | null; resolved_by_role: string | null; created_at: string; updated_at: string;
};
type StoredMessage = {
  id: string; ticket_id: string; sender_id: string; sender_role: string; body: string;
  attachment_urls_json: string; is_internal_note: number; metadata_json: string; created_at: string;
};
type StoredAttachment = {
  id: string; ticket_id: string; message_id: string | null; uploaded_by: string; file_key: string;
  file_name: string; mime_type: string; size_bytes: number; storage_provider: string; status: string;
  metadata_json: string; created_at: string;
};
type UploadRow = {
  upload_id: string; ticket_id: string; user_id: string; file_key: string; file_name: string;
  mime_type: string; size_bytes: number; uploaded_at: string | null; completed_at: string | null; expires_at: string;
};

export class AdminSupportError extends Error {
  readonly status: SupportStatus;
  constructor(status: SupportStatus, message: string) {
    super(message);
    this.status = status;
    this.name = 'AdminSupportError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 64 * 1024;
const MAX_ACTIVE = 3;
const STAFF_ROLES = new Set(['admin', 'auditor']);
const TICKET_STATUSES = new Set(['open', 'pending', 'resolved', 'closed']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const CATEGORIES = new Set(['login', 'grades', 'events', 'schedule', 'lost_found', 'feedback', 'other']);
const TICKET_SELECT = `id,user_id,assigned_to,subject,category,priority,status,initial_message,
  attachment_urls_json,last_message_at,resolved_at,resolved_by,resolved_by_role,created_at,updated_at`;
const MESSAGE_SELECT = 'id,ticket_id,sender_id,sender_role,body,attachment_urls_json,is_internal_note,metadata_json,created_at';
const ATTACHMENT_SELECT = 'id,ticket_id,message_id,uploaded_by,file_key,file_name,mime_type,size_bytes,storage_provider,status,metadata_json,created_at';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isStaff = (identity: BetterAuthIdentity) => STAFF_ROLES.has(identity.role);
const requireAdmin = (identity: BetterAuthIdentity) => {
  if (identity.role !== 'admin') throw new AdminSupportError(403, 'Không có quyền thực hiện thao tác này.');
  return identity;
};
const db = (env: AdminSupportEnv) => {
  if (!env.DB) throw new AdminSupportError(503, 'Dịch vụ hỗ trợ chưa sẵn sàng.');
  return env.DB;
};
const store = (env: AdminSupportEnv) => {
  if (!env.DB || !env.SUPPORT_ATTACHMENTS_BUCKET) throw new AdminSupportError(503, 'Dịch vụ tệp hỗ trợ chưa sẵn sàng.');
  return { db: env.DB, bucket: env.SUPPORT_ATTACHMENTS_BUCKET };
};
const cleanText = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const safePage = (value: unknown, fallback: number, maximum: number) =>
  Number.isSafeInteger(Number(value)) ? Math.max(1, Math.min(maximum, Number(value))) : fallback;
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const hash = async (value: unknown) => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
const readBody = async (request: Request) => {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) throw new AdminSupportError(413, 'Dữ liệu gửi lên quá lớn.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) throw new AdminSupportError(413, 'Dữ liệu gửi lên quá lớn.');
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) throw new Error();
    return value;
  } catch {
    throw new AdminSupportError(400, 'Dữ liệu ticket không hợp lệ.');
  }
};
const ticketResponse = (row: StoredTicket) => {
  const { attachment_urls_json, ...rest } = row;
  return { ...rest, attachment_urls: parseJson<unknown[]>(attachment_urls_json, []) };
};
const attachmentResponse = (row: StoredAttachment) => {
  const { metadata_json, ...rest } = row;
  return { ...rest, metadata: parseJson<Record<string, unknown>>(metadata_json, {}) };
};
const messageResponse = (row: StoredMessage, attachments: StoredAttachment[] = []) => {
  const { attachment_urls_json, metadata_json, ...rest } = row;
  return {
    ...rest,
    is_internal_note: Number(row.is_internal_note) !== 0,
    attachment_urls: parseJson<unknown[]>(attachment_urls_json, []),
    metadata: parseJson<Record<string, unknown>>(metadata_json, {}),
    attachments: attachments.map(attachmentResponse),
  };
};

const ticketById = async (env: AdminSupportEnv, ticketId: string) => {
  if (!isUuid(ticketId)) throw new AdminSupportError(400, 'Ticket không hợp lệ.');
  return db(env).prepare(`SELECT ${TICKET_SELECT} FROM support_tickets WHERE id = ?`).bind(ticketId).first<StoredTicket>();
};
const requireTicketAccess = async (env: AdminSupportEnv, identity: BetterAuthIdentity, ticketId: string, open = false) => {
  const row = await ticketById(env, ticketId);
  if (!row) throw new AdminSupportError(404, 'Ticket không tồn tại.');
  if (!isStaff(identity) && row.user_id !== identity.userId) throw new AdminSupportError(403, 'Bạn không có quyền truy cập ticket này.');
  if (open && (row.status === 'resolved' || row.status === 'closed')) throw new AdminSupportError(409, 'Ticket đã đóng, không thể gửi thêm phản hồi.');
  return row;
};

const readProfiles = async (env: AdminSupportEnv, ids: string[]) => {
  const unique = [...new Set(ids.filter(isUuid))];
  if (!unique.length) return new Map<string, { full_name: string | null; avatar_url: string | null; student_code: string | null }>();
  const rows = await db(env).prepare(
    `SELECT user_id,full_name,avatar_url,student_code FROM user_profiles WHERE user_id IN (${unique.map(() => '?').join(',')})`,
  ).bind(...unique).all<{ user_id: string; full_name: string | null; avatar_url: string | null; student_code: string | null }>();
  return new Map((rows.results || []).map((row) => [row.user_id, row]));
};
const hydrateTickets = async (env: AdminSupportEnv, rows: StoredTicket[]) => {
  const profiles = await readProfiles(env, rows.flatMap((row) => [row.user_id, row.assigned_to || '']));
  const profile = (id: string | null) => {
    if (!id) return null;
    const value = profiles.get(id);
    return value ? { full_name: value.full_name, email: null, student_code: value.student_code, avatar_url: value.avatar_url } : null;
  };
  return rows.map((row) => ({ ...ticketResponse(row), user: profile(row.user_id), assignee: profile(row.assigned_to) }));
};
const readSupportStaff = async (env: AdminSupportEnv) => {
  const staff = await listBetterAuthStaff(env);
  const profiles = await readProfiles(env, staff.map((entry) => entry.userId));
  return staff.map((entry) => ({
    id: entry.userId,
    role: entry.role,
    full_name: profiles.get(entry.userId)?.full_name || null,
    email: null,
  }));
};

const listTickets = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const size = safePage(input.paged ? input.pageSize : input.limit, isStaff(identity) ? 100 : 50, isStaff(identity) ? 200 : 80);
  const offset = input.paged ? (safePage(input.page, 1, 10_000) - 1) * size : 0;
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  if (!isStaff(identity)) { clauses.push('user_id = ?'); bindings.push(identity.userId); }
  for (const [key, allowed] of [['status', TICKET_STATUSES], ['category', CATEGORIES], ['priority', PRIORITIES]] as const) {
    const value = input[key];
    if (typeof value === 'string' && value !== 'all' && allowed.has(value)) { clauses.push(`${key} = ?`); bindings.push(value); }
  }
  const search = cleanText(input.search, 80);
  if (search) { clauses.push(`subject LIKE ? ESCAPE '\\' COLLATE NOCASE`); bindings.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`); }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    db(env).prepare(`SELECT ${TICKET_SELECT} FROM support_tickets${where} ORDER BY last_message_at DESC LIMIT ? OFFSET ?`).bind(...bindings, size, offset).all<StoredTicket>(),
    db(env).prepare(`SELECT COUNT(*) AS total FROM support_tickets${where}`).bind(...bindings).first<{ total: number }>(),
  ]);
  return { success: true, data: await hydrateTickets(env, rows.results || []), total: Number(count?.total || 0), role: identity.role };
};

const notification = (env: AdminSupportEnv, input: {
  receiverId: string; actorId: string; ticket: StoredTicket; messageId: string | null;
  type: string; content: string; link: string; at: string;
}) => db(env).prepare(
  `INSERT OR IGNORE INTO support_notifications
   (id,receiver_id,actor_id,ticket_id,message_id,type,content,link,is_read,dedupe_key,created_at)
   VALUES (?,?,?,?,?,?,?,?,0,?,?)`,
).bind(
  crypto.randomUUID(), input.receiverId, input.actorId, input.ticket.id, input.messageId,
  input.type, input.content, input.link,
  `${input.type}:${input.ticket.id}:${input.messageId || input.at}:${input.receiverId}`, input.at,
);
const actorName = async (env: AdminSupportEnv, userId: string) => {
  const row = await db(env).prepare('SELECT full_name,student_code FROM user_profiles WHERE user_id = ?').bind(userId).first<{ full_name: string | null; student_code: string | null }>();
  return cleanText(row?.full_name || row?.student_code || 'User', 120) || 'User';
};
const notifyStaff = async (env: AdminSupportEnv, identity: BetterAuthIdentity, ticket: StoredTicket, messageId: string | null, type: 'support_ticket_created' | 'support_ticket_user_reply' | 'support_ticket_resolved', at: string) => {
  const receivers = (await listBetterAuthStaffUserIds(env)).filter((id) => id !== identity.userId);
  const name = await actorName(env, identity.userId);
  const content = type === 'support_ticket_created'
    ? `${name} vừa tạo ticket: ${ticket.subject}`
    : type === 'support_ticket_resolved'
      ? `User đã đánh dấu ticket đã xử lý xong: ${ticket.subject}`
      : `${name} vừa phản hồi ticket: ${ticket.subject}`;
  return receivers.map((receiverId) => notification(env, {
    receiverId, actorId: identity.userId, ticket, messageId, type, content,
    link: `/admin/support/${ticket.id}`, at,
  }));
};
const notifyOwner = (env: AdminSupportEnv, identity: BetterAuthIdentity, ticket: StoredTicket, messageId: string | null, type: 'support_ticket_reply' | 'support_ticket_resolved', at: string) => notification(env, {
  receiverId: ticket.user_id, actorId: identity.userId, ticket, messageId, type,
  content: type === 'support_ticket_resolved' ? `Ticket đã được xử lý xong: ${ticket.subject}` : `HUB Planner vừa phản hồi ticket: ${ticket.subject}`,
  link: `/support/${ticket.id}`, at,
});

const createTicket = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const subject = cleanText(input.subject, 160);
  const message = typeof input.message === 'string' ? input.message.trim().slice(0, 4000) : '';
  const category = typeof input.category === 'string' && CATEGORIES.has(input.category) ? input.category : '';
  const priority = typeof input.priority === 'string' && PRIORITIES.has(input.priority) ? input.priority : '';
  if (subject.length < 3 || !message || !category || !priority) throw new AdminSupportError(400, 'Dữ liệu ticket không hợp lệ.');
  const active = await db(env).prepare(`SELECT COUNT(*) AS total FROM support_tickets WHERE user_id = ? AND status IN ('open','pending')`).bind(identity.userId).first<{ total: number }>();
  if (Number(active?.total || 0) >= MAX_ACTIVE) throw new AdminSupportError(409, 'Bạn đang có 3 phiếu hỗ trợ chưa xử lý.');
  const now = new Date().toISOString(); const ticketId = crypto.randomUUID(); const messageId = crypto.randomUUID();
  const ticket: StoredTicket = { id: ticketId, user_id: identity.userId, assigned_to: null, subject, category, priority, status: 'open', initial_message: message, attachment_urls_json: '[]', last_message_at: now, resolved_at: null, resolved_by: null, resolved_by_role: null, created_at: now, updated_at: now };
  const messageRow: StoredMessage = { id: messageId, ticket_id: ticketId, sender_id: identity.userId, sender_role: 'user', body: message, attachment_urls_json: '[]', is_internal_note: 0, metadata_json: JSON.stringify(isRecord(input.metadata) ? input.metadata : {}), created_at: now };
  const notices = await notifyStaff(env, identity, ticket, messageId, 'support_ticket_created', now);
  try {
    await db(env).batch([
      db(env).prepare(`INSERT INTO support_tickets (id,user_id,assigned_to,subject,category,priority,status,initial_message,attachment_urls_json,last_message_at,resolved_at,resolved_by,resolved_by_role,created_at,updated_at,canonical_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ticket.id, ticket.user_id, ticket.assigned_to, ticket.subject, ticket.category, ticket.priority, ticket.status, ticket.initial_message, ticket.attachment_urls_json, ticket.last_message_at, ticket.resolved_at, ticket.resolved_by, ticket.resolved_by_role, ticket.created_at, ticket.updated_at, await hash(ticket)),
      db(env).prepare(`INSERT INTO support_ticket_messages (id,ticket_id,sender_id,sender_role,body,attachment_urls_json,is_internal_note,metadata_json,created_at,canonical_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(messageRow.id, messageRow.ticket_id, messageRow.sender_id, messageRow.sender_role, messageRow.body, messageRow.attachment_urls_json, messageRow.is_internal_note, messageRow.metadata_json, messageRow.created_at, await hash(messageRow)),
      ...notices,
    ]);
  } catch (error) {
    if (String(error).includes('SUPPORT_ACTIVE_TICKET_LIMIT')) throw new AdminSupportError(409, 'Bạn đang có 3 phiếu hỗ trợ chưa xử lý.');
    throw error;
  }
  return { ...ticketResponse(ticket), initial_message_id: messageId };
};

const createMessage = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : '';
  const ticket = await requireTicketAccess(env, identity, ticketId, true);
  const content = typeof input.body === 'string' ? input.body.trim().slice(0, 4000) : '';
  if (!content && input.allow_empty_body !== true) throw new AdminSupportError(400, 'Không thể gửi phản hồi rỗng.');
  if (identity.role === 'auditor') throw new AdminSupportError(403, 'Auditor chỉ có quyền đọc.');
  const internal = input.is_internal_note === true;
  if (internal && identity.role !== 'admin') throw new AdminSupportError(403, 'Không có quyền tạo ghi chú nội bộ.');
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  const row: StoredMessage = { id, ticket_id: ticketId, sender_id: identity.userId, sender_role: identity.role === 'admin' ? 'admin' : 'user', body: content, attachment_urls_json: '[]', is_internal_note: internal ? 1 : 0, metadata_json: JSON.stringify(isRecord(input.metadata) ? input.metadata : {}), created_at: now };
  const statements: D1PreparedStatement[] = [
    db(env).prepare(`INSERT INTO support_ticket_messages (id,ticket_id,sender_id,sender_role,body,attachment_urls_json,is_internal_note,metadata_json,created_at,canonical_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(row.id, row.ticket_id, row.sender_id, row.sender_role, row.body, row.attachment_urls_json, row.is_internal_note, row.metadata_json, row.created_at, await hash(row)),
    db(env).prepare(`UPDATE support_tickets SET last_message_at=?,updated_at=?,status=CASE WHEN status='open' THEN 'pending' ELSE status END WHERE id=?`).bind(now, now, ticketId),
  ];
  if (!internal && row.sender_role === 'user') statements.push(...await notifyStaff(env, identity, ticket, id, 'support_ticket_user_reply', now));
  if (!internal && row.sender_role === 'admin' && ticket.user_id !== identity.userId) statements.push(notifyOwner(env, identity, ticket, id, 'support_ticket_reply', now));
  await db(env).batch(statements);
  return { message: messageResponse(row) };
};

const readMessages = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : '';
  await requireTicketAccess(env, identity, ticketId);
  const clauses = ['ticket_id = ?']; const bindings: unknown[] = [ticketId];
  if (!isStaff(identity)) clauses.push('is_internal_note = 0');
  if (typeof input.before_created_at === 'string') { clauses.push('created_at < ?'); bindings.push(input.before_created_at); }
  const result = await db(env).prepare(`SELECT ${MESSAGE_SELECT} FROM support_ticket_messages WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`).bind(...bindings, safePage(input.limit, 50, 100)).all<StoredMessage>();
  const messages = result.results || [];
  const attachments = messages.length
    ? await db(env).prepare(`SELECT ${ATTACHMENT_SELECT} FROM support_ticket_attachments WHERE message_id IN (${messages.map(() => '?').join(',')}) AND status <> 'deleted' ORDER BY created_at`).bind(...messages.map((row) => row.id)).all<StoredAttachment>()
    : { results: [] as StoredAttachment[] };
  const grouped = new Map<string, StoredAttachment[]>();
  for (const attachment of attachments.results || []) if (attachment.message_id) grouped.set(attachment.message_id, [...(grouped.get(attachment.message_id) || []), attachment]);
  return { success: true, data: messages.map((row) => messageResponse(row, grouped.get(row.id) || [])) };
};

const updateTicket = async (env: AdminSupportEnv, identity: BetterAuthIdentity, ticketId: string, changes: Record<string, unknown>) => {
  const previous = await requireTicketAccess(env, identity, ticketId);
  const patch: Array<[string, unknown]> = [];
  if (typeof changes.status === 'string' && TICKET_STATUSES.has(changes.status)) patch.push(['status', changes.status]);
  if (typeof changes.priority === 'string' && PRIORITIES.has(changes.priority)) patch.push(['priority', changes.priority]);
  if (changes.assigned_to === null || isUuid(changes.assigned_to)) patch.push(['assigned_to', changes.assigned_to]);
  if (!patch.length) throw new AdminSupportError(400, 'Dữ liệu cập nhật không hợp lệ.');
  const now = new Date().toISOString();
  await db(env).prepare(`UPDATE support_tickets SET ${patch.map(([key]) => `${key}=?`).join(',')},updated_at=? WHERE id=?`).bind(...patch.map(([, value]) => value), now, ticketId).run();
  const current = await ticketById(env, ticketId);
  if (!current) throw new AdminSupportError(404, 'Ticket không tồn tại.');
  if (previous.status !== current.status && (current.status === 'resolved' || current.status === 'closed') && current.user_id !== identity.userId) {
    await notifyOwner(env, identity, current, null, 'support_ticket_resolved', now).run();
  }
  return ticketResponse(current);
};
const resolveTicket = async (env: AdminSupportEnv, identity: BetterAuthIdentity, ticketId: string) => {
  const ticket = await requireTicketAccess(env, identity, ticketId);
  if (identity.role === 'auditor') throw new AdminSupportError(403, 'Auditor chỉ có quyền đọc.');
  if (ticket.status === 'resolved') return ticketResponse(ticket);
  const now = new Date().toISOString();
  const notices = isStaff(identity) && ticket.user_id !== identity.userId
    ? [notifyOwner(env, identity, ticket, null, 'support_ticket_resolved', now)]
    : await notifyStaff(env, identity, ticket, null, 'support_ticket_resolved', now);
  await db(env).batch([
    db(env).prepare(`UPDATE support_tickets SET status='resolved',resolved_at=?,resolved_by=?,resolved_by_role=?,updated_at=? WHERE id=?`).bind(now, identity.userId, isStaff(identity) ? 'admin' : 'user', now, ticketId),
    ...notices,
  ]);
  return ticketResponse({ ...ticket, status: 'resolved', resolved_at: now, resolved_by: identity.userId, resolved_by_role: isStaff(identity) ? 'admin' : 'user', updated_at: now });
};
const resolveAll = async (env: AdminSupportEnv, identity: BetterAuthIdentity) => {
  const result = await db(env).prepare(`SELECT ${TICKET_SELECT} FROM support_tickets WHERE status IN ('open','pending')`).all<StoredTicket>();
  const tickets = result.results || []; const now = new Date().toISOString();
  await db(env).batch([
    db(env).prepare(`UPDATE support_tickets SET status='resolved',resolved_at=?,resolved_by=?,resolved_by_role='admin',updated_at=? WHERE status IN ('open','pending')`).bind(now, identity.userId, now),
    ...tickets.filter((ticket) => ticket.user_id !== identity.userId).map((ticket) => notifyOwner(env, identity, ticket, null, 'support_ticket_resolved', now)),
  ]);
  return { success: true, resolved_count: tickets.length };
};
const deleteTicket = async (env: AdminSupportEnv, identity: BetterAuthIdentity, ticketId: string) => {
  const ticket = await requireTicketAccess(env, identity, ticketId);
  if (ticket.user_id !== identity.userId || isStaff(identity)) throw new AdminSupportError(403, 'Bạn không có quyền xóa ticket này.');
  const attachments = await db(env).prepare(`SELECT file_key FROM support_ticket_attachments WHERE ticket_id=? AND status<>'deleted'`).bind(ticketId).all<{ file_key: string }>();
  const attachmentStore = store(env);
  const keys = (attachments.results || []).map((row) => row.file_key).filter((key) => key.startsWith(`support-tickets/${ticketId}/`));
  if (keys.length) await attachmentStore.bucket.delete(keys);
  await attachmentStore.db.batch([
    attachmentStore.db.prepare('DELETE FROM support_attachment_uploads WHERE ticket_id=?').bind(ticketId),
    attachmentStore.db.prepare('DELETE FROM support_tickets WHERE id=? AND user_id=?').bind(ticketId, identity.userId),
  ]);
  return { deleted: true };
};

const attachmentInput = (input: Record<string, unknown>) => {
  const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : '';
  const fileName = cleanText(input.file_name, 180).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  const mimeType = typeof input.mime_type === 'string' ? input.mime_type : '';
  const size = Number(input.size);
  if (!isUuid(ticketId) || !fileName || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType) || !Number.isSafeInteger(size) || size < 1) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.');
  if ((mimeType === 'application/pdf' && size > 10 * 1024 * 1024) || (mimeType !== 'application/pdf' && size > 5 * 1024 * 1024)) throw new AdminSupportError(400, 'Tệp đính kèm vượt quá dung lượng cho phép.');
  return { ticketId, fileName, mimeType, size };
};
const createUpload = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const file = attachmentInput(input); await requireTicketAccess(env, identity, file.ticketId, true);
  if (identity.role === 'auditor') throw new AdminSupportError(403, 'Auditor chỉ có quyền đọc.');
  const attachmentStore = store(env); const uploadId = crypto.randomUUID();
  const extension = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType === 'image/jpeg' ? 'jpg' : file.mimeType.split('/')[1];
  const key = `support-tickets/${file.ticketId}/${uploadId}.${extension}`;
  const now = new Date(); const expires = new Date(now.getTime() + 10 * 60_000).toISOString();
  await attachmentStore.db.prepare(`INSERT INTO support_attachment_uploads (upload_id,ticket_id,user_id,file_key,file_name,mime_type,size_bytes,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(uploadId, file.ticketId, identity.userId, key, file.fileName, file.mimeType, file.size, now.toISOString(), expires).run();
  return { upload_url: `/api/private/v1/support/attachment-upload/${uploadId}`, file_key: key, expires_at: expires };
};
const completeUpload = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const file = attachmentInput(input);
  const uploadId = typeof input.file_key === 'string' ? input.file_key.split('/').at(-1)?.split('.')[0] : '';
  if (!uploadId || !isUuid(uploadId)) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.');
  await requireTicketAccess(env, identity, file.ticketId, true);
  if (identity.role === 'auditor') throw new AdminSupportError(403, 'Auditor chỉ có quyền đọc.');
  const attachmentStore = store(env);
  const upload = await attachmentStore.db.prepare(`SELECT upload_id,ticket_id,user_id,file_key,file_name,mime_type,size_bytes,uploaded_at,completed_at,expires_at FROM support_attachment_uploads WHERE upload_id=? AND ticket_id=? AND user_id=?`).bind(uploadId, file.ticketId, identity.userId).first<UploadRow>();
  if (!upload || upload.completed_at || !upload.uploaded_at || Date.parse(upload.expires_at) <= Date.now() || upload.file_name !== file.fileName || upload.mime_type !== file.mimeType || Number(upload.size_bytes) !== file.size) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.');
  const object = await attachmentStore.bucket.head(upload.file_key);
  if (!object || object.size !== file.size || object.httpMetadata?.contentType !== file.mimeType) throw new AdminSupportError(400, 'Tệp tải lên không hợp lệ.');
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const row: StoredAttachment = { id, ticket_id: file.ticketId, message_id: null, uploaded_by: identity.userId, file_key: upload.file_key, file_name: upload.file_name, mime_type: upload.mime_type, size_bytes: upload.size_bytes, storage_provider: 'cloudflare_r2', status: 'uploaded', metadata_json: JSON.stringify(isRecord(input.metadata) ? input.metadata : {}), created_at: now };
  await attachmentStore.db.batch([
    attachmentStore.db.prepare(`INSERT INTO support_ticket_attachments (id,ticket_id,message_id,uploaded_by,file_key,file_name,mime_type,size_bytes,storage_provider,status,metadata_json,created_at,canonical_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(row.id, row.ticket_id, row.message_id, row.uploaded_by, row.file_key, row.file_name, row.mime_type, row.size_bytes, row.storage_provider, row.status, row.metadata_json, row.created_at, await hash(row)),
    attachmentStore.db.prepare('UPDATE support_attachment_uploads SET completed_at=? WHERE upload_id=? AND completed_at IS NULL').bind(now, uploadId),
  ]);
  return { attachment: attachmentResponse(row) };
};
const linkAttachments = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const ticketId = typeof input.ticket_id === 'string' ? input.ticket_id : '';
  const messageId = typeof input.message_id === 'string' ? input.message_id : '';
  const ids = Array.isArray(input.attachment_ids) ? [...new Set(input.attachment_ids.filter(isUuid))].slice(0, 3) : [];
  if (!isUuid(ticketId) || !isUuid(messageId) || !ids.length) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.');
  await requireTicketAccess(env, identity, ticketId, true);
  if (identity.role === 'auditor') throw new AdminSupportError(403, 'Auditor chỉ có quyền đọc.');
  const message = await db(env).prepare('SELECT id,sender_id,is_internal_note FROM support_ticket_messages WHERE id=? AND ticket_id=?').bind(messageId, ticketId).first<{ id: string; sender_id: string; is_internal_note: number }>();
  if (!message || message.is_internal_note || (!isStaff(identity) && message.sender_id !== identity.userId)) throw new AdminSupportError(403, 'Không có quyền gắn tệp đính kèm.');
  const rows = await db(env).prepare(`SELECT id,uploaded_by,message_id,status FROM support_ticket_attachments WHERE id IN (${ids.map(() => '?').join(',')}) AND ticket_id=?`).bind(...ids, ticketId).all<{ id: string; uploaded_by: string; message_id: string | null; status: string }>();
  if ((rows.results || []).length !== ids.length || (rows.results || []).some((row) => row.uploaded_by !== identity.userId || row.message_id !== null || row.status !== 'uploaded')) throw new AdminSupportError(400, 'Không thể gắn tệp đính kèm.');
  await db(env).batch(ids.map((id) => db(env).prepare(`UPDATE support_ticket_attachments SET message_id=?,status='linked' WHERE id=? AND ticket_id=? AND uploaded_by=? AND message_id IS NULL`).bind(messageId, id, ticketId, identity.userId)));
  const linked = await db(env).prepare(`SELECT ${ATTACHMENT_SELECT} FROM support_ticket_attachments WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<StoredAttachment>();
  return { attachments: (linked.results || []).map(attachmentResponse), ticket: ticketId };
};
const attachmentForAccess = async (env: AdminSupportEnv, id: string) => {
  if (!isUuid(id)) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.');
  const row = await db(env).prepare(`SELECT ${ATTACHMENT_SELECT} FROM support_ticket_attachments WHERE id=?`).bind(id).first<StoredAttachment>();
  if (!row || row.status === 'deleted') throw new AdminSupportError(404, 'Không tìm thấy tệp đính kèm.');
  return row;
};
const downloadUrl = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const row = await attachmentForAccess(env, typeof input.attachment_id === 'string' ? input.attachment_id : '');
  await requireTicketAccess(env, identity, row.ticket_id);
  return { download_url: `/api/private/v1/support/attachment-download/${row.id}`, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() };
};
const deleteAttachment = async (env: AdminSupportEnv, identity: BetterAuthIdentity, input: Record<string, unknown>) => {
  const id = typeof input.attachment_id === 'string' ? input.attachment_id : '';
  if (!isUuid(id)) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.');
  const row = await db(env).prepare(`SELECT ${ATTACHMENT_SELECT} FROM support_ticket_attachments WHERE id=?`).bind(id).first<StoredAttachment>();
  if (!row || row.status === 'deleted') return { deleted: true };
  await requireTicketAccess(env, identity, row.ticket_id);
  if (row.uploaded_by !== identity.userId && identity.role !== 'admin') throw new AdminSupportError(403, 'Bạn không có quyền xóa tệp này.');
  const attachmentStore = store(env); await attachmentStore.bucket.delete(row.file_key);
  await attachmentStore.db.prepare(`UPDATE support_ticket_attachments SET status='deleted' WHERE id=?`).bind(id).run();
  return { deleted: true };
};

export const handleAdminSupport = async (request: Request, url: URL, env: AdminSupportEnv) => {
  if (url.pathname.startsWith('/api/admin/v1/support/')) {
    const identity = await requireBetterAuthStaff(request, env);
    if (url.pathname === '/api/admin/v1/support/tickets' && request.method === 'GET') return listTickets(env, identity, Object.fromEntries(url.searchParams));
    const id = /^\/api\/admin\/v1\/support\/tickets\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1];
    if (id && request.method === 'PATCH') return { success: true, ticket: await updateTicket(env, requireAdmin(identity), id, await readBody(request)) };
    if (url.pathname === '/api/admin/v1/support/resolve-all' && request.method === 'POST') return resolveAll(env, requireAdmin(identity));
    throw new AdminSupportError(405, 'Phương thức hỗ trợ không được hỗ trợ.');
  }
  if (request.method !== 'POST') throw new AdminSupportError(405, 'Phương thức hỗ trợ không được hỗ trợ.');
  const identity = await requireBetterAuthSession(request, env); const input = await readBody(request);
  const action = typeof input.action === 'string' ? input.action : '';
  if (action === 'list') return listTickets(env, identity, input);
  if (action === 'get-ticket') return { success: true, ticket: ticketResponse(await requireTicketAccess(env, identity, typeof input.ticket_id === 'string' ? input.ticket_id : '')) };
  if (action === 'messages') return readMessages(env, identity, input);
  if (action === 'create-ticket') return createTicket(env, identity, input);
  if (action === 'create-message') return createMessage(env, identity, input);
  if (action === 'update-ticket') return { success: true, ticket: await updateTicket(env, requireAdmin(identity), typeof input.ticket_id === 'string' ? input.ticket_id : '', isRecord(input.updates) ? input.updates : {}) };
  if (action === 'resolve-ticket') return { success: true, ticket: await resolveTicket(env, identity, typeof input.ticket_id === 'string' ? input.ticket_id : '') };
  if (action === 'resolve-all-open-tickets') return resolveAll(env, requireAdmin(identity));
  if (action === 'delete-ticket') return deleteTicket(env, identity, typeof input.ticket_id === 'string' ? input.ticket_id : '');
  if (action === 'staff') { const staff = await requireBetterAuthStaff(request, env); return { success: true, data: await readSupportStaff(env), role: staff.role }; }
  if (action === 'attachment:create-upload-url') return createUpload(env, identity, input);
  if (action === 'attachment:complete-upload') return completeUpload(env, identity, input);
  if (action === 'attachment:link-message-attachments') return linkAttachments(env, identity, input);
  if (action === 'attachment:create-download-url') return downloadUrl(env, identity, input);
  if (action === 'attachment:delete') return deleteAttachment(env, identity, input);
  throw new AdminSupportError(400, 'Thao tác ticket hỗ trợ không hợp lệ.');
};

export const handleAdminSupportAttachmentObject = async (request: Request, url: URL, env: AdminSupportEnv): Promise<Response> => {
  const identity = await requireBetterAuthSession(request, env); const attachmentStore = store(env);
  const upload = /^\/api\/private\/v1\/support\/attachment-upload\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1];
  if (upload) {
    if (request.method !== 'PUT') throw new AdminSupportError(405, 'Phương thức không được hỗ trợ.');
    const row = await attachmentStore.db.prepare(`SELECT upload_id,ticket_id,user_id,file_key,file_name,mime_type,size_bytes,uploaded_at,completed_at,expires_at FROM support_attachment_uploads WHERE upload_id=?`).bind(upload).first<UploadRow>();
    if (!row || row.user_id !== identity.userId || row.uploaded_at || row.completed_at || Date.parse(row.expires_at) <= Date.now()) throw new AdminSupportError(403, 'Tệp đính kèm không hợp lệ.');
    await requireTicketAccess(env, identity, row.ticket_id, true);
    if (identity.role === 'auditor') throw new AdminSupportError(403, 'Auditor chỉ có quyền đọc.');
    const length = Number(request.headers.get('content-length') || 0);
    if (!request.body || length !== row.size_bytes || request.headers.get('content-type')?.split(';', 1)[0] !== row.mime_type) throw new AdminSupportError(400, 'Tệp đính kèm không hợp lệ.');
    await attachmentStore.bucket.put(row.file_key, request.body, { httpMetadata: { contentType: row.mime_type } });
    await attachmentStore.db.prepare('UPDATE support_attachment_uploads SET uploaded_at=? WHERE upload_id=? AND uploaded_at IS NULL').bind(new Date().toISOString(), upload).run();
    return new Response(null, { status: 204 });
  }
  const download = /^\/api\/private\/v1\/support\/attachment-download\/([0-9a-f-]{36})$/i.exec(url.pathname)?.[1];
  if (download) {
    if (request.method !== 'GET') throw new AdminSupportError(405, 'Phương thức không được hỗ trợ.');
    const row = await attachmentForAccess(env, download); await requireTicketAccess(env, identity, row.ticket_id);
    if (!isStaff(identity) && row.message_id) {
      const message = await attachmentStore.db.prepare('SELECT is_internal_note FROM support_ticket_messages WHERE id=?').bind(row.message_id).first<{ is_internal_note: number }>();
      if (Number(message?.is_internal_note || 0) !== 0) throw new AdminSupportError(403, 'Không có quyền xem tệp này.');
    }
    const object = await attachmentStore.bucket.get(row.file_key);
    if (!object) throw new AdminSupportError(404, 'Không tìm thấy tệp đính kèm.');
    return new Response(object.body, { headers: { 'content-type': row.mime_type, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  }
  throw new AdminSupportError(404, 'Không tìm thấy endpoint.');
};

export const adminSupportErrorStatus = (error: unknown) =>
  error instanceof AdminSupportError || error instanceof BetterAuthIdentityError ? error.status : 500;
