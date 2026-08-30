const AUTH_SENSITIVE_POST_ACTIONS = new Map<string, string>([
  ["/api/auth/sign-up/email", "signup"],
  ["/api/auth/sign-in/email", "login"],
  // The public login surface deliberately dispatches only after Turnstile
  // verification. It selects a backend; it never accepts a client role.
  ["/api/auth/login/dispatch", "login"],
  ["/api/auth/sign-in/social", "google_login"],
  ["/api/auth/link-social", "google_link"],
  ["/api/auth/send-verification-email", "verify_email"],
  ["/api/auth/request-password-reset", "forgot_password"],
  // This is an activation/reset path for a pre-provisioned staff identity.
  // Server-side role lookup, not this public route, decides eligibility.
  ["/api/auth/staff/request-password-reset", "forgot_password"],
  ["/api/auth/reset-password", "reset_password"],
  ["/api/auth/mssv/sign-in", "login"],
  ["/api/auth/mssv/request-password-reset", "forgot_password"],
  ["/api/auth/student/sign-up/start", "signup"],
  ["/api/auth/student/sign-up/verify", "verify_email"],
  ["/api/auth/student/sign-up/resend", "verify_email"],
  ["/api/auth/registration/set-password", "signup_password"],
]);

export function getSensitiveAuthAction(pathname: string): string | null {
  return AUTH_SENSITIVE_POST_ACTIONS.get(pathname) ?? null;
}

export function isSensitiveAuthIngressRequest(request: Request): boolean {
  return request.method === "POST" && getSensitiveAuthAction(new URL(request.url).pathname) !== null;
}
