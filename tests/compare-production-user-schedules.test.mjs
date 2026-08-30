import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ReconciliationError,
  assertReadOnlySql,
  compareScheduleDatasets,
  normalizeCustomData,
  normalizeScheduleRow,
  normalizeTimestamp,
  parseWranglerJson,
  runProductionReconciliation,
} from '../scripts/compare-production-user-schedules.mjs';

const USER = 'd9428888-122b-4f0f-b88f-1c8f4f762b22';
const OTHER_USER = '57768d5d-e2a7-49c3-92a5-3956cd05de69';
const COURSE = '1368d47c-f0cb-47da-aa8a-cb650078b2e2';
const OTHER_COURSE = '52f56aae-3c60-4ccb-9cdf-1de66e24dd79';
const ID = 'f26257a2-f98b-4bf7-a7c3-54866cded95a';

const row = (overrides = {}) => ({
  id: ID,
  user_id: USER,
  course_id: COURSE,
  semester: ' HK1_2026_2027 ',
  custom_data: '{"room":"A.101","nested":{"b":2,"a":1}}',
  created_at: '2026-08-12T08:30:00+07:00',
  ...overrides,
});

const compare = (supabaseRows, d1Rows, options = {}) =>
  compareScheduleDatasets({
    supabaseRows,
    d1Rows,
    authUserIds: [USER, OTHER_USER],
    supabaseCourseIds: [COURSE, OTHER_COURSE],
    d1CourseIds: [COURSE, OTHER_COURSE],
    supabaseSchema: {
      columns: [{ table_name: 'user_schedules', column_name: 'custom_data' }],
    },
    ...options,
  });

test('normalization canonicalizes UUID, semester, JSON keys and timestamps', () => {
  const normalized = normalizeScheduleRow(row({ user_id: USER.toUpperCase() }), 'SUPABASE');
  assert.equal(normalized.user_id, USER);
  assert.equal(normalized.semester, 'HK1_2026_2027');
  assert.equal(normalized.custom_data, '{"nested":{"a":1,"b":2},"room":"A.101"}');
  assert.equal(normalized.created_at, '2026-08-12T01:30:00Z');
  assert.equal(normalizeCustomData({ z: 1, a: [3, 2, 1] }), '{"a":[3,2,1],"z":1}');
  assert.equal(normalizeTimestamp('2026-08-12T01:30:00.123456Z'), '2026-08-12T01:30:00.123456Z');
});

test('exact datasets pass despite custom JSON key order', () => {
  const result = compare(
    [row()],
    [row({ custom_data: '{"nested":{"a":1,"b":2},"room":"A.101"}' })],
  );
  assert.equal(result.RECONCILIATION_STATUS, 'PASS');
  assert.equal(result.FIELD_MISMATCH_ROWS, 0);
});

test('supabase-only, D1-only and matching-key field differences are categorized', () => {
  assert.equal(compare([row()], []).SUPABASE_ONLY_ROWS, 1);
  assert.equal(compare([], [row()]).D1_ONLY_ROWS, 1);
  assert.equal(compare([row()], [row({ semester: 'HK2_2026_2027' })]).FIELD_MISMATCH_ROWS, 1);
});

test('malformed custom data and UUIDs fail closed into aggregate categories', () => {
  const result = compare(
    [row({ custom_data: '{bad' }), row({ id: 'not-a-uuid' })],
    [],
  );
  assert.equal(result.MALFORMED_ROWS_SUPABASE, 2);
  assert.equal(result.RECONCILIATION_STATUS, 'FAIL');
});

test('duplicates, missing owners and missing course references are counted', () => {
  const second = row({ id: '357081c5-9f48-4bbd-a8d8-69579845b48e' });
  const result = compare([row(), second], [row(), second], {
    authUserIds: [],
    supabaseCourseIds: [],
    d1CourseIds: [],
  });
  assert.equal(result.DUPLICATE_OWNER_COURSE_SUPABASE, 1);
  assert.equal(result.DUPLICATE_OWNER_COURSE_D1, 1);
  assert.equal(result.D1_OWNER_NOT_IN_BETTER_AUTH, 1);
  assert.equal(result.MISSING_COURSE_REFERENCE_SUPABASE, 2);
  assert.equal(result.MISSING_COURSE_REFERENCE_D1, 2);
});

test('schema custom_data absence is reported without fabricating equality', () => {
  const result = compare([row({ custom_data: null })], [row({ custom_data: null })], {
    supabaseSchema: { columns: [] },
  });
  assert.equal(result.CUSTOM_DATA_SCHEMA_PRESENT, false);
  assert.equal(result.RECONCILIATION_STATUS, 'FAIL');
});

