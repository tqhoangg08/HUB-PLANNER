export const API_BASE_URL = '/api';

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export const apiHeaders = (headers: HeadersInit = {}) => new Headers(headers);
