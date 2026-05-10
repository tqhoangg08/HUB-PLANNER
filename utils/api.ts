const DEFAULT_API_BASE_URL = 'https://udrlnbmctcxtmxrncmsb.supabase.co/functions/v1';

export const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, '');

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
