const READ_TIMEOUT_MS = 5_000;
const WRITE_TIMEOUT_MS = 12_000;

const readErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    if (
      payload &&
      typeof payload === 'object' &&
      typeof payload.error === 'string'
    ) {
      return payload.error;
    }
  } catch {
    // The status-specific fallback below remains safe for non-JSON responses.
  }
  if (response.status === 401) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  }
  if (response.status === 403) {
    return 'Bạn không có quyền xem lịch sử tham gia này.';
  }
  return 'Không thể tải lịch sử tham gia sự kiện.';
};

const authenticatedRequest = async (
  path: string,
  init: RequestInit = {},
  timeoutMs = READ_TIMEOUT_MS
) => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('event-participation-timeout'),
    timeoutMs
  );
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  try {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const response = await fetch(normalizedPath, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') throw error;
    throw new Error(
      'Cloudflare phản hồi quá chậm. Vui lòng kiểm tra mạng và thử lại.'
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

export const fetchEventParticipations = async (userId?: string) => {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await authenticatedRequest(
    `/api/user/v1/event-participations${suffix}`
  );
  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error('Cloudflare trả về lịch sử tham gia không hợp lệ.');
  }
  return payload.data
    .map((value: unknown) => Number(value))
    .filter(
      (eventId: number) => Number.isSafeInteger(eventId) && eventId > 0
    );
};

export const setEventParticipation = async (
  eventIdValue: string | number,
  participated: boolean
) => {
  const eventId = Number(eventIdValue);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    throw new Error('Mã sự kiện không hợp lệ.');
  }
  const response = await authenticatedRequest(
    `/api/user/v1/event-participations/${eventId}`,
    { method: participated ? 'PUT' : 'DELETE' },
    WRITE_TIMEOUT_MS
  );
  const payload = await response.json();
  if (
    !payload?.success ||
    Number(payload.eventId) !== eventId ||
    payload.participated !== participated
  ) {
    throw new Error('Cloudflare trả về trạng thái tham gia không hợp lệ.');
  }
  return {
    eventId,
    participated,
    mirrorSynced: payload.mirrorSynced === true,
  };
};
