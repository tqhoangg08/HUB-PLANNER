import { privateApiRequest } from './privateApi';

export const fetchStaffSchedulesPayload = async (
  mode: 'changed' | 'summaries' | 'courses',
  semester: string,
  extraParams: Record<string, string> = {},
) => {
  const params = new URLSearchParams({ mode, semester, ...extraParams });
  const response = await privateApiRequest(`/api/staff/v1/schedules?${params.toString()}`);
  return response.json() as Promise<{ data?: any[]; total?: number; hasMore?: boolean }>;
};

export const fetchStaffSchedules = async (
  mode: 'changed' | 'summaries' | 'courses',
  semester: string,
  extraParams: Record<string, string> = {},
) => (await fetchStaffSchedulesPayload(mode, semester, extraParams)).data || [];
