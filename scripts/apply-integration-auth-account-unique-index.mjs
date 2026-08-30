import path from "node:path";
import process from "node:process";

import {
  INTEGRATION_DATABASE_NAME,
  IntegrationD1Error,
  REPO_ROOT,
  assertIntegrationDatabaseGuard,
  fail,
  queryIntegrationReadOnly,
  requireForeignKeysClean,
  rowsFrom,
  runIntegrationD1,
} from "./integration-auth-d1.mjs";

const MIGRATION_PATH = path.join(
  REPO_ROOT,
  "cloudflare",
  "auth-production-migrations",
  "0001_unique_auth_account_provider_account.sql",
);

const duplicatePreconditionSql = `
SELECT provider_id, account_id, COUNT(*) AS duplicate_count
FROM auth_account
GROUP BY provider_id, account_id
HAVING COUNT(*) > 1;
PRAGMA foreign_key_check;
`;

const postflightSql = `
SELECT
  (SELECT COUNT(*) FROM pragma_index_list('auth_account')
    WHERE name = 'auth_account_provider_account_unique' AND "unique" = 1) AS unique_index_count,
  (SELECT COUNT(*) FROM pragma_index_info('auth_account_provider_account_unique')
    WHERE seqno = 0 AND name = 'provider_id') AS provider_column_count,
  (SELECT COUNT(*) FROM pragma_index_info('auth_account_provider_account_unique')
    WHERE seqno = 1 AND name = 'account_id') AS account_column_count;
PRAGMA foreign_key_check;
`;

async function main() {
  try {
    if (process.argv.slice(2).length !== 0) fail("ARGUMENTS_NOT_ALLOWED");
    await assertIntegrationDatabaseGuard();
    const preflight = await queryIntegrationReadOnly(duplicatePreconditionSql, "UNIQUE_INDEX_PREFLIGHT");
    const duplicates = rowsFrom(preflight).filter((row) => Object.hasOwn(row, "duplicate_count"));
    if (duplicates.length !== 0) fail("DUPLICATE_PROVIDER_ACCOUNT_FOUND");
    requireForeignKeysClean(preflight);

    await runIntegrationD1(["--file", MIGRATION_PATH], "UNIQUE_INDEX_MUTATION");
    const postflight = await queryIntegrationReadOnly(postflightSql, "UNIQUE_INDEX_POSTFLIGHT");
    const row = rowsFrom(postflight).find((entry) => Object.hasOwn(entry, "unique_index_count"));
    if (
      Number(row?.unique_index_count) !== 1 ||
      Number(row?.provider_column_count) !== 1 ||
      Number(row?.account_column_count) !== 1
    ) fail("UNIQUE_INDEX_POSTFLIGHT_FAILED");
    requireForeignKeysClean(postflight);

    process.stdout.write([
      "INTEGRATION_UNIQUE_INDEX=PASS",
      `TARGET=${INTEGRATION_DATABASE_NAME}`,
      "INDEX=auth_account_provider_account_unique",
      "",
    ].join("\n"));
  } catch (error) {
    const code = error instanceof IntegrationD1Error ? error.code : "UNIQUE_INDEX_FAILED";
    process.stderr.write(`INTEGRATION_UNIQUE_INDEX=FAIL\nERROR_CODE=${code}\n`);
    process.exitCode = 1;
  }
}

await main();
