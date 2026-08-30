import { betterAuth } from "better-auth";
import { APIError, getOAuthState } from "better-auth/api";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { emailOTP } from "better-auth/plugins";
import { getSensitiveAuthAction } from "../../shared/auth-sensitive-routes.ts";
export { getSensitiveAuthAction } from "../../shared/auth-sensitive-routes.ts";

const AUTH_BASE_PATH = "/api/auth";
const PRODUCTION_ORIGIN = "https://hotrosinhvienhub.id.vn";
const PRODUCTION_HOSTNAME = "hotrosinhvienhub.id.vn";
const STUDENT_EMAIL_DOMAIN = "@st.buh.edu.vn";
const MAX_AUTH_BODY_BYTES = 16 * 1024;
const OUTBOUND_FETCH_TIMEOUT_MS = 10_000;
const IDENTIFIER_WINDOW_SECONDS = 5 * 60;
const IDENTIFIER_MAX_FAILURES = 8;
const RESET_EMAIL_WINDOW_SECONDS = 60 * 60;
const RESET_EMAIL_MAX_ATTEMPTS = 3;
const PASSWORD_RESET_RESPONSE_FLOOR_MS = 180;
const PASSWORD_RESET_RESPONSE_JITTER_MS = 24;
const RESET_EMAIL_GLOBAL_RATE_KEY = "reset-email:global";

export const PASSWORD_RESET_LIMIT_POLICY = Object.freeze({
  identifierEmailsPerHour: RESET_EMAIL_MAX_ATTEMPTS,
  identifierNativeRequestsPerMinute: 8,
  defaultGlobalEmailsPerDay: 80,
});

const GENERIC_CREDENTIAL_ERROR = {
  ok: false,
  error: "Thông tin đăng nhập không hợp lệ.",
};

const GENERIC_PASSWORD_RESET_RESPONSE = {
  status: true,
  message: "Nếu tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu sẽ được gửi qua email.",
};

export type AuthRuntimeEnv = {
  AUTH_DB: D1Database;
  AUTH_IDENTIFIER_RATE_LIMIT?: RateLimit;
  AUTH_ENABLED?: string;
  AUTH_ORIGIN?: string;
  AUTH_TURNSTILE_EXPECTED_HOSTNAME?: string;
  AUTH_TURNSTILE_SITE_KEY?: string;
  AUTH_GOOGLE_CLIENT_ID?: string;
  AUTH_EMAIL_FROM?: string;
  AUTH_RESET_EMAIL_DAILY_BUDGET?: string;
  AUTH_BETTER_AUTH_SECRET?: string;
  AUTH_TURNSTILE_SECRET?: string;
  AUTH_GOOGLE_CLIENT_SECRET?: string;
  AUTH_RESEND_API_KEY?: string;
  AUTH_INTEGRATION_SYNTHETIC_USER_ID?: string;
};

export type AuthProductionEnv = Env & AuthRuntimeEnv;

export type AuthRuntimeProfile = {
  readonly kind: "production" | "integration-synthetic-credential" | "integration-stage2";
  readonly appName: string;
  readonly origin: string;
  readonly trustedOrigins: readonly string[];
  readonly cookiePrefix: string;
  readonly serviceName: string;
  readonly routeSurface: "full" | "integration-synthetic-session-lifecycle" | "integration-stage2";
  readonly providers: "production" | "email-only" | "none";
  readonly resetPage: string;
  readonly expectedHostname: string;
  readonly eligibilityPolicy: "production-student" | "integration-synthetic-user";
  readonly emailBrand: "production" | "integration-test";
  readonly syntheticSignInEmail?: string;
};

export const PRODUCTION_AUTH_PROFILE = {
  kind: "production",
  appName: "HUB Planner",
  origin: PRODUCTION_ORIGIN,
  trustedOrigins: [PRODUCTION_ORIGIN],
  cookiePrefix: "hubplanner_auth",
  serviceName: "hub-planner-auth-production",
  routeSurface: "full",
  providers: "production",
  resetPage: `${PRODUCTION_ORIGIN}/reset-password`,
  expectedHostname: PRODUCTION_HOSTNAME,
  eligibilityPolicy: "production-student",
  emailBrand: "production",
} as const satisfies AuthRuntimeProfile;

type RuntimeConfig = {
  origin: string;
  trustedOrigins: string[];
  cookiePrefix: string;
  appName: string;
  betterAuthSecret: string;
  resetPage: string;
  eligibilityPolicy: AuthRuntimeProfile["eligibilityPolicy"];
  emailBrand: AuthRuntimeProfile["emailBrand"];
  syntheticUserId?: string;
  turnstile?: {
    hostname: string;
    secret: string;
  };
  google?: {
    clientId: string;
    clientSecret: string;
  };
  email?: {
    resendApiKey: string;
    from: string;
  };
  resetEmailDailyBudget?: number;
};

type AuthBody = Record<string, unknown>;
type EffectiveRole = "user" | "admin" | "auditor";
type IdentifierPurpose = "login" | "reset" | "mssv" | "signup" | "signup-verify" | "signup-password";

export type StudentIdentity = {
  studentCode: string;
  email: string;
};

type AuthRequestSignals = {
  passwordResetEmailScheduled: boolean;
};

const ACCOUNT_DELETE_OTP_PURPOSE = "account_delete";
const ACCOUNT_DELETE_OTP_TTL_MS = 10 * 60_000;
const ACCOUNT_DELETE_MAX_ATTEMPTS = 5;
const ACCOUNT_DELETE_IDENTIFIER_PREFIX = "account-delete-otp:";
const ACCOUNT_DELETE_GRANT_PREFIX = "account-delete-grant:";

type AccountDeleteOtpState = {
  hash: string;
  attempts: number;
};

export type PasswordResetEligibility = {
  userFound: boolean;
  role: EffectiveRole | null;
  totalProviders: number;
  credentialProviders: number;
  googleProviders: number;
  unexpectedProviders: number;
};

type ResetEmailReservation = {
  identifierKey: string;
  identifierWindowStartedAt: number;
  globalWindowStartedAt: number;
};

class AuthConfigurationError extends Error {
  constructor() {
    super("AUTH_CONFIGURATION_REQUIRED");
    this.name = "AuthConfigurationError";
  }
}

export function handleAuthProductionRequest(
  request: Request,
  env: AuthProductionEnv,
  context: ExecutionContext,
): Promise<Response> {
  return handleAuthRuntimeRequest(request, env, context, PRODUCTION_AUTH_PROFILE);
}

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store, max-age=0");
  responseHeaders.set("pragma", "no-cache");
  responseHeaders.set("x-content-type-options", "nosniff");
  responseHeaders.set("referrer-policy", "no-referrer");
  responseHeaders.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  responseHeaders.set("x-frame-options", "DENY");
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
}

function withPrivateResponseHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("x-frame-options", "DENY");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function hasConfiguredValue(value: string | undefined): value is string {
  return Boolean(value && value.trim() && !value.startsWith("CONFIGURE_"));
}

export function getRuntimeConfig(
  env: AuthRuntimeEnv,
  profile: AuthRuntimeProfile,
): RuntimeConfig {
  if (!hasConfiguredValue(env.AUTH_BETTER_AUTH_SECRET)) {
    throw new AuthConfigurationError();
  }

  const coreConfig = {
    origin: profile.origin,
    trustedOrigins: [...profile.trustedOrigins],
    cookiePrefix: profile.cookiePrefix,
    appName: profile.appName,
    betterAuthSecret: env.AUTH_BETTER_AUTH_SECRET,
    resetPage: profile.resetPage,
    eligibilityPolicy: profile.eligibilityPolicy,
    emailBrand: profile.emailBrand,
  };

  if (profile.providers === "none") {
    return coreConfig;
  }

  const sharedPublicValues = [
    env.AUTH_ORIGIN,
    env.AUTH_TURNSTILE_EXPECTED_HOSTNAME,
    env.AUTH_TURNSTILE_SITE_KEY,
    env.AUTH_EMAIL_FROM,
    env.AUTH_RESET_EMAIL_DAILY_BUDGET,
  ];
  const sharedSecretValues = [env.AUTH_TURNSTILE_SECRET, env.AUTH_RESEND_API_KEY];

  if (profile.providers === "email-only") {
    if (
      sharedPublicValues.some((value) => !hasConfiguredValue(value)) ||
      sharedSecretValues.some((value) => !hasConfiguredValue(value)) ||
      !hasConfiguredValue(env.AUTH_INTEGRATION_SYNTHETIC_USER_ID) ||
      profile.kind !== "integration-stage2" ||
      profile.routeSurface !== "integration-stage2" ||
      profile.eligibilityPolicy !== "integration-synthetic-user" ||
      env.AUTH_ORIGIN !== profile.origin ||
      env.AUTH_TURNSTILE_EXPECTED_HOSTNAME !== profile.expectedHostname ||
      !isUuidV4(env.AUTH_INTEGRATION_SYNTHETIC_USER_ID) ||
      !env.AUTH_EMAIL_FROM.includes("@") ||
      parseResetEmailDailyBudget(env.AUTH_RESET_EMAIL_DAILY_BUDGET) !== 1
    ) {
      throw new AuthConfigurationError();
    }

    return {
      ...coreConfig,
      syntheticUserId: env.AUTH_INTEGRATION_SYNTHETIC_USER_ID,
      turnstile: {
        hostname: env.AUTH_TURNSTILE_EXPECTED_HOSTNAME,
        secret: env.AUTH_TURNSTILE_SECRET,
      },
      email: {
        resendApiKey: env.AUTH_RESEND_API_KEY,
        from: env.AUTH_EMAIL_FROM,
      },
      resetEmailDailyBudget: 1,
    };
  }

  if (
    [...sharedPublicValues, env.AUTH_GOOGLE_CLIENT_ID].some((value) => !hasConfiguredValue(value)) ||
    [...sharedSecretValues, env.AUTH_GOOGLE_CLIENT_SECRET].some((value) => !hasConfiguredValue(value)) ||
    profile.kind !== "production" ||
    profile.routeSurface !== "full" ||
    profile.eligibilityPolicy !== "production-student" ||
    env.AUTH_ORIGIN !== profile.origin ||
    env.AUTH_TURNSTILE_EXPECTED_HOSTNAME !== profile.expectedHostname ||
    !env.AUTH_EMAIL_FROM.includes("@")
  ) {
    throw new AuthConfigurationError();
  }

  return {
    ...coreConfig,
    turnstile: {
      hostname: env.AUTH_TURNSTILE_EXPECTED_HOSTNAME,
      secret: env.AUTH_TURNSTILE_SECRET,
    },
    google: {
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
    },
    email: {
      resendApiKey: env.AUTH_RESEND_API_KEY,
      from: env.AUTH_EMAIL_FROM,
    },
    resetEmailDailyBudget: parseResetEmailDailyBudget(env.AUTH_RESET_EMAIL_DAILY_BUDGET),
  };
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseResetEmailDailyBudget(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new AuthConfigurationError();
  }
  return parsed;
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().normalize("NFKC").toLowerCase() : "";
}

