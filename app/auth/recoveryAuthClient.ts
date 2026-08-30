export const RECOVERY_AUTH_PATHS = {
  googleSignIn: '/api/auth/sign-in/social',
  emailSignIn: '/api/auth/sign-in/email',
  requestPasswordReset: '/api/auth/request-password-reset',
  staffPasswordActivation: '/api/auth/staff/request-password-reset',
  resetPassword: '/api/auth/reset-password',
  getSession: '/api/auth/get-session',
  signOut: '/api/auth/sign-out',
} as const;

export const GENERIC_PASSWORD_RESET_MESSAGE =
  'Nếu tài khoản đủ điều kiện, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email của bạn.';

export type RecoveryIdentity = {
  id: string;
  name: string | null;
  email: string;
};

export type RecoverySessionState = {
  authenticated: boolean;
  user: RecoveryIdentity | null;
};

class RecoveryAuthError extends Error {
  readonly kind: 'unavailable' | 'not-eligible' | 'invalid-response' | 'invalid-credentials' | 'invalid-reset';

  constructor(kind: 'unavailable' | 'not-eligible' | 'invalid-response' | 'invalid-credentials' | 'invalid-reset') {
    super(kind);
    this.name = 'RecoveryAuthError';
    this.kind = kind;
  }
}

const authHeaders = (turnstileToken: string) => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-turnstile-token': turnstileToken,
});

const requireTurnstileToken = (token: string) => {
  if (!token.trim()) throw new RecoveryAuthError('unavailable');
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new RecoveryAuthError('invalid-response');
  }
};

export async function getRecoverySession(
  fetchImpl: typeof fetch = fetch,
): Promise<RecoverySessionState> {
  const response = await fetchImpl(RECOVERY_AUTH_PATHS.getSession, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new RecoveryAuthError('unavailable');

  const payload = await readJson(response);
  if (payload === null) return { authenticated: false, user: null };
  if (!payload || typeof payload !== 'object') throw new RecoveryAuthError('invalid-response');

  const user = (payload as { user?: unknown }).user;
  if (!user || typeof user !== 'object') return { authenticated: false, user: null };
  const candidate = user as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || typeof candidate.email !== 'string') {
    throw new RecoveryAuthError('invalid-response');
  }
  return {
    authenticated: true,
    user: {
      id: candidate.id,
      email: candidate.email,
      name: typeof candidate.name === 'string' ? candidate.name : null,
    },
  };
}

export async function beginGoogleRecoverySignIn(
  turnstileToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  requireTurnstileToken(turnstileToken);

  const response = await fetchImpl(RECOVERY_AUTH_PATHS.googleSignIn, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(turnstileToken),
    body: JSON.stringify({
      provider: 'google',
      callbackURL: '/dashboard',
      errorCallbackURL: '/login?error=oauth',
    }),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    const code =
      payload && typeof payload === 'object' && typeof (payload as { code?: unknown }).code === 'string'
        ? (payload as { code: string }).code
        : '';
    if (code === 'SIGN_UP_NOT_ALLOWED' || code === 'USER_NOT_FOUND') {
      throw new RecoveryAuthError('not-eligible');
    }
    throw new RecoveryAuthError('unavailable');
  }

  const redirectUrl =
    payload && typeof payload === 'object' && typeof (payload as { url?: unknown }).url === 'string'
      ? (payload as { url: string }).url
      : '';
  let parsed: URL;
  try {
    parsed = new URL(redirectUrl);
  } catch {
    throw new RecoveryAuthError('invalid-response');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.google.com') {
    throw new RecoveryAuthError('invalid-response');
  }
  return parsed.toString();
}

export async function signInRecoveryWithEmail(
  email: string,
  password: string,
  turnstileToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RecoverySessionState> {
  requireTurnstileToken(turnstileToken);
  const response = await fetchImpl(RECOVERY_AUTH_PATHS.emailSignIn, {
    method: 'POST',
    credentials: 'same-origin',
    headers: authHeaders(turnstileToken),
    body: JSON.stringify({ email, password, rememberMe: true }),
  });
  if (!response.ok) throw new RecoveryAuthError('invalid-credentials');

  // Better Auth may include a bearer token in its JSON response. Discard the
  // body: the recovery island trusts only the same-origin HttpOnly cookie.
  const session = await getRecoverySession(fetchImpl);
  if (!session.authenticated) throw new RecoveryAuthError('invalid-response');
  return session;
}

export async function requestRecoveryPasswordReset(
  email: string,
  turnstileToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  requireTurnstileToken(turnstileToken);
  const response = await fetchImpl(RECOVERY_AUTH_PATHS.requestPasswordReset, {
    method: 'POST',
    credentials: 'same-origin',
    headers: authHeaders(turnstileToken),
    body: JSON.stringify({ email, redirectTo: '/reset-password' }),
  });
  if (!response.ok) throw new RecoveryAuthError('unavailable');
}

/**
 * Requests a credential-activation link for an already provisioned admin or
 * auditor. The Worker returns the same generic shape for every address and
 * performs the role lookup server-side.
 */
export async function requestStaffPasswordActivation(
  email: string,
  turnstileToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  requireTurnstileToken(turnstileToken);
  const response = await fetchImpl(RECOVERY_AUTH_PATHS.staffPasswordActivation, {
    method: 'POST',
    credentials: 'same-origin',
    headers: authHeaders(turnstileToken),
    body: JSON.stringify({ email, redirectTo: '/staff/reset-password' }),
  });
  if (!response.ok) throw new RecoveryAuthError('unavailable');
}

export async function submitRecoveryPasswordReset(
  token: string,
  newPassword: string,
  turnstileToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  requireTurnstileToken(turnstileToken);
  if (!token) throw new RecoveryAuthError('invalid-reset');
  const response = await fetchImpl(RECOVERY_AUTH_PATHS.resetPassword, {
    method: 'POST',
    credentials: 'same-origin',
    headers: authHeaders(turnstileToken),
    body: JSON.stringify({ token, newPassword }),
  });
  if (!response.ok) throw new RecoveryAuthError('invalid-reset');
}

export async function signOutRecovery(fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(RECOVERY_AUTH_PATHS.signOut, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new RecoveryAuthError('unavailable');
  const current = await getRecoverySession(fetchImpl);
  if (current.authenticated) throw new RecoveryAuthError('unavailable');
}

export const recoveryAuthMessage = (error: unknown) =>
  error instanceof RecoveryAuthError && error.kind === 'not-eligible'
    ? 'Tài khoản này chưa hỗ trợ đăng nhập trong giai đoạn khôi phục. Vui lòng thử lại sau.'
    : error instanceof RecoveryAuthError && error.kind === 'invalid-credentials'
      ? 'Email hoặc mật khẩu không đúng.'
      : error instanceof RecoveryAuthError && error.kind === 'invalid-reset'
        ? 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'
        : 'Dịch vụ đăng nhập tạm thời chưa sẵn sàng. Vui lòng thử lại sau.';
