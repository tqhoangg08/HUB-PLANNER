import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  PRODUCTION_AUTH_PROFILE,
  createAuthForProfile,
  getRuntimeConfig,
  handleAuthProductionRequest,
  handleInternalSession,
  type AuthProductionEnv,
} from "../cloudflare/auth-production-worker/src/auth-production.ts";

const ORIGIN = "https://hotrosinhvienhub.id.vn";
const STUDENT_EMAIL = "030841250048@st.buh.edu.vn";

type BoundStatement = {
  bind: (...values: unknown[]) => BoundStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[]; meta: { changes: number; last_row_id: number | null } }>;
  run: () => Promise<{ success: true; meta: { changes: number } }>;
};

const d1Adapter = (database: DatabaseSync) => ({
  prepare(sql: string): BoundStatement {
    let values: unknown[] = [];
    const statement: BoundStatement = {
      bind: (...next) => {
        values = next;
        return statement;
      },
      first: async <T>() => (database.prepare(sql).get(...values) as T | undefined) ?? null,
      all: async <T>() => ({
        results: database.prepare(sql).all(...values) as T[],
        meta: { changes: 0, last_row_id: null },
      }),
      run: async () => {
        const result = database.prepare(sql).run(...values);
        return { success: true as const, meta: { changes: Number(result.changes) } };
      },
    };
    return statement;
  },
  batch: async (statements: BoundStatement[]) => Promise.all(statements.map((statement) => statement.all<unknown>())),
  exec: async (sql: string) => {
    database.exec(sql);
    return { count: 0, duration: 0 };
  },
}) as unknown as D1Database;

const createDatabase = () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE auth_user (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL, image TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE auth_account (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL,
      access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at TEXT,
      refresh_token_expires_at TEXT, scope TEXT, password TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(provider_id, account_id), UNIQUE(user_id, provider_id),
      FOREIGN KEY (user_id) REFERENCES auth_user(id) ON DELETE CASCADE
    );
    CREATE TABLE auth_session (
      id TEXT PRIMARY KEY, expires_at TEXT NOT NULL, token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, ip_address TEXT, user_agent TEXT, user_id TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES auth_user(id) ON DELETE CASCADE
    );
    CREATE TABLE auth_verification (
      id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE app_auth_identifiers (user_id TEXT NOT NULL, student_code TEXT UNIQUE, created_at TEXT);
    CREATE TABLE app_user_roles (user_id TEXT PRIMARY KEY, role TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    -- Keep this in-memory Auth D1 fixture aligned with migration 0004. Internal
    -- creator provenance intentionally has no FK because creator accounts can
    -- later be deleted while audit history must remain durable.
    CREATE TABLE app_internal_accounts (
      user_id TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user','admin','auditor')),
      purpose TEXT NOT NULL CHECK (purpose IN ('test','demo','qa','internal')),
      status TEXT NOT NULL CHECK (status IN ('active','disabled')) DEFAULT 'active',
      expires_at TEXT,
      exclude_from_student_stats INTEGER NOT NULL DEFAULT 1 CHECK (exclude_from_student_stats IN (1)),
      receive_broadcast INTEGER NOT NULL DEFAULT 0 CHECK (receive_broadcast IN (0,1)),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE auth_rate_limit_windows (
      rate_key TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  return database;
};

const createEnv = (database: DatabaseSync) => ({
    AUTH_ENABLED: "true",
    AUTH_DB: d1Adapter(database),
    AUTH_IDENTIFIER_RATE_LIMIT: {
      limit: async () => ({ success: true }),
    } as unknown as RateLimit,
    AUTH_BETTER_AUTH_SECRET: "test-better-auth-secret-that-is-long-enough-for-google-linking",
    AUTH_ORIGIN: ORIGIN,
    AUTH_TURNSTILE_EXPECTED_HOSTNAME: "hotrosinhvienhub.id.vn",
    AUTH_TURNSTILE_SITE_KEY: "test-public-site-key",
    AUTH_TURNSTILE_SECRET: "test-turnstile-secret",
    AUTH_GOOGLE_CLIENT_ID: "test-google-client-id.apps.googleusercontent.com",
    AUTH_GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    AUTH_EMAIL_FROM: "HUB Planner <no-reply@hotrosinhvienhub.id.vn>",
    AUTH_RESEND_API_KEY: "test-resend-api-key",
    AUTH_RESET_EMAIL_DAILY_BUDGET: "80",
  } as AuthProductionEnv);

const createAuth = (database: DatabaseSync) => {
  const env = createEnv(database);
  return createAuthForProfile(
    env,
    { waitUntil() {} } as ExecutionContext,
    PRODUCTION_AUTH_PROFILE,
    getRuntimeConfig(env, PRODUCTION_AUTH_PROFILE),
  );
};

const tokenFor = (email: string, subject: string, verified = true) => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: subject,
    email,
    email_verified: verified,
    hd: "st.buh.edu.vn",
    name: "Test student",
  })).toString("base64url");
  return `${header}.${payload}.signature`;
};

