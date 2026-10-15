export interface EventDrlRule {
  rule_id: string;
  section: string;
  rule_group: string | null;
  content: string;
  condition_text: string | null;
  points: number;
  unit: string | null;
}
export interface EventDrlPrediction {
  rule_id: string | null;
  observed_code: string | null;
  section: string | null;
  points: number | null;
  content: string | null;
  condition_text: string | null;
  confidence: number;
  confidence_label: 'high' | 'medium' | 'low';
  reason_code: string;
  historical_support_count: number;
  closest_matches: string[];
}
export interface EventDrlDraft {
  title: string;
  organizer?: string;
  description?: string;
  format?: string;
}
export class EventDrlRequestError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? 'Vui lòng đăng nhập để tải danh mục ĐRL và đơn vị tổ chức.' : 'Danh mục và gợi ý ĐRL hiện chưa sẵn sàng.');
  }
}
const read = async <T>(response: Response): Promise<T> => {
  if (!response.ok) throw new EventDrlRequestError(response.status);
  return response.json() as Promise<T>;
};
export const loadEventDrlCatalog = async () => {
  const response = await fetch('/api/private/v1/event-drl/catalog', {
    credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
  });
  return read<{ success: true; organizers: string[]; rules: EventDrlRule[] }>(response);
};
export const requestEventDrlPrediction = async (draft: EventDrlDraft, signal?: AbortSignal) => {
  const response = await fetch('/api/private/v1/event-drl/predict', {
    method: 'POST', credentials: 'include', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      title: draft.title,
      organizer: draft.organizer || '',
      description: draft.description || '',
      format: draft.format || '',
    }),
  });
  return read<{ success: true; prediction: EventDrlPrediction }>(response);
};
