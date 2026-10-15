export interface EventDrlRule {
  rule_id: string;
  section: string;
  rule_group: string | null;
  content: string;
  condition_text: string | null;
  points: number;
  unit: string | null;
  policy_version?: string;
  active?: number;
  event_suitable?: number;
  academic_year?: string;
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
  policy_version?: string;
  rules_fingerprint?: string;
  stale?: boolean;
  academic_year?: string;
}
export interface EventDrlDraft {
  title: string;
  organizer?: string;
  description?: string;
  format?: string;
  drl_policy_version?: string;
  drl_academic_year?: string;
}
const read = async <T>(response: Response): Promise<T> => {
  if (!response.ok) throw new Error('Gợi ý ĐRL hiện chưa sẵn sàng.');
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
      ...(draft.drl_policy_version ? { drl_policy_version: draft.drl_policy_version } : {}),
      ...(draft.drl_academic_year ? { drl_academic_year: draft.drl_academic_year } : {}),
    }),
  });
  return read<{ success: true; prediction: EventDrlPrediction }>(response);
};
