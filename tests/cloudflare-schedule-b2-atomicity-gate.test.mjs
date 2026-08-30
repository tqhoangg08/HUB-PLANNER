import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Miniflare } from 'miniflare';

const migration = readFileSync(
  'cloudflare/migrations/0015_add_user_schedule_transaction_assertions.sql',
  'utf8',
);
const schedulesMigration = readFileSync(
  'cloudflare/migrations/0011_create_user_schedules.sql',
  'utf8',
);
const safetyMigration = readFileSync(
  'cloudflare/migrations/0014_add_user_schedule_write_safety.sql',
  'utf8',
);

const createLocalD1 = async () => {
  const schema = [schedulesMigration, safetyMigration, migration]
    .map((sql) => sql.replace(/^--.*$/gm, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((statement) => `${statement};`)
    .join('\n');
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: '2026-07-29',
    script: `
      const schema = ${JSON.stringify(schema)};
      const snapshot = async (db) => db.prepare(\`
        SELECT
          (SELECT COUNT(*) FROM user_schedules) AS schedules,
          (SELECT COUNT(*) FROM user_schedule_revisions) AS revisions,
          (SELECT revision FROM user_schedule_revisions
            WHERE user_id = 'user-a' AND semester = '2026-1') AS revision,
          (SELECT last_operation_id FROM user_schedule_revisions
            WHERE user_id = 'user-a' AND semester = '2026-1') AS lastOperationId,
          (SELECT COUNT(*) FROM user_schedule_mutation_receipts) AS receipts,
          (SELECT COUNT(*) FROM user_schedule_transaction_assertions) AS assertions
      \`).first();
      export default {
        async fetch(request, env) {
          const url = new URL(request.url);
          if (url.pathname === '/setup') {
            await env.DB.exec(schema);
            return Response.json({ ready: true });
          }
          if (url.pathname === '/seed-old') {
            await env.DB.prepare(\`
              INSERT INTO user_schedule_revisions
                (user_id, semester, revision, updated_at, last_operation_id)
              VALUES ('user-a', '2026-1', 4, ?, 'old-operation')
            \`).bind('2026-08-12T00:00:00.000Z').run();
            return Response.json({ state: await snapshot(env.DB) });
          }
          const operationId = url.searchParams.get('operationId');
          const idempotencyKey = url.searchParams.get('idempotencyKey');
          const courseId = url.searchParams.get('courseId') || 'course-a';
          const scheduleId = url.searchParams.get('scheduleId') || 'schedule-a';
          const expectedRevision = Number(url.searchParams.get('expectedRevision'));
          const cleanupFailure = url.searchParams.get('cleanupFailure') === 'true';
          const injectedFailure = url.searchParams.get('failure');
          const statements = [
            env.DB.prepare(\`
              INSERT OR IGNORE INTO user_schedule_revisions
                (user_id, semester, revision, updated_at, last_operation_id)
              VALUES ('user-a', '2026-1', 0, ?, NULL)
            \`).bind('2026-08-12T00:00:00.000Z'),
            env.DB.prepare(\`
              UPDATE user_schedule_revisions
              SET revision = revision + 1, updated_at = ?, last_operation_id = ?
              WHERE user_id = 'user-a' AND semester = '2026-1' AND revision = ?
            \`).bind('2026-08-12T00:00:00.000Z', operationId, expectedRevision),
            env.DB.prepare(\`
              INSERT INTO user_schedules
                (id, user_id, course_id, semester, custom_data, created_at, updated_at)
              VALUES (?, 'user-a', ?, '2026-1', NULL, ?, ?)
            \`).bind(scheduleId, courseId, '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
            env.DB.prepare(\`
              INSERT INTO user_schedule_transaction_assertions
                (operation_id, passed, created_at)
              VALUES (
                ?,
                CASE WHEN (
                  SELECT CASE
                    WHEN revision = ? AND last_operation_id = ? THEN 1
                    ELSE 0
                  END
                  FROM user_schedule_revisions
                  WHERE user_id = 'user-a' AND semester = '2026-1'
                ) = 1 THEN 1 ELSE 0 END,
                ?
              )
            \`).bind(operationId, expectedRevision + 1, operationId, '2026-08-12T00:00:00.000Z'),
            env.DB.prepare(\`
              INSERT INTO user_schedule_mutation_receipts
                (user_id, idempotency_key, request_hash, response_json, created_at)
              VALUES ('user-a', ?, ?, ?, ?)
            \`).bind(
              idempotencyKey,
              injectedFailure === 'receipt' ? 'invalid-hash' : 'e'.repeat(64),
              JSON.stringify({ success: true, revision: expectedRevision + 1 }),
              '2026-08-12T00:00:00.000Z',
            ),
            cleanupFailure
              ? env.DB.prepare('DELETE FROM missing_assertion_cleanup_table WHERE operation_id = ?').bind(operationId)
              : env.DB.prepare('DELETE FROM user_schedule_transaction_assertions WHERE operation_id = ?').bind(operationId),
          ];
          if (injectedFailure === 'schedule') {
            statements.splice(3, 0, env.DB.prepare(\`
              INSERT INTO user_schedules
                (id, user_id, course_id, semester, created_at, updated_at)
              VALUES (?, 'user-a', 'duplicate-course', '2026-1', ?, ?)
            \`).bind(scheduleId, '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'));
          }
          let committed = true;
          try {
            await env.DB.batch(statements);
          } catch {
            committed = false;
          }
          return Response.json({ committed, state: await snapshot(env.DB) });
        }
      };
    `,
    d1Databases: { DB: crypto.randomUUID() },
  });
  const setupResponse = await mf.dispatchFetch('http://localhost/setup');
  const setupText = await setupResponse.text();
  if (setupResponse.status !== 200) {
    await mf.dispose();
    assert.fail(setupText);
  }
  const add = async (options) => {
    const url = new URL('http://localhost/add');
    for (const [key, value] of Object.entries(options)) url.searchParams.set(key, String(value));
    const response = await mf.dispatchFetch(url);
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return JSON.parse(text);
  };
  const seedOld = async () => {
    const response = await mf.dispatchFetch('http://localhost/seed-old');
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return JSON.parse(text);
  };
  return { add, seedOld, dispose: () => mf.dispose() };
};