export function removeGoogleOAuthLoginHint(body: Record<string, unknown>): void {
  delete body.loginHint;
  delete body.login_hint;
}

export async function allowsIntegrationSyntheticCredentialRequest(
  request: Request,
  profile: AuthRuntimeProfile,
): Promise<boolean> {
  if (profile.routeSurface !== "integration-synthetic-session-lifecycle") return false;

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === `${AUTH_BASE_PATH}/get-session`) {
    return true;
  }

  if (request.method === "POST" && url.pathname === `${AUTH_BASE_PATH}/sign-out`) {
    return true;
  }

  if (request.method !== "POST" || url.pathname !== `${AUTH_BASE_PATH}/sign-in/email`) {
    return false;
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return false;

  const body = await readBoundedJsonBody(request);
  return Boolean(
    body &&
      profile.syntheticSignInEmail &&
      normalizeEmail(body.email) === normalizeEmail(profile.syntheticSignInEmail),
  );
}

export function allowsIntegrationStage2Request(request: Request): boolean {
  const { pathname } = new URL(request.url);
  const method = request.method.toUpperCase();
  if (method === "GET" && pathname === `${AUTH_BASE_PATH}/get-session`) return true;
  if (method === "GET" && /^\/api\/auth\/reset-password\/[^/]+$/.test(pathname)) return true;
  return method === "POST" && new Set([
    `${AUTH_BASE_PATH}/request-password-reset`,
    `${AUTH_BASE_PATH}/reset-password`,
    `${AUTH_BASE_PATH}/sign-in/email`,
    `${AUTH_BASE_PATH}/sign-out`,
  ]).has(pathname);
}

export function isStudentEmail(value: unknown): boolean {
  const normalized = normalizeEmail(value);
  return normalized.length > STUDENT_EMAIL_DOMAIN.length && normalized.endsWith(STUDENT_EMAIL_DOMAIN);
}

export function isPasswordResetEligible(input: PasswordResetEligibility): boolean {
  if (!input.userFound || input.role !== "user" || input.unexpectedProviders !== 0) return false;
  if (input.totalProviders === 0) return true;
  return input.credentialProviders > 0 || input.googleProviders > 0;
}

// Staff identities are provisioned ahead of time in app_user_roles. They do
// not use the student registration path, so their first Better Auth
// credential is intentionally established through the emailed reset token.
// This remains a server-side allowlist: email shape and browser input grant no
// staff authority.
export function isStaffPasswordActivationEligible(input: PasswordResetEligibility): boolean {
  return input.userFound && (input.role === "admin" || input.role === "auditor");
}

export function isIntegrationSyntheticPasswordResetEligible(
  input: PasswordResetEligibility,
): boolean {
  if (!isPasswordResetEligible(input) || input.googleProviders !== 0) return false;
  return input.totalProviders === 0 || input.totalProviders === input.credentialProviders;
}

export function isResetEmailReservationWithinLimits(
  identifierCount: number,
  globalCount: number,
  dailyBudget: number,
): boolean {
  return identifierCount <= RESET_EMAIL_MAX_ATTEMPTS && globalCount <= dailyBudget;
}

export function allowsProductionUserCreation(input: {
  email: unknown;
  emailVerified: boolean;
  isOAuthCreation: boolean;
  oauthRequestedSignUp: boolean;
}): boolean {
  if (!isStudentEmail(input.email)) return false;
  if (!input.isOAuthCreation) return true;
  return input.emailVerified === true && input.oauthRequestedSignUp === true;
}

export function normalizeStudentCode(value: unknown): string {
  return typeof value === "string" ? value.trim().normalize("NFKC").toUpperCase() : "";
}

export function isValidStudentCode(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(value);
}

export function normalizeStudentIdentity(value: unknown): StudentIdentity | null {
  const normalized = typeof value === "string" ? value.trim().normalize("NFKC").toLowerCase() : "";
  const localPart = normalized.includes("@")
    ? normalized.endsWith(STUDENT_EMAIL_DOMAIN)
      ? normalized.slice(0, -STUDENT_EMAIL_DOMAIN.length)
      : ""
    : normalized;
  if (!/^\d{12}$/.test(localPart)) return null;
  return {
    studentCode: localPart,
    email: `${localPart}${STUDENT_EMAIL_DOMAIN}`,
  };
}

export type LoginDispatchTarget = "student" | "staff" | "invalid";

// This is an identifier classifier, not an authorization decision. In
// particular, an email's domain never grants staff access.
export function classifyLoginDispatchIdentifier(value: unknown): LoginDispatchTarget {
  if (normalizeStudentIdentity(value)) return "student";
  const email = normalizeEmail(value);
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
    ? "staff"
    : "invalid";
}

export function shouldRejectGoogleSignupForExistingUser(
  requestSignUp: boolean,
  userCreatedInCurrentOAuthRequest: boolean,
): boolean {
  return requestSignUp && !userCreatedInCurrentOAuthRequest;
}

export function isAuthEnabled(env: Pick<AuthRuntimeEnv, "AUTH_ENABLED">): boolean {
  return String(env.AUTH_ENABLED) === "true";
}

async function readBoundedJsonBody(request: Request): Promise<AuthBody | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUTH_BODY_BYTES) {
    return null;
  }

  const body = request.clone().body;
  if (!body) return {};

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AUTH_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const parsed = JSON.parse(new TextDecoder().decode(joined)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as AuthBody;
  } catch {
    return null;
  }
}

function requestWithJsonBody(request: Request, body: AuthBody): Request {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
    redirect: request.redirect,
  });
}

