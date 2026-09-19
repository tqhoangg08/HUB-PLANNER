import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('internal accounts use Better Auth only and cannot become student records', () => {
  const auth = read('cloudflare/auth-production-worker/src/auth-production.ts');
  const migration = read('cloudflare/auth-production-migrations/0004_internal_accounts.sql');
  assert.match(migration, /app_internal_accounts/);
  assert.match(migration, /exclude_from_student_stats INTEGER NOT NULL DEFAULT 1/);
  assert.match(migration, /receive_broadcast INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /CHECK \(role IN \('user','admin','auditor'\)\)/);
  assert.match(migration, /created_by TEXT NOT NULL,/);
  assert.doesNotMatch(migration, /created_by TEXT NOT NULL REFERENCES auth_user/i);
  assert.match(auth, /internal\.hub-planner\.invalid/);
  assert.match(auth, /INSERT INTO auth_account[\s\S]*hashPassword\(password\)/);
  assert.doesNotMatch(auth.match(/async function handleInternalAccounts[\s\S]*?function safeEmailFailureCode/)?.[0] || '', /user_profiles|app_auth_identifiers/);
});

test('internal account operations are admin-only, bounded, and audited without credentials', () => {
  const auth = read('cloudflare/auth-production-worker/src/auth-production.ts');
  const internalHandler = auth.match(/async function handleInternalAccounts[\s\S]*?function safeEmailFailureCode/)?.[0] || '';
  const publicApi = read('cloudflare/worker/src/admin-internal-accounts.ts');
  const router = read('cloudflare/worker/src/index.ts');
  assert.match(auth, /roleForUser\(env, session\.user\.id\)\) === "admin"/);
  assert.match(auth, /auth_internal_account_audit/);
  assert.match(auth, /DELETE FROM auth_session WHERE user_id=\?1/);
  assert.match(auth, /status='active'/);
  assert.match(publicApi, /requireBetterAuthStaff/);
  assert.match(publicApi, /identity\.role !== 'admin'/);
  assert.match(router, /api\/admin\/internal-accounts[\s\S]*?private, no-store/);
  assert.doesNotMatch(internalHandler, /console\.(?:log|error)\([^\n]*(?:password|hashPassword)/i);
});

test('UI is a distinct admin-only internal-account surface', () => {
  const ui = read('components/AdminInternalAccounts.tsx');
  const routes = read('app/routing/ProtectedAppRoutes.tsx');
  const sidebar = read('layouts/DesktopLayout.tsx');
  assert.match(ui, /Tài khoản nội bộ/);
  assert.match(ui, /Broadcast luôn tắt mặc định/);
  assert.match(routes, /admin\/internal-accounts[\s\S]*?isAdmin/);
  assert.match(sidebar, /Tài khoản nội bộ/);
});