const beginGoogle = async (auth: ReturnType<typeof createAuthForProfile>, requestSignUp: boolean) => {
  const response = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      provider: "google",
      requestSignUp,
      callbackURL: "/dashboard",
      newUserCallbackURL: "/complete-registration",
      errorCallbackURL: `/login?oauth=${requestSignUp ? "signup" : "login"}-error`,
    }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json() as { url: string };
  return {
    state: new URL(payload.url).searchParams.get("state") ?? "",
    cookie: response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; "),
  };
};

const completeGoogle = async (
  auth: ReturnType<typeof createAuthForProfile>,
  oauth: { state: string; cookie: string },
  email: string,
  subject: string,
  verified = true,
) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(new URL(String(input)).origin, "https://oauth2.googleapis.com");
    return Response.json({ access_token: "test-access-token", token_type: "Bearer", id_token: tokenFor(email, subject, verified) });
  };
  try {
    return await auth.handler(new Request(`${ORIGIN}/api/auth/callback/google?code=test-code&state=${encodeURIComponent(oauth.state)}`, {
      headers: { cookie: oauth.cookie },
    }));
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const productionRequest = (
  database: DatabaseSync,
  path: string,
  init: RequestInit = {},
) => handleAuthProductionRequest(
  new Request(`${ORIGIN}${path}`, init),
  createEnv(database),
  { waitUntil() {} } as ExecutionContext,
);

test("verified exact-email Google sign-in links an existing local user once and creates sessions", async () => {
  const database = createDatabase();
  try {
    const now = new Date().toISOString();
    database.prepare("INSERT INTO auth_user VALUES (?, ?, ?, 0, NULL, ?, ?)").run("existing-user", "Existing student", STUDENT_EMAIL, now, now);
    database.prepare("INSERT INTO auth_account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?)")
      .run("credential-account", "existing-user", "existing-user", now, now);
    database.prepare("INSERT INTO app_user_roles VALUES (?, 'user', ?, ?)").run("existing-user", now, now);
    const auth = createAuth(database);

    const firstState = await beginGoogle(auth, false);
    const first = await completeGoogle(auth, firstState, STUDENT_EMAIL, "google-subject-existing");
    assert.equal(first.status, 302);
    assert.equal(new URL(first.headers.get("location") ?? "", ORIGIN).pathname, "/dashboard");
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_user").get() as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_account WHERE provider_id = 'google' AND user_id = 'existing-user'").get() as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT email_verified FROM auth_user WHERE id = 'existing-user'").get() as { email_verified: number }).email_verified, 1);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_session WHERE user_id = 'existing-user'").get() as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT role FROM app_user_roles WHERE user_id = 'existing-user'").get() as { role: string }).role, "user");
    const sessionCookie = first.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    const restored = await auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: sessionCookie } }));
    assert.equal(restored.status, 200);
    assert.equal(((await restored.json()) as { user: { id: string } }).user.id, "existing-user");

    const secondState = await beginGoogle(auth, false);
    const second = await completeGoogle(auth, secondState, STUDENT_EMAIL, "google-subject-existing");
    assert.equal(second.status, 302);
    assert.equal(new URL(second.headers.get("location") ?? "", ORIGIN).pathname, "/dashboard");
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_user").get() as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_account WHERE provider_id = 'google' AND user_id = 'existing-user'").get() as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_session WHERE user_id = 'existing-user'").get() as { count: number }).count, 2);
    assert.equal((database.prepare("SELECT role FROM app_user_roles WHERE user_id = 'existing-user'").get() as { role: string }).role, "user");
  } finally {
    database.close();
  }
});