async function validateTurnstile(
  request: Request,
  config: RuntimeConfig,
  expectedAction: string,
): Promise<boolean> {
  if (!config.turnstile) throw new AuthConfigurationError();
  const token = request.headers.get("x-turnstile-token")?.trim();
  if (!token) return false;

  const body = new URLSearchParams({
    secret: config.turnstile.secret,
    response: token,
  });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(OUTBOUND_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return false;

  const result = (await response.json()) as {
    success?: boolean;
    action?: string;
    hostname?: string;
  };
  return result.success === true && result.action === expectedAction && result.hostname === config.turnstile.hostname;
}

async function identifierDigest(secret: string, normalizedIdentifier: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`rate-limit:v1:${normalizedIdentifier}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function identifierRateKey(
  secret: string,
  purpose: IdentifierPurpose,
  normalizedIdentifier: string,
): Promise<string> {
  return `${purpose}:${await identifierDigest(secret, normalizedIdentifier)}`;
}

async function passwordResetEligibilityForEmail(
  env: AuthRuntimeEnv,
  email: string,
  exactUserId?: string,
): Promise<PasswordResetEligibility> {
  const row = await env.AUTH_DB.prepare(
    `SELECT r.role,
            COUNT(a.id) AS total_providers,
            SUM(CASE WHEN a.provider_id = 'credential' THEN 1 ELSE 0 END) AS credential_providers,
            SUM(CASE WHEN a.provider_id = 'google' THEN 1 ELSE 0 END) AS google_providers,
            SUM(CASE WHEN a.provider_id NOT IN ('credential', 'google') THEN 1 ELSE 0 END) AS unexpected_providers
       FROM auth_user u
       LEFT JOIN app_user_roles r ON r.user_id = u.id
       LEFT JOIN auth_account a ON a.user_id = u.id
      WHERE u.email = ?1
        AND (?2 IS NULL OR u.id = ?2)
      GROUP BY u.id, r.role
      LIMIT 1`,
  )
    .bind(email, exactUserId ?? null)
    .first<{
      role: string | null;
      total_providers: number;
      credential_providers: number;
      google_providers: number;
      unexpected_providers: number;
    }>();

  return {
    userFound: Boolean(row),
    role: effectiveRole(row?.role),
    totalProviders: Number(row?.total_providers ?? 0),
    credentialProviders: Number(row?.credential_providers ?? 0),
    googleProviders: Number(row?.google_providers ?? 0),
    unexpectedProviders: Number(row?.unexpected_providers ?? 0),
  };
}

async function integrationSyntheticEmailMatches(
  env: AuthRuntimeEnv,
  email: string,
  syntheticUserId: string,
): Promise<boolean> {
  const row = await env.AUTH_DB.prepare(
    `SELECT COUNT(*) AS match_count
       FROM auth_user u
       JOIN app_user_roles r ON r.user_id = u.id
      WHERE u.id = ?1
        AND u.email = ?2
        AND r.role = 'user'`,
  )
    .bind(syntheticUserId, email)
    .first<{ match_count: number }>();
  return Number(row?.match_count) === 1;
}

function utcDayStartedAt(nowSeconds: number): number {
  return nowSeconds - (nowSeconds % (24 * 60 * 60));
}

async function currentRateWindow(
  env: AuthRuntimeEnv,
  key: string,
): Promise<{ windowStartedAt: number; requestCount: number } | null> {
  const row = await env.AUTH_DB.prepare(
    `SELECT window_started_at, request_count
       FROM auth_rate_limit_windows
      WHERE rate_key = ?1
      LIMIT 1`,
  )
    .bind(key)
    .first<{ window_started_at: number; request_count: number }>();
  return row
    ? { windowStartedAt: Number(row.window_started_at), requestCount: Number(row.request_count) }
    : null;
}

async function reserveResetEmailBudget(
  env: AuthRuntimeEnv,
  identifierKey: string,
  dailyBudget: number,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<ResetEmailReservation | null> {
  const globalWindowStartedAt = utcDayStartedAt(nowSeconds);
  const incrementIdentifier = env.AUTH_DB.prepare(
    `INSERT INTO auth_rate_limit_windows (rate_key, window_started_at, request_count, updated_at)
     VALUES (?1, ?2, 1, ?2)
     ON CONFLICT(rate_key) DO UPDATE SET
       request_count = CASE
         WHEN (?2 - auth_rate_limit_windows.window_started_at) >= ?3 THEN 1
         ELSE auth_rate_limit_windows.request_count + 1
       END,
       window_started_at = CASE
         WHEN (?2 - auth_rate_limit_windows.window_started_at) >= ?3 THEN ?2
         ELSE auth_rate_limit_windows.window_started_at
       END,
       updated_at = ?2
     RETURNING window_started_at, request_count`,
  ).bind(identifierKey, nowSeconds, RESET_EMAIL_WINDOW_SECONDS);
  const incrementGlobal = env.AUTH_DB.prepare(
    `INSERT INTO auth_rate_limit_windows (rate_key, window_started_at, request_count, updated_at)
     VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(rate_key) DO UPDATE SET
       request_count = CASE
         WHEN auth_rate_limit_windows.window_started_at = ?2
         THEN auth_rate_limit_windows.request_count + 1
         ELSE 1
       END,
       window_started_at = ?2,
       updated_at = ?3
     RETURNING window_started_at, request_count`,
  ).bind(RESET_EMAIL_GLOBAL_RATE_KEY, globalWindowStartedAt, nowSeconds);
  const guard = env.AUTH_DB.prepare(
    `SELECT CASE
       WHEN (SELECT request_count FROM auth_rate_limit_windows WHERE rate_key = ?1) <= ?2
        AND (SELECT window_started_at FROM auth_rate_limit_windows WHERE rate_key = ?1) > (?3 - ?4)
        AND (SELECT request_count FROM auth_rate_limit_windows WHERE rate_key = ?5) <= ?6
        AND (SELECT window_started_at FROM auth_rate_limit_windows WHERE rate_key = ?5) = ?7
       THEN 1
       ELSE json('')
     END AS reservation_ok`,
  ).bind(
    identifierKey,
    RESET_EMAIL_MAX_ATTEMPTS,
    nowSeconds,
    RESET_EMAIL_WINDOW_SECONDS,
    RESET_EMAIL_GLOBAL_RATE_KEY,
    dailyBudget,
    globalWindowStartedAt,
  );

  try {
    const results = await env.AUTH_DB.batch<[number, number, number]>([
      incrementIdentifier,
      incrementGlobal,
      guard,
    ]);
    const identifierRow = results[0]?.results?.[0] as
      | { window_started_at?: number; request_count?: number }
      | undefined;
    const globalRow = results[1]?.results?.[0] as
      | { window_started_at?: number; request_count?: number }
      | undefined;
    const guardRow = results[2]?.results?.[0] as { reservation_ok?: number } | undefined;
    if (!isResetEmailReservationWithinLimits(
      Number(identifierRow?.request_count),
      Number(globalRow?.request_count),
      dailyBudget,
    ) || Number(guardRow?.reservation_ok) !== 1) {
      throw new Error("AUTH_RESET_EMAIL_RESERVATION_INVALID");
    }
    return {
      identifierKey,
      identifierWindowStartedAt: Number(identifierRow?.window_started_at),
      globalWindowStartedAt: Number(globalRow?.window_started_at),
    };
  } catch (error: unknown) {
    const [identifierWindow, globalWindow] = await Promise.all([
      currentRateWindow(env, identifierKey),
      currentRateWindow(env, RESET_EMAIL_GLOBAL_RATE_KEY),
    ]);
    const identifierExhausted = Boolean(
      identifierWindow &&
        nowSeconds - identifierWindow.windowStartedAt < RESET_EMAIL_WINDOW_SECONDS &&
        identifierWindow.requestCount >= RESET_EMAIL_MAX_ATTEMPTS,
    );
    const globalExhausted = Boolean(
      globalWindow &&
        globalWindow.windowStartedAt === globalWindowStartedAt &&
        globalWindow.requestCount >= dailyBudget,
    );
    if (identifierExhausted || globalExhausted) return null;
    throw error;
  }
}

async function releaseResetEmailReservation(
  env: AuthRuntimeEnv,
  reservation: ResetEmailReservation,
): Promise<void> {
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(
      `UPDATE auth_rate_limit_windows
          SET request_count = CASE WHEN request_count > 0 THEN request_count - 1 ELSE 0 END,
              updated_at = ?3
        WHERE rate_key = ?1 AND window_started_at = ?2`,
    ).bind(reservation.identifierKey, reservation.identifierWindowStartedAt, Math.floor(Date.now() / 1_000)),
    env.AUTH_DB.prepare(
      `UPDATE auth_rate_limit_windows
          SET request_count = CASE WHEN request_count > 0 THEN request_count - 1 ELSE 0 END,
              updated_at = ?3
        WHERE rate_key = ?1 AND window_started_at = ?2`,
    ).bind(RESET_EMAIL_GLOBAL_RATE_KEY, reservation.globalWindowStartedAt, Math.floor(Date.now() / 1_000)),
  ]);
}

async function waitForPasswordResetResponseFloor(startedAtMs: number): Promise<void> {
  const jitter = crypto.getRandomValues(new Uint8Array(1))[0] % (PASSWORD_RESET_RESPONSE_JITTER_MS + 1);
  const remaining = PASSWORD_RESET_RESPONSE_FLOOR_MS + jitter - (performance.now() - startedAtMs);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

async function identifierFailureAllowed(env: AuthRuntimeEnv, identifierKey: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1_000);
  const windowStartedAt = now - (now % IDENTIFIER_WINDOW_SECONDS);
  const row = await env.AUTH_DB.prepare(
    `SELECT window_started_at, request_count
       FROM auth_rate_limit_windows
      WHERE rate_key = ?1
      LIMIT 1`,
  )
    .bind(identifierKey)
    .first<{ window_started_at: number; request_count: number }>();

  return (
    !row ||
    Number(row.window_started_at) !== windowStartedAt ||
    Number(row.request_count) < IDENTIFIER_MAX_FAILURES
  );
}

async function recordIdentifierFailure(env: AuthRuntimeEnv, identifierKey: string): Promise<void> {
  const now = Math.floor(Date.now() / 1_000);
  const windowStartedAt = now - (now % IDENTIFIER_WINDOW_SECONDS);
  await env.AUTH_DB.prepare(
    `INSERT INTO auth_rate_limit_windows (rate_key, window_started_at, request_count, updated_at)
     VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(rate_key) DO UPDATE SET
       request_count = CASE
         WHEN auth_rate_limit_windows.window_started_at = excluded.window_started_at
         THEN auth_rate_limit_windows.request_count + 1
         ELSE 1
       END,
       window_started_at = excluded.window_started_at,
       updated_at = excluded.updated_at`,
  )
    .bind(identifierKey, windowStartedAt, now)
    .run();
}

function effectiveRole(value: unknown): EffectiveRole | null {
  return value === "user" || value === "admin" || value === "auditor" ? value : null;
}

function identifierRateLimiter(env: AuthRuntimeEnv): RateLimit {
  if (!env.AUTH_IDENTIFIER_RATE_LIMIT) throw new AuthConfigurationError();
  return env.AUTH_IDENTIFIER_RATE_LIMIT;
}

async function roleForUser(env: AuthRuntimeEnv, userId: string): Promise<EffectiveRole | null> {
  const row = await env.AUTH_DB.prepare(
    `SELECT role
       FROM app_user_roles
      WHERE user_id = ?1
      LIMIT 1`,
  )
    .bind(userId)
    .first<{ role: string }>();
  return effectiveRole(row?.role);
}

async function sendProductionEmail(
  emailConfig: NonNullable<RuntimeConfig["email"]>,
  input: { recipient: string; subject: string; text: string; html: string },
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${emailConfig.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: emailConfig.from,
      to: [input.recipient],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
    signal: AbortSignal.timeout(OUTBOUND_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AUTH_EMAIL_DELIVERY_HTTP_${response.status}`);
}

