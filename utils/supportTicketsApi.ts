import { supabase } from './supabase';
import { apiHeaders, apiUrl } from './api';

export type SupportTicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportTicketCategory = 'login' | 'grades' | 'events' | 'schedule' | 'lost_found' | 'feedback' | 'other';
export type SupportSenderRole = 'user' | 'admin' | 'support';

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Mới',
  pending: 'Đang xử lý',
  resolved: 'Đã giải quyết',
  closed: 'Đã đóng',
};

export const SUPPORT_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  login: 'Đăng nhập',
  grades: 'Lỗi bảng điểm',
  events: 'Lỗi sự kiện',
  schedule: 'Lỗi TKB',
  lost_found: 'Lỗi tìm đồ thất lạc',
  feedback: 'Góp ý',
  other: 'Khác',
};

export const SUPPORT_PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  low: 'Thấp',
  normal: 'Bình thường',
  high: 'Cao',
  urgent: 'Khẩn cấp',
};

export interface SupportTicket {
  id: string;
  user_id: string;
  assigned_to: string | null;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  initial_message?: string | null;
  attachment_urls?: string[];
  last_message_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolved_by_role?: 'user' | 'admin' | 'support' | 'auditor' | null;
  created_at: string;
  updated_at: string;
  user?: {
    full_name?: string | null;
    email?: string | null;
    student_code?: string | null;
    avatar_url?: string | null;
  } | null;
  assignee?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: SupportSenderRole;
  body: string;
  attachment_urls?: string[];
  is_internal_note: boolean;
  created_at: string;
  sender?: {
    full_name?: string | null;
    email?: string | null;
    student_code?: string | null;
    avatar_url?: string | null;
  } | null;
  attachments?: SupportTicketAttachment[];
}

export interface SupportTicketAttachment {
  id: string;
  ticket_id?: string;
  message_id?: string | null;
  uploaded_by?: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_provider?: 'cloudflare_r2';
  status?: 'pending' | 'uploaded' | 'linked' | 'deleted';
  created_at?: string;
}

export interface TicketFilters {
  status?: SupportTicketStatus | 'all';
  category?: SupportTicketCategory | 'all';
  priority?: SupportTicketPriority | 'all';
  search?: string;
  isStaff?: boolean;
  limit?: number;
}

export interface SupportStaffMember {
  id: string;
  role: string;
  full_name?: string | null;
  email?: string | null;
}

const isDev = import.meta.env.DEV;

const logSupportPayload = (queryName: string, data: unknown) => {
  if (!isDev) return;
  const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
  const bytes = new Blob([JSON.stringify(data ?? null)]).size;
  console.info(`[support-query] ${queryName}`, { rows, bytes });
};

const ticketListSelect = `
  id,user_id,assigned_to,subject,category,priority,status,last_message_at,created_at,updated_at
`;

const staffTicketListSelect = `
  id,user_id,assigned_to,subject,category,priority,status,last_message_at,created_at,updated_at,
  user:profiles!support_tickets_user_id_fkey(full_name,email,student_code)
`;

const ticketDetailSelect = `
  id,user_id,assigned_to,subject,category,priority,status,last_message_at,resolved_at,resolved_by,resolved_by_role,created_at,updated_at
`;

const messageSelect = `
  id,ticket_id,sender_id,sender_role,body,is_internal_note,created_at,
  attachments:support_ticket_attachments(id,file_name,mime_type,size_bytes)
`;

const messageInsertSelect = `
  id,ticket_id,sender_id,sender_role,body,is_internal_note,created_at
`;

export const normalizeTicketText = (value: string, maxLength: number) => value.replace(/\s+/g, ' ').trim().slice(0, maxLength);

export const validateTicketInput = (subject: string, message: string) => {
  const cleanSubject = normalizeTicketText(subject, 160);
  const cleanMessage = message.trim().slice(0, 4000);

  if (cleanSubject.length < 3) throw new Error('Tiêu đề cần có ít nhất 3 ký tự.');
  if (cleanMessage.length < 1) throw new Error('Mô tả vấn đề không được để trống.');

  return { subject: cleanSubject, message: cleanMessage };
};

export const getCurrentUserId = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error('Bạn cần đăng nhập để dùng tính năng hỗ trợ.');
  return data.user.id;
};

const postSupportTicketAction = async <T>(action: string, payload: Record<string, unknown>) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Bạn cần đăng nhập để dùng tính năng hỗ trợ.');
  const response = await fetch(apiUrl('/auth?resource=support-tickets'), {
    method: 'POST',
    headers: apiHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error || 'Không thể xử lý ticket hỗ trợ.');
  return result as T;
};

export const isSupportTicketClosed = (status?: SupportTicketStatus | null) => status === 'resolved' || status === 'closed';

const finalizeSupportMessageCreated = async (messageId: string) => {
  try {
    await postSupportTicketAction<{ ok: boolean }>('message-created', {
      message_id: messageId,
    });
  } catch (error) {
    console.warn('Không thể xử lý thông báo ticket:', error);
  }
};

