import { privateApiRequest } from './privateApi';

const STAFF_PROFILE_PATH = '/api/staff/v1/profiles';

const post = async <T>(body: Record<string, unknown>): Promise<T> => {
  const response = await privateApiRequest(STAFF_PROFILE_PATH, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { data: T };
  return payload.data;
};

const postPayload = async <T>(body: Record<string, unknown>) => {
  const response = await privateApiRequest(STAFF_PROFILE_PATH, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return response.json() as Promise<T>;
};

export const searchStaffProfiles = (
  query: string,
  options: { limit?: number; offset?: number } = {},
) => post<any[]>({
  action: 'search',
  query,
  limit: options.limit ?? 80,
  offset: options.offset ?? 0,
});

export const searchStaffProfilesPage = (
  query: string,
  options: { limit?: number; offset?: number } = {},
) => postPayload<{ data: any[]; total: number }>({
  action: 'search',
  query,
  limit: options.limit ?? 80,
  offset: options.offset ?? 0,
});

export const fetchStaffPublicProfileMap = async (userIds: string[]) => {
  const rows = await post<any[]>({ action: 'public-map', userIds });
  return rows.reduce((map: Record<string, any>, row) => {
    map[row.id] = row;
    return map;
  }, {});
};

export const fetchStaffProfileExportPage = (offset: number, limit: number) =>
  post<any[]>({ action: 'export-page', offset, limit });
