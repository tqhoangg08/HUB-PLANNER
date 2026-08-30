import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import {
  HISTORICAL_SYNTHETIC_USER_ID,
  INTEGRATION_DATABASE_NAME,
  IntegrationD1Error,
  assertIntegrationDatabaseGuard,
  fail,
  queryIntegrationReadOnly,
  requireCount,
  requireForeignKeysClean,
  rowsFrom,
  runIntegrationD1,
  sqlLiteral,
} from "./integration-auth-d1.mjs";

function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) fail("INTERACTIVE_TERMINAL_REQUIRED");
  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const cleanup = () => {
      input.removeListener("data", onData);
      if (typeof input.setRawMode === "function") input.setRawMode(false);
      input.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new IntegrationD1Error("INPUT_CANCELLED"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\b" || character === "\u007f") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    process.stderr.write(label);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function normalizeRecipientEmail(value) {
  const email = String(value).trim().normalize("NFKC").toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("RECIPIENT_EMAIL_INVALID");
  }
  return email;
}

const preflightSql = `
SELECT
  (SELECT COUNT(*) FROM auth_user) AS user_count,
  (SELECT COUNT(*) FROM auth_account) AS account_count,
  (SELECT COUNT(*) FROM app_user_roles) AS role_count,
  (SELECT COUNT(*) FROM auth_session) AS session_count,
  (SELECT COUNT(*) FROM auth_verification) AS verification_count,
  (SELECT COUNT(*) FROM app_auth_identifiers) AS identifier_count,
  (SELECT COUNT(*) FROM auth_rate_limit_windows) AS rate_window_count,
  (SELECT COUNT(*) FROM auth_user WHERE id = ${sqlLiteral(HISTORICAL_SYNTHETIC_USER_ID)}) AS historical_user_count,
  (SELECT COUNT(*) FROM auth_account
    WHERE user_id = ${sqlLiteral(HISTORICAL_SYNTHETIC_USER_ID)}
      AND provider_id = 'credential'
      AND account_id = ${sqlLiteral(HISTORICAL_SYNTHETIC_USER_ID)}) AS historical_credential_count,
  (SELECT COUNT(*) FROM app_user_roles
    WHERE user_id = ${sqlLiteral(HISTORICAL_SYNTHETIC_USER_ID)} AND role = 'user') AS historical_role_count;
PRAGMA foreign_key_check;
`;

function assertKnownPreflight(response) {
  const row = rowsFrom(response).find((entry) => Object.hasOwn(entry, "user_count"));
  const userCount = Number(row?.user_count);
  const empty = userCount === 0;
  const historical = userCount === 1;
  if (!empty && !historical) fail("UNEXPECTED_INTEGRATION_FIXTURE_STATE");
  requireCount(row, "account_count", historical ? 1 : 0, "UNEXPECTED_ACCOUNT_STATE");
  requireCount(row, "role_count", historical ? 1 : 0, "UNEXPECTED_ROLE_STATE");
  requireCount(row, "session_count", 0, "UNEXPECTED_SESSION_STATE");
  requireCount(row, "verification_count", 0, "UNEXPECTED_VERIFICATION_STATE");
  requireCount(row, "identifier_count", 0, "UNEXPECTED_IDENTIFIER_STATE");
  requireCount(row, "rate_window_count", 0, "UNEXPECTED_RATE_WINDOW_STATE");
  requireCount(row, "historical_user_count", historical ? 1 : 0, "HISTORICAL_USER_GUARD_FAILED");
  requireCount(row, "historical_credential_count", historical ? 1 : 0, "HISTORICAL_ACCOUNT_GUARD_FAILED");
  requireCount(row, "historical_role_count", historical ? 1 : 0, "HISTORICAL_ROLE_GUARD_FAILED");
  requireForeignKeysClean(response);
}