export const fetchSupportTickets = async (filters: TicketFilters = {}) => {
  const limit = Math.max(10, Math.min(filters.limit || (filters.isStaff ? 100 : 50), filters.isStaff ? 200 : 80));
  const keyword = normalizeTicketText(filters.search || '', 80);
  let query = supabase
    .from('support_tickets')
    .select(filters.isStaff ? staffTicketListSelect : ticketListSelect)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.priority && filters.priority !== 'all') query = query.eq('priority', filters.priority);
  if (keyword) query = query.ilike('subject', `%${keyword.replace(/[%_]/g, '\\$&')}%`);

  const { data, error } = await query;
  if (error) throw error;
  logSupportPayload(filters.isStaff ? 'ticket_list_staff' : 'ticket_list_user', data);

  return (data || []) as SupportTicket[];
};

export const fetchSupportTicket = async (ticketId: string) => {
  const { data, error } = await supabase
    .from('support_tickets')
    .select(ticketDetailSelect)
    .eq('id', ticketId)
    .maybeSingle();

  if (error) throw error;
  logSupportPayload('ticket_detail', data);
  return data as SupportTicket | null;
};

export const fetchTicketMessages = async (ticketId: string, limit = 50, beforeCreatedAt?: string) => {
  const safeLimit = Math.max(20, Math.min(limit, 100));
  let query = supabase
    .from('support_ticket_messages')
    .select(messageSelect)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (beforeCreatedAt) query = query.lt('created_at', beforeCreatedAt);

  const { data, error } = await query;
  if (error) throw error;
  logSupportPayload(beforeCreatedAt ? 'ticket_messages_older_page' : 'ticket_messages_page', data);
  return ((data || []) as SupportTicketMessage[]).reverse();
};

export const createSupportTicket = async (input: {
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  message: string;
}) => {
  const userId = await getCurrentUserId();
  const { subject, message } = validateTicketInput(input.subject, input.message);

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId,
      subject,
      category: input.category,
      priority: input.priority,
      initial_message: message,
      status: 'open',
    })
    .select(ticketDetailSelect)
    .single();

  if (ticketError) throw ticketError;

  const { data: messageRow, error: messageError } = await supabase
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticket.id,
      sender_id: userId,
      sender_role: 'user',
      body: message,
      is_internal_note: false,
    })
    .select('id')
    .single();

  if (messageError) throw messageError;
  if (messageRow?.id) await finalizeSupportMessageCreated(messageRow.id);

  return ticket as SupportTicket;
};

export const sendTicketMessage = async (input: {
  ticketId: string;
  body: string;
  senderRole: SupportSenderRole;
  isInternalNote?: boolean;
  allowEmptyBody?: boolean;
}) => {
  const userId = await getCurrentUserId();
  const body = input.body.trim().slice(0, 4000);
  if (!body && !input.allowEmptyBody) throw new Error('Không thể gửi phản hồi rỗng.');

  const { data, error } = await supabase
    .from('support_ticket_messages')
    .insert({
      ticket_id: input.ticketId,
      sender_id: userId,
      sender_role: input.senderRole,
      body,
      is_internal_note: Boolean(input.isInternalNote),
    })
    .select(messageInsertSelect)
    .single();

  if (error) throw error;
  logSupportPayload('ticket_message_insert', data);
  await finalizeSupportMessageCreated((data as SupportTicketMessage).id);
  return data as SupportTicketMessage;
};

export const updateSupportTicket = async (ticketId: string, updates: {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  assigned_to?: string | null;
}) => {
  const { data, error } = await supabase
    .from('support_tickets')
    .update(updates)
    .eq('id', ticketId)
    .select(ticketDetailSelect)
    .single();

  if (error) throw error;
  logSupportPayload('ticket_update', data);
  return data as SupportTicket;
};

export const resolveSupportTicket = async (ticketId: string) => {
  await postSupportTicketAction<{ ticket: Pick<SupportTicket, 'id' | 'status' | 'resolved_at' | 'resolved_by' | 'resolved_by_role'> }>('resolve-ticket', {
    ticket_id: ticketId,
  });
};

export const deleteSupportTicketHard = async (ticketId: string) => {
  await postSupportTicketAction<{ deleted: boolean }>('delete-ticket', {
    ticket_id: ticketId,
  });
};

export const fetchSupportStaff = async () => {
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id,user_id,role')
    .in('role', ['admin', 'auditor', 'support']);

  if (rolesError) throw rolesError;

  const staffIds = Array.from(new Set((roles || []).map((role: any) => role.user_id || role.id).filter(Boolean)));
  if (staffIds.length === 0) return [] as SupportStaffMember[];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id,full_name,email')
    .in('id', staffIds);

  if (profilesError) throw profilesError;

  const profileById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));

  return (roles || [])
    .map((role: any) => {
      const id = role.user_id || role.id;
      const profile = profileById.get(id);
      if (!id || !profile) return null;

      return {
        id,
        role: role.role,
        full_name: profile.full_name,
        email: profile.email,
      } satisfies SupportStaffMember;
    })
    .filter(Boolean) as SupportStaffMember[];
};
