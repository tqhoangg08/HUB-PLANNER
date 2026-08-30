import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const INTEGRATION_DATABASE_NAME = "hub-planner-auth-integration";
export const INTEGRATION_DATABASE_ID = "7a29a608-b44c-4a55-895b-d96ed26c52b8";
export const PRODUCTION_DATABASE_NAME = "hub-planner-auth-production";
export const PRODUCTION_DATABASE_ID = "4f42d86e-f924-4ecc-b3af-fc947b48810b";
export const HISTORICAL_SYNTHETIC_USER_ID = "b42a6f01-a58e-4046-b90c-73ffa2aeee26";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
export const INTEGRATION_CONFIG_PATH = path.join(
  REPO_ROOT,
  "cloudflare",
  "wrangler.auth-integration-stage2.jsonc",
);
export const PRODUCTION_CONFIG_PATH = path.join(
  REPO_ROOT,
  "cloudflare",
  "wrangler.auth-production.jsonc",
);
const WRANGLER_WRAPPER = path.join(REPO_ROOT, "scripts", "run-wrangler.mjs");
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

export class IntegrationD1Error extends Error {
  constructor(code, category = "INTERNAL", safeMessage = "internal Integration D1 error") {
    super(safeMessage);
    this.name = "IntegrationD1Error";
    this.code = code;
    this.category = category;
  }
}

export function fail(code) {
  throw new IntegrationD1Error(code);
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function readConfig(configPath) {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    fail("WRANGLER_CONFIG_INVALID");
  }
}

function exactAuthDatabase(config) {
  const matches = Array.isArray(config?.d1_databases)
    ? config.d1_databases.filter((entry) => entry?.binding === "AUTH_DB")
    : [];
  if (matches.length !== 1) fail("AUTH_DB_BINDING_INVALID");
  return matches[0];
}

export async function assertIntegrationDatabaseGuard() {
  const integration = exactAuthDatabase(await readConfig(INTEGRATION_CONFIG_PATH));
  const production = exactAuthDatabase(await readConfig(PRODUCTION_CONFIG_PATH));
  if (
    integration.database_name !== INTEGRATION_DATABASE_NAME ||
    integration.database_id !== INTEGRATION_DATABASE_ID ||
    integration.database_name.includes("production") ||
    integration.database_id === PRODUCTION_DATABASE_ID
  ) {
    fail("INTEGRATION_DATABASE_GUARD_FAILED");
  }
  if (
    production.database_name !== PRODUCTION_DATABASE_NAME ||
    production.database_id !== PRODUCTION_DATABASE_ID ||
    production.database_name === integration.database_name ||
    production.database_id === integration.database_id
  ) {
    fail("PRODUCTION_DATABASE_ISOLATION_FAILED");
  }
  return { integration, production };
}

function capture(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_CAPTURE_BYTES) {
        stream.destroy();
        reject(new IntegrationD1Error("WRANGLER_OUTPUT_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    stream.once("error", reject);
    stream.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

export function safeWranglerD1Diagnostic(stderr) {
  const text = String(stderr).toLowerCase();
  const knownDiagnostics = [
    {
      pattern: /cannot start a transaction within a transaction|nested transaction/,
      category: "D1_TRANSACTION_CONFLICT",
      message: "D1 rejected an explicit or nested transaction",
    },
    {
      pattern: /foreign key constraint|foreign key failed/,
      category: "D1_FOREIGN_KEY_CONSTRAINT",
      message: "D1 rejected a foreign-key constraint",
    },
    {
      pattern: /unique constraint|constraint failed/,
      category: "D1_CONSTRAINT",
      message: "D1 rejected a database constraint",
    },
    {
      pattern: /syntax error|incomplete input|no such (?:table|column)/,
      category: "D1_SQL_REJECTED",
      message: "D1 rejected the SQL file",
    },
    {
      pattern: /unauthorized|authentication|not logged in|api token/,
      category: "WRANGLER_AUTH",
      message: "Wrangler authentication failed",
    },
    {
      pattern: /fetch failed|network|timed out|timeout|econnreset|enotfound/,
      category: "WRANGLER_NETWORK",
      message: "Wrangler could not complete the remote D1 request",
    },
    {
      pattern: /database[^\n]*(?:not found|does not exist)/,
      category: "D1_TARGET_NOT_FOUND",
      message: "Wrangler could not find the guarded Integration D1 target",
    },
  ];
  const match = knownDiagnostics.find(({ pattern }) => pattern.test(text));
  return match
    ? { category: match.category, message: match.message }
    : {
        category: "WRANGLER_D1_COMMAND_REJECTED",
        message: "Wrangler rejected the remote Integration D1 command",
      };
}

export function parseWranglerD1Json(stdout) {
  const input = String(stdout).trim();
  const candidates = [input];
  for (let index = input.lastIndexOf("["); index > 0; index = input.lastIndexOf("[", index - 1)) {
    candidates.push(input.slice(index));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((result) => result?.success === true && Array.isArray(result.results))
      ) {
        return parsed;
      }
    } catch {
      // Wrangler 4.115 can prefix its final JSON document with progress text.
    }
  }
  fail("WRANGLER_D1_RESPONSE_INVALID");
}

export async function runIntegrationD1(operationArgs, stage) {
  await assertIntegrationDatabaseGuard();
  const child = spawn(
    process.execPath,
    [
      WRANGLER_WRAPPER,
      "d1",
      "execute",
      INTEGRATION_DATABASE_NAME,
      "--remote",
      "--config",
      INTEGRATION_CONFIG_PATH,
      ...operationArgs,
      "--json",
      "--yes",
    ],
    {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const stdoutPromise = capture(child.stdout);
  const stderrPromise = capture(child.stderr);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  }).catch(() => fail(`${stage}_PROCESS_FAILED`));
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]).catch(() =>
    fail(`${stage}_OUTPUT_FAILED`),
  );
  if (exitCode !== 0) {
    const diagnostic = safeWranglerD1Diagnostic(stderr);
    throw new IntegrationD1Error(`${stage}_COMMAND_FAILED`, diagnostic.category, diagnostic.message);
  }
  return parseWranglerD1Json(stdout);
}

export async function queryIntegrationReadOnly(sql, stage) {
  if (/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH)\b/i.test(sql)) {
    fail("READ_ONLY_SQL_GUARD_FAILED");
  }
  return runIntegrationD1(["--command", sql], stage);
}

export function rowsFrom(response) {
  return response.flatMap((result) => Array.isArray(result.results) ? result.results : []);
}

export function requireCount(row, name, expected, code) {
  if (Number(row?.[name]) !== expected) fail(code);
}

export function requireForeignKeysClean(response, code = "INTEGRATION_FOREIGN_KEY_CHECK_FAILED") {
  const violations = rowsFrom(response).filter((row) =>
    Object.hasOwn(row, "table") && Object.hasOwn(row, "parent") && Object.hasOwn(row, "fkid"),
  );
  if (violations.length !== 0) fail(code);
}
