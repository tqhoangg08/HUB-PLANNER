import { privateApiRequest } from './privateApi';

export type AdminReportKind =
  | 'course_reports'
  | 'bug_reports'
  | 'ctv_requests'
  | 'event_reports'
  | 'feedback'
  | 'canva_pro_requests';

const json = async <T>(response: Response): Promise<T> => response.json() as Promise<T>;

export const fetchAdminReports = (kind: AdminReportKind, offset: number, limit: number) =>
  privateApiRequest(`/api/admin/v1/reports?kind=${encodeURIComponent(kind)}&offset=${offset}&limit=${limit}`)
    .then(response => json<{ data: Record<string, unknown>[]; total: number }>(response));

export const updateAdminReportStatus = (kind: AdminReportKind, id: string | number, status: string) =>
  privateApiRequest(`/api/admin/v1/reports?kind=${encodeURIComponent(kind)}`, {
    method: 'PATCH', body: JSON.stringify({ id: String(id), status }),
  });

export const deleteAdminReport = (kind: AdminReportKind, id: string | number) =>
  privateApiRequest(`/api/admin/v1/reports?kind=${encodeURIComponent(kind)}`, {
    method: 'DELETE', body: JSON.stringify({ id: String(id) }),
  });

export const resolveAllAdminReports = (kind: AdminReportKind, status: string) =>
  privateApiRequest(`/api/admin/v1/reports?kind=${encodeURIComponent(kind)}`, {
    method: 'POST', body: JSON.stringify({ operation: 'resolve-all', status }),
  }).then(response => json<{ updated: number }>(response));

export const fetchAdminActivity = (offset: number, limit: number) =>
  privateApiRequest(`/api/admin/v1/activity?offset=${offset}&limit=${limit}`)
    .then(response => json<{ data: Record<string, unknown>[]; total: number }>(response));

export const fetchAdminLostFound = (type: 'FOUND' | 'LOST', offset: number, limit: number, id?: number) => {
  const params = new URLSearchParams({ type, offset: String(offset), limit: String(limit) });
  if (id) params.set('id', String(id));
  return privateApiRequest(`/api/admin/v1/lost-found?${params.toString()}`)
    .then(response => json<{ data: Record<string, unknown>[]; total: number }>(response));
};

export const updateAdminLostFound = (id: number, patch: Record<string, unknown>) =>
  privateApiRequest('/api/admin/v1/lost-found', {
    method: 'PATCH', body: JSON.stringify({ id, ...patch }),
  });

export const uploadAdminLostFoundImage = (image: { base64: string; contentType: string }) =>
  privateApiRequest('/api/admin/v1/lost-found', {
    method: 'POST', body: JSON.stringify({ operation: 'upload-image', ...image }),
  }).then(response => json<{ publicUrl: string }>(response));

export const fetchAdminEventCandidates = (reviewStatus: string) =>
  privateApiRequest(`/api/admin/v1/event-candidates?review_status=${encodeURIComponent(reviewStatus)}&limit=200`)
    .then(response => json<{ candidates: Record<string, unknown>[] }>(response));
