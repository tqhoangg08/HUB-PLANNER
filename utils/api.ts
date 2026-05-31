const DEFAULT_API_BASE_URL = 'https://udrlnbmctcxtmxrncmsb.supabase.co/functions/v1';
const SUPABASE_FUNCTIONS_ORIGIN = 'https://udrlnbmctcxtmxrncmsb.supabase.co/functions/v1';
const VERCEL_API_BASE_URL = '/api';
const VERCEL_API_ROUTES = new Set([
  'auth',
  'bot',
  'chat',
  'courses',
  'cron',
  'event-candidates',
  'event-candidates-analyze',
  'events',
  'moderator-notifications',
  'push',
  'schedule-reminders',
  'scraper',
]);

export const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, '');

export const SUPABASE_FUNCTIONS_BASE_URL = String(
  import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE_URL || SUPABASE_FUNCTIONS_ORIGIN
).replace(/\/$/, '');

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const route = normalizedPath.slice(1).split(/[/?#]/)[0];
  const useVercelApi = import.meta.env.VITE_USE_VERCEL_API === 'true' || API_BASE_URL === VERCEL_API_BASE_URL;

  if (useVercelApi && VERCEL_API_ROUTES.has(route)) {
    return `${VERCEL_API_BASE_URL}${normalizedPath}`;
  }

  if (API_BASE_URL === VERCEL_API_BASE_URL) {
    return `${SUPABASE_FUNCTIONS_BASE_URL}${normalizedPath}`;
  }

  return `${API_BASE_URL}${normalizedPath}`;
};

export const apiHeaders = (headers: HeadersInit = {}) => {
  const merged = new Headers(headers);
  const anonKey = import.meta.env.VITE_SUPABASE_KEY;

  if (API_BASE_URL === SUPABASE_FUNCTIONS_ORIGIN && anonKey) {
    if (!merged.has('apikey')) merged.set('apikey', anonKey);
    if (!merged.has('Authorization')) merged.set('Authorization', `Bearer ${anonKey}`);
  }

  return merged;
};
