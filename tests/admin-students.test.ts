import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AdminStudentsError, handleAdminStudents, parseAdminStudentQuery } from '../cloudflare/worker/src/admin-students.ts';

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
  assert.equal('user_id' in response.data[0], false);
  assert.equal(response.data[0].phone_masked, null);
  assert.equal(response.data[0].email_masked, 'SV***@st.buh.edu.vn');
});

test('unsafe account lifecycle operations fail closed instead of orphaning Better Auth identities', async () => {
  const env = {
    AUTH_SERVICE: { fetch: async () => Response.json({ userId: '11111111-1111-4111-8111-111111111111', email: 'admin@example.invalid', role: 'admin' }) },
    DB: { prepare: () => { throw new Error('not needed'); } },
  } as any;
  const post = new Request('https://example.invalid/api/admin/students', { method: 'POST', headers: { Cookie: 'better-auth.session=test' } });
  await assert.rejects(() => handleAdminStudents(post, new URL(post.url), env), (error: unknown) => error instanceof AdminStudentsError && error.status === 409);
  const del = new Request('https://example.invalid/api/admin/students/SV123456', { method: 'DELETE', headers: { Cookie: 'better-auth.session=test' } });
  await assert.rejects(() => handleAdminStudents(del, new URL(del.url), env), (error: unknown) => error instanceof AdminStudentsError && error.status === 409);
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

test('student export creates a redacted admin audit record', () => {
  const source = readFileSync('cloudflare/worker/src/admin-export.ts', 'utf8');
  assert.match(source, /admin_student_export/);
  assert.match(source, /activity_logs/);
  assert.doesNotMatch(source, /metadata_json\).*email/i);
});
