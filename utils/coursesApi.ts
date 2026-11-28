import { fetchPublicWorker } from './publicWorkerApi';

const PUBLIC_COURSE_RESOURCES = new Set(['', 'filter-options', 'course-detail']);

const catalogueUrl = (path: string) => {
  const origin = globalThis.location?.origin ?? 'https://hub-planner.local';
  try {
    const url = new URL(path, origin);
    if (url.origin === origin && !url.username && !url.password &&
        (url.pathname === '/courses' || url.pathname === '/api/courses') &&
        PUBLIC_COURSE_RESOURCES.has(url.searchParams.get('resource') || '')) return url;
  } catch {
    return null;
  }
  return null;
};

export const isPublicCourseRead = (path: string, init?: RequestInit) =>
  String(init?.method || 'GET').toUpperCase() === 'GET' && catalogueUrl(path) !== null;

export const fetchPublicCourses = async (path: string, init?: RequestInit) => {
  const url = catalogueUrl(path);
  if (!url || String(init?.method || 'GET').toUpperCase() !== 'GET') {
    throw new Error('Unsupported public course request.');
  }
  const headers = new Headers(init?.headers);
  if (init?.cache === 'reload' || init?.cache === 'no-cache' ||
      headers.get('Cache-Control')?.toLowerCase().includes('no-cache')) {
    url.searchParams.set('refresh', '1');
  }
  headers.set('X-Hub-Catalogue-Cache', 'v1');
  return fetchPublicWorker('/api/courses' + url.search, {
    ...init, headers, cache: 'no-store', redirect: 'error',
  }, 'same-origin');
};
