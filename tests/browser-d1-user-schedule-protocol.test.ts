import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScheduleRevisionConflictError,
  addCloudflareUserSchedule,
  fetchCloudflareUserSchedules,
  removeCloudflareUserSchedule,
  replaceCloudflareUserScheduleSemester,
  updateCloudflareUserSchedule,
} from '../utils/userSchedulesApi.ts';

const COURSE_ID = '1368d47c-f0cb-47da-aa8a-cb650078b2e2';
const SCHEDULE_ID = 'f26257a2-f98b-4bf7-a7c3-54866cded95a';
const SEMESTER = 'HK1_2026_2027';

const json = (value: unknown, status = 200) => Response.json(value, { status });

test('browser sends the D1 CAS and idempotency contract for every schedule mutation', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ path: string; method: string; ifMatch: string | null; key: string | null }> = [];
  const responses = [
    json({ success: true, data: [], revisions: { [SEMESTER]: 3 } }),
    json({ success: true, changed: true, revision: 4 }),
    json({ success: true, changed: true, revision: 5 }),
    json({ success: true, changed: true, revision: 6 }),
    json({ success: true, changed: true, revision: 7, count: 1 }),
    json({ success: true, changed: true, revision: 8, count: 1 }),
  ];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://hotrosinhvienhub.id.vn');
    const headers = new Headers(init?.headers);
    requests.push({
      path: `${url.pathname}${url.search}`,
      method: String(init?.method || 'GET'),
      ifMatch: headers.get('If-Match'),
      key: headers.get('Idempotency-Key'),
    });
    const response = responses.shift();
    assert.ok(response, 'unexpected browser request');
    return response;
  }) as typeof fetch;

  try {
    await fetchCloudflareUserSchedules();
    await addCloudflareUserSchedule(COURSE_ID, SEMESTER);
    await removeCloudflareUserSchedule(COURSE_ID, SEMESTER);
    await updateCloudflareUserSchedule(
      { id: COURSE_ID, user_schedule_id: SCHEDULE_ID, semester: SEMESTER },
      { label: 'safe-test' },
    );
    await replaceCloudflareUserScheduleSemester(SEMESTER, [COURSE_ID]);
    await replaceCloudflareUserScheduleSemester(SEMESTER, [], [{ course: { course_code: 'PRIVATE101', subject_name: 'Private', credits: 1 } }]);

    assert.deepEqual(
      requests.map((request) => request.path),
      [
        '/api/user/v1/schedules',
        `/api/user/v1/schedules/courses/${COURSE_ID}`,
        `/api/user/v1/schedules/courses/${COURSE_ID}?semester=${SEMESTER}`,
        `/api/user/v1/schedules/entries/${SCHEDULE_ID}`,
        '/api/user/v1/schedules/replace',
        '/api/user/v1/schedules/replace',
      ],
    );
    assert.deepEqual(
      requests.slice(1).map((request) => request.ifMatch),
      ['"3"', '"4"', '"5"', '"6"', '"7"'],
    );
    for (const request of requests.slice(1)) {
      assert.match(String(request.key), /^[A-Za-z0-9._:-]{8,128}$/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser PATCH targets the user schedule row when course and schedule IDs differ', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ path: string; ifMatch: string | null; key: string | null }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://hotrosinhvienhub.id.vn');
    const headers = new Headers(init?.headers);
    requests.push({
      path: `${url.pathname}${url.search}`,
      ifMatch: headers.get('If-Match'),
      key: headers.get('Idempotency-Key'),
    });
    if (url.pathname === '/api/user/v1/schedules') {
      return json({ success: true, data: [], revisions: { [SEMESTER]: 31 } });
    }
    return json({ success: true, changed: true, revision: 32 });
  }) as typeof fetch;

  try {
    await fetchCloudflareUserSchedules();
    await updateCloudflareUserSchedule(
      { id: COURSE_ID, user_schedule_id: SCHEDULE_ID, semester: SEMESTER },
      { label: 'row-id-contract' },
    );

    assert.notEqual(COURSE_ID, SCHEDULE_ID);
    assert.deepEqual(requests.map((request) => request.path), [
      '/api/user/v1/schedules',
      `/api/user/v1/schedules/entries/${SCHEDULE_ID}`,
    ]);
    assert.equal(requests[1].ifMatch, '"31"');
    assert.match(String(requests[1].key), /^[A-Za-z0-9._:-]{8,128}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser reuses its idempotency key after a transport failure', async () => {
  const originalFetch = globalThis.fetch;
  const retrySemester = 'HK2_2026_2027';
  const seenKeys: string[] = [];
  let attempt = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://hotrosinhvienhub.id.vn');
    if (url.pathname === '/api/user/v1/schedules') {
      return json({ success: true, data: [], revisions: { [retrySemester]: 9 } });
    }
    const key = new Headers(init?.headers).get('Idempotency-Key');
    assert.ok(key);
    seenKeys.push(key);
    attempt += 1;
    if (attempt === 1) throw new TypeError('network interruption');
    return json({ success: true, changed: true, revision: 10 });
  }) as typeof fetch;

  try {
    await fetchCloudflareUserSchedules();
    await assert.rejects(
      () => updateCloudflareUserSchedule(
        { id: COURSE_ID, user_schedule_id: SCHEDULE_ID, semester: retrySemester },
        { label: 'retry' },
      ),
      /network interruption/,
    );
    await updateCloudflareUserSchedule(
      { id: COURSE_ID, user_schedule_id: SCHEDULE_ID, semester: retrySemester },
      { label: 'retry' },
    );
    assert.deepEqual(seenKeys, [seenKeys[0], seenKeys[0]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser refreshes the D1 revision before an unprimed mutation instead of guessing a token', async () => {
  const originalFetch = globalThis.fetch;
  const unprimedSemester = 'HK4_2026_2027';
  const requests: Array<{ path: string; ifMatch: string | null }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://hotrosinhvienhub.id.vn');
    const headers = new Headers(init?.headers);
    requests.push({
      path: `${url.pathname}${url.search}`,
      ifMatch: headers.get('If-Match'),
    });
    if (url.pathname === '/api/user/v1/schedules') {
      return json({ success: true, data: [], revisions: { [unprimedSemester]: 17 } });
    }
    return json({ success: true, changed: true, revision: 18 });
  }) as typeof fetch;

  try {
    await addCloudflareUserSchedule(COURSE_ID, unprimedSemester);
    assert.deepEqual(requests.map((request) => request.path), [
      '/api/user/v1/schedules',
      `/api/user/v1/schedules/courses/${COURSE_ID}`,
    ]);
    assert.equal(requests[1].ifMatch, '"17"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser rejects a stale CAS response and refreshes its canonical revision without retrying the write', async () => {
  const originalFetch = globalThis.fetch;
  const conflictSemester = 'HK3_2026_2027';
  const writes: RequestInit[] = [];
  let reads = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://hotrosinhvienhub.id.vn');
    if (url.pathname === '/api/user/v1/schedules') {
      reads += 1;
      return json({ success: true, data: [], revisions: { [conflictSemester]: reads === 1 ? 12 : 13 } });
    }
    writes.push(init || {});
    return json({ error: 'Lịch đã thay đổi. Vui lòng tải lại.' }, 409);
  }) as typeof fetch;

  try {
    await fetchCloudflareUserSchedules();
    await assert.rejects(
      () => updateCloudflareUserSchedule(
        { id: COURSE_ID, user_schedule_id: SCHEDULE_ID, semester: conflictSemester },
        { label: 'conflict' },
      ),
      (error: unknown) => error instanceof ScheduleRevisionConflictError,
    );
    assert.equal(writes.length, 1);
    assert.equal(new Headers(writes[0].headers).get('If-Match'), '"12"');
    assert.equal(reads, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
