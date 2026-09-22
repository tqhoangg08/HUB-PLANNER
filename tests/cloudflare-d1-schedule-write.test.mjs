import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const ORIGIN = 'https://hotrosinhvienhub.id.vn';
const USER_A = 'd9428888-122b-4f0f-b88f-1c8f4f762b22';
const USER_B = '57768d5d-e2a7-49c3-92a5-3956cd05de69';
const COURSE_A = '1368d47c-f0cb-47da-aa8a-cb650078b2e2';
const COURSE_B = '2368d47c-f0cb-47da-aa8a-cb650078b2e2';
const COURSE_OTHER_SEMESTER = '3368d47c-f0cb-47da-aa8a-cb650078b2e2';
const COURSE_PUBLISHED_CONTRIBUTION = '4368d47c-f0cb-47da-aa8a-cb650078b2e2';
const COURSE_RETIRED = '5368d47c-f0cb-47da-aa8a-cb650078b2e2';
const SEMESTER = 'HK1_2026_2027';
const OTHER_SEMESTER = 'HK2_2026_2027';

const schema = `
  CREATE TABLE course_schedules (
    id TEXT PRIMARY KEY,
    semester TEXT,
    campus TEXT,
    room TEXT,
    is_user_added INTEGER CHECK (is_user_added IN (0, 1)),
    catalogue_visibility TEXT NOT NULL DEFAULT 'published'
  );
  CREATE TABLE user_schedules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    semester TEXT NOT NULL DEFAULT '',
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
    last_operation_id TEXT,
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
  CREATE TABLE user_schedule_transaction_assertions (
    operation_id TEXT PRIMARY KEY,
    passed INTEGER NOT NULL CHECK (passed = 1),
    created_at TEXT NOT NULL
  );
  CREATE TABLE user_schedule_course_snapshots (
    schedule_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    course_json TEXT NOT NULL,
    source_updated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE user_schedule_rollback_outbox (
    operation_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    semester TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    delivered_at TEXT
  );
  INSERT INTO course_schedules (id, semester, campus, room, is_user_added, catalogue_visibility) VALUES
    ('${COURSE_A}', '${SEMESTER}', 'TD', 'A.101', 0, 'published'),
    ('${COURSE_B}', '${SEMESTER}', NULL, NULL, NULL, 'published'),
    ('${COURSE_OTHER_SEMESTER}', '${OTHER_SEMESTER}', NULL, NULL, 0, 'published'),
    ('${COURSE_PUBLISHED_CONTRIBUTION}', '${SEMESTER}', NULL, NULL, 1, 'published'),
    ('${COURSE_RETIRED}', '${SEMESTER}', NULL, NULL, 0, 'retired');
`;

const createHarness = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hub-planner-b2-'));
  const bundlePath = join(directory, 'worker.mjs');
  await build({
    entryPoints: ['cloudflare/worker/src/index.ts'],
    outfile: bundlePath,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  });
  const applicationScript = await readFile(bundlePath, 'utf8');
  const controlScript = `
    export default {
      async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/__sql') {
          const sql = await request.text();
          try {
            const result = await env.DB.prepare(sql).all();
            return Response.json({ success: true, results: result.results || [] });
          } catch (error) {
            return Response.json({ success: false, error: String(error) }, { status: 500 });
          }
        }
        if (url.pathname === '/__exec') {
          const statements = await request.json();
          for (const sql of statements) await env.DB.prepare(sql).run();
          return Response.json({ success: true });
        }
        return env.APP.fetch(request);
      }
    };
  `;
  const authService = async (request) => {
    const cookie = request.headers.get('Cookie') || '';
    if (cookie.includes('session-a')) {
      return Response.json({ userId: USER_A, email: 'a@st.buh.edu.vn', role: 'user' });
    }
    if (cookie.includes('session-b')) {
      return Response.json({ userId: USER_B, email: 'b@st.buh.edu.vn', role: 'admin' });
    }
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  };
  const databaseId = crypto.randomUUID();
  const mf = new Miniflare({
    workers: [
      {
        name: 'control',
        modules: true,
        compatibilityDate: '2026-07-29',
        script: controlScript,
        d1Databases: { DB: databaseId },
        serviceBindings: { APP: 'application' },
      },
      {
        name: 'application',
        modules: true,
        compatibilityDate: '2026-07-29',
        script: applicationScript,
        d1Databases: { DB: databaseId },
        serviceBindings: { AUTH_SERVICE: authService },
        bindings: {
          ALLOWED_ORIGINS: ORIGIN,
          SCHEDULE_WRITE_MODE: 'd1',
          AUTH_SERVICE_PROXY_ENABLED: 'false',
          SCHEDULE_D1_INTERNAL_ENABLED: 'true',
          SCHEDULE_D1_INTERNAL_SECRET: 's'.repeat(40),
        },
      },
    ],
  });
  const exec = async (statements) => {
    const response = await mf.dispatchFetch('http://localhost/__exec', {
      method: 'POST',
      body: JSON.stringify(statements),
    });
    assert.equal(response.status, 200, await response.text());
  };
  const query = async (sql) => {
    const response = await mf.dispatchFetch('http://localhost/__sql', {
      method: 'POST',
      body: sql,
    });
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return JSON.parse(text).results;
  };
  await exec(schema.split(';').map((value) => value.trim()).filter(Boolean));
  return {
    request: (path, init) => mf.dispatchFetch(`${ORIGIN}${path}`, init),
    exec,
    query,
    async dispose() {
      await mf.dispose();
      await rm(directory, { recursive: true, force: true });
    },
  };
};

