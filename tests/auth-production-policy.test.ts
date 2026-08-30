import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  allowsProductionUserCreation,
  getSensitiveAuthAction,
  handleAuthProductionRequest,
  identifierRateKey,
  isAuthEnabled,
  isPasswordResetEligible,
  isStaffPasswordActivationEligible,
  isResetEmailReservationWithinLimits,
  PASSWORD_RESET_LIMIT_POLICY,
  isStudentEmail,
  classifyLoginDispatchIdentifier,
  isValidStudentCode,
  normalizeEmail,
  normalizeStudentCode,
  type AuthProductionEnv,
} from "../cloudflare/auth-production-worker/src/auth-production.ts";

test("production Auth is disabled unless the gate is exactly true", async () => {
  assert.equal(isAuthEnabled({ AUTH_ENABLED: "false" }), false);
  assert.equal(isAuthEnabled({ AUTH_ENABLED: "TRUE" }), false);
  assert.equal(isAuthEnabled({ AUTH_ENABLED: "true" }), true);

  const accessedBindings: PropertyKey[] = [];
  const disabledEnv = new Proxy(
    { AUTH_ENABLED: "false" },
    {
      get(target, property, receiver) {
        accessedBindings.push(property);
        if (property !== "AUTH_ENABLED") throw new Error(`Disabled gate accessed ${String(property)}`);
        return Reflect.get(target, property, receiver);
      },
    },
  ) as AuthProductionEnv;
  const disabledContext = {
    waitUntil() {
      throw new Error("Disabled gate scheduled background work");
    },
  } as unknown as ExecutionContext;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Disabled gate performed a network request");
  };

  try {
    const response = await handleAuthProductionRequest(
      new Request("https://hotrosinhvienhub.id.vn/api/auth/sign-in/email", { method: "POST" }),
      disabledEnv,
      disabledContext,
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(accessedBindings, ["AUTH_ENABLED"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production Auth fails closed when enabled without configured secrets", async () => {
  const response = await handleAuthProductionRequest(
    new Request("https://hotrosinhvienhub.id.vn/health"),
    {
      AUTH_ENABLED: "true",
      AUTH_ORIGIN: "https://hotrosinhvienhub.id.vn",
      AUTH_TURNSTILE_EXPECTED_HOSTNAME: "hotrosinhvienhub.id.vn",
      AUTH_TURNSTILE_SITE_KEY: "CONFIGURE_BEFORE_ENABLE",
      AUTH_GOOGLE_CLIENT_ID: "CONFIGURE_BEFORE_ENABLE",
      AUTH_EMAIL_FROM: "CONFIGURE_BEFORE_ENABLE",
    } as unknown as AuthProductionEnv,
    {} as ExecutionContext,
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Dịch vụ xác thực tạm thời chưa sẵn sàng." });
});

test("student email policy normalizes server-side and rejects non-student domains", () => {
  assert.equal(normalizeEmail("  Student.001@ST.BUH.EDU.VN  "), "student.001@st.buh.edu.vn");
  assert.equal(isStudentEmail("  Student.001@ST.BUH.EDU.VN  "), true);
  assert.equal(isStudentEmail("admin@gmail.com"), false);
  assert.equal(isStudentEmail("auditor@hubplanner.com"), false);
  assert.equal(isStudentEmail("@st.buh.edu.vn"), false);
});

test("unified login dispatch preserves the student backend and gates staff by server role", () => {
  assert.equal(classifyLoginDispatchIdentifier("030841250048"), "student");
  assert.equal(classifyLoginDispatchIdentifier("030841250048@ST.BUH.EDU.VN"), "student");
  assert.equal(classifyLoginDispatchIdentifier("admin@example.invalid"), "staff");
  assert.equal(classifyLoginDispatchIdentifier("not-an-identifier"), "invalid");
  assert.equal(getSensitiveAuthAction("/api/auth/login/dispatch"), "login");

  const source = readFileSync("cloudflare/auth-production-worker/src/auth-production.ts", "utf8");
  const dispatch = source.slice(
    source.indexOf("async function handleLoginDispatch"),
    source.indexOf("async function existingStudentUserId"),
  );
  const staff = source.slice(
    source.indexOf("async function handleStaffEmailSignIn"),
    source.indexOf("async function handleLoginDispatch"),
  );
  assert.match(dispatch, /handleMssvSignIn[\s\S]*mssv: body\.identifier/);
  assert.match(dispatch, /handleStaffEmailSignIn[\s\S]*email: body\.identifier/);
  assert.match(staff, /SELECT id[\s\S]*FROM auth_user[\s\S]*WHERE email = \?1/);
  assert.match(staff, /await roleForUser\(env, row\.id\)/);
  assert.match(staff, /role === "admin" \|\| role === "auditor"/);
  assert.match(staff, /missing-auth-user@invalid\.example/);
  assert.doesNotMatch(`${dispatch}\n${staff}`, /body\.role|localStorage|sessionStorage/);
});

test("public account creation allows only students and requires explicit verified Google signup", () => {
  assert.equal(
    allowsProductionUserCreation({
      email: "student.001@st.buh.edu.vn",
      emailVerified: false,
      isOAuthCreation: false,
      oauthRequestedSignUp: false,
    }),
    true,
  );
  assert.equal(
    allowsProductionUserCreation({
      email: "student.001@st.buh.edu.vn",
      emailVerified: true,
      isOAuthCreation: true,
      oauthRequestedSignUp: true,
    }),
    true,
  );
  assert.equal(
    allowsProductionUserCreation({
      email: "student.001@st.buh.edu.vn",
      emailVerified: false,
      isOAuthCreation: true,
      oauthRequestedSignUp: true,
    }),
    false,
  );
  assert.equal(
    allowsProductionUserCreation({
      email: "new-admin@gmail.com",
      emailVerified: true,
      isOAuthCreation: true,
      oauthRequestedSignUp: true,
    }),
    false,
  );
  assert.equal(
    allowsProductionUserCreation({
      email: "new-auditor@hubplanner.com",
      emailVerified: true,
      isOAuthCreation: true,
      oauthRequestedSignUp: true,
    }),
    false,
  );
});

test("password recovery eligibility supports password and Google student accounts but excludes privileged states", () => {
  const eligibleNoProvider = {
    userFound: true, role: "user" as const, totalProviders: 0,
    credentialProviders: 0, googleProviders: 0, unexpectedProviders: 0,
  };
  assert.equal(isPasswordResetEligible(eligibleNoProvider), true);
  assert.equal(isPasswordResetEligible({ ...eligibleNoProvider, totalProviders: 1, credentialProviders: 1 }), true);
  assert.equal(isPasswordResetEligible({ ...eligibleNoProvider, totalProviders: 1, googleProviders: 1 }), true);
  assert.equal(isPasswordResetEligible({ ...eligibleNoProvider, role: "auditor" }), false);
  assert.equal(isPasswordResetEligible({ ...eligibleNoProvider, role: "admin" }), false);
  assert.equal(isPasswordResetEligible({ ...eligibleNoProvider, userFound: false }), false);
  assert.equal(isPasswordResetEligible({ ...eligibleNoProvider, totalProviders: 1, unexpectedProviders: 1 }), false);
});

test("staff credential activation is role-mapped server-side and does not loosen student recovery", () => {
  const base = {
    userFound: true, totalProviders: 0, credentialProviders: 0,
    googleProviders: 0, unexpectedProviders: 0,
  };
  assert.equal(isStaffPasswordActivationEligible({ ...base, role: "admin" }), true);
  assert.equal(isStaffPasswordActivationEligible({ ...base, role: "auditor" }), true);
  assert.equal(isStaffPasswordActivationEligible({ ...base, role: "user" }), false);
  assert.equal(isStaffPasswordActivationEligible({ ...base, role: null }), false);
  assert.equal(isStaffPasswordActivationEligible({ ...base, role: "admin", userFound: false }), false);
  assert.equal(isPasswordResetEligible({ ...base, role: "admin" }), false);
  assert.equal(isPasswordResetEligible({ ...base, role: "auditor" }), false);
});

test("identifier limiter HMAC keys are purpose-separated and contain no raw email", async () => {
  const email = "student.001@st.buh.edu.vn";
  const login = await identifierRateKey("test-only-hmac-secret", "login", email);
  const reset = await identifierRateKey("test-only-hmac-secret", "reset", email);
  assert.notEqual(login, reset);
  assert.match(login, /^login:[0-9a-f]{64}$/);
  assert.match(reset, /^reset:[0-9a-f]{64}$/);
  assert.equal(login.includes(email), false);
  assert.deepEqual(PASSWORD_RESET_LIMIT_POLICY, {
    identifierEmailsPerHour: 3,
    identifierNativeRequestsPerMinute: 8,
    defaultGlobalEmailsPerDay: 80,
  });
});

test("precise reset email caps accept 3/hour and 80/day but reject the next reservation", () => {
  assert.equal(isResetEmailReservationWithinLimits(3, 80, 80), true);
  assert.equal(isResetEmailReservationWithinLimits(4, 80, 80), false);
  assert.equal(isResetEmailReservationWithinLimits(3, 81, 80), false);
});

test("MSSV normalization is deterministic and malformed input is rejected", () => {
  assert.equal(normalizeStudentCode("  preview-mssv-001  "), "PREVIEW-MSSV-001");
  assert.equal(normalizeStudentCode("０３０８"), "0308");
  assert.equal(isValidStudentCode("PREVIEW-MSSV-001"), true);
  assert.equal(isValidStudentCode("' OR 1=1 --"), false);
  assert.equal(isValidStudentCode("<SCRIPT>"), false);
  assert.equal(isValidStudentCode("A".repeat(65)), false);
});

test("sensitive routes have fixed Turnstile actions", () => {
  assert.equal(getSensitiveAuthAction("/api/auth/sign-up/email"), "signup");
  assert.equal(getSensitiveAuthAction("/api/auth/sign-in/email"), "login");
  assert.equal(getSensitiveAuthAction("/api/auth/login/dispatch"), "login");
  assert.equal(getSensitiveAuthAction("/api/auth/sign-in/social"), "google_login");
  assert.equal(getSensitiveAuthAction("/api/auth/link-social"), "google_link");
  assert.equal(getSensitiveAuthAction("/api/auth/send-verification-email"), "verify_email");
  assert.equal(getSensitiveAuthAction("/api/auth/request-password-reset"), "forgot_password");
  assert.equal(getSensitiveAuthAction("/api/auth/staff/request-password-reset"), "forgot_password");
  assert.equal(getSensitiveAuthAction("/api/auth/reset-password"), "reset_password");
  assert.equal(getSensitiveAuthAction("/api/auth/mssv/sign-in"), "login");
  assert.equal(getSensitiveAuthAction("/api/auth/callback/google"), null);
});

test("production source matches the deployed D1 limiter schema and bounds outbound email", () => {
  const source = readFileSync(
    new URL("../cloudflare/auth-production-worker/src/auth-production.ts", import.meta.url),
    "utf8",
  );
  const mssvHandler = source.slice(
    source.indexOf("async function handleMssvSignIn"),
    source.indexOf("async function existingStudentUserId"),
  );

  assert.match(source, /IDENTIFIER_WINDOW_SECONDS = 5 \* 60/);
  assert.match(source, /IDENTIFIER_MAX_FAILURES = 8/);
  assert.match(source, /INSERT INTO auth_rate_limit_windows \(rate_key, window_started_at, request_count, updated_at\)/);
  assert.doesNotMatch(source, /identifier_key|failure_count/);
  assert.doesNotMatch(mssvHandler, /JOIN app_user_roles/);
  assert.match(source, /https:\/\/api\.resend\.com\/emails[\s\S]*?signal: AbortSignal\.timeout\(OUTBOUND_FETCH_TIMEOUT_MS\)/);
  assert.match(source, /context\.waitUntil\([\s\S]*?sendProductionEmail\(emailConfig, input\)\.catch/);
  assert.doesNotMatch(source, /AUTH_IP_RATE_LIMIT|cf-connecting-ip|remoteip/);
  assert.match(source, /identifierRateLimiter\(env\)\.limit/);
  assert.match(source, /identifierFailureAllowed[\s\S]*recordIdentifierFailure/);
  assert.match(source, /PASSWORD_RESET_RESPONSE_FLOOR_MS = 180/);
  assert.match(source, /PASSWORD_RESET_RESPONSE_JITTER_MS = 24/);
  assert.match(source, /reset-email:global/);
  assert.match(source, /AUTH_RESET_EMAIL_DAILY_BUDGET/);
  assert.match(source, /AUTH_DB\.batch<[\s\S]*?incrementIdentifier,[\s\S]*?incrementGlobal,[\s\S]*?guard/);
  assert.match(source, /body\.redirectTo = isStaffPasswordActivation \? "\/staff\/reset-password" : config\.resetPage/);
  assert.match(source, /isStaffPasswordActivationEligible\(eligibility\)/);
  assert.match(source, /isStaffPasswordActivation \? "\/staff\/reset-password" : config\.resetPage/);
  assert.match(source, /isStaffPasswordActivation\s*\? new Request\(new URL\(`\$\{AUTH_BASE_PATH\}\/request-password-reset`, request\.url\)/);
  assert.match(source, /auth\.handler\(requestWithJsonBody\(betterAuthRequest, body\)\)/);
  assert.match(source, /requestSignals\.passwordResetEmailScheduled/);
  assert.match(source, /reset-password\/:token/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:user\.email|body\.email|recipient|verificationToken)/i);
});

test("credential uniqueness migration has a duplicate precondition and Better Auth tuple compatibility", () => {
  const migration = readFileSync(
    "cloudflare/auth-production-migrations/0001_unique_auth_account_provider_account.sql",
    "utf8",
  );
  assert.match(migration, /GROUP BY provider_id, account_id/);
  assert.match(migration, /HAVING COUNT\(\*\) > 1/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS auth_account_provider_account_unique/);
  assert.match(migration, /ON auth_account \(provider_id, account_id\)/);
  assert.doesNotMatch(migration, /DELETE|UPDATE|INSERT/i);

  const betterAuth = readFileSync("node_modules/better-auth/dist/api/routes/password.mjs", "utf8");
  assert.match(betterAuth, /providerId: "credential"/);
  assert.match(betterAuth, /accountId: userId/);
  assert.match(betterAuth, /findAccounts\(userId\)/);
  assert.match(betterAuth, /deleteUserSessions\(userId\)/);

  const production = readFileSync(
    "cloudflare/auth-production-worker/src/auth-production.ts",
    "utf8",
  );
  const routeHandler = production.slice(
    production.indexOf("async function handleAuthRoute"),
    production.indexOf("export async function handleAuthRuntimeRequest"),
  );
  assert.match(routeHandler, /reset-password[\s\S]*response\.status >= 500[\s\S]*409/);
  assert.doesNotMatch(routeHandler, /INSERT INTO auth_user|INSERT INTO app_user_roles/);
});

test("request-reset eligibility and quota outcomes share one public response shape", () => {
  const source = readFileSync(
    "cloudflare/auth-production-worker/src/auth-production.ts",
    "utf8",
  );
  const resetBranch = source.slice(
    source.indexOf('url.pathname === `${AUTH_BASE_PATH}/request-password-reset`'),
    source.indexOf('if (url.pathname === `${AUTH_BASE_PATH}/send-verification-email`)'),
  );
  assert.equal((resetBranch.match(/jsonResponse\(GENERIC_PASSWORD_RESET_RESPONSE\)/g) || []).length, 4);
  assert.doesNotMatch(resetBranch, /USER_NOT_FOUND|Google-only|auditor|admin/);
});

test("production recovery config declares only the required secrets and remains private", () => {
  const config = JSON.parse(
    readFileSync(
      new URL("../cloudflare/wrangler.auth-production.jsonc", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;

  assert.deepEqual(config.secrets, {
    required: [
      "AUTH_BETTER_AUTH_SECRET",
      "AUTH_TURNSTILE_SECRET",
      "AUTH_GOOGLE_CLIENT_SECRET",
      "AUTH_RESEND_API_KEY",
    ],
  });
  assert.equal((config.vars as Record<string, unknown>).AUTH_ENABLED, "true");
  assert.equal((config.vars as Record<string, unknown>).AUTH_RESET_EMAIL_DAILY_BUDGET, "80");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.ratelimits, [
    {
      name: "AUTH_IDENTIFIER_RATE_LIMIT",
      namespace_id: "45871912",
      simple: { limit: 8, period: 60 },
    },
  ]);
  for (const forbiddenKey of ["route", "routes", "services", "assets", "triggers", "crons"]) {
    assert.equal(Object.hasOwn(config, forbiddenKey), false, `Unexpected public trigger: ${forbiddenKey}`);
  }
});