test('live-schema inventory is represented only by safe counts and a hash', () => {
  const result = compare([row()], [row()], {
    supabaseSchema: {
      columns: [{ table_name: 'user_schedules', column_name: 'custom_data' }],
      constraints: [{ table_name: 'user_schedules', conname: 'user_schedules_pkey' }],
      indexes: [{ table_name: 'user_schedules', indexname: 'user_schedules_pkey' }],
    },
  });
  assert.equal(result.SUPABASE_SCHEMA_COLUMN_COUNT, 1);
  assert.equal(result.SUPABASE_SCHEMA_CONSTRAINT_COUNT, 1);
  assert.equal(result.SUPABASE_SCHEMA_INDEX_COUNT, 1);
  assert.match(result.SUPABASE_SCHEMA_HASH, /^[0-9a-f]{64}$/);
});

test('read-only guard accepts mutation words and semicolons inside quoted literals', () => {
  for (const sql of [
    "SELECT has_table_privilege(current_user, 'x', 'INSERT')",
    "SELECT has_table_privilege(current_user, 'x', 'UPDATE')",
    "SELECT has_table_privilege(current_user, 'x', 'DELETE')",
    "SELECT json_build_object('schedule_insert', false)",
    "SELECT 'DELETE'",
    "SELECT 'text with UPDATE and INSERT'",
    "SELECT 'it''s safe; DELETE remains literal'",
    'SELECT "UPDATE" FROM "INSERT"',
  ]) {
    assert.equal(assertReadOnlySql(sql), sql);
  }
});

test('exact Supabase privilege-verification query passes the read-only guard', () => {
  const privilegeQuery = `SELECT json_build_object(
    'transaction_read_only', current_setting('transaction_read_only'),
    'schedule_insert', has_table_privilege(current_user, 'public.user_schedules', 'INSERT'),
    'schedule_update', has_table_privilege(current_user, 'public.user_schedules', 'UPDATE'),
    'schedule_delete', has_table_privilege(current_user, 'public.user_schedules', 'DELETE'),
    'course_insert', has_table_privilege(current_user, 'public.course_schedules', 'INSERT'),
    'course_update', has_table_privilege(current_user, 'public.course_schedules', 'UPDATE'),
    'course_delete', has_table_privilege(current_user, 'public.course_schedules', 'DELETE')
  )`;
  assert.equal(assertReadOnlySql(privilegeQuery), privilegeQuery);
});

test('read-only guard rejects writes, DDL, comments and multi-statement input', () => {
  assert.equal(assertReadOnlySql('SELECT COUNT(*) FROM user_schedules;'), 'SELECT COUNT(*) FROM user_schedules');
  for (const sql of [
    'INSERT INTO user_schedules VALUES (1)',
    'UPDATE user_schedules SET semester=x',
    'DELETE FROM user_schedules',
    'ALTER TABLE user_schedules ADD COLUMN x TEXT',
    'SELECT 1; DELETE FROM user_schedules',
    "SELECT 'safe'; UPDATE user_schedules SET semester='x'",
    'PRAGMA table_info(user_schedules); DROP TABLE user_schedules',
    'WITH x AS (SELECT 1) DELETE FROM user_schedules',
    'SELECT 1 -- hidden',
    'SELECT 1 /* hidden */',
    "SELECT 'unterminated",
    'SELECT "unterminated',
  ]) {
    assert.throws(() => assertReadOnlySql(sql), ReconciliationError);
  }
});

test('production guards reject missing arguments and unexpected D1 names before access', async () => {
  await assert.rejects(
    runProductionReconciliation([]),
    (error) => error instanceof ReconciliationError && error.code === 'ARGUMENTS_INVALID',
  );
  await assert.rejects(
    runProductionReconciliation([
      '--supabase-service', 'production_readonly',
      '--d1-config', 'cloudflare/wrangler.jsonc',
      '--d1-database', 'unexpected-database',
      '--auth-config', 'cloudflare/wrangler.auth-production.jsonc',
    ]),
    (error) => error instanceof ReconciliationError && error.code === 'PUBLIC_DATABASE_NAME_REJECTED',
  );
});

test('Wrangler parser accepts clean JSON and leading progress but rejects malformed output', () => {
  const expected = [{ results: [{ count: 1 }], success: true }];
  assert.deepEqual(parseWranglerJson(JSON.stringify(expected)), expected);
  assert.deepEqual(parseWranglerJson(`Wrangler progress\r\n${JSON.stringify(expected)}\r\n`), expected);
  assert.throws(() => parseWranglerJson('progress only'), ReconciliationError);
});

test('comparison output contains only aggregate keys and never source row values', () => {
  const result = compare([row()], [row()]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, new RegExp(USER, 'i'));
  assert.doesNotMatch(serialized, new RegExp(COURSE, 'i'));
  assert.doesNotMatch(serialized, /A\.101/);
});
