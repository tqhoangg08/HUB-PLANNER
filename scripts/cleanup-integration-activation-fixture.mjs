import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import {
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

function promptSyntheticUserId() {
  if (!process.stdin.isTTY || !process.stderr.isTTY) fail("INTERACTIVE_TERMINAL_REQUIRED");
  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const cleanup = () => {
      input.removeListener("data", onData);
      input.setRawMode(false);
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
          resolve(value.trim());
          return;
        }
        if (character === "\b" || character === "\u007f") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    process.stderr.write("Synthetic fixture UUID to remove (input hidden): ");
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function preflightSql(userId) {
  return `
SELECT
  (SELECT COUNT(*) FROM auth_user) AS user_count,
  (SELECT COUNT(*) FROM auth_user WHERE id = ${sqlLiteral(userId)}) AS exact_user_count,
  (SELECT COUNT(*) FROM auth_account) AS account_count,
  (SELECT COUNT(*) FROM auth_account WHERE user_id = ${sqlLiteral(userId)}) AS exact_account_count,
  (SELECT COUNT(*) FROM app_user_roles) AS role_count,
  (SELECT COUNT(*) FROM app_user_roles WHERE user_id = ${sqlLiteral(userId)} AND role = 'user') AS exact_role_count,
  (SELECT COUNT(*) FROM auth_session WHERE user_id <> ${sqlLiteral(userId)}) AS other_session_count,
  (SELECT COUNT(*) FROM app_auth_identifiers WHERE user_id <> ${sqlLiteral(userId)}) AS other_identifier_count;
PRAGMA foreign_key_check;
`;
}

function cleanupSql(userId) {
  const guard = `(SELECT COUNT(*) FROM auth_user) = 1 AND EXISTS (SELECT 1 FROM auth_user WHERE id = ${sqlLiteral(userId)})`;
  return `
PRAGMA foreign_keys=ON;
DELETE FROM auth_session WHERE user_id = ${sqlLiteral(userId)} AND ${guard};
DELETE FROM auth_account WHERE user_id = ${sqlLiteral(userId)} AND ${guard};
DELETE FROM app_auth_identifiers WHERE user_id = ${sqlLiteral(userId)} AND ${guard};
DELETE FROM auth_verification WHERE ${guard};
DELETE FROM auth_rate_limit_windows WHERE ${guard};
DELETE FROM app_user_roles WHERE user_id = ${sqlLiteral(userId)} AND role = 'user' AND ${guard};
DELETE FROM auth_user WHERE id = ${sqlLiteral(userId)} AND (SELECT COUNT(*) FROM auth_user) = 1;
`;
}

const postflightSql = `
SELECT
  (SELECT COUNT(*) FROM auth_user) AS user_count,
  (SELECT COUNT(*) FROM auth_account) AS account_count,
  (SELECT COUNT(*) FROM app_user_roles) AS role_count,
  (SELECT COUNT(*) FROM app_auth_identifiers) AS identifier_count,
  (SELECT COUNT(*) FROM auth_session) AS session_count,
  (SELECT COUNT(*) FROM auth_verification) AS verification_count,
  (SELECT COUNT(*) FROM auth_rate_limit_windows) AS rate_window_count;
PRAGMA foreign_key_check;
`;

async function main() {
  let tempDirectory;
  try {
    if (process.argv.slice(2).length !== 0) fail("ARGUMENTS_NOT_ALLOWED");
    await assertIntegrationDatabaseGuard();
    const userId = String(await promptSyntheticUserId());
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      fail("SYNTHETIC_UUID_INVALID");
    }

    const preflight = await queryIntegrationReadOnly(preflightSql(userId), "CLEANUP_PREFLIGHT");
    const row = rowsFrom(preflight).find((entry) => Object.hasOwn(entry, "exact_user_count"));
    requireCount(row, "user_count", 1, "CLEANUP_USER_SCOPE_UNSAFE");
    requireCount(row, "exact_user_count", 1, "CLEANUP_TARGET_NOT_FOUND");
    requireCount(row, "account_count", Number(row?.exact_account_count), "CLEANUP_ACCOUNT_SCOPE_UNSAFE");
    requireCount(row, "role_count", 1, "CLEANUP_ROLE_SCOPE_UNSAFE");
    requireCount(row, "exact_role_count", 1, "CLEANUP_ROLE_SCOPE_UNSAFE");
    requireCount(row, "other_session_count", 0, "CLEANUP_OTHER_SESSION_FOUND");
    requireCount(row, "other_identifier_count", 0, "CLEANUP_OTHER_IDENTIFIER_FOUND");
    requireForeignKeysClean(preflight);

    tempDirectory = await mkdtemp(path.join(tmpdir(), "hub-planner-integration-cleanup-"));
    const sqlPath = path.join(tempDirectory, "cleanup-fixture.sql");
    await writeFile(sqlPath, cleanupSql(userId), { encoding: "utf8", flag: "wx" });
    await runIntegrationD1(["--file", sqlPath], "CLEANUP_MUTATION");
    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = undefined;

    const postflight = await queryIntegrationReadOnly(postflightSql, "CLEANUP_POSTFLIGHT");
    const finalRow = rowsFrom(postflight).find((entry) => Object.hasOwn(entry, "user_count"));
    for (const name of [
      "user_count",
      "account_count",
      "role_count",
      "identifier_count",
      "session_count",
      "verification_count",
      "rate_window_count",
    ]) requireCount(finalRow, name, 0, "CLEANUP_POSTFLIGHT_FAILED");
    requireForeignKeysClean(postflight);

    process.stdout.write([
      "INTEGRATION_FIXTURE_CLEANUP=PASS",
      `TARGET=${INTEGRATION_DATABASE_NAME}`,
      "FINAL_SYNTHETIC_USER_COUNT=0",
      "FINAL_SESSION_COUNT=0",
      "FINAL_FOREIGN_KEY_CHECK=Clean",
      "",
    ].join("\n"));
  } catch (error) {
    const code = error instanceof IntegrationD1Error ? error.code : "FIXTURE_CLEANUP_FAILED";
    const category = error instanceof IntegrationD1Error ? error.category : "INTERNAL";
    const message = error instanceof IntegrationD1Error ? error.message : "internal cleanup error";
    process.stderr.write(
      `INTEGRATION_FIXTURE_CLEANUP=FAIL\nERROR_CODE=${code}\nERROR_CATEGORY=${category}\nERROR_MESSAGE=${message}\n`,
    );
    process.exitCode = 1;
  } finally {
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

await main();
