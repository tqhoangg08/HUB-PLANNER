const PATHS = {
  session: '/api/auth/get-session',
  google: '/api/auth/sign-in/social',
  password: '/api/auth/mssv/sign-in',
  loginDispatch: '/api/auth/login/dispatch',
  signupStart: '/api/auth/student/sign-up/start',
  signupVerify: '/api/auth/student/sign-up/verify',
  signupResend: '/api/auth/student/sign-up/resend',
  registrationStatus: '/api/auth/registration/status',
  registrationPassword: '/api/auth/registration/set-password',
  passwordReset: '/api/auth/mssv/request-password-reset',
} as const;

export type StudentAuthErrorKind =
  | 'invalid-credentials'
  | 'already-registered'
  | 'not-registered'
  | 'invalid-input'
  | 'invalid-otp'
  | 'unavailable';

export class StudentAuthError extends Error {
  readonly kind: StudentAuthErrorKind;

  constructor(kind: StudentAuthErrorKind) {
    super(kind);
    this.name = 'StudentAuthError';
    this.kind = kind;
  }
}

const headers = (turnstileToken: string) => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-turnstile-token': turnstileToken,
});

const json = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const value = await response.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const requireToken = (token: string) => {
  if (!token.trim()) throw new StudentAuthError('unavailable');
};

const classify = (response: Response, payload: Record<string, unknown>) => {
  const code = typeof payload.code === 'string' ? payload.code : '';
  if (code === 'ACCOUNT_ALREADY_REGISTERED') return new StudentAuthError('already-registered');
  if (code === 'SIGN_UP_NOT_ALLOWED' || code === 'USER_NOT_FOUND') return new StudentAuthError('not-registered');
  if (response.status === 401) return new StudentAuthError('invalid-credentials');
  if (response.status === 400 || response.status === 422) return new StudentAuthError('invalid-input');
  return new StudentAuthError('unavailable');
};

export const studentAuthMessage = (error: unknown) => {
  if (!(error instanceof StudentAuthError)) return 'Dịch vụ xác thực tạm thời chưa sẵn sàng. Vui lòng thử lại.';
  if (error.kind === 'invalid-credentials') return 'MSSV hoặc mật khẩu không chính xác.';
  if (error.kind === 'already-registered') return 'Tài khoản đã được đăng ký. Vui lòng chuyển sang Đăng nhập.';
  if (error.kind === 'not-registered') return 'Tài khoản này chưa được đăng ký trên HUB Planner. Vui lòng chuyển sang Đăng ký để tạo tài khoản.';
  if (error.kind === 'invalid-otp') return 'Mã OTP không chính xác hoặc đã hết hạn.';
  if (error.kind === 'invalid-input') return 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.';
  return 'Dịch vụ xác thực tạm thời chưa sẵn sàng. Vui lòng thử lại.';
};

export async function signInStudent(
  identifier: string,
  password: string,
  turnstileToken: string,
  fetchImpl: typeof fetch = fetch,
) {
  requireToken(turnstileToken);
  const response = await fetchImpl(PATHS.password, {
    method: 'POST', credentials: 'include', headers: headers(turnstileToken),
    body: JSON.stringify({ mssv: identifier, password, rememberMe: true }),
  });
  const payload = await json(response);
  if (!response.ok) throw classify(response, payload);
  // Deliberately discard any token-shaped response data. Browser authority is
  // the same-origin HttpOnly Better Auth cookie only.
}

// `/login` has one unchanged student-facing presentation. The server selects
// the existing student or staff implementation after it verifies Turnstile;
// no role or backend choice is accepted from the browser.
export async function signInWithLoginDispatch(
  identifier: string,
  password: string,
  turnstileToken: string,
  fetchImpl: typeof fetch = fetch,
) {
  requireToken(turnstileToken);
  const response = await fetchImpl(PATHS.loginDispatch, {
    method: 'POST', credentials: 'include', headers: headers(turnstileToken),
    body: JSON.stringify({ identifier, password, rememberMe: true }),
  });
  const payload = await json(response);
  if (!response.ok) throw classify(response, payload);
  // Deliberately discard any token-shaped response data. Browser authority is
  // the same-origin HttpOnly Better Auth cookie only.
}

export async function beginGoogleStudentAuth(
  intent: 'login' | 'signup',
  turnstileToken: string,
  fetchImpl: typeof fetch = fetch,
) {
  requireToken(turnstileToken);
  const signup = intent === 'signup';
  const response = await fetchImpl(PATHS.google, {
    method: 'POST', credentials: 'include', headers: headers(turnstileToken),
    body: JSON.stringify({
      provider: 'google',
      requestSignUp: signup,
      callbackURL: signup ? '/complete-registration' : '/dashboard',
      newUserCallbackURL: '/complete-registration',
      errorCallbackURL: `/login?oauth=${signup ? 'signup' : 'login'}-error`,
    }),
  });
  const payload = await json(response);
  if (!response.ok) throw classify(response, payload);
  const target = typeof payload.url === 'string' ? payload.url : '';
  let url: URL;
  try { url = new URL(target); } catch { throw new StudentAuthError('unavailable'); }
  if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') {
    throw new StudentAuthError('unavailable');
  }
  return url.toString();
}

export async function startStudentSignup(identifier: string, password: string, token: string, fetchImpl: typeof fetch = fetch) {
  requireToken(token);
  const response = await fetchImpl(PATHS.signupStart, {
    method: 'POST', credentials: 'include', headers: headers(token),
    body: JSON.stringify({ identifier, password }),
  });
  const payload = await json(response);
  if (!response.ok) throw classify(response, payload);
}

export async function verifyStudentSignup(identifier: string, otp: string, token: string, fetchImpl: typeof fetch = fetch) {
  requireToken(token);
  const response = await fetchImpl(PATHS.signupVerify, {
    method: 'POST', credentials: 'include', headers: headers(token),
    body: JSON.stringify({ identifier, otp }),
  });
  const payload = await json(response);
  if (!response.ok) throw new StudentAuthError(response.status === 400 ? 'invalid-otp' : 'unavailable');
}

export async function resendStudentSignup(identifier: string, token: string, fetchImpl: typeof fetch = fetch) {
  requireToken(token);
  const response = await fetchImpl(PATHS.signupResend, {
    method: 'POST', credentials: 'include', headers: headers(token),
    body: JSON.stringify({ identifier }),
  });
  if (!response.ok) throw classify(response, await json(response));
}

export async function requestStudentPasswordReset(identifier: string, token: string, fetchImpl: typeof fetch = fetch) {
  requireToken(token);
  const response = await fetchImpl(PATHS.passwordReset, {
    method: 'POST', credentials: 'include', headers: headers(token),
    body: JSON.stringify({ identifier, redirectTo: '/reset-password' }),
  });
  if (!response.ok) throw new StudentAuthError('unavailable');
}

export async function getRegistrationStatus(fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(PATHS.registrationStatus, {
    method: 'GET', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
  });
  const payload = await json(response);
  if (!response.ok) throw classify(response, payload);
  return {
    pending: payload.pending === true,
    complete: payload.complete === true,
    email: typeof payload.email === 'string' ? payload.email : '',
  };
}

export async function completeGoogleRegistration(password: string, token: string, fetchImpl: typeof fetch = fetch) {
  requireToken(token);
  const response = await fetchImpl(PATHS.registrationPassword, {
    method: 'POST', credentials: 'include', headers: headers(token),
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw classify(response, await json(response));
}
