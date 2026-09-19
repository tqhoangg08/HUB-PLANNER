import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AdminStudentsError, handleAdminStudents, parseAdminStudentQuery } from '../cloudflare/worker/src/admin-students.ts';
import { parseAdminStudentCreate } from '../cloudflare/worker/src/admin-student-lifecycle.ts';

test('admin student query is cursor-based, bounded, and rejects unsafe filters', () => {
  assert.deepEqual(parseAdminStudentQuery(new URLSearchParams('limit=999&q=AB')), {
    limit: 50, query: 'AB', className: '', major: '', status: '', start: '', end: '', cursor: null,
  });
  assert.throws(() => parseAdminStudentQuery(new URLSearchParams('q=A')), AdminStudentsError);
  assert.throws(() => parseAdminStudentQuery(new URLSearchParams('status=all')), AdminStudentsError);
  assert.throws(() => parseAdminStudentQuery(new URLSearchParams('cursor=not-a-cursor')), AdminStudentsError);
});

test('non-admin student management request is denied before a D1 query', async () => {
  let queried = false;
  const request = new Request('https://example.invalid/api/admin/students', { headers: { Cookie: 'better-auth.session=test' } });
  const env = {
    AUTH_SERVICE: { fetch: async () => Response.json({ userId: '11111111-1111-4111-8111-111111111111', email: 'member@example.invalid', role: 'auditor' }) },
    DB: { prepare: () => { queried = true; throw new Error('must not query'); } },
  } as any;
  await assert.rejects(() => handleAdminStudents(request, new URL(request.url), env), (error: unknown) => error instanceof AdminStudentsError && error.status === 403);
  assert.equal(queried, false);
});

test('admin list uses a bounded cursor query and redacts internal identity/PII', async () => {
  let statement = '';
  let bindings: unknown[] = [];
  const request = new Request('https://example.invalid/api/admin/students?limit=10&q=SV', { headers: { Cookie: 'better-auth.session=test' } });
  const env = {
    AUTH_SERVICE: { fetch: async () => Response.json({ userId: '11111111-1111-4111-8111-111111111111', email: 'admin@example.invalid', role: 'admin' }) },
    DB: { prepare: (sql: string) => ({ bind: (...values: unknown[]) => {
      statement = sql;
      bindings = values;
      return { all: async () => ({ results: [{
        user_id: '22222222-2222-4222-8222-222222222222', student_code: 'SV123456', full_name: 'Sinh vien', class_name: 'K42', updated_at: '2026-09-19T00:00:00.000Z',
        student_name: 'Sinh vien', cohort: 'K42', program_name: 'standard', major_name: 'CNTT', specialization_name: 'CNTT', has_onboarded: 1,
      }] }) };
    } }) },
  } as any;
  const response = await handleAdminStudents(request, new URL(request.url), env);
  assert.match(statement, /ORDER BY p\.updated_at DESC,p\.user_id DESC LIMIT \?/);
  assert.match(statement, /student_code COLLATE NOCASE >= \?/);
  assert.equal(bindings.at(-1), 11);
  assert.equal(response.data[0].student_code, 'SV123456');
  assert.equal(response.data[0].full_name, 'Sinh vien');
  assert.equal('user_id' in response.data[0], false);
  assert.equal(response.data[0].phone_masked, null);
  assert.equal(response.data[0].email_masked, 'SV***@st.buh.edu.vn');
});

test('admin list prioritizes the persisted Better Auth display name with one bounded lookup per page', async () => {
  let canonicalNameRequests = 0;
  const userId = '22222222-2222-4222-8222-222222222222';
  const request = new Request('https://example.invalid/api/admin/students?limit=10', { headers: { Cookie: 'better-auth.session=test' } });
  const env = {
    AUTH_SERVICE: { fetch: async (input: RequestInfo | URL) => {
      const internal = new URL(input instanceof Request ? input.url : String(input));
      if (internal.pathname === '/internal/auth/user-names') {
        canonicalNameRequests += 1;
        return Response.json({ names: [{ userId, name: 'Nguyễn Văn An' }] });
      }
      return Response.json({ userId: '11111111-1111-4111-8111-111111111111', email: 'admin@example.invalid', role: 'admin' });
    } },
    DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{
      user_id: userId, student_code: 'SV123456', full_name: 'Tên hồ sơ cũ', updated_at: '2026-09-19T00:00:00.000Z', has_onboarded: 1,
    }] }) }) }) },
  } as any;
  const response = await handleAdminStudents(request, new URL(request.url), env);
  assert.equal(canonicalNameRequests, 1);
  assert.equal(response.data[0].full_name, 'Nguyễn Văn An');
});

