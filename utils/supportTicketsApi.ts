import { fetchBetterAuthSession, privateApiRequest } from './privateApi';

export type SupportTicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportTicketCategory = 'login' | 'grades' | 'events' | 'schedule' | 'lost_found' | 'feedback' | 'other';
export type SupportSenderRole = 'user' | 'admin' | 'support';
export const MAX_ACTIVE_SUPPORT_TICKETS_PER_USER = 3;
export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = { open: 'Mới', pending: 'Đang xử lý', resolved: 'Đã giải quyết', closed: 'Đã đóng' };
export const SUPPORT_CATEGORY_LABELS: Record<SupportTicketCategory, string> = { login: 'Đăng nhập', grades: 'Lỗi bảng điểm', events: 'Lỗi sự kiện', schedule: 'Lỗi TKB', lost_found: 'Lỗi tìm đồ thất lạc', feedback: 'Góp ý', other: 'Khác' };
export const SUPPORT_PRIORITY_LABELS: Record<SupportTicketPriority, string> = { low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn cấp' };

export interface SupportTicket {
  id: string; user_id: string; assigned_to: string | null; subject: string;
  category: SupportTicketCategory; priority: SupportTicketPriority; status: SupportTicketStatus;
  initial_message?: string | null; attachment_urls?: string[]; last_message_at: string;
  resolved_at?: string | null; resolved_by?: string | null;
  resolved_by_role?: 'user' | 'admin' | 'support' | 'auditor' | null;
  created_at: string; updated_at: string;
  user?: { full_name?: string | null; email?: string | null; student_code?: string | null; avatar_url?: string | null } | null;
  assignee?: { full_name?: string | null; email?: string | null } | null;
}
export interface SupportTicketAttachment { id: string; ticket_id?: string; message_id?: string | null; uploaded_by?: string; file_name: string; mime_type: string; size_bytes: number; storage_provider?: 'cloudflare_r2'; status?: 'pending' | 'uploaded' | 'linked' | 'deleted'; metadata?: Record<string, unknown>; created_at?: string; }
export interface SupportTicketMessage { id: string; ticket_id: string; sender_id: string; sender_role: SupportSenderRole; body: string; attachment_urls?: string[]; metadata?: Record<string, unknown>; is_internal_note: boolean; created_at: string; sender?: { full_name?: string | null; email?: string | null; student_code?: string | null; avatar_url?: string | null } | null; attachments?: SupportTicketAttachment[]; }
export interface TicketFilters { status?: SupportTicketStatus | 'all'; category?: SupportTicketCategory | 'all'; priority?: SupportTicketPriority | 'all'; search?: string; isStaff?: boolean; limit?: number; page?: number; pageSize?: number; }
export interface SupportStaffMember { id: string; role: string; full_name?: string | null; email?: string | null; }

const SUPPORT_PATH = '/api/private/v1/support';
const json = async <T>(path: string, init: RequestInit = {}) => (await privateApiRequest(path, init)).json() as Promise<T>;
const post = <T>(action: string, payload: Record<string, unknown> = {}) => json<T>(SUPPORT_PATH, { method: 'POST', body: JSON.stringify({ action, ...payload }) });
export const normalizeTicketText = (value: string, maxLength: number) => value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
export const validateTicketInput = (subject: string, message: string) => {
  const cleanSubject = normalizeTicketText(subject, 160); const cleanMessage = message.trim().slice(0, 4000);
  if (cleanSubject.length < 3) throw new Error('Tiêu đề cần có ít nhất 3 ký tự.');
  if (cleanMessage.length < 1) throw new Error('Mô tả vấn đề không được để trống.');
  return { subject: cleanSubject, message: cleanMessage };
};
export const getCurrentUserId = async () => {
  const session = await fetchBetterAuthSession();
  if (!session?.user?.id) throw new Error('Bạn cần đăng nhập để dùng tính năng hỗ trợ.');
  return session.user.id;
};
export const isSupportTicketClosed = (status?: SupportTicketStatus | null) => status === 'resolved' || status === 'closed';
const normalizedFilters = (filters: TicketFilters) => ({
  status: filters.status, category: filters.category, priority: filters.priority,
  search: normalizeTicketText(filters.search || '', 80),
  limit: Math.max(1, Math.min(filters.limit || (filters.isStaff ? 100 : 50), filters.isStaff ? 200 : 80)),
  page: Math.max(1, Math.floor(filters.page || 1)), pageSize: Math.max(1, Math.min(filters.pageSize || 50, filters.isStaff ? 100 : 50)),
});
export const fetchSupportTickets = async (filters: TicketFilters = {}) => (await post<{ data: SupportTicket[] }>('list', normalizedFilters(filters))).data || [];
export const fetchSupportTicketPage = async (filters: TicketFilters = {}) => {
  const result = await post<{ data: SupportTicket[]; total: number }>('list', { ...normalizedFilters(filters), paged: true });
  return { tickets: result.data || [], total: Number(result.total || 0) };
};
export const fetchSupportTicket = async (ticketId: string) => (await post<{ ticket: SupportTicket | null }>('get-ticket', { ticket_id: ticketId })).ticket;
export const fetchTicketMessages = async (ticketId: string, limit = 50, beforeCreatedAt?: string) => ((await post<{ data: SupportTicketMessage[] }>('messages', { ticket_id: ticketId, limit: Math.max(20, Math.min(limit, 100)), before_created_at: beforeCreatedAt })).data || []).reverse();
export const createSupportTicket = async (input: { subject: string; category: SupportTicketCategory; priority: SupportTicketPriority; message: string; metadata?: Record<string, unknown> }) => {
  const { subject, message } = validateTicketInput(input.subject, input.message);
  return post<SupportTicket & { initial_message_id?: string }>('create-ticket', { ...input, subject, message });
};
export const sendTicketMessage = async (input: { ticketId: string; body: string; senderRole: SupportSenderRole; isInternalNote?: boolean; allowEmptyBody?: boolean; metadata?: Record<string, unknown> }) => {
  const body = input.body.trim().slice(0, 4000);
  if (!body && !input.allowEmptyBody) throw new Error('Không thể gửi phản hồi rỗng.');
  return (await post<{ message: SupportTicketMessage }>('create-message', { ticket_id: input.ticketId, body, is_internal_note: Boolean(input.isInternalNote), allow_empty_body: Boolean(input.allowEmptyBody), metadata: input.metadata || {} })).message;
};
export const updateSupportTicket = async (ticketId: string, updates: { status?: SupportTicketStatus; priority?: SupportTicketPriority; assigned_to?: string | null }) => (await post<{ ticket: SupportTicket }>('update-ticket', { ticket_id: ticketId, updates })).ticket;
export const resolveSupportTicket = async (ticketId: string) => post<{ ticket: Pick<SupportTicket, 'id' | 'status' | 'resolved_at' | 'resolved_by' | 'resolved_by_role'> }>('resolve-ticket', { ticket_id: ticketId });
export const resolveAllOpenSupportTickets = async () => post<{ resolved_count: number }>('resolve-all-open-tickets');
export const deleteSupportTicketHard = async (ticketId: string) => post<{ deleted: boolean }>('delete-ticket', { ticket_id: ticketId });
export const fetchSupportStaff = async () => (await post<{ data: SupportStaffMember[] }>('staff')).data || [];
