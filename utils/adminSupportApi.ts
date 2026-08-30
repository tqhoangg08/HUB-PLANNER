import { privateApiRequest } from './privateApi';
import type { SupportTicket, SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from './supportTicketsApi';

export const fetchAdminSupportTickets = async (filters: { status?: SupportTicketStatus | 'all'; category?: SupportTicketCategory | 'all'; priority?: SupportTicketPriority | 'all'; page?: number; pageSize?: number }) => {
  const params = new URLSearchParams({ limit: String(filters.pageSize || 10), offset: String(Math.max(0, ((filters.page || 1) - 1) * (filters.pageSize || 10))) });
  for (const key of ['status', 'category', 'priority'] as const) if (filters[key] && filters[key] !== 'all') params.set(key, String(filters[key]));
  const response = await privateApiRequest(`/api/admin/v1/support/tickets?${params}`);
  return response.json() as Promise<{ data: SupportTicket[]; total: number }>;
};
export const updateAdminSupportTicket = (id: string, patch: Record<string, unknown>) => privateApiRequest(`/api/admin/v1/support/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const resolveAllAdminSupportTickets = async () => (await privateApiRequest('/api/admin/v1/support/resolve-all', { method: 'POST', body: '{}' })).json() as Promise<{ resolved_count: number }>;
