import { apiUrl } from './api';

export type EventsBackendMode = 'supabase' | 'shadow' | 'cloudflare';

const DEFAULT_CLOUDFLARE_PUBLIC_API =
  'https://hub-planner-public-dev-api.tqhoangg2.workers.dev';
const CLOUDFLARE_TIMEOUT_MS = 5_000;

const normalizeMode = (value: unknown): EventsBackendMode => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'shadow' || mode === 'cloudflare') return mode;
  return 'supabase';
};

export const EVENTS_BACKEND_MODE = normalizeMode(
  import.meta.env?.VITE_EVENTS_BACKEND
);

const cloudflareBase = String(
  import.meta.env?.VITE_CLOUDFLARE_PUBLIC_API_BASE_URL ||
    DEFAULT_CLOUDFLARE_PUBLIC_API
).replace(/\/$/, '');

export const isPublicEventRead = (path: string, init?: RequestInit) => {
  if (String(init?.method || 'GET').toUpperCase() !== 'GET') return false;
  const url = new URL(path, 'https://hub-planner.local');
  return (
    url.pathname === '/events' &&
    !url.searchParams.has('includeHidden') &&
    !url.searchParams.has('resource')
  );
};

const publicCandidateInit = (init?: RequestInit): RequestInit | undefined => {
  if (!init) return undefined;
  const headers = new Headers(init.headers);
  headers.delete('Authorization');
  headers.delete('apikey');
  return { ...init, headers };
};

const fetchCandidate = async (path: string, init?: RequestInit) => {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init?.signal?.reason);
  if (init?.signal) {
    if (init.signal.aborted) abortFromCaller();
    else init.signal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeout = window.setTimeout(
    () => controller.abort('cloudflare-timeout'),
    CLOUDFLARE_TIMEOUT_MS
  );
  try {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return await fetch(`${cloudflareBase}${normalizedPath}`, {
      ...publicCandidateInit(init),
      signal: controller.signal,
    });
  } catch (error) {
    console.warn('[event-cloudflare-unavailable]', {
      message: error instanceof Error ? error.message : 'unknown-error',
    });
    return null;
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener('abort', abortFromCaller);
  }
};

const compareShadow = async (
  sourceResponse: Response,
  candidatePromise: Promise<Response | null>
) => {
  try {
    const candidateResponse = await candidatePromise;
    if (!candidateResponse) return;
    const [sourcePayload, candidatePayload] = await Promise.all([
      sourceResponse.json(),
      candidateResponse.json(),
    ]);
    const canonicalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(
          Object.keys(record)
            .sort()
            .map((key) => [key, canonicalize(record[key])])
        );
      }
      return value;
    };
    if (
      sourceResponse.status !== candidateResponse.status ||
      JSON.stringify(canonicalize(sourcePayload)) !==
        JSON.stringify(canonicalize(candidatePayload))
    ) {
      console.warn('[event-shadow-mismatch]', {
        sourceStatus: sourceResponse.status,
        candidateStatus: candidateResponse.status,
        sourceTotal: Number(sourcePayload?.total || 0),
        candidateTotal: Number(candidatePayload?.total || 0),
      });
    }
  } catch (error) {
    console.warn('[event-shadow-check-failed]', {
      message: error instanceof Error ? error.message : 'unknown-error',
    });
  }
};

/**
 * Routes only the public read-only event list to Cloudflare.
 * Management reads and all writes remain on Supabase.
 */
export const fetchPublicEvents = async (path: string, init?: RequestInit) => {
  const sourceUrl = apiUrl(path);
  if (!isPublicEventRead(path, init) || EVENTS_BACKEND_MODE === 'supabase') {
    return fetch(sourceUrl, init);
  }

  if (EVENTS_BACKEND_MODE === 'shadow') {
    const candidate = fetchCandidate(path, init);
    const source = await fetch(sourceUrl, init);
    void compareShadow(source.clone(), candidate);
    return source;
  }

  const candidate = await fetchCandidate(path, init);
  if (candidate?.ok) return candidate;

  console.warn('[event-cloudflare-fallback]', {
    status: candidate?.status || 0,
  });
  return fetch(sourceUrl, init);
};
