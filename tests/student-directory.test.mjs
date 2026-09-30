import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import {
  normalizeDirectoryStudentCode, mergeDirectoryRecords,
  validateStudentDirectoryWorkbook, buildStudentDirectoryImportSql,
} from '../scripts/student-directory-workbook.mjs';
import {
  studentCodeFromVerifiedEmail, handleOwnStudentDirectory,
  readVerifiedStudentCode,
} from '../cloudflare/worker/src/student-directory.ts';
import { enforceProfileIdentityLocks } from '../cloudflare/worker/src/private-profile.ts';
import { fillEditableDirectoryField } from '../scripts/student-directory-backfill-core.mjs';
import { directoryCohortToProfile, directoryProgramToProfile } from '../shared/student-directory-academic.ts';

const owner = { userId: '11111111-1111-4111-8111-111111111111',
  email: '012345678901@st.buh.edu.vn', role: 'user' };
const directory = { student_code: '012345678901', full_name: 'Student A', cohort: '41',
  gender: 'Nữ', general_class: 'C1', major_class: null, major: 'M1',
  specialization: null, training_program: 'Đại học chính quy chuẩn' };
const request = (suffix = '') => new Request(`https://example.test/api/user/v1/student-directory${suffix}`,
  { headers: { Cookie: 'test-session=synthetic' } });
const env = (options = {}) => {
  const calls = [];
  return {
    calls,
    AUTH_SERVICE: { fetch: async (input) => {
      const url = new URL(input.url);
      calls.push(url.pathname);
      if (url.pathname === '/internal/auth/session') return options.sessionMissing
        ? Response.json({ error: 'No session' }, { status: 401 }) : Response.json(owner);
      return Response.json({ user: { id: options.userIdOverride || owner.userId,
        email: options.emailOverride || owner.email,
        emailVerified: options.verified ?? true } });
    } },
    DB: { prepare: (sql) => ({ bind: (code) => ({ first: async () => {
      calls.push(`D1:${sql.includes('WHERE student_code=?')}`);
      return !options.directoryMissing && code === directory.student_code ? directory : null;
    } }) }) },
  };
};

test('verified 12-digit student email derives exact text MSSV', () => {
  assert.equal(studentCodeFromVerifiedEmail('012345678901@ST.BUH.EDU.VN', true), '012345678901');
  assert.equal(studentCodeFromVerifiedEmail('012345678901@st.buh.edu.vn', false), null);
  assert.equal(studentCodeFromVerifiedEmail('012345678901@gmail.com', true), null);
});

test('directory lookup uses session owner only and rejects query parameters', async () => {
  const context = env();
  const result = await handleOwnStudentDirectory(request(), context);
  assert.equal(result.matched, true);
  assert.equal(result.studentCode, directory.student_code);
  assert.deepEqual(context.calls, ['/internal/auth/session', '/api/auth/get-session', 'D1:true']);
  await assert.rejects(handleOwnStudentDirectory(request('?mssv=999999999999'), context),
    { status: 400 });
});

test('unverified and non-student accounts cannot match directory', async () => {
  assert.equal(await readVerifiedStudentCode(request(), env({ verified: false }), owner), null);
  const nonStudent = { ...owner, email: 'someone@example.test' };
  assert.equal(await readVerifiedStudentCode(request(), env(), nonStudent), null);
});

test('untrusted session, user mismatch and missing row never expose another record', async () => {
  await assert.rejects(handleOwnStudentDirectory(request(), env({ sessionMissing: true })),
    { status: 401 });
  await assert.rejects(handleOwnStudentDirectory(request(), env({ userIdOverride:
    '22222222-2222-4222-8222-222222222222' })), { status: 503 });
  assert.deepEqual(await handleOwnStudentDirectory(request(), env({ directoryMissing: true })),
    { matched: false });
});

test('directory name/cohort override only the owner and remain locked', () => {
  const publicPatch = { full_name: 'Student A' };
  const privatePatch = { data: { studentName: 'Student A', cohort: 'K41', gender: 'Khác' } };
  const locks = enforceProfileIdentityLocks(publicPatch, privatePatch, null, null, directory);
  assert.deepEqual(locks, { fullNameLocked: true, cohortLocked: true });
  assert.equal(privatePatch.data.gender, 'Khác');
  assert.throws(() => enforceProfileIdentityLocks({ full_name: 'Different' }, {}, null, null, directory),
    { status: 400 });
  assert.throws(() => enforceProfileIdentityLocks({}, { data: { cohort: '40' } }, null, null, directory),
    { status: 400 });
});

test('missing name/cohort can be set once, then become immutable', () => {
  assert.deepEqual(enforceProfileIdentityLocks({ full_name: 'First' },
    { data: { studentName: 'First', cohort: '41' } }, null, null, null),
  { fullNameLocked: false, cohortLocked: false });
  assert.throws(() => enforceProfileIdentityLocks({ full_name: 'Second' }, {},
    { full_name: 'First' }, { data: { cohort: '41' } }, null), { status: 400 });
  assert.throws(() => enforceProfileIdentityLocks({}, { data: { cohort: '42' } },
    { full_name: 'First' }, { data: { cohort: '41' } }, null), { status: 400 });
});

