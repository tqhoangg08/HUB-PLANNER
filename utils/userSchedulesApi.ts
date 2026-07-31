const DEFAULT_CLOUDFLARE_PUBLIC_API =
  'https://hub-planner-public-dev-api.tqhoangg2.workers.dev';
const READ_TIMEOUT_MS = 6_000;
const WRITE_TIMEOUT_MS = 15_000;

const cloudflareBase = String(
  import.meta.env?.VITE_CLOUDFLARE_PUBLIC_API_BASE_URL ||
    DEFAULT_CLOUDFLARE_PUBLIC_API
).replace(/\/$/, '');

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
    // Keep the status-specific fallback for non-JSON responses.
  }
  if (response.status === 401) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  }
  if (response.status === 403) {
    return 'Bạn không có quyền xem lịch cá nhân này.';
  }
  return 'Không thể xử lý lịch cá nhân.';
};

const authenticatedRequest = async (
  path: string,
  init: RequestInit = {},
  timeoutMs = READ_TIMEOUT_MS
) => {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error(
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    );
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('user-schedule-timeout'),
    timeoutMs
  );
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  try {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const response = await fetch(`${cloudflareBase}${normalizedPath}`, {
      ...init,
      headers,
      cache: 'no-store',
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

const readMutationResult = async (response: Response) => {
  const payload = await response.json();
  if (!payload?.success) {
    throw new Error('Cloudflare trả về kết quả lưu lịch không hợp lệ.');
  }
  return {
    mirrorSynced: payload.mirrorSynced === true,
  };
};

export const fetchCloudflareUserSchedules = async (userId?: string) => {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await authenticatedRequest(
    `/api/user/v1/schedules${suffix}`
  );
  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error('Cloudflare trả về lịch cá nhân không hợp lệ.');
  }
  return payload.data as Record<string, unknown>[];
};

export const addCloudflareUserSchedule = async (
  courseId: string,
  semester: string
) => {
  const response = await authenticatedRequest(
    `/api/user/v1/schedules/courses/${encodeURIComponent(courseId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ semester }),
    },
    WRITE_TIMEOUT_MS
  );
  return readMutationResult(response);
};

export const removeCloudflareUserSchedule = async (courseId: string) => {
  const response = await authenticatedRequest(
    `/api/user/v1/schedules/courses/${encodeURIComponent(courseId)}`,
    { method: 'DELETE' },
    WRITE_TIMEOUT_MS
  );
  return readMutationResult(response);
};

export const updateCloudflareUserSchedule = async (
  scheduleId: string,
  customData: Record<string, unknown>
) => {
  const response = await authenticatedRequest(
    `/api/user/v1/schedules/entries/${encodeURIComponent(scheduleId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ customData }),
    },
    WRITE_TIMEOUT_MS
  );
  return readMutationResult(response);
};

export const replaceCloudflareUserScheduleSemester = async (
  semester: string,
  courseIds: string[]
) => {
  const response = await authenticatedRequest(
    '/api/user/v1/schedules/replace',
    {
      method: 'PUT',
      body: JSON.stringify({ semester, courseIds }),
    },
    WRITE_TIMEOUT_MS
  );
  const payload = await response.json();
  if (
    !payload?.success ||
    !Number.isSafeInteger(Number(payload.count)) ||
    Number(payload.count) < 0
  ) {
    throw new Error('Cloudflare trả về kết quả nhập lịch không hợp lệ.');
  }
  return {
    count: Number(payload.count),
    mirrorSynced: payload.mirrorSynced === true,
  };
};
