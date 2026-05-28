const DEFAULT_API_BASE_URL = 'https://udrlnbmctcxtmxrncmsb.supabase.co/functions/v1';
const SUPABASE_FUNCTIONS_ORIGIN = 'https://udrlnbmctcxtmxrncmsb.supabase.co/functions/v1';

export const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, '');

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
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
