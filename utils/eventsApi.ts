import { fetchPublicWorker } from './publicWorkerApi';

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

const CLOUDFLARE_TIMEOUT_MS = 5_000;

export const isPublicEventRead = (path: string, init?: RequestInit) => {
  if (String(init?.method || 'GET').toUpperCase() !== 'GET') return false;
  const url = new URL(path, 'https://hub-planner.local');
  return (
    url.pathname === '/events' &&
    !url.searchParams.has('includeHidden') &&
    !url.searchParams.has('resource')
  );
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
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    // Private staff requests must stay same-origin so the production Better
    // Auth cookie reaches the Worker. The public Worker base is only for
    // unauthenticated public reads.
    return await fetch(normalizedPath, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'include',
      redirect: 'manual',
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

/**
 * Routes the public read-only event list only to the same-origin Worker mirror.
 * Admin reads and writes remain isolated in the dedicated authenticated helpers.
 */
export const fetchPublicEvents = async (path: string, init?: RequestInit) => {
  if (!isPublicEventRead(path, init)) {
    throw new Error('Unsupported public event request.');
  }
  return fetchPublicWorker(path, init);
};

export const recordEventView = async (eventId: string, pendingStaffPreview = false): Promise<number | null> => {
  if (!/^[1-9]\d*$/.test(eventId) || !Number.isSafeInteger(Number(eventId))) return null;
  const path = pendingStaffPreview
    ? `/api/admin/v1/events/${eventId}/view`
    : `/api/events/${eventId}/view`;
  const response = pendingStaffPreview
    ? await fetch(path, { method: 'POST', credentials: 'include', cache: 'no-store' })
    : await fetchPublicWorker(path, { method: 'POST', cache: 'no-store' });
  if (!response.ok) return null;
  const payload = await response.json() as { views?: unknown };
  const views = Number(payload.views);
  return Number.isSafeInteger(views) && views >= 0 ? views : null;
};
