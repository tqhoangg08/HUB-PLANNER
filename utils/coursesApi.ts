import { fetchPublicWorker } from './publicWorkerApi';

const PUBLIC_COURSE_RESOURCES = new Set(['', 'filter-options', 'course-detail']);

export const isPublicCourseRead = (path: string, init?: RequestInit) => {
  if (String(init?.method || 'GET').toUpperCase() !== 'GET') return false;
  const url = new URL(path, 'https://hub-planner.local');
  return (
    url.pathname === '/courses' &&
    PUBLIC_COURSE_RESOURCES.has(String(url.searchParams.get('resource') || ''))
  );
};

/** Public catalogue reads use only the same-origin Public Worker D1 mirror. */
export const fetchPublicCourses = async (path: string, init?: RequestInit) => {
  if (!isPublicCourseRead(path, init)) {
    throw new Error('Unsupported public course request.');
  }
  const url = new URL(path, 'https://hub-planner.local');
  const semesters = url.searchParams.getAll('semester').map(s=>s.trim()).filter(Boolean);
  const sensitive = !semesters.length || semesters.includes('HK2_2026_2027') || url.searchParams.get('resource')?.trim() === 'course-detail';
  return fetchPublicWorker(path, sensitive ? { ...init, cache: 'no-store' } : init);
};
