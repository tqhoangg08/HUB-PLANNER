import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { safeWranglerD1Diagnostic } from '../scripts/integration-auth-d1.mjs';

const INTEGRATION_NAME = 'hub-planner-auth-integration';
const INTEGRATION_ID = '7a29a608-b44c-4a55-895b-d96ed26c52b8';
const PRODUCTION_NAME = 'hub-planner-auth-production';
const PRODUCTION_ID = '4f42d86e-f924-4ecc-b3af-fc947b48810b';

const helper = readFileSync('scripts/integration-auth-d1.mjs', 'utf8');
const prepare = readFileSync('scripts/prepare-integration-activation-fixture.mjs', 'utf8');
const cleanup = readFileSync('scripts/cleanup-integration-activation-fixture.mjs', 'utf8');
const unique = readFileSync('scripts/apply-integration-auth-account-unique-index.mjs', 'utf8');

test('all mutation tooling hard-pins Integration and refuses Production', () => {
  assert.match(helper, new RegExp(INTEGRATION_NAME));
  assert.match(helper, new RegExp(INTEGRATION_ID));
  assert.match(helper, new RegExp(PRODUCTION_ID));
  assert.match(helper, /integration\.database_name\.includes\("production"\)/);
  assert.match(helper, /integration\.database_id === PRODUCTION_DATABASE_ID/);
  assert.match(helper, /PRODUCTION_DATABASE_ISOLATION_FAILED/);
  assert.match(helper, /--remote/);
  assert.match(helper, /--json/);
  for (const source of [prepare, cleanup, unique]) {
    assert.match(source, /assertIntegrationDatabaseGuard/);
    assert.doesNotMatch(source, new RegExp(PRODUCTION_NAME));
    assert.doesNotMatch(source, new RegExp(PRODUCTION_ID));
    assert.doesNotMatch(source, /wrangler\.mjs[\s\S]*hub-planner-auth-production/);
  }
});