test('admin list retains the profile fallback and never derives a name from an email local-part', async () => {
  const source = readFileSync('cloudflare/worker/src/admin-students.ts', 'utf8');
  const ui = readFileSync('components/AdminStudentManagement.tsx', 'utf8');
  assert.match(source, /canonicalName\(row\.full_name\) \|\| canonicalName\(row\.student_name\) \|\| null/);
  assert.match(source, /userIds: ids/);
  assert.match(source, /MAX_AUTH_NAME_LOOKUP = 50/);
  assert.doesNotMatch(source, /split\(['"]@['"]\)/);
  assert.doesNotMatch(source, /googleapis|oauth2\.google/i);
  assert.match(ui, /student\.full_name \|\| 'Chưa cập nhật'/);
});

test('student lifecycle requires a canonical student email and avoids caller-controlled owner fields', () => {
  assert.deepEqual(parseAdminStudentCreate({ studentCode: '241100000001', fullName: 'Sinh viên mới' }), {
    studentCode: '241100000001', fullName: 'Sinh viên mới', className: '', cohort: '', programName: '', majorName: '', specializationName: '',
  });
  assert.throws(() => parseAdminStudentCreate({ studentCode: '241100000001', fullName: 'Sinh viên mới', userId: 'attacker-id' }));
  assert.throws(() => parseAdminStudentCreate({ studentCode: 'x', fullName: 'Sinh viên mới' }));
});

test('cross-database lifecycle is an idempotent saga with Auth-side confirmation', () => {
  const publicLifecycle = readFileSync('cloudflare/worker/src/admin-student-lifecycle.ts', 'utf8');
  const authLifecycle = readFileSync('cloudflare/auth-production-worker/src/auth-production.ts', 'utf8');
  assert.match(publicLifecycle, /state: 'pending' \| 'auth_done' \| 'profile_done' \| 'completed'/);
  assert.match(publicLifecycle, /\/internal\/admin-students\/create/);
  assert.match(publicLifecycle, /\/internal\/admin-students\/invite/);
  assert.match(publicLifecycle, /\/internal\/admin-students\/delete/);
  assert.match(publicLifecycle, /cleanupD1UserDataForAdminLifecycle/);
  assert.match(publicLifecycle, /readRecoverableLifecycle/);
  assert.match(publicLifecycle, /state<>'completed'/);
  assert.match(authLifecycle, /handleInternalAdminStudentCreate/);
  assert.match(authLifecycle, /roleForUser\(env, session\.user\.id\)\) !== "admin"/);
  assert.match(authLifecycle, /hashPassword\(bootstrapSecret\)/);
  assert.match(authLifecycle, /request-password-reset/);
  assert.doesNotMatch(authLifecycle, /console\.(?:log|error)\([^\n]*(?:bootstrapSecret|studentCode|input\.email)/i);
});

test('student management query exposes no direct PII or wildcard selection', () => {
  const source = readFileSync('cloudflare/worker/src/admin-students.ts', 'utf8');
  const router = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  assert.match(source, /requireAdmin/);
  assert.match(router, /api\/admin\/students/);
  assert.match(router, /private, no-store/);
  assert.match(source, /next_cursor/);
  assert.doesNotMatch(source, /SELECT\s+\*/i);
  assert.doesNotMatch(source, /localStorage/);
  assert.match(source, /phone_masked: null/);
  assert.match(source, /email_masked/);
});

test('dashboard mounts the server-paginated student management surface', () => {
  const source = readFileSync('components/Dashboard.tsx', 'utf8');
  assert.match(source, /<AdminStudentManagement/);
  const ui = readFileSync('components/AdminStudentManagement.tsx', 'utf8');
  assert.match(ui, /fetchAdminStudents/);
  assert.match(ui, /setTimeout\(\(\) =>/);
  assert.match(ui, /10 \/ trang/);
  assert.match(ui, /50 \/ trang/);
});

test('student management uses a dense, responsive enterprise table without changing its cursor data flow', () => {
  const ui = readFileSync('components/AdminStudentManagement.tsx', 'utf8');
  assert.match(ui, /aria-label="Bộ lọc sinh viên"/);
  assert.match(ui, /xl:grid-cols-\[minmax\(245px,1\.45fr\)_minmax\(150px,\.8fr\)/);
  assert.match(ui, /aria-label="Thao tác quản lý sinh viên"/);
  assert.match(ui, /overflow-x-auto/);
  assert.match(ui, /sticky right-0/);
  assert.match(ui, /student\.cohort/);
  assert.match(ui, /aria-label="Số kết quả mỗi trang"/);
  assert.match(ui, /aria-label="Trang trước"/);
  assert.match(ui, /aria-label="Trang sau"/);
  assert.match(ui, /fetchAdminStudents\(filters, limit, nextCursor\)/);
  assert.doesNotMatch(ui, /localStorage/);
  assert.doesNotMatch(ui, /'Giới tính'/);
  assert.doesNotMatch(ui, /'Ngày sinh'/);
  assert.doesNotMatch(ui, /'Số điện thoại'/);
});

test('student export creates a redacted admin audit record', () => {
  const source = readFileSync('cloudflare/worker/src/admin-export.ts', 'utf8');
  assert.match(source, /admin_student_export/);
  assert.match(source, /activity_logs/);
  assert.doesNotMatch(source, /metadata_json\).*email/i);
});

test('both lifecycle ledgers are additive, indexed, and deliberately not applied by this change', () => {
  const publicMigration = readFileSync('cloudflare/migrations/0042_admin_student_lifecycle.sql', 'utf8');
  const authMigration = readFileSync('cloudflare/auth-production-migrations/0003_admin_student_lifecycle.sql', 'utf8');
  assert.match(publicMigration, /CREATE TABLE IF NOT EXISTS admin_student_lifecycle/);
  assert.match(publicMigration, /UNIQUE \(actor_user_id, idempotency_key\)/);
  assert.match(authMigration, /CREATE TABLE IF NOT EXISTS auth_admin_student_lifecycle/);
  assert.match(authMigration, /auth_admin_student_lifecycle_target_idx/);
});