test("Google preserves the existing sign-in/sign-up intent policy without cross-email linking", async () => {
  const database = createDatabase();
  try {
    const auth = createAuth(database);
    const signInState = await beginGoogle(auth, false);
    const signIn = await completeGoogle(auth, signInState, "030841250049@st.buh.edu.vn", "new-google-signin");
    assert.equal(signIn.status, 302);
    assert.match(signIn.headers.get("location") ?? "", /oauth=login-error/);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_user").get() as { count: number }).count, 0);

    const signupState = await beginGoogle(auth, true);
    const signup = await completeGoogle(auth, signupState, "030841250049@st.buh.edu.vn", "new-google-signup");
    assert.equal(signup.status, 302);
    assert.equal(new URL(signup.headers.get("location") ?? "", ORIGIN).pathname, "/complete-registration");
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_user").get() as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_account WHERE provider_id = 'google'").get() as { count: number }).count, 1);
  } finally {
    database.close();
  }
});

test("Google never links an unverified or different-email provider account to an existing user", async () => {
  const database = createDatabase();
  try {
    const now = new Date().toISOString();
    database.prepare("INSERT INTO auth_user VALUES (?, ?, ?, 1, NULL, ?, ?)").run("existing-user", "Existing student", STUDENT_EMAIL, now, now);
    database.prepare("INSERT INTO app_user_roles VALUES (?, 'user', ?, ?)").run("existing-user", now, now);
    const auth = createAuth(database);

    const unverifiedState = await beginGoogle(auth, false);
    const unverified = await completeGoogle(auth, unverifiedState, STUDENT_EMAIL, "unverified-google-subject", false);
    assert.equal(unverified.status, 302);
    assert.match(unverified.headers.get("location") ?? "", /oauth=login-error/);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_account WHERE provider_id = 'google'").get() as { count: number }).count, 0);

    const differentState = await beginGoogle(auth, true);
    const different = await completeGoogle(auth, differentState, "030841250049@st.buh.edu.vn", "different-google-subject");
    assert.equal(different.status, 302);
    assert.equal(new URL(different.headers.get("location") ?? "", ORIGIN).pathname, "/complete-registration");
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_user").get() as { count: number }).count, 2);
    assert.notEqual((database.prepare("SELECT user_id FROM auth_account WHERE provider_id = 'google'").get() as { user_id: string }).user_id, "existing-user");
  } finally {
    database.close();
  }
});

test("verified existing Google session receives least-privilege private identity when a legacy role row is missing", async () => {
  const database = createDatabase();
  try {
    const now = new Date().toISOString();
    database.prepare("INSERT INTO auth_user VALUES (?, ?, ?, 1, NULL, ?, ?)")
      .run("existing-google-user", "Existing Google student", STUDENT_EMAIL, now, now);
    database.prepare("INSERT INTO auth_account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, 'google', ?, ?, ?)")
      .run("google-account", "google-subject-existing", "existing-google-user", now, now);
    const env = createEnv(database);
    const auth = createAuthForProfile(
      env,
      { waitUntil() {} } as ExecutionContext,
      PRODUCTION_AUTH_PROFILE,
      getRuntimeConfig(env, PRODUCTION_AUTH_PROFILE),
    );

    const oauth = await beginGoogle(auth, false);
    const callback = await completeGoogle(auth, oauth, STUDENT_EMAIL, "google-subject-existing");
    assert.equal(callback.status, 302);
    const cookie = callback.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    const identity = await handleInternalSession(
      new Request("https://auth-service.internal/internal/auth/session", { headers: { cookie } }),
      env,
      auth,
      false,
    );
    assert.equal(identity.status, 200);
    assert.deepEqual(await identity.json(), {
      userId: "existing-google-user",
      email: STUDENT_EMAIL,
      role: "user",
    });
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM app_user_roles").get() as { count: number }).count, 0);

    const staff = await handleInternalSession(
      new Request("https://auth-service.internal/internal/auth/staff", { headers: { cookie } }),
      env,
      auth,
      true,
    );
    assert.equal(staff.status, 403);
  } finally {
    database.close();
  }
});