// This route is reachable only through the bound public Worker service.  It
// reuses the production mail provider without ever exposing its credential to
// a browser or to the public application Worker configuration.
async function handleInternalAdminExportOtpEmail(
  request: Request,
  config: RuntimeConfig,
): Promise<Response> {
  // This hostname is created only by the public Worker's service-binding
  // request. The Auth Worker has no public route/workers.dev hostname, and a
  // future accidental public attachment still fails closed here.
  if (
    request.method !== "POST" ||
    new URL(request.url).hostname !== "auth-service.internal" ||
    !config.email
  ) {
    return jsonResponse({ error: "Not found." }, 404);
  }
  const body = await readBoundedJsonBody(request);
  const recipient = normalizeEmail(body?.email);
  const otp = typeof body?.otp === "string" ? body.otp : "";
  if (!recipient || !/^\d{6}$/.test(otp)) return jsonResponse({ error: "Invalid request." }, 400);
  await sendProductionEmail(config.email, {
    recipient,
    subject: "Mã xác nhận xuất Excel HUB Planner",
    text: `Mã xác nhận xuất Excel của bạn là ${otp}. Mã có hiệu lực trong 10 phút.`,
    html: `<p>Mã xác nhận xuất Excel của bạn:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>Mã có hiệu lực trong 10 phút.</p>`,
  });
  return jsonResponse({ ok: true });
}

function accountDeleteInternalRequest(request: Request): boolean {
  return new URL(request.url).hostname === "auth-service.internal";
}

async function accountDeleteDigest(secret: string, userId: string, value: string): Promise<string> {
  return identifierDigest(secret, `${ACCOUNT_DELETE_OTP_PURPOSE}:${userId}:${value}`);
}

function accountDeleteOtp(): string {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return String(100000 + (random[0] % 900000));
}

function parseAccountDeleteState(value: string): AccountDeleteOtpState | null {
  try {
    const parsed = JSON.parse(value) as Partial<AccountDeleteOtpState>;
    return typeof parsed.hash === "string" && Number.isInteger(parsed.attempts)
      ? { hash: parsed.hash, attempts: Number(parsed.attempts) }
      : null;
  } catch {
    return null;
  }
}

async function handleInternalAccountDeleteRequestOtp(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  config: RuntimeConfig,
): Promise<Response> {
  if (request.method !== "POST" || !accountDeleteInternalRequest(request)) {
    return jsonResponse({ error: "Not found." }, 404);
  }
  const session = await betterAuthSession(auth, request);
  if (!session?.user?.id) return jsonResponse({ error: "Chưa đăng nhập." }, 401);
  if (!(await validateTurnstile(request, config, ACCOUNT_DELETE_OTP_PURPOSE))) {
    return jsonResponse({ error: "Không thể xác minh yêu cầu." }, 400);
  }
  if (!config.email) throw new AuthConfigurationError();
  const limiter = await identifierRateLimiter(env).limit({
    key: await identifierRateKey(config.betterAuthSecret, "reset", session.user.id),
  });
  if (!limiter.success) return jsonResponse({ error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." }, 429);

  const otp = accountDeleteOtp();
  const now = new Date();
  const id = crypto.randomUUID();
  const state: AccountDeleteOtpState = {
    hash: await accountDeleteDigest(config.betterAuthSecret, session.user.id, otp),
    attempts: 0,
  };
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare("DELETE FROM auth_verification WHERE identifier = ?1")
      .bind(`${ACCOUNT_DELETE_IDENTIFIER_PREFIX}${session.user.id}`),
    env.AUTH_DB.prepare(
      `INSERT INTO auth_verification
        (id, identifier, value, expires_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)`,
    ).bind(
      id,
      `${ACCOUNT_DELETE_IDENTIFIER_PREFIX}${session.user.id}`,
      JSON.stringify(state),
      new Date(now.getTime() + ACCOUNT_DELETE_OTP_TTL_MS).toISOString(),
      now.toISOString(),
    ),
  ]);
  try {
    await sendProductionEmail(config.email, {
      recipient: session.user.email,
      subject: "Mã xác nhận xóa tài khoản HUB Planner",
      text: `Mã xác nhận xóa tài khoản của bạn là ${otp}. Mã có hiệu lực trong 10 phút.`,
      html: `<p>Mã xác nhận xóa tài khoản HUB Planner:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>`,
    });
  } catch (error) {
    await env.AUTH_DB.prepare("DELETE FROM auth_verification WHERE id = ?1").bind(id).run();
    throw error;
  }
  return jsonResponse({ ok: true, expiresInSeconds: ACCOUNT_DELETE_OTP_TTL_MS / 1000 });
}

async function handleInternalAccountDeleteVerify(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  config: RuntimeConfig,
): Promise<Response> {
  if (request.method !== "POST" || !accountDeleteInternalRequest(request)) return jsonResponse({ error: "Not found." }, 404);
  const session = await betterAuthSession(auth, request);
  if (!session?.user?.id) return jsonResponse({ error: "Chưa đăng nhập." }, 401);
  const body = await readBoundedJsonBody(request);
  const otp = typeof body?.otp === "string" ? body.otp : "";
  if (!/^\d{6}$/.test(otp)) return jsonResponse({ error: "Mã xác nhận không hợp lệ hoặc đã hết hạn." }, 400);
  const identifier = `${ACCOUNT_DELETE_IDENTIFIER_PREFIX}${session.user.id}`;
  const row = await env.AUTH_DB.prepare(
    "SELECT id, value, expires_at FROM auth_verification WHERE identifier = ?1 ORDER BY created_at DESC LIMIT 1",
  ).bind(identifier).first<{ id: string; value: string; expires_at: string }>();
  const state = row ? parseAccountDeleteState(row.value) : null;
  if (!row || !state || Date.parse(row.expires_at) <= Date.now() || state.attempts >= ACCOUNT_DELETE_MAX_ATTEMPTS) {
    if (row) await env.AUTH_DB.prepare("DELETE FROM auth_verification WHERE id = ?1").bind(row.id).run();
    return jsonResponse({ error: "Mã xác nhận không hợp lệ hoặc đã hết hạn." }, 400);
  }
  const candidateHash = await accountDeleteDigest(config.betterAuthSecret, session.user.id, otp);
  if (candidateHash !== state.hash) {
    const nextAttempts = state.attempts + 1;
    if (nextAttempts >= ACCOUNT_DELETE_MAX_ATTEMPTS) {
      await env.AUTH_DB.prepare("DELETE FROM auth_verification WHERE id = ?1").bind(row.id).run();
    } else {
      await env.AUTH_DB.prepare("UPDATE auth_verification SET value = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(JSON.stringify({ ...state, attempts: nextAttempts }), new Date().toISOString(), row.id).run();
    }
    return jsonResponse({ error: "Mã xác nhận không hợp lệ hoặc đã hết hạn." }, 400);
  }

  const grant = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const grantIdentifier = `${ACCOUNT_DELETE_GRANT_PREFIX}${session.user.id}`;
  const now = new Date().toISOString();
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare("DELETE FROM auth_verification WHERE identifier = ?1").bind(grantIdentifier),
    env.AUTH_DB.prepare(
      `INSERT INTO auth_verification
        (id, identifier, value, expires_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)`,
    ).bind(
      crypto.randomUUID(), grantIdentifier,
      await accountDeleteDigest(config.betterAuthSecret, session.user.id, grant),
      new Date(Date.now() + 2 * 60_000).toISOString(), now,
    ),
  ]);
  return jsonResponse({ ok: true, userId: session.user.id, grant });
}

async function handleInternalAccountDeleteCommit(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  config: RuntimeConfig,
): Promise<Response> {
  if (request.method !== "POST" || !accountDeleteInternalRequest(request)) return jsonResponse({ error: "Not found." }, 404);
  const session = await betterAuthSession(auth, request);
  if (!session?.user?.id) return jsonResponse({ error: "Chưa đăng nhập." }, 401);
  const body = await readBoundedJsonBody(request);
  const grant = typeof body?.grant === "string" ? body.grant : "";
  if (!/^[0-9a-f-]{72}$/i.test(grant)) return jsonResponse({ error: "Yêu cầu không hợp lệ." }, 400);
  const identifier = `${ACCOUNT_DELETE_GRANT_PREFIX}${session.user.id}`;
  const row = await env.AUTH_DB.prepare(
    "SELECT value, expires_at FROM auth_verification WHERE identifier = ?1 LIMIT 1",
  ).bind(identifier).first<{ value: string; expires_at: string }>();
  const valid = row && Date.parse(row.expires_at) > Date.now()
    && row.value === await accountDeleteDigest(config.betterAuthSecret, session.user.id, grant);
  if (!valid) return jsonResponse({ error: "Yêu cầu không hợp lệ hoặc đã hết hạn." }, 400);

  const userId = session.user.id;
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare("DELETE FROM auth_verification WHERE identifier IN (?1, ?2)")
      .bind(`${ACCOUNT_DELETE_IDENTIFIER_PREFIX}${userId}`, identifier),
    env.AUTH_DB.prepare("DELETE FROM auth_session WHERE user_id = ?1").bind(userId),
    env.AUTH_DB.prepare("DELETE FROM auth_account WHERE user_id = ?1").bind(userId),
    env.AUTH_DB.prepare("DELETE FROM app_auth_identifiers WHERE user_id = ?1").bind(userId),
    env.AUTH_DB.prepare("DELETE FROM app_user_roles WHERE user_id = ?1").bind(userId),
    env.AUTH_DB.prepare("DELETE FROM auth_user WHERE id = ?1").bind(userId),
  ]);
  const remaining = await env.AUTH_DB.prepare(
    `SELECT (SELECT COUNT(*) FROM auth_user WHERE id = ?1) AS users,
            (SELECT COUNT(*) FROM auth_session WHERE user_id = ?1) AS sessions,
            (SELECT COUNT(*) FROM auth_account WHERE user_id = ?1) AS accounts`,
  ).bind(userId).first<{ users: number; sessions: number; accounts: number }>();
  if (!remaining || Number(remaining.users) + Number(remaining.sessions) + Number(remaining.accounts) !== 0) {
    throw new Error("ACCOUNT_DELETE_AUTH_POSTCONDITION_FAILED");
  }
  return jsonResponse({ ok: true, deleted: true });
}

