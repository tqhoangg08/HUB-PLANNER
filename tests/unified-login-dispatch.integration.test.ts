import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { hashPassword } from "better-auth/crypto";

import {
  handleAuthProductionRequest,
  type AuthProductionEnv,
} from "../cloudflare/auth-production-worker/src/auth-production.ts";

const ORIGIN = "https://hotrosinhvienhub.id.vn";
const PASSWORD = "test-only-password-123";

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
      all: async <T>() => {
        const result = database.prepare(sql).all(...values) as T[];
        return { results: result, meta: { changes: 0, last_row_id: null } };
      },
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

const createEnvironment = (database: DatabaseSync): AuthProductionEnv => ({
  AUTH_ENABLED: "true",
  AUTH_DB: d1Adapter(database),
  AUTH_IDENTIFIER_RATE_LIMIT: { limit: async () => ({ success: true }) } as RateLimit,
  AUTH_BETTER_AUTH_SECRET: "test-better-auth-secret-that-is-long-enough-for-unified-login",
  AUTH_ORIGIN: ORIGIN,
  AUTH_TURNSTILE_EXPECTED_HOSTNAME: "hotrosinhvienhub.id.vn",
  AUTH_TURNSTILE_SITE_KEY: "test-public-site-key",
  AUTH_TURNSTILE_SECRET: "test-turnstile-secret",
  AUTH_GOOGLE_CLIENT_ID: "test-google-client-id.apps.googleusercontent.com",
  AUTH_GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  AUTH_EMAIL_FROM: "HUB Planner <no-reply@hotrosinhvienhub.id.vn>",
  AUTH_RESEND_API_KEY: "test-resend-api-key",
  AUTH_RESET_EMAIL_DAILY_BUDGET: "80",
});

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
    CREATE TABLE app_auth_identifiers (user_id TEXT NOT NULL, student_code TEXT UNIQUE);
    CREATE TABLE app_user_roles (
      user_id TEXT PRIMARY KEY, role TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES auth_user(id) ON DELETE CASCADE
    );
    CREATE TABLE auth_rate_limit_windows (
      rate_key TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL, request_count INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  return database;
};

const seedCredentialUser = async (
  database: DatabaseSync,
  userId: string,
  email: string,
  role: "user" | "admin" | "auditor",
  studentCode?: string,
) => {
  const now = new Date().toISOString();
  database.prepare(
    "INSERT INTO auth_user (id, name, email, email_verified, image, created_at, updated_at) VALUES (?, ?, ?, 1, NULL, ?, ?)",
  ).run(userId, "Test identity", email, now, now);
  database.prepare(
    "INSERT INTO auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)",
  ).run(`${userId}-credential`, userId, userId, await hashPassword(PASSWORD), now, now);
  database.prepare(
    "INSERT INTO app_user_roles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)",
  ).run(userId, role, now, now);
  if (studentCode) {
    database.prepare("INSERT INTO app_auth_identifiers (user_id, student_code) VALUES (?, ?)").run(userId, studentCode);
  }
};

const dispatch = async (env: AuthProductionEnv, identifier: string) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    return Response.json({ success: true, action: "login", hostname: "hotrosinhvienhub.id.vn" });
  };
  try {
    return await handleAuthProductionRequest(
      new Request(`${ORIGIN}/api/auth/login/dispatch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-turnstile-token": "test-token",
        },
        body: JSON.stringify({ identifier, password: PASSWORD, rememberMe: true }),
      }),
      env,
      { waitUntil() {} } as ExecutionContext,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test("unified dispatch keeps the student backend separate and accepts mapped staff only", async () => {
  const database = createDatabase();
  try {
    await seedCredentialUser(database, "student-id", "030841250048@st.buh.edu.vn", "user", "030841250048");
    await seedCredentialUser(database, "admin-id", "admin@example.invalid", "admin");
    await seedCredentialUser(database, "auditor-id", "auditor@example.invalid", "auditor");
    await seedCredentialUser(database, "ordinary-id", "ordinary@example.invalid", "user");
    const env = createEnvironment(database);

    for (const identifier of ["030841250048", "030841250048@st.buh.edu.vn", "admin@example.invalid", "auditor@example.invalid"]) {
      const response = await dispatch(env, identifier);
      assert.equal(response.status, 200, identifier);
    }
    const rejected = await dispatch(env, "ordinary@example.invalid");
    assert.equal(rejected.status, 401);
    assert.deepEqual(await rejected.json(), {
      ok: false,
      error: "Thông tin đăng nhập không hợp lệ.",
    });
    const sessionCount = database.prepare("SELECT COUNT(*) AS count FROM auth_session").get() as { count: number };
    assert.equal(sessionCount.count, 4, "non-staff credentials must not create a session");
  } finally {
    database.close();
  }
});
