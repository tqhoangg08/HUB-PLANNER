import { fetchPublicWorker } from './publicWorkerApi';

/**
 * Fetches public school announcements from the same-origin Worker mirror.
 * The browser has no Supabase fallback for this read path.
 */
export const fetchSchoolAnnouncements = (path: string, init?: RequestInit) =>
  fetchPublicWorker(path, init);
