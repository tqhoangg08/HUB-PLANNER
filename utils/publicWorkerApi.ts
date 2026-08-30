const PUBLIC_WORKER_TIMEOUT_MS = 5_000;

const toSameOriginPath = (path: string) => {
  const url = new URL(path, 'https://hub-planner.local');
  return `${url.pathname}${url.search}`;
};

/**
 * Sends a public read to the Public Worker on the current origin.
 * Public mirror reads must never carry a Better Auth session or fall back to
 * the legacy Supabase browser API.
 */
export const fetchPublicWorker = async (
  path: string,
  init: RequestInit = {}
): Promise<Response> => {
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
    return await fetch(toSameOriginPath(path), {
      ...init,
      headers,
      credentials: 'omit',
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
};

export const isSameOriginPublicWorkerPath = (path: string) =>
  toSameOriginPath(path).startsWith('/');