function safeEmailFailureCode(error: unknown): string {
  if (error instanceof Error && /^AUTH_EMAIL_DELIVERY_HTTP_\d{3}$/.test(error.message)) {
    return error.message;
  }
  return "AUTH_EMAIL_DELIVERY_FAILED";
}

function scheduleProductionEmail(
  context: ExecutionContext,
  emailConfig: NonNullable<RuntimeConfig["email"]>,
  kind: "verification" | "password_reset" | "signup_otp",
  input: { recipient: string; subject: string; text: string; html: string },
): void {
  context.waitUntil(
    sendProductionEmail(emailConfig, input).catch((error: unknown) => {
      console.error(JSON.stringify({ event: "auth_email_failed", kind, code: safeEmailFailureCode(error) }));
    }),
  );
}

export function createAuthForProfile(
  env: AuthRuntimeEnv,
  context: ExecutionContext,
  profile: AuthRuntimeProfile,
  config = getRuntimeConfig(env, profile),
  requestSignals?: AuthRequestSignals,
) {
  const emailConfig = config.email;
  const googleConfig = config.google;
  // The auth instance is created per request, so this set is request-scoped.
  // It distinguishes a user created by the current signed OAuth signup state
  // from an already-existing user attempting to enter through the signup CTA.
  const oauthUsersCreatedInThisRequest = new Set<string>();
  const requireStudentOAuthUser = async (userId: string): Promise<void> => {
    const row = await env.AUTH_DB.prepare(
      "SELECT email FROM auth_user WHERE id = ? LIMIT 1",
    ).bind(userId).first<{ email: string }>();
    if (!row || !isStudentEmail(row.email)) {
      throw new APIError("FORBIDDEN", {
        code: "SIGN_UP_NOT_ALLOWED",
        message: "student account required",
      });
    }
  };

  return betterAuth({
    appName: config.appName,
    baseURL: config.origin,
    basePath: AUTH_BASE_PATH,
    secret: config.betterAuthSecret,
    trustedOrigins: config.trustedOrigins,
    database: env.AUTH_DB,
    advanced: {
      cookiePrefix: config.cookiePrefix,
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      },
      disableCSRFCheck: false,
      disableOriginCheck: false,
      database: { generateId: "uuid" },
    },
    user: {
      modelName: "auth_user",
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "auth_session",
      fields: {
        expiresAt: "expires_at",
        token: "token",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        userId: "user_id",
      },
      expiresIn: 30 * 60,
      updateAge: 15 * 60,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "auth_account",
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        scope: "scope",
        password: "password",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // Google verifies the school email. A login intent may therefore link
        // that verified identity to the existing same-email Better Auth user.
        // Signup intent is independently rejected for existing users by the
        // account/session hooks below.
        disableImplicitLinking: false,
        allowDifferentEmails: false,
        trustedProviders: [],
      },
    },
    verification: {
      modelName: "auth_verification",
      fields: {
        identifier: "identifier",
        value: "value",
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      storeVerificationIdentifier: "hashed",
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
      ...(emailConfig ? { sendResetPassword: async ({ user, url }) => {
        const isIntegrationTest = config.emailBrand === "integration-test";
        scheduleProductionEmail(context, emailConfig, "password_reset", {
          recipient: user.email,
          subject: isIntegrationTest
            ? "HUB Planner Integration authentication test — đặt lại mật khẩu"
            : "Đặt lại mật khẩu HUB Planner",
          text: isIntegrationTest
            ? `HUB Planner Integration authentication test. Mở liên kết sau để đặt lại mật khẩu: ${url}`
            : `Mở liên kết sau để đặt lại mật khẩu HUB Planner: ${url}`,
          html: isIntegrationTest
            ? `<p><strong>HUB Planner Integration authentication test.</strong></p><p><a href="${url}">Đặt lại mật khẩu kiểm thử</a></p><p>Nếu bạn không thực hiện kiểm thử này, hãy bỏ qua email.</p>`
            : `<p>Bạn đã yêu cầu đặt lại mật khẩu HUB Planner.</p><p><a href="${url}">Đặt lại mật khẩu</a></p><p>Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.</p>`,
        });
        if (requestSignals) requestSignals.passwordResetEmailScheduled = true;
      } } : {}),
    },
    ...(emailConfig && profile.kind === "production" ? { emailVerification: {
      sendOnSignUp: false,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 30 * 60,
      afterEmailVerification: async (user) => {
        const identity = normalizeStudentIdentity(user.email);
        if (!identity) {
          throw new APIError("FORBIDDEN", { code: "SIGN_UP_NOT_ALLOWED", message: "signup not allowed" });
        }
        const now = new Date().toISOString();
        await env.AUTH_DB.batch([
          env.AUTH_DB.prepare(
            `INSERT INTO app_auth_identifiers (student_code, user_id, created_at)
             SELECT ?1, ?2, ?3
              WHERE NOT EXISTS (SELECT 1 FROM app_auth_identifiers WHERE student_code = ?1)`,
          ).bind(identity.studentCode, user.id, now),
          env.AUTH_DB.prepare(
            `INSERT INTO app_user_roles (user_id, role, created_at, updated_at)
             SELECT ?1, 'user', ?2, ?2
              WHERE EXISTS (SELECT 1 FROM app_auth_identifiers WHERE student_code = ?3 AND user_id = ?1)
                AND NOT EXISTS (SELECT 1 FROM app_user_roles WHERE user_id = ?1)`,
          ).bind(user.id, now, identity.studentCode),
        ]);
        const activated = await env.AUTH_DB.prepare(
          `SELECT i.user_id
             FROM app_auth_identifiers i
             JOIN app_user_roles r ON r.user_id = i.user_id AND r.role = 'user'
            WHERE i.student_code = ?1 AND i.user_id = ?2
            LIMIT 1`,
        ).bind(identity.studentCode, user.id).first<{ user_id: string }>();
        if (!activated) {
          throw new APIError("CONFLICT", { code: "ACCOUNT_ALREADY_REGISTERED", message: "account already registered" });
        }
      },
      sendVerificationEmail: async ({ user, url }) => {
        scheduleProductionEmail(context, emailConfig, "verification", {
          recipient: user.email,
          subject: "Xác minh email HUB Planner",
          text: `Mở liên kết sau để xác minh email HUB Planner: ${url}`,
          html: `<p>Vui lòng xác minh email để sử dụng tài khoản HUB Planner.</p><p><a href="${url}">Xác minh email</a></p>`,
        });
      },
    } } : {}),
    ...(googleConfig ? { socialProviders: {
      google: {
        clientId: googleConfig.clientId,
        clientSecret: googleConfig.clientSecret,
        disableImplicitSignUp: true,
        hd: "st.buh.edu.vn",
        prompt: "select_account",
      },
    } } : {}),
    ...(emailConfig && profile.kind === "production" ? { plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: "hashed",
        resendStrategy: "rotate",
        sendVerificationOnSignUp: true,
        disableSignUp: true,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "email-verification" || !isStudentEmail(email)) return;
          scheduleProductionEmail(context, emailConfig, "signup_otp", {
            recipient: normalizeEmail(email),
            subject: "Mã xác nhận đăng ký HUB Planner",
            text: `${otp} là mã xác nhận đăng ký HUB Planner. Mã có hiệu lực trong 10 phút.`,
            html: `<p>Mã xác nhận đăng ký HUB Planner của bạn:</p><p style="font-size:30px;font-weight:800;letter-spacing:6px">${otp}</p><p>Mã có hiệu lực trong 10 phút.</p>`,
          });
        },
      }),
    ] } : {}),
    rateLimit: { enabled: false },
    ...(profile.kind === "production" ? { databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = normalizeEmail(user.email);
            const oauthState = await getOAuthState().catch(() => null);
            const canCreate = allowsProductionUserCreation({
              email,
              emailVerified: user.emailVerified === true,
              isOAuthCreation: oauthState !== null,
              oauthRequestedSignUp: oauthState?.requestSignUp === true,
            });
            if (!canCreate) {
              throw new APIError("FORBIDDEN", { code: "SIGN_UP_NOT_ALLOWED", message: "signup not allowed" });
            }
            return { data: { ...user, email } };
          },
          after: async (user) => {
            const oauthState = await getOAuthState().catch(() => null);
            if (oauthState?.requestSignUp === true) {
              oauthUsersCreatedInThisRequest.add(user.id);
            }
            // Email/password sign-up is activated only after the OTP succeeds;
            // Google sign-up is activated only after server-side password setup.
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            const oauthState = await getOAuthState().catch(() => null);
            if (oauthState !== null) {
              await requireStudentOAuthUser(account.userId);
            }
            if (shouldRejectGoogleSignupForExistingUser(
              oauthState?.requestSignUp === true,
              oauthUsersCreatedInThisRequest.has(account.userId),
            )) {
              throw new APIError("CONFLICT", {
                code: "ACCOUNT_ALREADY_REGISTERED",
                message: "account already registered",
              });
            }
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const oauthState = await getOAuthState().catch(() => null);
            if (oauthState !== null) {
              await requireStudentOAuthUser(session.userId);
            }
            if (shouldRejectGoogleSignupForExistingUser(
              oauthState?.requestSignUp === true,
              oauthUsersCreatedInThisRequest.has(session.userId),
            )) {
              throw new APIError("CONFLICT", {
                code: "ACCOUNT_ALREADY_REGISTERED",
                message: "account already registered",
              });
            }
          },
        },
      },
    } } : {}),
  });
}