const mutationHeaders = (cookie, key, revision, extra = {}) => ({
  Cookie: cookie,
  'Content-Type': 'application/json',
  'Idempotency-Key': key,
  'If-Match': `"${revision}"`,
  ...extra,
});

const add = (harness, {
  courseId = COURSE_A,
  semester = SEMESTER,
  cookie = 'session=session-a',
  key = 'add-operation-0001',
  revision = 0,
  body = { semester },
  headers = {},
  query = '',
} = {}) => harness.request(
  `/api/user/v1/schedules/courses/${courseId}${query}`,
  {
    method: 'PUT',
    headers: mutationHeaders(cookie, key, revision, headers),
    body: JSON.stringify(body),
  }
);

const remove = (harness, {
  courseId = COURSE_A,
  semester = SEMESTER,
  cookie = 'session=session-a',
  key = 'delete-operation-0001',
  revision = 0,
  headers = {},
  query = `?semester=${semester}`,
  body,
} = {}) => {
  const init = {
    method: 'DELETE',
    headers: mutationHeaders(cookie, key, revision, headers),
  };
  if (body !== undefined) init.body = body;
  return harness.request(`/api/user/v1/schedules/courses/${courseId}${query}`, init);
};

const updateCustomData = (harness, {
  scheduleId,
  customData,
  cookie = 'session=session-a',
  key = 'update-custom-0001',
  revision = 0,
} = {}) => harness.request(
  `/api/user/v1/schedules/entries/${scheduleId}`,
  {
    method: 'PATCH',
    headers: mutationHeaders(cookie, key, revision),
    body: JSON.stringify({ customData }),
  },
);

const replaceSchedule = (harness, {
  body,
  cookie = 'session=session-a',
  key = 'replace-schedule-0001',
  revision = 0,
} = {}) => harness.request('/api/user/v1/schedules/replace', {
  method: 'PUT',
  headers: mutationHeaders(cookie, key, revision),
  body: JSON.stringify(body),
});