function mutationSql(userId, recipientEmail, now) {
  return `
PRAGMA foreign_keys=ON;
DELETE FROM auth_session WHERE user_id = ${sqlLiteral(HISTORICAL_SYNTHETIC_USER_ID)};
DELETE FROM auth_account
 WHERE user_id = ${sqlLiteral(HISTORICAL_SYNTHETIC_USER_ID)}
   AND provider_id = 'credential'
   AND account_id = ${sqlLiteral(HISTORICAL_SYNTHETIC_USER_ID)};
DELETE FROM app_user_roles WHERE user_id = ${sqlLiteral(HISTORICAL_SYNTHETIC_USER_ID)} AND role = 'user';
DELETE FROM auth_user WHERE id = ${sqlLiteral(HISTORICAL_SYNTHETIC_USER_ID)};
INSERT INTO auth_user (id, name, email, email_verified, image, created_at, updated_at)
VALUES (${sqlLiteral(userId)}, 'HUB Planner Integration Activation Test', ${sqlLiteral(recipientEmail)}, 1, NULL, ${sqlLiteral(now)}, ${sqlLiteral(now)});
INSERT INTO app_user_roles (user_id, role, created_at, updated_at)
VALUES (${sqlLiteral(userId)}, 'user', ${sqlLiteral(now)}, ${sqlLiteral(now)});
`;
}

function postflightSql(userId) {
  return `
SELECT
  (SELECT COUNT(*) FROM auth_user) AS user_count,
  (SELECT COUNT(*) FROM auth_account) AS account_count,
  (SELECT COUNT(*) FROM app_user_roles) AS role_count,
  (SELECT COUNT(*) FROM auth_session) AS session_count,
  (SELECT COUNT(*) FROM auth_verification) AS verification_count,
  (SELECT COUNT(*) FROM auth_user WHERE id = ${sqlLiteral(userId)} AND email_verified = 1) AS exact_user_count,
  (SELECT COUNT(*) FROM app_user_roles WHERE user_id = ${sqlLiteral(userId)} AND role = 'user') AS exact_role_count,
  (SELECT COUNT(*) FROM auth_account WHERE user_id = ${sqlLiteral(userId)}) AS exact_provider_count;
PRAGMA foreign_key_check;
`;
}

async function main() {
  let recipientEmail;
  let tempDirectory;
  try {
    if (process.argv.slice(2).length !== 0) fail("ARGUMENTS_NOT_ALLOWED");
    await assertIntegrationDatabaseGuard();
    const preflight = await queryIntegrationReadOnly(preflightSql, "FIXTURE_PREFLIGHT");
    assertKnownPreflight(preflight);

    recipientEmail = normalizeRecipientEmail(
      await promptHidden("Owner-controlled recipient email (input hidden): "),
    );
    const userId = randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      fail("SYNTHETIC_UUID_GENERATION_FAILED");
    }

    tempDirectory = await mkdtemp(path.join(tmpdir(), "hub-planner-integration-fixture-"));
    const sqlPath = path.join(tempDirectory, "prepare-fixture.sql");
    await writeFile(sqlPath, mutationSql(userId, recipientEmail, new Date().toISOString()), {
      encoding: "utf8",
      flag: "wx",
    });
    await runIntegrationD1(["--file", sqlPath], "FIXTURE_MUTATION");
    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = undefined;

    const postflight = await queryIntegrationReadOnly(postflightSql(userId), "FIXTURE_POSTFLIGHT");
    const row = rowsFrom(postflight).find((entry) => Object.hasOwn(entry, "exact_user_count"));
    for (const [name, expected] of Object.entries({
      user_count: 1,
      account_count: 0,
      role_count: 1,
      session_count: 0,
      verification_count: 0,
      exact_user_count: 1,
      exact_role_count: 1,
      exact_provider_count: 0,
    })) requireCount(row, name, expected, "FIXTURE_POSTFLIGHT_FAILED");
    requireForeignKeysClean(postflight);

    process.stdout.write([
      "INTEGRATION_FIXTURE_PREPARE=PASS",
      `TARGET=${INTEGRATION_DATABASE_NAME}`,
      `SYNTHETIC_USER_ID=${userId}`,
      "ROLE=user",
      "PROVIDER_COUNT=0",
      "RECIPIENT_EMAIL_STORED=True",
      "",
    ].join("\n"));
  } catch (error) {
    const code = error instanceof IntegrationD1Error ? error.code : "FIXTURE_PREPARE_FAILED";
    const category = error instanceof IntegrationD1Error ? error.category : "INTERNAL";
    const message = error instanceof IntegrationD1Error ? error.message : "internal fixture error";
    process.stderr.write(
      `INTEGRATION_FIXTURE_PREPARE=FAIL\nERROR_CODE=${code}\nERROR_CATEGORY=${category}\nERROR_MESSAGE=${message}\n`,
    );
    process.exitCode = 1;
  } finally {
    recipientEmail = undefined;
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

await main();
