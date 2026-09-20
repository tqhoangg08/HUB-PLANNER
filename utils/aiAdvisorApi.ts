import { privateApiRequest } from './privateApi';

type AiDocumentApplicability = {
  cohortYear?: number;
  fromCohortYear?: number;
  academicYear?: string;
  effectiveFrom?: string;
  rawLabel: string;
};

export type AiAdvisorTurn = {
  id: number;
  conversationId: string;
  user_message?: string;
  bot_reply?: string;
  created_at: string;
  is_helpful: boolean | null;
  document_sources?: Array<{ id?: string | null; documentId?: string | null; title: string; fileName?: string; pageNumber?: number | null; locators?: string[]; applicability?: AiDocumentApplicability[] }>;
  document_search_unavailable?: boolean;
};

export type AiAdvisorConversation = {
  conversationId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  messageCount: number;
};

export const listAiAdvisorSessions = async () => {
  const response = await privateApiRequest('/api/private/v1/ai-advisor');
  const payload = await response.json() as { data?: AiAdvisorConversation[] };
  return Array.isArray(payload.data) ? payload.data : [];
};

export const getAiAdvisorConversation = async (conversationId: string) => {
  const response = await privateApiRequest(`/api/private/v1/ai-advisor?conversationId=${encodeURIComponent(conversationId)}`);
  const payload = await response.json() as { data?: { conversationId: string; turns: AiAdvisorTurn[] } | null };
  return payload.data || null;
};

export const sendAiAdvisorMessage = async (input: { question: string; history: Array<{ role: string; content: string }>; conversationId?: string }) => {
  const response = await privateApiRequest('/api/private/v1/ai-advisor', { method: 'POST', body: JSON.stringify(input) });
  return response.json() as Promise<{
    reply: string;
    logId?: number | null;
    conversationId: string;
    documentSources?: Array<{ id?: string | null; documentId?: string | null; title: string; fileName?: string; pageNumber?: number | null; locators?: string[]; applicability?: AiDocumentApplicability[] }>;
    answerSources?: Array<{ type: string; id?: string | number; title: string; url?: string; date?: string }>;
    documentSearchUnavailable?: boolean;
  }>;
};

export const updateAiAdvisorTurn = async (id: number, isHelpful: boolean) => {
  await privateApiRequest('/api/private/v1/ai-advisor', { method: 'PATCH', body: JSON.stringify({ id, is_helpful: isHelpful }) });
};

export const updateAiAdvisorConversation = async (conversationId: string, patch: { title?: string; is_pinned?: boolean; is_deleted?: true }) => {
  await privateApiRequest('/api/private/v1/ai-advisor', { method: 'PATCH', body: JSON.stringify({ conversationId, ...patch }) });
};