const internalScheduleRequest = async (harness, payload) => {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode('s'.repeat(40)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = [...new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${timestamp}.${nonce}.${body}`),
  ))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return harness.request('/internal/schedules/v1/authority', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Schedule-Internal-Timestamp': timestamp,
      'X-Hub-Schedule-Internal-Nonce': nonce,
      'X-Hub-Schedule-Internal-Signature': signature,
    },
    body,
  });
};

const internalScheduleCleanup = (harness, userId) => internalScheduleRequest(harness, {
  writer: 'auth_edge', operation: 'delete_user_schedules', userId,
});

const state = async (harness) => (await harness.query(`
  SELECT
    (SELECT COUNT(*) FROM user_schedules) AS schedules,
    (SELECT COUNT(*) FROM user_schedule_revisions) AS revisions,
    (SELECT COALESCE(MAX(revision), 0) FROM user_schedule_revisions) AS max_revision,
    (SELECT COUNT(*) FROM user_schedule_mutation_receipts) AS receipts,
    (SELECT COUNT(*) FROM user_schedule_transaction_assertions) AS assertions
`))[0];

test('D1 add validates Better Auth, strict concurrency inputs, semester, and published catalogue scope', async () => {
  const harness = await createHarness();
  try {
    assert.equal((await add(harness, { cookie: '', key: 'auth-missing-0001' })).status, 401);
    assert.equal((await add(harness, {
      cookie: '',
      key: 'bearer-only-0001',
      headers: { Authorization: 'Bearer fake' },
    })).status, 401);
    assert.equal((await add(harness, { key: '' })).status, 400);
    assert.equal((await add(harness, { key: 'x'.repeat(129) })).status, 400);
    const missingRevision = await harness.request(
      `/api/user/v1/schedules/courses/${COURSE_A}`,
      {
        method: 'PUT',
        headers: {
          Cookie: 'session=session-a',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'missing-revision-0001',
        },
        body: JSON.stringify({ semester: SEMESTER }),
      }
    );
    assert.equal(missingRevision.status, 400);
    const malformedRevision = await harness.request(
      `/api/user/v1/schedules/courses/${COURSE_A}`,
      {
        method: 'PUT',
        headers: {
          Cookie: 'session=session-a',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'malformed-revision-001',
          'If-Match': 'revision-0',
        },
        body: JSON.stringify({ semester: SEMESTER }),
      }
    );
    assert.equal(malformedRevision.status, 400);
    assert.equal((await add(harness, { body: { semester: SEMESTER, userId: USER_B } })).status, 400);
    assert.equal((await add(harness, { query: `?userId=${USER_B}` })).status, 400);
    assert.equal((await add(harness, { courseId: crypto.randomUUID(), key: 'missing-course-0001' })).status, 404);
    assert.equal((await add(harness, {
      courseId: COURSE_OTHER_SEMESTER,
      key: 'course-semester-0001',
    })).status, 404);
    assert.equal((await add(harness, {
      courseId: COURSE_RETIRED,
      key: 'retired-course-0001',
    })).status, 404);
    assert.deepEqual(await state(harness), {
      schedules: 0,
      revisions: 0,
      max_revision: 0,
      receipts: 0,
      assertions: 0,
    });
  } finally {
    await harness.dispose();
  }
});

test('D1 add accepts an approved published contribution and remains owner-scoped and idempotent', async () => {
  const harness = await createHarness();
  try {
    const first = await add(harness, {
      courseId: COURSE_PUBLISHED_CONTRIBUTION,
      key: 'published-contribution-0001',
    });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { success: true, changed: true, revision: 1 });

    const replay = await add(harness, {
      courseId: COURSE_PUBLISHED_CONTRIBUTION,
      key: 'published-contribution-0001',
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { success: true, changed: true, revision: 1 });

    const rows = await harness.query(
      `SELECT user_id, course_id FROM user_schedules WHERE course_id='${COURSE_PUBLISHED_CONTRIBUTION}'`,
    );
    assert.deepEqual(rows, [{ user_id: USER_A, course_id: COURSE_PUBLISHED_CONTRIBUTION }]);
  } finally {
    await harness.dispose();
  }
});

test('D1 add is owner-scoped, idempotent, revisioned, and preserves semantic no-ops', async () => {
  const harness = await createHarness();
  try {
    const first = await add(harness, {
      headers: {
        Authorization: 'Bearer fake-user-b',
        'x-user-id': USER_B,
        'x-role': 'admin',
        'x-email': 'b@st.buh.edu.vn',
      },
    });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { success: true, changed: true, revision: 1 });
    assert.equal(first.headers.get('ETag'), '"1"');
    assert.equal(first.headers.get('Cache-Control'), 'no-store');

    const original = (await harness.query(`
      SELECT id, user_id, course_id, semester, custom_data, created_at, updated_at
        FROM user_schedules
    `))[0];
    assert.equal(original.user_id, USER_A);
    assert.equal(original.course_id, COURSE_A);
    assert.equal(original.custom_data, null);

    const replay = await add(harness);
    assert.deepEqual(await replay.json(), { success: true, changed: true, revision: 1 });

    const second = await add(harness, {
      courseId: COURSE_B,
      key: 'add-operation-0002',
      revision: 1,
    });
    assert.deepEqual(await second.json(), { success: true, changed: true, revision: 2 });

    const lateReplay = await add(harness);
    assert.deepEqual(await lateReplay.json(), { success: true, changed: true, revision: 1 });

    const conflictingKey = await add(harness, {
      courseId: COURSE_B,
      key: 'add-operation-0001',
      revision: 1,
    });
    assert.equal(conflictingKey.status, 409);

    const noop = await add(harness, {
      key: 'add-noop-00000001',
      revision: 2,
    });
    assert.deepEqual(await noop.json(), { success: true, changed: false, revision: 2 });
    const afterNoop = (await harness.query(`
      SELECT id, custom_data, created_at, updated_at
        FROM user_schedules WHERE user_id='${USER_A}' AND course_id='${COURSE_A}'
    `))[0];
    assert.deepEqual(afterNoop, {
      id: original.id,
      custom_data: original.custom_data,
      created_at: original.created_at,
      updated_at: original.updated_at,
    });
    assert.deepEqual(await state(harness), {
      schedules: 2,
      revisions: 1,
      max_revision: 2,
      receipts: 3,
      assertions: 0,
    });
  } finally {
    await harness.dispose();
  }
});

test('D1 delete is self-only with explicit semester scope and deterministic absent no-op', async () => {
  const harness = await createHarness();
  try {
    await add(harness);
    await harness.exec([
      `INSERT INTO user_schedules
        (id,user_id,course_id,semester,custom_data,created_at,updated_at)
       VALUES ('${crypto.randomUUID()}','${USER_B}','${COURSE_A}','${SEMESTER}',NULL,'2026-01-01T00:00:00.000Z',NULL)`,
      `INSERT INTO user_schedule_revisions
        (user_id,semester,revision,updated_at,last_operation_id)
       VALUES ('${USER_B}','${SEMESTER}',4,'2026-01-01T00:00:00.000Z',NULL)`,
    ]);

    const wrongSemester = await remove(harness, {
      semester: OTHER_SEMESTER,
      key: 'delete-wrong-semester',
      revision: 0,
    });
    assert.equal(wrongSemester.status, 409);

    const invalidSemester = await remove(harness, {
      semester: 'invalid/semester',
      key: 'delete-invalid-semester',
      revision: 1,
    });
    assert.equal(invalidSemester.status, 400);

    // Cloudflare may represent a browser's bodyless DELETE as a non-null,
    // zero-length stream. It must obey the same validated DELETE contract.
    const deleted = await remove(harness, { revision: 1, body: '' });
    assert.deepEqual(await deleted.json(), { success: true, changed: true, revision: 2 });
    assert.equal((await harness.query(`
      SELECT COUNT(*) AS count FROM user_schedules
       WHERE user_id='${USER_B}' AND course_id='${COURSE_A}'
    `))[0].count, 1);

    const replay = await remove(harness, { revision: 1 });
    assert.deepEqual(await replay.json(), { success: true, changed: true, revision: 2 });

    const absent = await remove(harness, {
      key: 'delete-absent-0001',
      revision: 2,
    });
    assert.deepEqual(await absent.json(), { success: true, changed: false, revision: 2 });
    assert.equal((await state(harness)).assertions, 0);
  } finally {
    await harness.dispose();
  }
});

test('D1 ownership and revisions are isolated for users and staff roles', async () => {
  const harness = await createHarness();
  try {
    assert.equal((await add(harness)).status, 200);
    const userBAdd = await add(harness, {
      courseId: COURSE_B,
      cookie: 'session=session-b',
      key: 'admin-self-add-0001',
    });
    assert.deepEqual(await userBAdd.json(), {
      success: true,
      changed: true,
      revision: 1,
    });

    const stale = await add(harness, {
      courseId: COURSE_B,
      key: 'stale-add-0000001',
      revision: 0,
    });
    assert.equal(stale.status, 409);

    const crossUserDelete = await remove(harness, {
      courseId: COURSE_B,
      key: 'cross-user-delete-1',
      revision: 1,
    });
    assert.deepEqual(await crossUserDelete.json(), {
      success: true,
      changed: false,
      revision: 1,
    });

    const rows = await harness.query(`
      SELECT user_id, course_id FROM user_schedules ORDER BY user_id
    `);
    assert.equal(rows.length, 2);
    assert.equal(rows.some((row) => row.user_id === USER_A && row.course_id === COURSE_A), true);
    assert.equal(rows.some((row) => row.user_id === USER_B && row.course_id === COURSE_B), true);
    const revisions = await harness.query(`
      SELECT user_id, revision FROM user_schedule_revisions ORDER BY user_id
    `);
    assert.deepEqual(revisions, [
      { user_id: USER_B, revision: 1 },
      { user_id: USER_A, revision: 1 },
    ]);
    assert.equal((await state(harness)).receipts, 3);
  } finally {
    await harness.dispose();
  }
});

test('D1 CAS and idempotency races commit exactly one logical mutation', async () => {
  const harness = await createHarness();
  try {
    const [a, b] = await Promise.all([
      add(harness, { courseId: COURSE_A, key: 'race-different-0001' }),
      add(harness, { courseId: COURSE_B, key: 'race-different-0002' }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.deepEqual(await state(harness), {
      schedules: 1,
      revisions: 1,
      max_revision: 1,
      receipts: 1,
      assertions: 0,
    });
  } finally {
    await harness.dispose();
  }

  const sameKeyHarness = await createHarness();
  try {
    const [a, b] = await Promise.all([
      add(sameKeyHarness, { key: 'race-same-key-0001' }),
      add(sameKeyHarness, { key: 'race-same-key-0001' }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.deepEqual(await a.json(), await b.json());
    assert.deepEqual(await state(sameKeyHarness), {
      schedules: 1,
      revisions: 1,
      max_revision: 1,
      receipts: 1,
      assertions: 0,
    });
    assert.equal(
      (await sameKeyHarness.query('SELECT COUNT(*) AS outbox FROM user_schedule_rollback_outbox'))[0].outbox,
      1,
    );
  } finally {
    await sameKeyHarness.dispose();
  }
});

test('D1 transactional failures expose no partial schedule, revision, receipt, or assertion', async () => {
  for (const failure of ['schedule', 'revision', 'receipt', 'cleanup']) {
    const harness = await createHarness();
    try {
      const trigger = failure === 'schedule'
        ? `CREATE TRIGGER fail_schedule BEFORE INSERT ON user_schedules
             BEGIN SELECT RAISE(ABORT, 'injected'); END`
        : failure === 'revision'
          ? `CREATE TRIGGER fail_revision BEFORE UPDATE ON user_schedule_revisions
               BEGIN SELECT RAISE(ABORT, 'injected'); END`
          : failure === 'receipt'
            ? `CREATE TRIGGER fail_receipt BEFORE INSERT ON user_schedule_mutation_receipts
                 BEGIN SELECT RAISE(ABORT, 'injected'); END`
            : `CREATE TRIGGER fail_cleanup BEFORE DELETE ON user_schedule_transaction_assertions
                 BEGIN SELECT RAISE(ABORT, 'injected'); END`;
      await harness.exec([trigger]);
      const response = await add(harness, { key: `failure-${failure}-0001` });
      assert.equal(response.status, 503);
      assert.deepEqual(await state(harness), {
        schedules: 0,
        revisions: 0,
        max_revision: 0,
        receipts: 0,
        assertions: 0,
      });
      assert.doesNotMatch(await response.text(), /injected|sqlite|d1_error/i);
    } finally {
      await harness.dispose();
    }
  }
});

test('D1 PATCH and replace reject unauthenticated requests without any Supabase path', async () => {
  const harness = await createHarness();
  try {
    const patch = await harness.request(
      `/api/user/v1/schedules/entries/${crypto.randomUUID()}`,
      { method: 'PATCH', body: '{}' }
    );
    const replace = await harness.request(
      '/api/user/v1/schedules/replace',
      { method: 'PUT', body: '{}' }
    );
    assert.equal(patch.status, 401);
    assert.equal(replace.status, 401);
    assert.deepEqual(await state(harness), {
      schedules: 0,
      revisions: 0,
      max_revision: 0,
      receipts: 0,
      assertions: 0,
    });
  } finally {
    await harness.dispose();
  }
});

test('D1 update custom data is owner-scoped, revisioned, canonical, and idempotent', async () => {
  const harness = await createHarness();
  try {
    assert.equal((await add(harness)).status, 200);
    const schedule = (await harness.query(`
      SELECT id FROM user_schedules WHERE user_id='${USER_A}' AND course_id='${COURSE_A}'
    `))[0];
    const first = await updateCustomData(harness, {
      scheduleId: schedule.id,
      revision: 1,
      customData: { room: 'A.101', priority: 1 },
    });
    assert.deepEqual(await first.json(), { success: true, changed: true, revision: 2 });
    const replay = await updateCustomData(harness, {
      scheduleId: schedule.id,
      revision: 1,
      customData: { priority: 1, room: 'A.101' },
    });
    assert.deepEqual(await replay.json(), { success: true, changed: true, revision: 2 });
    const otherOwner = await updateCustomData(harness, {
      scheduleId: schedule.id,
      cookie: 'session=session-b',
      revision: 0,
      key: 'cross-owner-update-0001',
      customData: { room: 'blocked' },
    });
    assert.equal(otherOwner.status, 404);
    const stored = (await harness.query(`SELECT custom_data FROM user_schedules WHERE id='${schedule.id}'`))[0];
    assert.equal(stored.custom_data, JSON.stringify({ priority: 1, room: 'A.101' }));
  } finally {
    await harness.dispose();
  }
});

test('D1 replace and PDF import are atomic, owner-scoped, and keep imported courses private', async () => {
  const harness = await createHarness();
  try {
    const replace = await replaceSchedule(harness, {
      body: { semester: SEMESTER, courseIds: [COURSE_A, COURSE_B] },
    });
    assert.deepEqual(await replace.json(), { success: true, changed: true, revision: 1, count: 2 });
    const missingInstructor = await replaceSchedule(harness, {
      key: 'pdf-import-no-instructor',
      revision: 1,
      body: { semester: SEMESTER, rows: [{ course: {
        course_code: 'PRIVATE_NO_TEACHER', subject_name: 'Missing instructor', credits: 3,
        scheduleSessions: [{ weeks: [1], dayOfWeek: 2, shift: 'S', campus: '', room: 'A.101' }], phase: '1',
      } }] },
    });
    assert.equal(missingInstructor.status, 400);
    const importedBody = {
      semester: SEMESTER,
      rows: [{
        course: {
          course_code: 'PRIVATE101', subject_name: 'Imported private course', credits: 3,
          instructor: 'Teacher',
          scheduleSessions: [
            { weeks: [1], dayOfWeek: 2, shift: 'S', campus: '', room: 'A.101' },
            { weeks: [6], dayOfWeek: 4, shift: 'C', campus: '', room: 'B.202' },
          ], phase: '1',
        },
      }],
    };
    const imported = await replaceSchedule(harness, {
      body: importedBody,
      key: 'pdf-import-00000001',
      revision: 1,
    });
    assert.deepEqual(await imported.json(), { success: true, changed: true, revision: 2, count: 1 });
    const replay = await replaceSchedule(harness, {
      body: importedBody,
      key: 'pdf-import-00000001',
      revision: 1,
    });
    assert.deepEqual(await replay.json(), { success: true, changed: true, revision: 2, count: 1 });
    const stateRows = await harness.query(`
      SELECT
        (SELECT COUNT(*) FROM user_schedules WHERE user_id='${USER_A}' AND semester='${SEMESTER}') AS schedules,
        (SELECT COUNT(*) FROM user_schedule_course_snapshots WHERE user_id='${USER_A}') AS snapshots,
        (SELECT COUNT(*) FROM course_schedules WHERE is_user_added=1) AS public_imports
    `);
    assert.deepEqual(stateRows[0], { schedules: 1, snapshots: 1, public_imports: 1 });
    const snapshot = (await harness.query(`SELECT course_json FROM user_schedule_course_snapshots WHERE user_id='${USER_A}'`))[0];
    const reloaded = JSON.parse(snapshot.course_json);
    assert.deepEqual(
      { weeks: reloaded.weeks, day_of_week: reloaded.day_of_week, shift: reloaded.shift, campus: reloaded.campus, room: reloaded.room },
      { weeks: '1\n6', day_of_week: '2\n4', shift: 'S\nC', campus: '\n', room: 'A.101\nB.202' },
    );
  } finally {
    await harness.dispose();
  }
});

test('signed Courses Edge custom-data operation is owner-scoped and idempotent', async () => {
  const harness = await createHarness();
  try {
    assert.equal((await add(harness)).status, 200);
    const schedule = (await harness.query(`
      SELECT id FROM user_schedules WHERE user_id='${USER_A}' AND course_id='${COURSE_A}'
    `))[0];
    const payload = {
      writer: 'courses_edge',
      operation: 'update_user_schedule_custom_data',
      userId: USER_A,
      scheduleId: schedule.id,
      customData: { priority: 2, room: 'A.101' },
      idempotencyKey: 'courses-sync-00000001',
    };
    const first = await internalScheduleRequest(harness, payload);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { success: true, changed: true, revision: 2 });
    const replay = await internalScheduleRequest(harness, payload);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { success: true, changed: true, revision: 2 });
    const crossOwner = await internalScheduleRequest(harness, {
      ...payload,
      userId: USER_B,
      idempotencyKey: 'courses-sync-00000002',
    });
    assert.equal(crossOwner.status, 400);
    const stored = (await harness.query(`SELECT custom_data FROM user_schedules WHERE id='${schedule.id}'`))[0];
    assert.equal(stored.custom_data, JSON.stringify({ priority: 2, room: 'A.101' }));
  } finally {
    await harness.dispose();
  }
});

test('internal account cleanup is authenticated and removes only private owner schedule state', async () => {
  const harness = await createHarness();
  try {
    assert.equal((await add(harness)).status, 200);
    assert.equal((await add(harness, {
      cookie: 'session=session-b', courseId: COURSE_B, key: 'owner-b-add-00001',
    })).status, 200);
    assert.equal((await harness.request('/internal/schedules/v1/authority', {
      method: 'POST', body: JSON.stringify({}),
    })).status, 401);
    const response = await internalScheduleCleanup(harness, USER_A);
    assert.equal(response.status, 200);
    const rows = await harness.query(`
      SELECT
        (SELECT COUNT(*) FROM user_schedules WHERE user_id='${USER_A}') AS owner_a,
        (SELECT COUNT(*) FROM user_schedules WHERE user_id='${USER_B}') AS owner_b,
        (SELECT COUNT(*) FROM course_schedules) AS public_courses
    `);
    assert.deepEqual(rows[0], { owner_a: 0, owner_b: 1, public_courses: 5 });
  } finally {
    await harness.dispose();
  }
});

test('D1 write graph is Better Auth-only and contains no client authority or Supabase calls', async () => {
  const moduleSource = await readFile('cloudflare/worker/src/d1-user-schedule-mutations.ts', 'utf8');
  const indexSource = await readFile('cloudflare/worker/src/index.ts', 'utf8');
  assert.doesNotMatch(moduleSource, /SUPABASE|readBearerToken|Authorization|x-user-id|x-role|x-email|MSSV/i);
  assert.match(moduleSource, /crypto\.randomUUID\(\)/);
  assert.match(moduleSource, /last_operation_id = \?/);
  assert.match(moduleSource, /user_id = \? AND course_id = \?/);
  assert.match(moduleSource, /FROM course_schedules[\s\S]*catalogue_visibility = 'published'/);
  assert.match(moduleSource, /Idempotency-Key/);
  assert.match(moduleSource, /If-Match/);
  assert.doesNotMatch(moduleSource, /payload\.userId|payload\.user_id|payload\.role/);
  const d1BranchStart = indexSource.indexOf("if (scheduleWriteMode === 'd1')");
  const legacyStart = indexSource.indexOf('addUserScheduleForBetterAuth', d1BranchStart);
  const d1Branch = indexSource.slice(d1BranchStart, legacyStart);
  assert.match(d1Branch, /requireBetterAuthSession/);
  assert.match(d1Branch, /identity\.userId/);
  assert.doesNotMatch(d1Branch, /requireAuthenticatedUser|readBearerToken|SUPABASE|serviceRole/i);
});
