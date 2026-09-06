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

// The Better Auth session endpoint is the authority for whether a browser is
// signed in.  The public Worker identity bridge adds the application role, but
// a just-created OAuth session can reach that bridge before the service binding
// has observed the new session.  Keep that distinction explicit so callers do
// not turn a recoverable bridge failure into either a logout or an endless
// loading state.
export class SessionIdentityUnavailableError extends Error {
  readonly session: AppSession;

  constructor(session: AppSession) {
    super('Không thể đồng bộ quyền truy cập lúc này.');
    this.name = 'SessionIdentityUnavailableError';
    this.session = session;
  }
}

const PRIVATE_IDENTITY_RETRY_DELAYS_MS = [0, 300, 900] as const;
const PRIVATE_IDENTITY_REQUEST_TIMEOUT_MS = 4_000;
export const POST_LOGIN_IDENTITY_MAX_WAIT_SECONDS = 14;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));

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
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
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

let sessionRequest: Promise<AppSession | null> | undefined;

const restoreBetterAuthSession = async (): Promise<AppSession | null> => {
    // Only the official session endpoint may establish anonymous state.
    // A failure in the auxiliary role bridge is not a logout signal.
    const official = await privateApiRequest('/api/auth/get-session');
    const payload = await official.json();
    if (payload === null) return null;
    if (!payload?.session || typeof payload?.user?.id !== 'string') {
      throw new PrivateApiError(503, 'Phản hồi phiên đăng nhập không hợp lệ.');
    }
    const fallbackEmail = typeof payload.user.email === 'string'
      ? payload.user.email
      : '';
    if (!fallbackEmail) {
      throw new PrivateApiError(503, 'Phản hồi phiên đăng nhập không hợp lệ.');
    }
    const provisionalSession: AppSession = {
      // A role is never elevated until the authoritative identity bridge has
      // returned it. This keeps a temporary bridge failure least-privileged.
      role: 'user',
      user: {
        id: payload.user.id,
        email: fallbackEmail,
        user_metadata: {},
        app_metadata: { role: 'user' },
      },
    };

    let lastError: unknown;
    for (const retryDelay of PRIVATE_IDENTITY_RETRY_DELAYS_MS) {
      if (retryDelay > 0) await delay(retryDelay);
      try {
        const response = await privateApiRequest('/api/private/v1/me', {
          // A backend/service-binding race must resolve into the bounded
          // fallback below, never leave the post-login bootstrap pending.
          signal: AbortSignal.timeout(PRIVATE_IDENTITY_REQUEST_TIMEOUT_MS),
        });
        const identity = await response.json() as {
          userId?: unknown;
          email?: unknown;
          role?: unknown;
        };
        if (
          typeof identity.userId !== 'string'
          || identity.userId !== payload.user.id
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
        lastError = error;
        const retryable =
          !(error instanceof PrivateApiError)
          || [401, 403, 503].includes(error.status);
        if (!retryable) throw error;
      }
    }

    // get-session still proves the Better Auth session is valid.  Surface a
    // finite degraded state to the UI rather than falsely logging out or
    // leaving AuthGate on its initial spinner forever.
    void lastError;
    throw new SessionIdentityUnavailableError(provisionalSession);
};

export const fetchBetterAuthSession = (): Promise<AppSession | null> => {
  // Share concurrent restores, but never cache authenticated state across runs.
  if (!sessionRequest) {
    sessionRequest = restoreBetterAuthSession().finally(() => { sessionRequest = undefined; });
  }
  return sessionRequest;
};

export const signOutBetterAuth = async () => {
  await privateApiRequest('/api/auth/sign-out', {
    method: 'POST',
    body: JSON.stringify({}),
  });
};