test('fixture creation is interactive, fresh UUID, verified user role and zero provider', () => {
  const mutation = prepare.slice(
    prepare.indexOf('function mutationSql'),
    prepare.indexOf('function postflightSql'),
  );
  assert.match(prepare, /process\.argv\.slice\(2\)\.length !== 0/);
  assert.match(prepare, /promptHidden\(/);
  assert.match(prepare, /randomUUID\(\)/);
  assert.match(mutation, /PRAGMA foreign_keys=ON/);
  assert.doesNotMatch(mutation, /\bBEGIN\b/i);
  assert.doesNotMatch(mutation, /\bCOMMIT\b/i);
  assert.equal((mutation.match(/INSERT INTO auth_user/g) || []).length, 1);
  assert.equal((mutation.match(/INSERT INTO app_user_roles/g) || []).length, 1);
  assert.match(mutation, /email_verified[\s\S]*, 1,/);
  assert.match(mutation, /INSERT INTO app_user_roles[\s\S]*'user'/);
  assert.doesNotMatch(mutation, /INSERT INTO auth_account/);
  assert.match(prepare, /exact_provider_count[\s\S]*0/);
  assert.doesNotMatch(prepare, /console\.(?:log|error)[^\n]*(?:recipientEmail|email)/i);
});

test('historical cleanup and generated-fixture cleanup are exact-user guarded', () => {
  const mutation = cleanup.slice(
    cleanup.indexOf('function cleanupSql'),
    cleanup.indexOf('const postflightSql'),
  );
  assert.match(mutation, /PRAGMA foreign_keys=ON/);
  assert.doesNotMatch(mutation, /\bBEGIN\b/i);
  assert.doesNotMatch(mutation, /\bCOMMIT\b/i);
  assert.match(prepare, /DELETE FROM auth_account[\s\S]*user_id = \$\{sqlLiteral\(HISTORICAL_SYNTHETIC_USER_ID\)\}/);
  assert.match(mutation, /DELETE FROM auth_session WHERE user_id = \$\{sqlLiteral\(userId\)\} AND \$\{guard\}/);
  assert.match(mutation, /DELETE FROM auth_account WHERE user_id = \$\{sqlLiteral\(userId\)\} AND \$\{guard\}/);
  assert.match(mutation, /DELETE FROM app_auth_identifiers WHERE user_id = \$\{sqlLiteral\(userId\)\} AND \$\{guard\}/);
  assert.match(mutation, /DELETE FROM auth_verification WHERE \$\{guard\}/);
  assert.match(mutation, /DELETE FROM auth_rate_limit_windows WHERE \$\{guard\}/);
  assert.match(mutation, /DELETE FROM app_user_roles WHERE user_id = \$\{sqlLiteral\(userId\)\} AND role = 'user' AND \$\{guard\}/);
  assert.match(mutation, /DELETE FROM auth_user WHERE id = \$\{sqlLiteral\(userId\)\} AND \(SELECT COUNT\(\*\) FROM auth_user\) = 1/);
  assert.match(mutation, /const guard = `\(SELECT COUNT\(\*\) FROM auth_user\) = 1 AND EXISTS/);
  assert.doesNotMatch(mutation, /DELETE FROM (?:auth_session|auth_account|app_auth_identifiers|app_user_roles|auth_user)\s*;/);
  assert.match(cleanup, /PRAGMA foreign_key_check/);
});

test('cleanup retains FK-safe deletion order and pre/postflight guards', () => {
  const mutation = cleanup.slice(
    cleanup.indexOf('function cleanupSql'),
    cleanup.indexOf('const postflightSql'),
  );
  const orderedStatements = [
    'DELETE FROM auth_session',
    'DELETE FROM auth_account',
    'DELETE FROM app_auth_identifiers',
    'DELETE FROM auth_verification',
    'DELETE FROM auth_rate_limit_windows',
    'DELETE FROM app_user_roles',
    'DELETE FROM auth_user',
  ];
  let previous = -1;
  for (const statement of orderedStatements) {
    const index = mutation.indexOf(statement);
    assert.ok(index > previous, `${statement} must retain FK-safe order`);
    previous = index;
  }
  assert.match(cleanup, /SYNTHETIC_UUID_INVALID/);
  assert.match(cleanup, /requireCount\(row, "user_count", 1/);
  assert.match(cleanup, /requireCount\(row, "exact_role_count", 1/);
  assert.match(cleanup, /requireCount\(row, "other_session_count", 0/);
  assert.match(cleanup, /requireCount\(row, "other_identifier_count", 0/);
  assert.match(cleanup, /CLEANUP_POSTFLIGHT_FAILED/);
});

test('cleanup surfaces only shared safe Wrangler diagnostic fields', () => {
  assert.match(cleanup, /ERROR_CODE=\$\{code\}/);
  assert.match(cleanup, /ERROR_CATEGORY=\$\{category\}/);
  assert.match(cleanup, /ERROR_MESSAGE=\$\{message\}/);
  assert.match(cleanup, /error instanceof IntegrationD1Error \? error\.category/);
  assert.doesNotMatch(cleanup, /process\.stderr\.write\([^\n]*(?:sqlPath|stderr|userId)/);
});

test('fixture mutation preserves exact historical delete and insert ordering', () => {
  const mutation = prepare.slice(
    prepare.indexOf('function mutationSql'),
    prepare.indexOf('function postflightSql'),
  );
  const orderedStatements = [
    'DELETE FROM auth_session',
    'DELETE FROM auth_account',
    'DELETE FROM app_user_roles',
    'DELETE FROM auth_user',
    'INSERT INTO auth_user',
    'INSERT INTO app_user_roles',
  ];
  let previous = -1;
  for (const statement of orderedStatements) {
    const index = mutation.indexOf(statement);
    assert.ok(index > previous, `${statement} must retain guarded order`);
    previous = index;
  }
  assert.equal((mutation.match(/HISTORICAL_SYNTHETIC_USER_ID/g) || []).length >= 4, true);
});

test('Wrangler failures expose only categorized, constant diagnostics', () => {
  const sensitive = [
    'owner@example.test',
    "INSERT INTO auth_user VALUES ('secret')",
    'C:\\Users\\owner\\AppData\\Local\\Temp\\fixture.sql',
  ].join(' ');
  const nested = safeWranglerD1Diagnostic(`cannot start a transaction within a transaction ${sensitive}`);
  assert.deepEqual(nested, {
    category: 'D1_TRANSACTION_CONFLICT',
    message: 'D1 rejected an explicit or nested transaction',
  });
  const unknown = safeWranglerD1Diagnostic(`unexpected remote error ${sensitive}`);
  assert.deepEqual(unknown, {
    category: 'WRANGLER_D1_COMMAND_REJECTED',
    message: 'Wrangler rejected the remote Integration D1 command',
  });
  for (const diagnostic of [nested, unknown]) {
    assert.doesNotMatch(`${diagnostic.category} ${diagnostic.message}`, /owner@example|INSERT INTO|fixture\.sql|secret/i);
  }
  assert.doesNotMatch(helper, /process\.(?:stdout|stderr)\.write\([^\n]*stderr/);
});

test('unique-index helper checks duplicates and targets only Integration', () => {
  assert.match(unique, /GROUP BY provider_id, account_id/);
  assert.match(unique, /HAVING COUNT\(\*\) > 1/);
  assert.match(unique, /0001_unique_auth_account_provider_account\.sql/);
  assert.match(unique, /auth_account_provider_account_unique/);
  assert.match(unique, /provider_id[\s\S]*account_id/);
});

test('tooling never logs raw email, reset token, password, hash or cookie values', () => {
  for (const source of [helper, prepare, cleanup, unique]) {
    assert.doesNotMatch(source, /console\.(?:log|error)\(/);
    assert.doesNotMatch(source, /process\.(?:stdout|stderr)\.write\([^\n]*(?:recipientEmail|password|hash|token|cookie)/i);
  }
});
