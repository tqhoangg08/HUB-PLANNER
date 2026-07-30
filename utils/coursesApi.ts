import { apiUrl } from './api';

export type CoursesBackendMode = 'supabase' | 'shadow' | 'cloudflare';

const DEFAULT_CLOUDFLARE_PUBLIC_API =
  'https://hub-planner-public-dev-api.tqhoangg2.workers.dev';
const CLOUDFLARE_TIMEOUT_MS = 5_000;
const PUBLIC_COURSE_RESOURCES = new Set(['', 'filter-options', 'course-detail']);

const normalizeMode = (value: unknown): CoursesBackendMode => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'shadow' || mode === 'cloudflare') return mode;
  return 'supabase';
};

export const COURSES_BACKEND_MODE = normalizeMode(import.meta.env?.VITE_COURSES_BACKEND);

const cloudflareBase = String(
  import.meta.env?.VITE_CLOUDFLARE_PUBLIC_API_BASE_URL || DEFAULT_CLOUDFLARE_PUBLIC_API
).replace(/\/$/, '');

export const isPublicCourseRead = (path: string, init?: RequestInit) => {
  if (String(init?.method || 'GET').toUpperCase() !== 'GET') return false;
  const url = new URL(path, 'https://hub-planner.local');
  return (
    url.pathname === '/courses' &&
    PUBLIC_COURSE_RESOURCES.has(String(url.searchParams.get('resource') || ''))
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
    console.warn('[course-cloudflare-unavailable]', {
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
    if (
      sourceResponse.status !== candidateResponse.status ||
      JSON.stringify(sourcePayload) !== JSON.stringify(candidatePayload)
    ) {
      console.warn('[course-shadow-mismatch]', {
        sourceStatus: sourceResponse.status,
        candidateStatus: candidateResponse.status,
        sourceTotal: Number(sourcePayload?.total || 0),
        candidateTotal: Number(candidatePayload?.total || 0),
      });
    }
  } catch (error) {
    console.warn('[course-shadow-check-failed]', {
      message: error instanceof Error ? error.message : 'unknown-error',
    });
  }
};

/**
 * Routes only public read-only catalog calls to Cloudflare.
 * Private resources and all writes always remain on the current API.
 */
export const fetchPublicCourses = async (path: string, init?: RequestInit) => {
  const sourceUrl = apiUrl(path);
  if (!isPublicCourseRead(path, init) || COURSES_BACKEND_MODE === 'supabase') {
    return fetch(sourceUrl, init);
  }

  if (COURSES_BACKEND_MODE === 'shadow') {
    const candidate = fetchCandidate(path, init);
    const source = await fetch(sourceUrl, init);
    void compareShadow(source.clone(), candidate);
    return source;
  }

  const candidate = await fetchCandidate(path, init);
  if (candidate?.ok) return candidate;

  console.warn('[course-cloudflare-fallback]', { status: candidate?.status || 0 });
  return fetch(sourceUrl, init);
};