test("Google-only HUB user is server-gated until password setup and can then sign in by MSSV", async () => {
  const database = createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const now = new Date().toISOString();
    database.prepare("INSERT INTO auth_user VALUES (?, ?, ?, 1, NULL, ?, ?)")
      .run("google-only-user", "Google-only student", STUDENT_EMAIL, now, now);
    database.prepare("INSERT INTO auth_account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, 'google', ?, ?, ?)")
      .run("google-account", "google-only-subject", "google-only-user", now, now);
    database.prepare("INSERT INTO app_auth_identifiers VALUES (?, ?, ?)")
      .run("google-only-user", "030841250048", now);
    database.prepare("INSERT INTO app_user_roles VALUES (?, 'user', ?, ?)")
      .run("google-only-user", now, now);

    const auth = createAuth(database);
    const oauth = await beginGoogle(auth, false);
    const callback = await completeGoogle(auth, oauth, STUDENT_EMAIL, "google-only-subject");
    assert.equal(callback.status, 302);
    assert.equal(new URL(callback.headers.get("location") ?? "", ORIGIN).pathname, "/dashboard");
    const cookie = callback.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const status = await productionRequest(database, "/api/auth/registration/status", {
        headers: { cookie },
      });
      assert.equal(status.status, 200);
      assert.deepEqual(await status.json(), {
        complete: false,
        pending: true,
        requiresPassword: true,
        needsPasswordSetup: true,
        email: STUDENT_EMAIL,
      });
    }

    globalThis.fetch = async (input) => {
      assert.equal(new URL(String(input)).hostname, "challenges.cloudflare.com");
      return Response.json({
        success: true,
        action: "signup_password",
        hostname: "hotrosinhvienhub.id.vn",
      });
    };
    const password = "safe-password-123";
    const setup = await productionRequest(database, "/api/auth/registration/set-password", {
      method: "POST",
      headers: {
        cookie,
        origin: ORIGIN,
        "content-type": "application/json",
        "x-turnstile-token": "test-turnstile-token",
      },
      body: JSON.stringify({ password }),
    });
    assert.equal(setup.status, 200);
    assert.deepEqual(await setup.json(), { ok: true, complete: true });

    const credential = database.prepare(
      "SELECT password FROM auth_account WHERE user_id = ? AND provider_id = 'credential'",
    ).get("google-only-user") as { password: string };
    assert.ok(credential.password);
    assert.notEqual(credential.password, password);

    const completed = await productionRequest(database, "/api/auth/registration/status", {
      headers: { cookie },
    });
    assert.equal(completed.status, 200);
    assert.deepEqual(await completed.json(), {
      complete: true,
      pending: false,
      requiresPassword: false,
      needsPasswordSetup: false,
      email: STUDENT_EMAIL,
    });

    globalThis.fetch = async (input) => {
      assert.equal(new URL(String(input)).hostname, "challenges.cloudflare.com");
      return Response.json({
        success: true,
        action: "login",
        hostname: "hotrosinhvienhub.id.vn",
      });
    };
    const mssvLogin = await productionRequest(database, "/api/auth/mssv/sign-in", {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-turnstile-token": "test-turnstile-token",
      },
      body: JSON.stringify({ mssv: "030841250048", password, rememberMe: true }),
    });
    assert.equal(mssvLogin.status, 200);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_user").get() as { count: number }).count, 1);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM auth_account WHERE user_id = 'google-only-user'").get() as { count: number }).count, 2);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
