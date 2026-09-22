import { privateApiRequest } from './privateApi';
import type { ScheduleSessionCatalogue } from './scheduleSessions';

export const fetchScheduleSessionCatalogue = async (semester: string): Promise<ScheduleSessionCatalogue> => {
  const params = new URLSearchParams({ semester });
  const response = await privateApiRequest(`/api/private/v1/course-schedule-options?${params.toString()}`, {
    method: 'GET',
  });
  if (!response.ok) throw new Error('Không thể tải danh mục cơ sở và phòng học.');
  const payload = await response.json() as Partial<ScheduleSessionCatalogue>;
  return {
    campuses: Array.isArray(payload.campuses) ? payload.campuses.filter((value): value is string => typeof value === 'string') : [],
    roomsByCampus: payload.roomsByCampus && typeof payload.roomsByCampus === 'object' ? payload.roomsByCampus : {},
  };
};
