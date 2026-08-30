export type BetterAuthRole = 'user' | 'admin' | 'auditor';

export type AppSession = {
  access_token?: undefined;
  user: {
    id: string;
    email: string;
    user_metadata: {
      full_name?: string;
      name?: string;
      avatar_url?: string;
      picture?: string;
    };
    app_metadata: { role: BetterAuthRole };
  };
  role: BetterAuthRole;
};

export class PrivateApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PrivateApiError';
    this.status = status;
  }
}

const safeErrorMessage = (status: number) => {
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 503) return 'Dịch vụ tạm thời chưa khả dụng. Vui lòng thử lại sau.';
  return 'Không thể xử lý yêu cầu lúc này.';
};

const mayUseClientSafeMessage = (status: number) =>
  status === 400 || status === 404 || status === 409 || status === 422;

export const privateApiRequest = async (
  path: string,
  init: RequestInit = {},
) => {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
    redirect: 'manual',
  });
  if (!response.ok) {
    let message = safeErrorMessage(response.status);
    try {
      const payload = await response.json() as { error?: unknown };
      if (
        mayUseClientSafeMessage(response.status)
        && typeof payload?.error === 'string'
        && payload.error.length <= 240
      ) {
        message = payload.error;
      }
    } catch {
      // Keep the fixed status-specific message for invalid error bodies.
    }
    throw new PrivateApiError(response.status, message);
  }
  return response;
};

export const fetchBetterAuthSession = async (): Promise<AppSession | null> => {
  try {
    const response = await privateApiRequest('/api/private/v1/me');
    const identity = await response.json() as {
      userId?: unknown;
      email?: unknown;
      role?: unknown;
    };
    if (
      typeof identity.userId !== 'string'
      || typeof identity.email !== 'string'
      || !['user', 'admin', 'auditor'].includes(String(identity.role))
    ) {
      throw new PrivateApiError(503, 'Phản hồi danh tính không hợp lệ.');
    }
    const role = identity.role as BetterAuthRole;
    return {
      role,
      user: {
        id: identity.userId,
        email: identity.email,
        user_metadata: {},
        app_metadata: { role },
      },
    };
  } catch (error) {
    if (error instanceof PrivateApiError && error.status === 401) return null;
    throw error;
  }
};

export const signOutBetterAuth = async () => {
  await privateApiRequest('/api/auth/sign-out', {
    method: 'POST',
    body: JSON.stringify({}),
  });
};