test('11-digit code receives exactly one leading zero; invalid remains invalid', () => {
  assert.equal(normalizeDirectoryStudentCode('12345678901'), '012345678901');
  assert.equal(normalizeDirectoryStudentCode('012345678901'), '012345678901');
  assert.equal(normalizeDirectoryStudentCode('1234567890'), null);
});

test('known academic directory labels map to the existing catalog without guessing others', () => {
  assert.equal(directoryProgramToProfile('Chất lượng cao'), 'ĐHCQ Tiếng Anh bán phần (TABP/CLC)');
  assert.equal(directoryProgramToProfile('Song bằng quốc tế'), 'ĐHCQ Quốc tế cấp song bằng');
  assert.equal(directoryCohortToProfile('41', 'Đại học chính quy chuẩn'), 'K41');
  assert.equal(directoryCohortToProfile('14', 'Chất lượng cao'), 'CLCK14');
  assert.equal(directoryCohortToProfile('20', 'Song bằng quốc tế'), '20');
});

test('compatible duplicate merges deterministically; conflict names are bounded', () => {
  const a = { full_name: 'A', cohort: null };
  const b = { full_name: 'A', cohort: '41' };
  assert.equal(mergeDirectoryRecords(a, b).merged.cohort, '41');
  assert.deepEqual(mergeDirectoryRecords(a, { full_name: 'B' }).conflicts, ['full_name']);
});

test('existing customized editable fields survive backfill and blanks fill', () => {
  const profile = { majorName: 'My choice', gender: '' };
  assert.equal(fillEditableDirectoryField(profile, 'majorName', 'Directory major'), 'preserved');
  assert.equal(fillEditableDirectoryField(profile, 'gender', 'Nữ'), 'filled');
  assert.deepEqual(profile, { majorName: 'My choice', gender: 'Nữ' });
});

test('synthetic workbook validates and SQL remains deterministic', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'hub-directory-test-'));
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Directory');
    sheet.addRow(['MSSV', 'Họ tên', 'Khóa', 'Ngành']);
    sheet.addRow(['12345678901', 'A', '41', 'M1']);
    sheet.addRow(['012345678901', 'A', '41', 'M1']);
    sheet.addRow(['invalid', 'B', '42', 'M2']);
    const file = path.join(temp, 'synthetic.xlsx');
    await workbook.xlsx.writeFile(file);
    const dataset = await validateStudentDirectoryWorkbook(file);
    assert.equal(dataset.counts.totalRows, 3);
    assert.equal(dataset.counts.validRows, 2);
    assert.equal(dataset.counts.duplicateRows, 1);
    assert.equal(dataset.counts.invalidMssv, 1);
    assert.equal(dataset.rows.length, 1);
    assert.equal(dataset.rows[0].student_code, '012345678901');
    const first = buildStudentDirectoryImportSql(dataset.rows, dataset.sourceVersion, '2026-01-01T00:00:00.000Z');
    assert.equal(first, buildStudentDirectoryImportSql(dataset.rows, dataset.sourceVersion,
      '2026-01-01T00:00:00.000Z'));
    assert.match(first, /ON CONFLICT\(student_code\) DO UPDATE/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('conflicting synthetic duplicate fails before any write', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'hub-directory-test-'));
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Directory');
    sheet.addRow(['MSSV', 'Họ tên']);
    sheet.addRow(['012345678901', 'A']);
    sheet.addRow(['012345678901', 'B']);
    const file = path.join(temp, 'conflict.xlsx');
    await workbook.xlsx.writeFile(file);
    await assert.rejects(validateStudentDirectoryWorkbook(file), /Conflicting duplicate MSSV/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('D1 migration stores MSSV as text and import upsert is idempotent', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const migration = await readFile(new URL('../cloudflare/migrations/0051_student_directory.sql', import.meta.url), 'utf8');
    db.exec(migration);
    const row = { student_code: '012345678901', full_name: 'A', gender: null,
      general_class: null, major_class: null, major: null, specialization: null,
      training_program: null, cohort: '41' };
    const sql = buildStudentDirectoryImportSql([row], 'source-test', '2026-01-01T00:00:00.000Z');
    db.exec(sql);
    db.exec(sql);
    assert.deepEqual({ ...db.prepare('SELECT COUNT(*) AS rows,typeof(student_code) AS type FROM student_directory').get() },
      { rows: 1, type: 'text' });
    assert.throws(() => db.exec("INSERT INTO student_directory (student_code,source_version,imported_at,updated_at) VALUES ('not-a-code','s','t','t')"));
  } finally { db.close(); }
});