async function betterAuthSession(
  auth: ReturnType<typeof createAuthForProfile>,
  request: Request,
): Promise<{ user: { id: string; email: string } } | null> {
  return (await auth.api.getSession({ headers: request.headers })) as {
    user: { id: string; email: string };
  } | null;
}

async function handleInternalSession(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  requireStaff: boolean,
): Promise<Response> {
  const session = await betterAuthSession(auth, request);
  if (!session?.user?.id) return jsonResponse({ error: "Chưa đăng nhập." }, 401);

  const role = await roleForUser(env, session.user.id);
  if (!role) {
    return jsonResponse({ error: "Đăng ký chưa hoàn tất." }, 403);
  }
  if (requireStaff && role !== "admin" && role !== "auditor") {
    return jsonResponse({ error: "Không có quyền truy cập." }, 403);
  }

  return jsonResponse({ userId: session.user.id, email: session.user.email, role });
}

async function handleMssvSignIn(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  config: RuntimeConfig,
  body: AuthBody,
): Promise<Response> {
  const identity = normalizeStudentIdentity(body.mssv);
  const studentCode = identity?.studentCode ?? "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!identity || password.length < 1 || password.length > 128) {
    return jsonResponse(GENERIC_CREDENTIAL_ERROR, 401);
  }

  const limiterKey = await identifierRateKey(config.betterAuthSecret, "mssv", studentCode);
  const nativeLimit = await identifierRateLimiter(env).limit({ key: limiterKey });
  if (!nativeLimit.success || !(await identifierFailureAllowed(env, limiterKey))) {
    return jsonResponse({ error: "Quá nhiều lần thử. Vui lòng thử lại sau." }, 429);
  }

  // MSSV resolves only the canonical student identity. Authorization remains
  // independent and reads app_user_roles after the session is established.
  const row = await env.AUTH_DB.prepare(
    `SELECT u.email
       FROM auth_user u
       LEFT JOIN app_auth_identifiers i ON i.user_id = u.id
      WHERE i.student_code = ?1 OR u.email = ?2
      LIMIT 1`,
  )
    .bind(studentCode, identity.email)
    .first<{ email: string }>();
  const resolvedEmail = normalizeEmail(row?.email);
  const email = isStudentEmail(resolvedEmail) ? resolvedEmail : "missing-auth-user@invalid.example";

  const forwardedBody: AuthBody = { email, password, rememberMe: body.rememberMe === true };
  const forwardedRequest = new Request(new URL(`${AUTH_BASE_PATH}/sign-in/email`, request.url), {
    method: request.method,
    headers: request.headers,
  });
  const response = await auth.handler(
    requestWithJsonBody(forwardedRequest, forwardedBody),
  );

  if (!response.ok) {
    await recordIdentifierFailure(env, limiterKey);
    return jsonResponse(GENERIC_CREDENTIAL_ERROR, 401);
  }

  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return jsonResponse({ ok: true }, 200, headers);
}

async function handleStaffEmailSignIn(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  config: RuntimeConfig,
  body: AuthBody,
): Promise<Response> {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (classifyLoginDispatchIdentifier(email) !== "staff" || password.length < 1 || password.length > 128) {
    return jsonResponse(GENERIC_CREDENTIAL_ERROR, 401);
  }

  const limiterKey = await identifierRateKey(config.betterAuthSecret, "login", email);
  const identifierLimit = await identifierRateLimiter(env).limit({ key: limiterKey });
  if (!identifierLimit.success || !(await identifierFailureAllowed(env, limiterKey))) {
    return jsonResponse({ error: "Quá nhiều lần thử. Vui lòng thử lại sau." }, 429);
  }

  // Resolve the allowlisted staff identity before forwarding credentials to
  // Better Auth. A non-staff credential must not establish a browser session.
  const row = await env.AUTH_DB.prepare(
    `SELECT id
       FROM auth_user
      WHERE email = ?1
      LIMIT 1`,
  )
    .bind(email)
    .first<{ id: string }>();
  const role = typeof row?.id === "string" ? await roleForUser(env, row.id) : null;
  const allowed = role === "admin" || role === "auditor";
  const forwardedBody: AuthBody = {
    email: allowed ? email : "missing-auth-user@invalid.example",
    password,
    rememberMe: body.rememberMe === true,
  };
  const forwardedRequest = new Request(new URL(`${AUTH_BASE_PATH}/sign-in/email`, request.url), {
    method: request.method,
    headers: request.headers,
  });
  const response = await auth.handler(requestWithJsonBody(forwardedRequest, forwardedBody));
  if (!response.ok) {
    await recordIdentifierFailure(env, limiterKey);
    return jsonResponse(GENERIC_CREDENTIAL_ERROR, 401);
  }

  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return jsonResponse({ ok: true }, 200, headers);
}

async function handleLoginDispatch(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  config: RuntimeConfig,
  body: AuthBody,
): Promise<Response> {
  const target = classifyLoginDispatchIdentifier(body.identifier);
  if (target === "student") {
    return handleMssvSignIn(request, env, auth, config, { ...body, mssv: body.identifier });
  }
  if (target === "staff") {
    return handleStaffEmailSignIn(request, env, auth, config, { ...body, email: body.identifier });
  }
  return jsonResponse(GENERIC_CREDENTIAL_ERROR, 401);
}

async function existingStudentUserId(
  env: AuthRuntimeEnv,
  identity: StudentIdentity,
): Promise<string | null> {
  const row = await env.AUTH_DB.prepare(
    `SELECT u.id
       FROM auth_user u
       LEFT JOIN app_auth_identifiers i ON i.user_id = u.id
      WHERE u.email = ?1 OR i.student_code = ?2
      LIMIT 1`,
  )
    .bind(identity.email, identity.studentCode)
    .first<{ id: string }>();
  return typeof row?.id === "string" ? row.id : null;
}

async function pendingStudentEmailSignupUserId(
  env: AuthRuntimeEnv,
  identity: StudentIdentity,
): Promise<string | null> {
  const row = await env.AUTH_DB.prepare(
    `SELECT u.id
       FROM auth_user u
       LEFT JOIN app_user_roles r ON r.user_id = u.id
      WHERE u.email = ?1
        AND u.email_verified = 0
        AND r.user_id IS NULL
      LIMIT 1`,
  ).bind(identity.email).first<{ id: string }>();
  return typeof row?.id === "string" ? row.id : null;
}

