import { apiUrl } from './api';

export type EventsBackendMode = 'supabase' | 'shadow' | 'cloudflare';

export interface AdminEventMutationResponse<T = Record<string, unknown>> {
  success: true;
  data: T[];
  mirrorSynced: boolean;
}

class AdminEventApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminEventApiError';
    this.status = status;
  }
}

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

const fetchAdminCandidate = async (
  path: string,
  init: RequestInit = {},
  timeoutMs = CLOUDFLARE_TIMEOUT_MS
): Promise<Response | null> => {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal) {
    if (init.signal.aborted) abortFromCaller();
    else init.signal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeout = window.setTimeout(
    () => controller.abort('cloudflare-admin-timeout'),
    timeoutMs
  );

  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) return null;

    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${accessToken}`);
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return await fetch(`${cloudflareBase}${normalizedPath}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    console.warn('[admin-event-cloudflare-unavailable]', {
      message: error instanceof Error ? error.message : 'unknown-error',
    });
    return null;
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
};

export const fetchAdminEvents = (
  params: URLSearchParams,
  init?: RequestInit
) =>
  fetchAdminCandidate(
    `/api/admin/v1/events?${params.toString()}`,
    init
  );

export const syncAdminEventMirror = async () => {
  const response = await fetchAdminCandidate('/api/admin/v1/events/sync', {
    method: 'POST',
  }, 15_000);
  if (response?.ok) return true;
  console.warn('[admin-event-sync-fallback]', {
    status: response?.status || 0,
  });
  return false;
};

const readAdminEventMutationResponse = async <
  T = Record<string, unknown>,
>(
  response: Response | null
): Promise<AdminEventMutationResponse<T>> => {
  if (!response) {
    throw new AdminEventApiError(
      0,
      'Không thể kết nối máy chủ quản trị. Vui lòng kiểm tra đăng nhập và thử lại.'
    );
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AdminEventApiError(
      response.status,
      String(payload?.error || 'Không thể lưu sự kiện. Vui lòng thử lại.')
    );
  }
  if (
    !payload?.success ||
    !Array.isArray(payload.data) ||
    payload.data.length === 0
  ) {
    throw new Error('Máy chủ không trả về dữ liệu sự kiện hợp lệ.');
  }

  return payload as AdminEventMutationResponse<T>;
};

const mutateAdminEvent = async <T = Record<string, unknown>>(
  path: string,
  method: 'POST' | 'PATCH',
  payload: Record<string, unknown>,
  idempotencyKey?: string
) => {
  const response = await fetchAdminCandidate(
    path,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey
          ? { 'Idempotency-Key': idempotencyKey }
          : {}),
      },
      body: JSON.stringify(payload),
    },
    15_000
  );
  return readAdminEventMutationResponse<T>(response);
};

const pendingCreateKeys = new Map<string, string>();

const createIdempotencyKey = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
};

export const createAdminEvent = async <T = Record<string, unknown>>(
  payload: Record<string, unknown>
) => {
  const payloadKey = JSON.stringify(payload);
  let idempotencyKey = pendingCreateKeys.get(payloadKey);
  if (!idempotencyKey) {
    idempotencyKey = createIdempotencyKey();
    if (pendingCreateKeys.size >= 20) {
      const oldestKey = pendingCreateKeys.keys().next().value;
      if (oldestKey) pendingCreateKeys.delete(oldestKey);
    }
    pendingCreateKeys.set(payloadKey, idempotencyKey);
  }

  try {
    const result = await mutateAdminEvent<T>(
      '/api/admin/v1/events',
      'POST',
      payload,
      idempotencyKey
    );
    pendingCreateKeys.delete(payloadKey);
    return result;
  } catch (error) {
    if (error instanceof AdminEventApiError && error.status !== 0 && error.status !== 409) {
      pendingCreateKeys.delete(payloadKey);
    }
    throw error;
  }
};

export const updateAdminEvent = <T = Record<string, unknown>>(
  eventId: string | number,
  payload: Record<string, unknown>
) => {
  const normalizedId = Number(eventId);
  if (!Number.isSafeInteger(normalizedId) || normalizedId <= 0) {
    throw new Error('Mã sự kiện không hợp lệ.');
  }
  return mutateAdminEvent<T>(
    `/api/admin/v1/events/${normalizedId}`,
    'PATCH',
    payload
  );
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
 * Public reads may use Cloudflare according to the configured rollout mode.
 * Admin reads and writes use their dedicated authenticated helpers above.
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
