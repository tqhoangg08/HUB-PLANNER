import { apiUrl } from './api';

export type AnnouncementsBackendMode = 'supabase' | 'shadow' | 'cloudflare';

const DEFAULT_CLOUDFLARE_PUBLIC_API =
  'https://hub-planner-public-dev-api.tqhoangg2.workers.dev';
const CLOUDFLARE_TIMEOUT_MS = 5_000;

const normalizeBackendMode = (value: unknown): AnnouncementsBackendMode => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'shadow' || normalized === 'cloudflare') return normalized;
  return 'supabase';
};

export const ANNOUNCEMENTS_BACKEND_MODE = normalizeBackendMode(
  import.meta.env.VITE_ANNOUNCEMENTS_BACKEND
);

const cloudflarePublicApiBase = String(
  import.meta.env.VITE_CLOUDFLARE_PUBLIC_API_BASE_URL || DEFAULT_CLOUDFLARE_PUBLIC_API
).replace(/\/$/, '');

const announcementCandidateUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${cloudflarePublicApiBase}${normalizedPath}`;
};

const fetchWithTimeout = async (url: string, init?: RequestInit) => {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init?.signal?.reason);
  if (init?.signal) {
    if (init.signal.aborted) abortFromCaller();
    else init.signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeout = window.setTimeout(() => controller.abort('cloudflare-timeout'), CLOUDFLARE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener('abort', abortFromCaller);
  }
};

const responseSummary = async (response: Response) => {
  const payload = await response.json();
  return {
    status: response.status,
    payload,
    total: Number(payload?.total || 0),
    hasMore: Boolean(payload?.hasMore),
    ids: Array.isArray(payload?.data) ? payload.data.map((row: { id?: unknown }) => row?.id) : [],
  };
};

const compareShadowResponses = async (
  sourceResponse: Response,
  candidateResult: Promise<Response | null>
) => {
  try {
    const candidateResponse = await candidateResult;
    if (!candidateResponse) return;

    const [source, candidate] = await Promise.all([
      responseSummary(sourceResponse),
      responseSummary(candidateResponse),
    ]);
    const matches =
      source.status === candidate.status &&
      JSON.stringify(source.payload) === JSON.stringify(candidate.payload);

    if (!matches) {
      console.warn('[announcement-shadow-mismatch]', {
        sourceStatus: source.status,
        candidateStatus: candidate.status,
        sourceTotal: source.total,
        candidateTotal: candidate.total,
        sourceHasMore: source.hasMore,
        candidateHasMore: candidate.hasMore,
        idsMatch: JSON.stringify(source.ids) === JSON.stringify(candidate.ids),
      });
    }
  } catch (error) {
    console.warn('[announcement-shadow-check-failed]', {
      message: error instanceof Error ? error.message : 'unknown-error',
    });
  }
};

const fetchCloudflareCandidate = async (path: string, init?: RequestInit) => {
  try {
    return await fetchWithTimeout(announcementCandidateUrl(path), init);
  } catch (error) {
    console.warn('[announcement-cloudflare-unavailable]', {
      message: error instanceof Error ? error.message : 'unknown-error',
    });
    return null;
  }
};

/**
 * Fetches public school announcements through a reversible backend switch.
 *
 * supabase: current API only.
 * shadow: current API is returned to the UI; Cloudflare is compared in background.
 * cloudflare: Cloudflare is preferred and the current API is an automatic fallback.
 */
export const fetchSchoolAnnouncements = async (path: string, init?: RequestInit) => {
  const sourceUrl = apiUrl(path);

  if (ANNOUNCEMENTS_BACKEND_MODE === 'supabase') {
    return fetch(sourceUrl, init);
  }

  if (ANNOUNCEMENTS_BACKEND_MODE === 'shadow') {
    const candidateResult = fetchCloudflareCandidate(path, init);
    const sourceResponse = await fetch(sourceUrl, init);
    void compareShadowResponses(sourceResponse.clone(), candidateResult);
    return sourceResponse;
  }

  const candidateResponse = await fetchCloudflareCandidate(path, init);
  if (candidateResponse?.ok) return candidateResponse;

  console.warn('[announcement-cloudflare-fallback]', {
    status: candidateResponse?.status || 0,
  });
  return fetch(sourceUrl, init);
};