async function handleStudentSignUpStart(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  config: RuntimeConfig,
  body: AuthBody,
): Promise<Response> {
  const identity = normalizeStudentIdentity(body.identifier);
  const password = typeof body.password === "string" ? body.password : "";
  if (!identity || password.length < 12 || password.length > 128) {
    return jsonResponse({ error: "Thông tin đăng ký không hợp lệ." }, 400);
  }
  const signupLimit = await identifierRateLimiter(env).limit({
    key: await identifierRateKey(config.betterAuthSecret, "signup", identity.email),
  });
  if (!signupLimit.success) {
    return jsonResponse({ error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." }, 429);
  }
  if (await existingStudentUserId(env, identity)) {
    return jsonResponse({
      error: "Tài khoản đã được đăng ký. Vui lòng chuyển sang Đăng nhập.",
      code: "ACCOUNT_ALREADY_REGISTERED",
    }, 409);
  }

  const forwarded = new Request(new URL(`${AUTH_BASE_PATH}/sign-up/email`, request.url), {
    method: "POST",
    headers: request.headers,
  });
  const response = await auth.handler(requestWithJsonBody(forwarded, {
    email: identity.email,
    password,
    name: identity.studentCode,
    callbackURL: "/login?registration=verified",
    rememberMe: false,
  }));
  if (!response.ok) {
    return response.status === 422
      ? jsonResponse({
        error: "Tài khoản đã được đăng ký. Vui lòng chuyển sang Đăng nhập.",
        code: "ACCOUNT_ALREADY_REGISTERED",
      }, 409)
      : jsonResponse({ error: "Không thể bắt đầu đăng ký lúc này." }, 400);
  }
  return jsonResponse({ ok: true, expiresInSeconds: 10 * 60 });
}

async function handleStudentSignUpOtp(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  config: RuntimeConfig,
  body: AuthBody,
  operation: "verify" | "resend",
): Promise<Response> {
  const identity = normalizeStudentIdentity(body.identifier);
  if (!identity) return jsonResponse({ error: "Thông tin đăng ký không hợp lệ." }, 400);
  const otpLimit = await identifierRateLimiter(env).limit({
    key: await identifierRateKey(config.betterAuthSecret, "signup-verify", identity.email),
  });
  if (!otpLimit.success) {
    return jsonResponse({ error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." }, 429);
  }
  const userId = await pendingStudentEmailSignupUserId(env, identity);
  if (!userId) return jsonResponse({ error: "Mã xác nhận không hợp lệ hoặc đã hết hạn." }, 400);

  const path = operation === "verify"
    ? `${AUTH_BASE_PATH}/email-otp/verify-email`
    : `${AUTH_BASE_PATH}/email-otp/send-verification-otp`;
  const forwarded = new Request(new URL(path, request.url), {
    method: "POST",
    headers: request.headers,
  });
  const forwardedBody = operation === "verify"
    ? { email: identity.email, otp: String(body.otp ?? "").replace(/\D/g, "").slice(0, 6) }
    : { email: identity.email, type: "email-verification" };
  const response = await auth.handler(requestWithJsonBody(forwarded, forwardedBody));
  if (!response.ok) {
    return jsonResponse({ error: operation === "verify"
      ? "Mã xác nhận không hợp lệ hoặc đã hết hạn."
      : "Không thể gửi lại mã xác nhận lúc này." }, response.status === 429 ? 429 : 400);
  }
  return jsonResponse(operation === "verify"
    ? { ok: true }
    : { ok: true, expiresInSeconds: 10 * 60 });
}

type RegistrationStateRow = {
  role: string | null;
  student_code: string | null;
  google_accounts: number;
  credential_accounts: number;
  unexpected_accounts: number;
};

async function registrationState(
  env: AuthRuntimeEnv,
  userId: string,
): Promise<RegistrationStateRow | null> {
  return env.AUTH_DB.prepare(
    `SELECT r.role,
            i.student_code,
            SUM(CASE WHEN a.provider_id = 'google' THEN 1 ELSE 0 END) AS google_accounts,
            SUM(CASE WHEN a.provider_id = 'credential' THEN 1 ELSE 0 END) AS credential_accounts,
            SUM(CASE WHEN a.provider_id NOT IN ('google', 'credential') THEN 1 ELSE 0 END) AS unexpected_accounts
       FROM auth_user u
       LEFT JOIN app_user_roles r ON r.user_id = u.id
       LEFT JOIN app_auth_identifiers i ON i.user_id = u.id
       LEFT JOIN auth_account a ON a.user_id = u.id
      WHERE u.id = ?1
      GROUP BY u.id, r.role, i.student_code
      LIMIT 1`,
  )
    .bind(userId)
    .first<RegistrationStateRow>();
}

async function handleRegistrationStatus(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
): Promise<Response> {
  const session = await betterAuthSession(auth, request);
  if (!session?.user?.id) return jsonResponse({ error: "Chưa đăng nhập." }, 401);
  const identity = normalizeStudentIdentity(session.user.email);
  const state = await registrationState(env, session.user.id);
  if (!identity || !state || Number(state.unexpected_accounts) !== 0 || Number(state.google_accounts) !== 1) {
    return jsonResponse({ error: "Không thể hoàn tất đăng ký." }, 403);
  }
  const complete = state.role === "user" && state.student_code === identity.studentCode && Number(state.credential_accounts) === 1;
  return jsonResponse({
    complete,
    pending: !complete,
    requiresPassword: !complete,
    email: identity.email,
  });
}

async function handleRegistrationSetPassword(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  body: AuthBody,
): Promise<Response> {
  const session = await betterAuthSession(auth, request);
  if (!session?.user?.id) return jsonResponse({ error: "Chưa đăng nhập." }, 401);
  const identity = normalizeStudentIdentity(session.user.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!identity || password.length < 12 || password.length > 128) {
    return jsonResponse({ error: "Mật khẩu phải có từ 12 đến 128 ký tự." }, 400);
  }
  const state = await registrationState(env, session.user.id);
  if (!state || state.role === "admin" || state.role === "auditor" || Number(state.google_accounts) !== 1 || Number(state.unexpected_accounts) !== 0) {
    return jsonResponse({ error: "Không thể hoàn tất đăng ký." }, 403);
  }
  if (state.role === "user" && state.student_code === identity.studentCode && Number(state.credential_accounts) === 1) {
    return jsonResponse({ ok: true, complete: true });
  }
  const conflicting = await env.AUTH_DB.prepare(
    `SELECT user_id FROM app_auth_identifiers WHERE student_code = ?1 LIMIT 1`,
  ).bind(identity.studentCode).first<{ user_id: string }>();
  if (conflicting && conflicting.user_id !== session.user.id) {
    return jsonResponse({ error: "Không thể hoàn tất đăng ký." }, 409);
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(
      `INSERT INTO app_auth_identifiers (student_code, user_id, created_at)
       SELECT ?1, ?2, ?3
        WHERE NOT EXISTS (SELECT 1 FROM app_auth_identifiers WHERE student_code = ?1)
          AND EXISTS (SELECT 1 FROM auth_user WHERE id = ?2 AND email = ?4)`,
    ).bind(identity.studentCode, session.user.id, now, identity.email),
    env.AUTH_DB.prepare(
      `INSERT INTO auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       SELECT ?1, ?2, 'credential', ?2, ?3, ?4, ?4
        WHERE EXISTS (SELECT 1 FROM app_auth_identifiers WHERE student_code = ?5 AND user_id = ?2)
          AND NOT EXISTS (SELECT 1 FROM auth_account WHERE user_id = ?2 AND provider_id = 'credential')`,
    ).bind(crypto.randomUUID(), session.user.id, passwordHash, now, identity.studentCode),
    env.AUTH_DB.prepare(
      `INSERT INTO app_user_roles (user_id, role, created_at, updated_at)
       SELECT ?1, 'user', ?2, ?2
        WHERE EXISTS (SELECT 1 FROM app_auth_identifiers WHERE student_code = ?3 AND user_id = ?1)
          AND EXISTS (SELECT 1 FROM auth_account WHERE user_id = ?1 AND provider_id = 'credential')
          AND NOT EXISTS (SELECT 1 FROM app_user_roles WHERE user_id = ?1)`,
    ).bind(session.user.id, now, identity.studentCode),
  ]);
  const completed = await registrationState(env, session.user.id);
  if (!completed || completed.role !== "user" || completed.student_code !== identity.studentCode || Number(completed.credential_accounts) !== 1) {
    return jsonResponse({ error: "Không thể hoàn tất đăng ký." }, 409);
  }
  return jsonResponse({ ok: true, complete: true });
}

async function handleAuthRoute(
  request: Request,
  env: AuthRuntimeEnv,
  auth: ReturnType<typeof createAuthForProfile>,
  config: RuntimeConfig,
  requestSignals: AuthRequestSignals,
): Promise<Response> {
  const url = new URL(request.url);
  const configuredAction = getSensitiveAuthAction(url.pathname);

  if (request.method === "GET" && url.pathname === `${AUTH_BASE_PATH}/registration/status`) {
    return handleRegistrationStatus(request, env, auth);
  }

  if (url.pathname.startsWith(`${AUTH_BASE_PATH}/email-otp/`)) {
    return jsonResponse({ error: "Không tìm thấy endpoint." }, 404);
  }

  if (request.method === "POST" && configuredAction) {
    const body = await readBoundedJsonBody(request);
    if (!body) return jsonResponse({ error: "Yêu cầu không hợp lệ." }, 400);
    const action = url.pathname === `${AUTH_BASE_PATH}/sign-in/social`
      ? body.requestSignUp === true ? "google_signup" : "google_login"
      : configuredAction;
    if (url.pathname === `${AUTH_BASE_PATH}/sign-in/social`) {
      removeGoogleOAuthLoginHint(body);
    }
    if (!(await validateTurnstile(request, config, action))) {
      return jsonResponse({ error: "Không thể xác minh yêu cầu." }, 400);
    }

    if (url.pathname === `${AUTH_BASE_PATH}/mssv/sign-in`) {
      return handleMssvSignIn(request, env, auth, config, body);
    }

    if (url.pathname === `${AUTH_BASE_PATH}/login/dispatch`) {
      return handleLoginDispatch(request, env, auth, config, body);
    }

    if (url.pathname === `${AUTH_BASE_PATH}/student/sign-up/start`) {
      return handleStudentSignUpStart(request, env, auth, config, body);
    }

    if (url.pathname === `${AUTH_BASE_PATH}/student/sign-up/verify`) {
      return handleStudentSignUpOtp(request, env, auth, config, body, "verify");
    }

    if (url.pathname === `${AUTH_BASE_PATH}/student/sign-up/resend`) {
      return handleStudentSignUpOtp(request, env, auth, config, body, "resend");
    }

    if (url.pathname === `${AUTH_BASE_PATH}/registration/set-password`) {
      return handleRegistrationSetPassword(request, env, auth, body);
    }

    if (url.pathname === `${AUTH_BASE_PATH}/sign-up/email`) {
      return jsonResponse({ error: "Không tìm thấy endpoint." }, 404);
    }

    if (url.pathname === `${AUTH_BASE_PATH}/mssv/request-password-reset`) {
      const identity = normalizeStudentIdentity(body.identifier);
      body.email = identity?.email ?? "missing-auth-user@invalid.example";
    }

    const isStaffPasswordActivation = url.pathname === `${AUTH_BASE_PATH}/staff/request-password-reset`;
    if (
      url.pathname === `${AUTH_BASE_PATH}/request-password-reset` ||
      url.pathname === `${AUTH_BASE_PATH}/mssv/request-password-reset` ||
      isStaffPasswordActivation
    ) {
      const startedAtMs = performance.now();
      const email = normalizeEmail(body.email);
      const limiterKey = await identifierRateKey(config.betterAuthSecret, "reset", email);
      const identifierLimit = await identifierRateLimiter(env).limit({ key: limiterKey });
      if (!identifierLimit.success) {
        await waitForPasswordResetResponseFloor(startedAtMs);
        return jsonResponse(GENERIC_PASSWORD_RESET_RESPONSE);
      }
      const integrationSyntheticUserId = config.eligibilityPolicy === "integration-synthetic-user"
        ? config.syntheticUserId
        : undefined;
      const emailAllowedByPolicy = isStaffPasswordActivation
        ? config.eligibilityPolicy === "production-student"
        : config.eligibilityPolicy === "production-student"
          ? isStudentEmail(email)
          : Boolean(integrationSyntheticUserId);
      const eligibility = emailAllowedByPolicy
        ? await passwordResetEligibilityForEmail(env, email, integrationSyntheticUserId)
        : {
            userFound: false,
            role: null,
            totalProviders: 0,
            credentialProviders: 0,
            googleProviders: 0,
            unexpectedProviders: 0,
          } satisfies PasswordResetEligibility;
      const resetEligible = isStaffPasswordActivation
        ? isStaffPasswordActivationEligible(eligibility)
        : config.eligibilityPolicy === "integration-synthetic-user"
          ? isIntegrationSyntheticPasswordResetEligible(eligibility)
          : isPasswordResetEligible(eligibility);
      if (!emailAllowedByPolicy || !resetEligible) {
        await waitForPasswordResetResponseFloor(startedAtMs);
        return jsonResponse(GENERIC_PASSWORD_RESET_RESPONSE);
      }

      const reservation = await reserveResetEmailBudget(
        env,
        `reset-email:${limiterKey}`,
        config.resetEmailDailyBudget ?? 0,
      );
      if (!reservation) {
        await waitForPasswordResetResponseFloor(startedAtMs);
        return jsonResponse(GENERIC_PASSWORD_RESET_RESPONSE);
      }

      body.email = email;
      body.redirectTo = isStaffPasswordActivation ? "/staff/reset-password" : config.resetPage;
      requestSignals.passwordResetEmailScheduled = false;
      try {
        // The staff route is an outer authorization gate only. Better Auth
        // owns the reset-token endpoint at the canonical route below.
        const betterAuthRequest = isStaffPasswordActivation
          ? new Request(new URL(`${AUTH_BASE_PATH}/request-password-reset`, request.url), {
              method: request.method,
              headers: request.headers,
            })
          : request;
        await auth.handler(requestWithJsonBody(betterAuthRequest, body));
        if (!requestSignals.passwordResetEmailScheduled) {
          await releaseResetEmailReservation(env, reservation);
          console.error(JSON.stringify({ event: "password_reset_request_failed", code: "AUTH_RESET_REQUEST_FAILED" }));
        }
      } catch {
        await releaseResetEmailReservation(env, reservation);
        console.error(JSON.stringify({ event: "password_reset_request_failed", code: "AUTH_RESET_REQUEST_FAILED" }));
      }
      await waitForPasswordResetResponseFloor(startedAtMs);
      return jsonResponse(GENERIC_PASSWORD_RESET_RESPONSE);
    }

    if (url.pathname === `${AUTH_BASE_PATH}/send-verification-email`) {
      const email = normalizeEmail(body.email);
      if (!isStudentEmail(email)) return jsonResponse({ status: true });
      const digest = await identifierDigest(config.betterAuthSecret, email);
      const identifierLimit = await identifierRateLimiter(env).limit({ key: `email:${digest}` });
      if (!identifierLimit.success) {
        return jsonResponse({ error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." }, 429);
      }
      body.email = email;
    }

    if (url.pathname === `${AUTH_BASE_PATH}/sign-up/email`) {
      const email = normalizeEmail(body.email);
      if (!isStudentEmail(email)) return jsonResponse({ error: "Không thể tạo tài khoản." }, 400);
      body.email = email;
    }

    if (url.pathname === `${AUTH_BASE_PATH}/sign-in/email`) {
      const email = normalizeEmail(body.email);
      if (
        config.eligibilityPolicy === "integration-synthetic-user" &&
        (!config.syntheticUserId || !(await integrationSyntheticEmailMatches(env, email, config.syntheticUserId)))
      ) {
        return jsonResponse(GENERIC_CREDENTIAL_ERROR, 401);
      }
      const limiterKey = await identifierRateKey(config.betterAuthSecret, "login", email);
      const identifierLimit = await identifierRateLimiter(env).limit({ key: limiterKey });
      if (!identifierLimit.success || !(await identifierFailureAllowed(env, limiterKey))) {
        return jsonResponse({ error: "Quá nhiều lần thử. Vui lòng thử lại sau." }, 429);
      }

      body.email = email;
      const response = await auth.handler(requestWithJsonBody(request, body));
      if (!response.ok) {
        await recordIdentifierFailure(env, limiterKey);
        return jsonResponse(GENERIC_CREDENTIAL_ERROR, 401);
      }
      return withPrivateResponseHeaders(response);
    }

    const response = await auth.handler(requestWithJsonBody(request, body));
    if (url.pathname === `${AUTH_BASE_PATH}/reset-password` && response.status >= 500) {
      console.error(JSON.stringify({ event: "password_reset_submit_failed", code: "AUTH_RESET_SUBMIT_FAILED" }));
      return jsonResponse({ error: "Không thể hoàn tất đặt lại mật khẩu. Vui lòng yêu cầu liên kết mới." }, 409);
    }
    return withPrivateResponseHeaders(response);
  }

  return withPrivateResponseHeaders(await auth.handler(request));
}

export async function handleAuthRuntimeRequest(
  request: Request,
  env: AuthRuntimeEnv,
  context: ExecutionContext,
  profile: AuthRuntimeProfile,
): Promise<Response> {
  if (!isAuthEnabled(env)) {
    return jsonResponse({ error: "Auth production chưa được kích hoạt." }, 503);
  }

  const url = new URL(request.url);
  if (profile.routeSurface === "integration-synthetic-session-lifecycle") {
    if (!(await allowsIntegrationSyntheticCredentialRequest(request, profile))) {
      return jsonResponse({ error: "Not found." }, 404);
    }
  }
  if (profile.routeSurface === "integration-stage2" && !allowsIntegrationStage2Request(request)) {
    return jsonResponse({ error: "Not found." }, 404);
  }

  try {
    const config = getRuntimeConfig(env, profile);
    if (
      profile.routeSurface === "full" &&
      url.pathname === "/internal/admin-export/send-otp"
    ) {
      return handleInternalAdminExportOtpEmail(request, config);
    }
    const requestSignals: AuthRequestSignals = { passwordResetEmailScheduled: false };
    const auth = createAuthForProfile(env, context, profile, config, requestSignals);

    if (profile.routeSurface === "full") {
      if (url.pathname === "/internal/account-delete/request-otp") {
        return handleInternalAccountDeleteRequestOtp(request, env, auth, config);
      }
      if (url.pathname === "/internal/account-delete/verify") {
        return handleInternalAccountDeleteVerify(request, env, auth, config);
      }
      if (url.pathname === "/internal/account-delete/commit") {
        return handleInternalAccountDeleteCommit(request, env, auth, config);
      }
    }

    if (profile.routeSurface === "integration-synthetic-session-lifecycle") {
      return withPrivateResponseHeaders(await auth.handler(request));
    }

    if (profile.routeSurface === "integration-stage2") {
      return handleAuthRoute(request, env, auth, config, requestSignals);
    }

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, service: profile.serviceName });
    }
    if (url.pathname === "/internal/auth/session" && request.method === "GET") {
      return handleInternalSession(request, env, auth, false);
    }
    if (url.pathname === "/internal/auth/staff" && request.method === "GET") {
      return handleInternalSession(request, env, auth, true);
    }
    if (url.pathname === `${AUTH_BASE_PATH}/mssv/sign-in` || url.pathname.startsWith(`${AUTH_BASE_PATH}/`)) {
      return handleAuthRoute(request, env, auth, config, requestSignals);
    }
    return jsonResponse({ error: "Không tìm thấy endpoint." }, 404);
  } catch (error: unknown) {
    const code = error instanceof AuthConfigurationError ? "AUTH_CONFIGURATION_REQUIRED" : "AUTH_REQUEST_FAILED";
    const safePath = url.pathname.startsWith(AUTH_BASE_PATH + "/reset-password/")
      ? AUTH_BASE_PATH + "/reset-password/:token"
      : url.pathname;
    console.error(JSON.stringify({ event: "auth_request_failed", code, path: safePath }));
    return jsonResponse({ error: "Dịch vụ xác thực tạm thời chưa sẵn sàng." }, 503);
  }
}
