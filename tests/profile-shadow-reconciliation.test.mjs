import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  ProfileShadowError,
  buildUpsertStatements,
  canonicalJsonValue,
  compareShadowDatasets,
  projectPrivateProfileRow,
  projectProfileRow,
} from '../scripts/profile-shadow-reconciliation.mjs';

const PROFILE_ID = '123e4567-e89b-42d3-a456-426614174000';

test('canonical JSON recursively sorts object keys without changing array order', () => {
  assert.deepEqual(canonicalJsonValue({ z: 1, a: { y: 2, b: 3 }, rows: [{ d: 4, c: 5 }] }), {
    a: { b: 3, y: 2 },
    rows: [{ c: 5, d: 4 }],
    z: 1,
  });
});

test('public profile projection is deterministic and excludes auth-only source fields', () => {
  const source = {
    id: PROFILE_ID.toUpperCase(),
    email: 'excluded@example.invalid',
    password_set_at: '2026-01-01T00:00:00Z',
    student_code: '030800000001',
    full_name: 'Student',
    avatar_url: null,
    bio: null,
    class_name: 'K01',
    class_name_overridden: false,
    profile_tags: [{ z: 1, a: 2 }],
    public_profile_enabled: true,
    show_profile_stats: false,
    public_gpa: 3.5,
    public_completed_semesters: 4,
    public_credits: 80,
    created_at: '2026-01-01 00:00:00+00',
    updated_at: '2026-01-02 00:00:00+00',
  };
  const first = projectProfileRow(source);
  const second = projectProfileRow({ ...source, profile_tags: [{ a: 2, z: 1 }] });

  assert.equal(first.user_id, PROFILE_ID);
  assert.equal(first.class_name_overridden, 0);
  assert.equal(first.public_profile_enabled, 1);
  assert.equal(first.profile_tags_json, '[{"a":2,"z":1}]');
  assert.equal(first.canonical_hash, second.canonical_hash);
  assert.equal(Object.hasOwn(first, 'email'), false);
  assert.equal(Object.hasOwn(first, 'password_set_at'), false);
});

test('private projection excludes duplicated auth identity and validates JSON shapes', () => {
  const projected = projectPrivateProfileRow({
    user_id: PROFILE_ID,
    email: 'excluded@example.invalid',
    password_set_at: '2026-01-01T00:00:00Z',
    student_code: 'excluded-duplicate',
    data: { z: true, a: 1 },
    student_name: 'Student',
    cohort: '2026',
    major_name: 'Major',
    specialization_name: null,
    program_name: 'Program',
    semesters: [{ semester: 'HK1' }],
    target_gpa: 3.8,
    total_credits_required: 120,
    has_onboarded: true,
    lookback_seen: { dashboard: true },
    updated_at: '2026-01-02T00:00:00Z',
  });

  assert.equal(projected.data_json, '{"a":1,"z":true}');
  assert.equal(projected.has_onboarded, 1);
  assert.equal(Object.hasOwn(projected, 'email'), false);
  assert.equal(Object.hasOwn(projected, 'student_code'), false);
  assert.throws(
    () => projectPrivateProfileRow({ ...projected, data: [], semesters: [], updated_at: projected.updated_at }),
    (error) => error instanceof ProfileShadowError && error.code === 'JSON_OBJECT_REQUIRED',
  );
});

test('upsert is idempotent by canonical hash and never rewrites user_id', () => {
  const statements = buildUpsertStatements(
    'user_profiles',
    [{
      user_id: PROFILE_ID,
      full_name: "O'Brien",
      updated_at: '2026-01-02T00:00:00.000Z',
      canonical_hash: 'a'.repeat(64),
    }],
    ['user_id', 'full_name', 'updated_at', 'canonical_hash'],
  );

  assert.equal(statements.length, 1);
  assert.match(statements[0], /ON CONFLICT\(user_id\) DO UPDATE/);
  assert.match(statements[0], /WHERE user_profiles\.canonical_hash <> excluded\.canonical_hash/);
  assert.match(statements[0], /user_profiles\.updated_at < excluded\.updated_at/);
  assert.match(statements[0], /O''Brien/);
  assert.doesNotMatch(statements[0], /user_id=excluded\.user_id/);
});

