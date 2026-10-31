import { privateApiRequest } from './privateApi';
import type { AdminSchoolAnnouncement } from '../shared/schoolAnnouncements';
export interface AnnouncementList { data:AdminSchoolAnnouncement[];total:number;departments:string[];role:'admin'|'auditor'; }
export const fetchAdminAnnouncements = (params:URLSearchParams,signal?:AbortSignal):Promise<AnnouncementList> =>
  privateApiRequest(`/api/admin/v1/announcements?${params}`,{signal}).then(response=>response.json());
export const fetchAdminAnnouncement = (id:number,signal?:AbortSignal):Promise<{data:AdminSchoolAnnouncement}> =>
  privateApiRequest(`/api/admin/v1/announcements?id=${id}`,{signal}).then(response=>response.json());
export const mutateAdminAnnouncement = (method:'POST'|'PATCH'|'DELETE',body:Record<string,unknown>):Promise<{data:AdminSchoolAnnouncement|null;inserted?:boolean;signaled?:boolean;deduplicated?:boolean}> =>
  privateApiRequest('/api/admin/v1/announcements',{method,body:JSON.stringify(body)}).then(response=>response.json());
