import { fetchPublicWorker } from './publicWorkerApi';

export const isPublicLostFoundRead = (path: string, init?: RequestInit) => {
  if (String(init?.method || 'GET').toUpperCase() !== 'GET') return false;
  const url = new URL(path, 'https://hub-planner.local');
  return (
    url.pathname === '/events' &&
    url.searchParams.get('resource') === 'lost-found'
  );
};

const candidatePath = (path: string) => {
  const url = new URL(path, 'https://hub-planner.local');
  url.pathname = '/lost-found';
  url.searchParams.delete('resource');
  return `${url.pathname}${url.search}`;
};

/** Public lost-and-found listing uses only the same-origin Worker mirror. */
export const fetchPublicLostFound = async (
  path: string,
  init?: RequestInit
) => {
  if (!isPublicLostFoundRead(path, init)) {
    throw new Error('Unsupported public lost-and-found request.');
  }
  return fetchPublicWorker(candidatePath(path), init);
};