test('profile delta upserts reject stale and conflicting equal-timestamp snapshots', async (t) => {
  const specifications = [
    {
      table: 'user_profiles',
      valueColumn: 'full_name',
      columns: ['user_id', 'full_name', 'updated_at', 'canonical_hash'],
    },
    {
      table: 'user_profile_private',
      valueColumn: 'data_json',
      columns: ['user_id', 'data_json', 'updated_at', 'canonical_hash'],
    },
  ];

  const timestamp = (day) => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;
  const row = (specification, day, value, hash) => ({
    user_id: PROFILE_ID,
    [specification.valueColumn]: value,
    updated_at: timestamp(day),
    canonical_hash: hash.repeat(64),
  });

  for (const specification of specifications) {
    await t.test(specification.table, () => {
      const createDatabase = () => {
        const database = new DatabaseSync(':memory:');
        database.exec(`CREATE TABLE ${specification.table} (
          user_id TEXT PRIMARY KEY,
          ${specification.valueColumn} TEXT,
          updated_at TEXT NOT NULL,
          canonical_hash TEXT NOT NULL,
          row_version INTEGER NOT NULL
        )`);
        return database;
      };
      const apply = (database, value) => database.exec(
        buildUpsertStatements(specification.table, [value], specification.columns).join('\n'),
      );
      const read = (database) => ({ ...database.prepare(
        `SELECT ${specification.valueColumn} AS value, updated_at, canonical_hash, row_version
         FROM ${specification.table} WHERE user_id = ?`,
      ).get(PROFILE_ID) });

      const newerDatabase = createDatabase();
      apply(newerDatabase, row(specification, 1, 'older', 'a'));
      apply(newerDatabase, row(specification, 2, 'newer', 'b'));
      assert.deepEqual(read(newerDatabase), {
        value: 'newer', updated_at: timestamp(2), canonical_hash: 'b'.repeat(64), row_version: 2,
      });

      const staleDatabase = createDatabase();
      apply(staleDatabase, row(specification, 2, 'newer', 'b'));
      apply(staleDatabase, row(specification, 1, 'older', 'a'));
      assert.deepEqual(read(staleDatabase), {
        value: 'newer', updated_at: timestamp(2), canonical_hash: 'b'.repeat(64), row_version: 1,
      });

      const idempotentDatabase = createDatabase();
      apply(idempotentDatabase, row(specification, 2, 'same', 'c'));
      apply(idempotentDatabase, row(specification, 2, 'same', 'c'));
      assert.deepEqual(read(idempotentDatabase), {
        value: 'same', updated_at: timestamp(2), canonical_hash: 'c'.repeat(64), row_version: 1,
      });

      const tieDatabase = createDatabase();
      apply(tieDatabase, row(specification, 2, 'kept', 'd'));
      apply(tieDatabase, row(specification, 2, 'blocked', 'e'));
      assert.deepEqual(read(tieDatabase), {
        value: 'kept', updated_at: timestamp(2), canonical_hash: 'd'.repeat(64), row_version: 1,
      });
    });
  }
});

test('reconciliation counts missing, extra, profile-only, and hash mismatches', () => {
  const other = '223e4567-e89b-42d3-a456-426614174000';
  const summary = compareShadowDatasets({
    sourceProfiles: [
      { user_id: PROFILE_ID, canonical_hash: 'a' },
      { user_id: other, canonical_hash: 'b' },
    ],
    sourcePrivate: [{ user_id: PROFILE_ID, canonical_hash: 'c' }],
    d1Profiles: [
      { user_id: PROFILE_ID, canonical_hash: 'wrong' },
      { user_id: '323e4567-e89b-42d3-a456-426614174000', canonical_hash: 'd' },
    ],
    d1Private: [{ user_id: PROFILE_ID, canonical_hash: 'c' }],
  });

  assert.equal(summary.MISSING_PROFILE_IDS, 1);
  assert.equal(summary.EXTRA_PROFILE_IDS, 1);
  assert.equal(summary.PROFILE_ONLY_ROWS, 1);
  assert.equal(summary.SYNTHETIC_BETTER_AUTH_ONLY_ROWS, 1);
  assert.equal(summary.FIELD_HASH_MISMATCH, 2);
});
