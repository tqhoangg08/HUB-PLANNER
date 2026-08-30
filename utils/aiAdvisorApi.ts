import { privateApiRequest } from './privateApi';

export type AiAdvisorSession = {
  id: number;
  user_message?: string;
  bot_reply?: string;
  created_at: string;
  is_helpful: boolean | null;
  title?: string | null;
  is_deleted?: boolean;
  is_pinned?: boolean;
};

export const listAiAdvisorSessions = async () => {
  const response = await privateApiRequest('/api/private/v1/ai-advisor');
  const payload = await response.json() as { data?: AiAdvisorSession[] };
  return Array.isArray(payload.data) ? payload.data : [];
};

export const getAiAdvisorSession = async (id: number) => {
  const response = await privateApiRequest(`/api/private/v1/ai-advisor?id=${encodeURIComponent(id)}`);
  const payload = await response.json() as { data?: AiAdvisorSession | null };
  return payload.data || null;
};

export const sendAiAdvisorMessage = async (input: { question: string; history: Array<{ role: string; content: string }>; context: string }) => {
  const response = await privateApiRequest('/api/private/v1/ai-advisor', { method: 'POST', body: JSON.stringify(input) });
  return response.json() as Promise<{ reply: string; logId?: number | null }>;
};

export const updateAiAdvisorSession = async (id: number, patch: Record<string, unknown>) => {
  await privateApiRequest('/api/private/v1/ai-advisor', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) });
};
