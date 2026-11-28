const PUBLIC_WORKER_TIMEOUT_MS = 5_000;

const toSameOriginPath = (path: string) => {
  const url = new URL(path, 'https://hub-planner.local');
  return `${url.pathname}${url.search}`;
};

/**
 * Sends a public read to the Public Worker on the current origin.
 * The catalogue can opt in to browser session credentials on its exact API path.
 * Other public reads omit credentials.
 */
export const fetchPublicWorker = async (
  path: string,
  init: RequestInit = {},
  credentials: 'omit' | 'same-origin' = 'omit',
): Promise<Response> => {
  const requestPath = toSameOriginPath(path);
  if (credentials === 'same-origin' && requestPath.split('?', 1)[0] !== '/api/courses') {
    throw new Error('Session credentials are only supported on the catalogue endpoint.');
  }
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal) {
    if (init.signal.aborted) abortFromCaller();
    else init.signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeout = globalThis.setTimeout(
    () => controller.abort('public-worker-timeout'),
    PUBLIC_WORKER_TIMEOUT_MS
  );
  const headers = new Headers(init.headers);
  headers.delete('Authorization');
  headers.delete('apikey');
  headers.delete('Cookie');

  try {
    return await fetch(requestPath, {
      ...init,
      headers,
      credentials,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
};

export const isSameOriginPublicWorkerPath = (path: string) =>
  toSameOriginPath(path).startsWith('/');