const createDatabase = ({ seedRevision = true } = {}) => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE user_schedules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      semester TEXT NOT NULL,
      custom_data TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      UNIQUE (user_id, course_id)
    );
    CREATE TABLE user_schedule_revisions (
      user_id TEXT NOT NULL,
      semester TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, semester)
    );
    CREATE TABLE user_schedule_mutation_receipts (
      user_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, idempotency_key)
    );
  `);
  db.exec(migration);
  if (seedRevision) {
    db.prepare(`
      INSERT INTO user_schedule_revisions (user_id, semester, revision, updated_at)
      VALUES (?, ?, 0, ?)
    `).run('user-a', '2026-1', '2026-08-12T00:00:00.000Z');
  }
  return db;
};

const snapshot = (db) => ({
  schedules: db.prepare('SELECT COUNT(*) AS count FROM user_schedules').get().count,
  revision: db.prepare(`
    SELECT revision FROM user_schedule_revisions
    WHERE user_id = 'user-a' AND semester = '2026-1'
  `).get().revision,
  receipts: db.prepare('SELECT COUNT(*) AS count FROM user_schedule_mutation_receipts').get().count,
  assertions: db.prepare('SELECT COUNT(*) AS count FROM user_schedule_transaction_assertions').get().count,
});

const transaction = (db, callback) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    callback();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

const insertAssertion = (db, operationId, expectedRevision) => {
  db.prepare(`
    INSERT INTO user_schedule_transaction_assertions (operation_id, passed, created_at)
    VALUES (
      ?,
      CASE WHEN (
        SELECT CASE
          WHEN revision = ? AND last_operation_id = ? THEN 1
          ELSE 0
        END
        FROM user_schedule_revisions
        WHERE user_id = ? AND semester = ?
      ) = 1 THEN 1 ELSE 0 END,
      ?
    )
  `).run(
    operationId,
    expectedRevision,
    operationId,
    'user-a',
    '2026-1',
    '2026-08-12T00:00:00.000Z',
  );
};

const successfulAdd = (db, {
  operationId,
  idempotencyKey,
  expectedRevision,
  courseId = 'course-a',
  scheduleId = 'schedule-a',
}) => {
  transaction(db, () => {
    db.prepare(`
      INSERT OR IGNORE INTO user_schedule_revisions
        (user_id, semester, revision, updated_at, last_operation_id)
      VALUES ('user-a', '2026-1', 0, ?, NULL)
    `).run('2026-08-12T00:00:00.000Z');
    db.prepare(`
      UPDATE user_schedule_revisions
      SET revision = revision + 1, updated_at = ?, last_operation_id = ?
      WHERE user_id = 'user-a' AND semester = '2026-1' AND revision = ?
    `).run('2026-08-12T00:00:00.000Z', operationId, expectedRevision);
    db.prepare(`
      INSERT INTO user_schedules
        (id, user_id, course_id, semester, custom_data, created_at, updated_at)
      VALUES (?, 'user-a', ?, '2026-1', NULL, ?, ?)
    `).run(
      scheduleId,
      courseId,
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:00:00.000Z',
    );
    insertAssertion(db, operationId, expectedRevision + 1);
    db.prepare(`
      INSERT INTO user_schedule_mutation_receipts
        (user_id, idempotency_key, request_hash, response_json, created_at)
      VALUES ('user-a', ?, ?, ?, ?)
    `).run(
      idempotencyKey,
      'a'.repeat(64),
      JSON.stringify({ success: true, revision: expectedRevision + 1 }),
      '2026-08-12T00:00:00.000Z',
    );
    db.prepare('DELETE FROM user_schedule_transaction_assertions WHERE operation_id = ?').run(operationId);
  });
};

test('0015 is additive and creates only the CAS marker plus constrained assertion table', () => {
  const statements = migration.replace(/^--.*$/gm, '');
  assert.match(migration, /ALTER TABLE user_schedule_revisions ADD COLUMN last_operation_id TEXT/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_schedule_transaction_assertions/i);
  assert.match(migration, /passed INTEGER NOT NULL CHECK \(passed = 1\)/i);
  assert.match(migration, /operation_id TEXT PRIMARY KEY/i);
  assert.doesNotMatch(statements, /\b(?:DROP|DELETE|UPDATE|INSERT|REPLACE|TRUNCATE)\b/i);
});

test('real 0011 and 0014 state is preserved exactly when 0015 is applied', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schedulesMigration);
  db.exec(safetyMigration);
  db.prepare(`
    INSERT INTO user_schedules
      (id, user_id, course_id, semester, custom_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run(
    'schedule-existing',
    'user-existing',
    'course-existing',
    '2025-2',
    JSON.stringify({ label: 'existing' }),
    '2026-01-01T00:00:00.000Z',
  );
  db.prepare(`
    INSERT INTO user_schedule_revisions (user_id, semester, revision, updated_at)
    VALUES ('user-existing', '2025-2', 7, '2026-01-01T00:00:00.000Z')
  `).run();
  db.prepare(`
    INSERT INTO user_schedule_mutation_receipts
      (user_id, idempotency_key, request_hash, response_json, created_at)
    VALUES ('user-existing', 'existing-key', ?, ?, '2026-01-01T00:00:00.000Z')
  `).run('c'.repeat(64), JSON.stringify({ success: true, revision: 7 }));

  const scheduleBefore = db.prepare(`
    SELECT id, user_id, course_id, semester, custom_data, created_at, updated_at
    FROM user_schedules ORDER BY id
  `).all();
  const revisionBefore = db.prepare(`
    SELECT user_id, semester, revision, updated_at
    FROM user_schedule_revisions ORDER BY user_id, semester
  `).all();
  const receiptBefore = db.prepare(`
    SELECT user_id, idempotency_key, request_hash, response_json, created_at
    FROM user_schedule_mutation_receipts ORDER BY user_id, idempotency_key
  `).all();

  db.exec(migration);

  assert.deepEqual(db.prepare(`
    SELECT id, user_id, course_id, semester, custom_data, created_at, updated_at
    FROM user_schedules ORDER BY id
  `).all(), scheduleBefore);
  assert.deepEqual(db.prepare(`
    SELECT user_id, semester, revision, updated_at
    FROM user_schedule_revisions ORDER BY user_id, semester
  `).all(), revisionBefore);
  assert.deepEqual(db.prepare(`
    SELECT user_id, idempotency_key, request_hash, response_json, created_at
    FROM user_schedule_mutation_receipts ORDER BY user_id, idempotency_key
  `).all(), receiptBefore);
  assert.equal(db.prepare(`
    SELECT last_operation_id FROM user_schedule_revisions
    WHERE user_id = 'user-existing' AND semester = '2025-2'
  `).get().last_operation_id, null);
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM pragma_table_info('user_schedule_revisions')
    WHERE name = 'last_operation_id'
  `).get().count, 1);
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM pragma_index_list('user_schedule_transaction_assertions')
    WHERE origin = 'pk'
  `).get().count, 1);
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM user_schedule_transaction_assertions
  `).get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM pragma_foreign_key_check').get().count, 0);
  db.close();
});

test('schema 0014 alone cannot abort a batch when a conditional CAS changes zero rows', () => {
  const db = createDatabase();
  transaction(db, () => {
    const result = db.prepare(`
      UPDATE user_schedule_revisions SET revision = revision + 1
      WHERE user_id = 'user-a' AND semester = '2026-1' AND revision = 9
    `).run();
    assert.equal(result.changes, 0);
    db.prepare(`
      INSERT INTO user_schedule_mutation_receipts
        (user_id, idempotency_key, request_hash, response_json, created_at)
      VALUES ('user-a', 'unsafe-key', ?, '{}', ?)
    `).run('a'.repeat(64), '2026-08-12T00:00:00.000Z');
  });
  assert.deepEqual(snapshot(db), { schedules: 0, revision: 0, receipts: 1, assertions: 0 });
  db.close();
});

test('0015 assertion failure rolls back schedule, revision, receipt, and marker atomically', () => {
  const db = createDatabase();
  assert.throws(() => successfulAdd(db, {
    operationId: 'stale-operation',
    idempotencyKey: 'stale-key',
    expectedRevision: 9,
  }), /CHECK constraint failed/);
  assert.deepEqual(snapshot(db), { schedules: 0, revision: 0, receipts: 0, assertions: 0 });
  db.close();
});

test('successful guarded mutation commits all state and leaves no assertion marker', () => {
  const db = createDatabase();
  successfulAdd(db, { operationId: 'operation-a', idempotencyKey: 'key-a', expectedRevision: 0 });
  assert.deepEqual(snapshot(db), { schedules: 1, revision: 1, receipts: 1, assertions: 0 });
  db.close();
});

test('schedule, revision, and receipt failures each roll back the complete transaction', () => {
  for (const failure of ['schedule', 'revision', 'receipt']) {
    const db = createDatabase();
    assert.throws(() => transaction(db, () => {
      db.prepare(`
        INSERT INTO user_schedules
          (id, user_id, course_id, semester, created_at, updated_at)
        VALUES ('schedule-a', 'user-a', 'course-a', '2026-1', ?, ?)
      `).run('2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z');
      if (failure === 'schedule') {
        db.prepare(`INSERT INTO user_schedules
          (id, user_id, course_id, semester, created_at) VALUES
          ('schedule-a', 'user-a', 'course-b', '2026-1', ?)`)
          .run('2026-08-12T00:00:00.000Z');
      }
      const revision = failure === 'revision' ? -1 : 1;
      db.prepare(`
        UPDATE user_schedule_revisions
        SET revision = ?, updated_at = ?, last_operation_id = ?
        WHERE user_id = 'user-a' AND semester = '2026-1'
      `).run(revision, '2026-08-12T00:00:00.000Z', `operation-${failure}`);
      insertAssertion(db, `operation-${failure}`, 1);
      db.prepare(`
        INSERT INTO user_schedule_mutation_receipts
          (user_id, idempotency_key, request_hash, response_json, created_at)
        VALUES ('user-a', ?, ?, '{}', ?)
      `).run(
        `key-${failure}`,
        failure === 'receipt' ? 'invalid-hash' : 'a'.repeat(64),
        '2026-08-12T00:00:00.000Z',
      );
      db.prepare('DELETE FROM user_schedule_transaction_assertions WHERE operation_id = ?')
        .run(`operation-${failure}`);
    }));
    assert.deepEqual(snapshot(db), { schedules: 0, revision: 0, receipts: 0, assertions: 0 });
    db.close();
  }
});

test('two writes from the same starting revision have exactly one winner', () => {
  const db = createDatabase();
  successfulAdd(db, { operationId: 'winner', idempotencyKey: 'winner-key', expectedRevision: 0 });
  assert.throws(() => transaction(db, () => {
    db.prepare(`
      UPDATE user_schedule_revisions
      SET revision = revision + 1, updated_at = ?, last_operation_id = 'stale-competitor'
      WHERE user_id = 'user-a' AND semester = '2026-1' AND revision = 0
    `).run('2026-08-12T00:00:01.000Z');
    insertAssertion(db, 'stale-competitor', 1);
    db.prepare(`
      INSERT INTO user_schedule_mutation_receipts
        (user_id, idempotency_key, request_hash, response_json, created_at)
      VALUES ('user-a', 'stale-key', ?, '{}', ?)
    `).run('b'.repeat(64), '2026-08-12T00:00:01.000Z');
  }), /UNIQUE constraint failed|CHECK constraint failed/);
  assert.deepEqual(snapshot(db), { schedules: 1, revision: 1, receipts: 1, assertions: 0 });
  db.close();
});

test('an old operation marker cannot satisfy a fresh stale assertion', () => {
  const db = createDatabase();
  db.prepare(`
    UPDATE user_schedule_revisions
    SET revision = 4, last_operation_id = 'old-operation'
    WHERE user_id = 'user-a' AND semester = '2026-1'
  `).run();
  assert.throws(() => transaction(db, () => {
    db.prepare(`
      UPDATE user_schedule_revisions
      SET revision = revision + 1, last_operation_id = 'new-operation'
      WHERE user_id = 'user-a' AND semester = '2026-1' AND revision = 3
    `).run();
    insertAssertion(db, 'new-operation', 4);
  }), /CHECK constraint failed/);
  const row = db.prepare(`
    SELECT revision, last_operation_id FROM user_schedule_revisions
    WHERE user_id = 'user-a' AND semester = '2026-1'
  `).get();
  assert.deepEqual({ ...row }, { revision: 4, last_operation_id: 'old-operation' });
  assert.equal(snapshot(db).assertions, 0);
  db.close();
});

test('absent revision initialization is race-safe and has exactly one winner', () => {
  const db = createDatabase({ seedRevision: false });
  successfulAdd(db, {
    operationId: 'initializer-a',
    idempotencyKey: 'initializer-key-a',
    expectedRevision: 0,
    courseId: 'course-a',
    scheduleId: 'schedule-a',
  });
  assert.throws(() => successfulAdd(db, {
    operationId: 'initializer-b',
    idempotencyKey: 'initializer-key-b',
    expectedRevision: 0,
    courseId: 'course-b',
    scheduleId: 'schedule-b',
  }), /CHECK constraint failed/);
  assert.deepEqual(snapshot(db), { schedules: 1, revision: 1, receipts: 1, assertions: 0 });
  assert.equal(db.prepare(`
    SELECT last_operation_id FROM user_schedule_revisions
    WHERE user_id = 'user-a' AND semester = '2026-1'
  `).get().last_operation_id, 'initializer-a');
  db.close();
});

test('failure during assertion cleanup rolls back all mutation state', () => {
  const db = createDatabase();
  assert.throws(() => transaction(db, () => {
    db.prepare(`
      UPDATE user_schedule_revisions
      SET revision = 1, last_operation_id = 'cleanup-operation'
      WHERE user_id = 'user-a' AND semester = '2026-1' AND revision = 0
    `).run();
    db.prepare(`
      INSERT INTO user_schedules
        (id, user_id, course_id, semester, created_at, updated_at)
      VALUES ('schedule-cleanup', 'user-a', 'course-cleanup', '2026-1', ?, ?)
    `).run('2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z');
    insertAssertion(db, 'cleanup-operation', 1);
    db.prepare(`
      INSERT INTO user_schedule_mutation_receipts
        (user_id, idempotency_key, request_hash, response_json, created_at)
      VALUES ('user-a', 'cleanup-key', ?, '{}', ?)
    `).run('d'.repeat(64), '2026-08-12T00:00:00.000Z');
    db.exec('DELETE FROM missing_assertion_cleanup_table');
  }), /no such table/);
  assert.deepEqual(snapshot(db), { schedules: 0, revision: 0, receipts: 0, assertions: 0 });
  db.close();
});

test('local D1 batch rolls back earlier statements when the exact assertion is false', async () => {
  const { add, dispose } = await createLocalD1();
  try {
    const result = await add({
      operationId: 'd1-false-operation',
      idempotencyKey: 'd1-false-key',
      expectedRevision: 9,
    });
    assert.equal(result.committed, false);
    assert.deepEqual(result.state, {
      schedules: 0,
      revisions: 0,
      revision: null,
      lastOperationId: null,
      receipts: 0,
      assertions: 0,
    });
  } finally {
    await dispose();
  }
});

test('local D1 batch commits a true assertion exactly once and cleans its marker', async () => {
  const { add, dispose } = await createLocalD1();
  try {
    const result = await add({
      operationId: 'd1-true-operation',
      idempotencyKey: 'd1-true-key',
      expectedRevision: 0,
    });
    assert.equal(result.committed, true);
    assert.deepEqual(result.state, {
      schedules: 1,
      revisions: 1,
      revision: 1,
      lastOperationId: 'd1-true-operation',
      receipts: 1,
      assertions: 0,
    });
  } finally {
    await dispose();
  }
});

test('concurrent local D1 batches from an absent revision have one exact marker winner', async () => {
  const { add, dispose } = await createLocalD1();
  try {
    const outcomes = await Promise.all([
      add({
        operationId: 'd1-race-a',
        idempotencyKey: 'd1-race-key-a',
        expectedRevision: 0,
        courseId: 'course-a',
        scheduleId: 'schedule-a',
      }),
      add({
        operationId: 'd1-race-b',
        idempotencyKey: 'd1-race-key-b',
        expectedRevision: 0,
        courseId: 'course-b',
        scheduleId: 'schedule-b',
      }),
    ]);
    assert.equal(outcomes.filter(({ committed }) => committed).length, 1);
    assert.equal(outcomes.filter(({ committed }) => !committed).length, 1);
    const state = outcomes.find(({ committed }) => !committed).state;
    assert.deepEqual(state, {
      schedules: 1,
      revisions: 1,
      revision: 1,
      receipts: 1,
      assertions: 0,
      lastOperationId: state.lastOperationId,
    });
    assert.ok(state.lastOperationId === 'd1-race-a' || state.lastOperationId === 'd1-race-b');
  } finally {
    await dispose();
  }
});

test('local D1 batch cleanup failure rolls back schedule, revision, receipt, and assertion', async () => {
  const { add, dispose } = await createLocalD1();
  try {
    const result = await add({
      operationId: 'd1-cleanup-operation',
      idempotencyKey: 'd1-cleanup-key',
      expectedRevision: 0,
      cleanupFailure: true,
    });
    assert.equal(result.committed, false);
    assert.deepEqual(result.state, {
      schedules: 0,
      revisions: 0,
      revision: null,
      lastOperationId: null,
      receipts: 0,
      assertions: 0,
    });
  } finally {
    await dispose();
  }
});

test('local D1 exact fresh marker rejects an old-marker false positive', async () => {
  const { add, seedOld, dispose } = await createLocalD1();
  try {
    await seedOld();
    const result = await add({
      operationId: 'new-operation',
      idempotencyKey: 'new-operation-key',
      expectedRevision: 3,
    });
    assert.equal(result.committed, false);
    assert.deepEqual(result.state, {
      schedules: 0,
      revisions: 1,
      revision: 4,
      lastOperationId: 'old-operation',
      receipts: 0,
      assertions: 0,
    });
  } finally {
    await dispose();
  }
});

for (const failure of ['schedule', 'receipt']) {
  test(`local D1 ${failure} failure after CAS rolls back every state component`, async () => {
    const { add, dispose } = await createLocalD1();
    try {
      const result = await add({
        operationId: `d1-${failure}-operation`,
        idempotencyKey: `d1-${failure}-key`,
        expectedRevision: 0,
        failure,
      });
      assert.equal(result.committed, false);
      assert.deepEqual(result.state, {
        schedules: 0,
        revisions: 0,
        revision: null,
        lastOperationId: null,
        receipts: 0,
        assertions: 0,
      });
    } finally {
      await dispose();
    }
  });
}
