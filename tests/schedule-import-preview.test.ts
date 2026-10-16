import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { parseHubScheduleLayout } from '../utils/hubScheduleParser.ts';

const bundle = await build({ entryPoints: ['utils/scheduleImportPreview.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const semester = 'HK1_2026_2027';
const imported = {
  course_code: 'AMA308_261_1_D01', subject_name: 'Cấu trúc rời rạc', credits: 2,
  instructor: 'Giảng viên kiểm thử', start_date: '12/10/2026', end_date: '28/10/2026',
  day_of_week: '2\n4', shift: '13:00-17:05\n13:00-17:05', room: 'A302\nA302', campus: 'TD\nTD',
};

async function withCatalog(rows: Record<string, unknown>[], run: (calls: URL[]) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: URL[] = [];
  globalThis.fetch = (async (input, init) => {
    assert.equal(init?.method || 'GET', 'GET', 'preview must never save');
    const url = new URL(String(input), 'https://example.test');
    assert.equal(url.pathname, '/courses');
    assert.equal(url.searchParams.get('semester'), semester);
    calls.push(url);
    return Response.json({ data: rows, total: rows.length });
  }) as typeof fetch;
  try { await run(calls); } finally { globalThis.fetch = original; }
}

test('fallback uses credits once across all meetings, maps C, and preserves rooms', async () => {
  await withCatalog([], async () => {
    const [row] = await api.buildScheduleImportPreview([imported], semester);
    assert.equal(row.isSystemCourse, false);
    assert.equal(row.course.is_user_added, true);
    assert.equal(row.course.scheduleSessions.length, 6);
    assert.deepEqual(row.course.scheduleSessions.map((s: any) => [s.weeks[0], s.dayOfWeek, s.shift, s.room]),
      [[7, 2, 'C', 'A302'], [7, 4, 'C', 'A302'], [8, 2, 'C', 'A302'], [8, 4, 'C', 'A302'], [9, 2, 'C', 'A302'], [9, 4, 'C', 'A302']]);
  });
});

test('official equivalent code wins unchanged over conflicting PDF and community course', async () => {
  const official = { ...imported, id: 'official-id', semester, course_code: 'AMA308_2611_D01', credits: 4, weeks: '1-20', shift: 'S', day_of_week: '6', is_user_added: false };
  await withCatalog([{ ...official, id: 'community', is_user_added: true }, official], async calls => {
    const [row] = await api.buildScheduleImportPreview([{ ...imported, credits: 0 }], semester);
    assert.equal(row.isSystemCourse, true);
    assert.equal(row.systemCourseId, official.id);
    assert.deepEqual(row.course, official);
    assert.ok(calls.some(url => url.searchParams.get('courseCode') === 'AMA308_2611_D01'));
  });
});

test('same name, different class or semester cannot become an official match', async () => {
  for (const mismatch of [{ course_code: 'AMA308_261_1_D02', semester }, { course_code: imported.course_code, semester: 'HK2_2026_2027' }]) {
    await withCatalog([{ ...imported, ...mismatch, id: 'wrong', is_user_added: false }], async () => {
      const [row] = await api.buildScheduleImportPreview([imported], semester);
      assert.equal(row.isSystemCourse, false);
    });
  }
});

test('ambiguous official matches stop preview safely instead of choosing the first', async () => {
  await withCatalog(['first', 'second'].map(id => ({ ...imported, id, semester, is_user_added: false })), async () => {
    await assert.rejects(api.buildScheduleImportPreview([imported], semester), /nhiều|duy nhất/i);
  });
});

test('catalog failure cannot silently turn an official course into a fallback', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
  try { await assert.rejects(api.buildScheduleImportPreview([imported], semester)); }
  finally { globalThis.fetch = original; }
});

test('an official catalog row missing its id cannot be hidden by a community row or become a fallback', async () => {
  await withCatalog([{ ...imported, semester, is_user_added: false }, { ...imported, semester, is_user_added: true }], async () => {
    await assert.rejects(api.buildScheduleImportPreview([imported], semester), /định danh|duy nhất/);
  });
});

test('eleven-course PDF matches one official course and only generates the ten unmatched classes', async () => {
  const catalog = JSON.parse(readFileSync('tests/fixtures/hub-schedule-catalog.json', 'utf8'));
  const parsed = parseHubScheduleLayout(JSON.parse(readFileSync('tests/fixtures/hub-schedule-11.layout.json', 'utf8')));
  await withCatalog(catalog, async () => {
    const rows = await api.buildScheduleImportPreview(parsed.courses, semester);
    assert.equal(rows.length, 11);
    assert.deepEqual(rows.filter((r: any) => r.isSystemCourse).map((r: any) => r.course.course_code), ['LAW349_2611_1_D01']);
    assert.equal(rows.filter((r: any) => !r.isSystemCourse).length, 10);
    assert.deepEqual(rows[3].course, catalog[0]);
    assert.equal(rows[3].course.scheduleSessions, undefined, 'official 2-7 weeks must not be replaced with six PDF sessions');
    for (const row of rows.filter((r: any) => !r.isSystemCourse)) assert.equal(row.course.scheduleSessions.length, row.course.credits * 3);
    assert.deepEqual(rows.filter((r: any) => api.getScheduleImportRowErrors(r, semester).length).map((r: any) => r.course.course_code), ['GYM301_2611_1_D07', 'ENP706_261_1_D05']);
  });
});

test('preview validation requires supported credits and target count but permits repeated weeks', async () => {
  await withCatalog([], async () => {
    const [row] = await api.buildScheduleImportPreview([imported], semester);
    assert.deepEqual(api.getScheduleImportRowErrors(row, semester), []);
    assert.match(api.getScheduleImportRowErrors({ ...row, course: { ...row.course, credits: 1.5 } }, semester).join(' '), /Tín chỉ/);
    assert.match(api.getScheduleImportRowErrors({ ...row, course: { ...row.course, scheduleSessions: row.course.scheduleSessions.slice(1) } }, semester).join(' '), /đúng 6 buổi/);
    assert.ok(api.getScheduleImportRowErrors({ ...row, semester: 'HK2_2026_2027' }, semester).length);
  });
});

test('preview keeps actual cross-course overlap validation while allowing separate time ranges', async () => {
  await withCatalog([], async () => {
    const rows = await api.buildScheduleImportPreview([imported, { ...imported, course_code: 'OTHER101', shift: '07:00-11:05\n07:00-11:05' }], semester);
    assert.deepEqual(api.getScheduleImportConflicts(rows, semester), []);
    rows[1].course.scheduleSessions[0] = { ...rows[0].course.scheduleSessions[0], room: 'B101' };
    assert.equal(api.getScheduleImportConflicts(rows, semester).length, 1);
  });
});

test('confirmation sends only official id and the exact edited fallback sessions via owner CAS API', async () => {
  let rows: any[];
  const official = { ...imported, id: '1368d47c-f0cb-47da-aa8a-cb650078b2e2', semester, weeks: '1', day_of_week: '6', shift: 'S', course_code: 'LAW349_2611_1_D01', is_user_added: false };
  await withCatalog([official], async () => { rows = await api.buildScheduleImportPreview([imported, official], semester); });
  rows![0].course.scheduleSessions[0].room = 'Đã sửa';
  rows![1].course.subject_name = 'PDF cannot overwrite official fields';
  const original = globalThis.fetch;
  const writes: any[] = [];
  globalThis.fetch = (async (input, init) => {
    assert.equal(init?.credentials, 'include');
    if (String(input) === '/api/user/v1/schedules') return Response.json({ success: true, data: [], revisions: { [semester]: 9 } });
    assert.equal(String(input), '/api/user/v1/schedules/replace');
    assert.equal(init?.method, 'PUT');
    assert.equal(new Headers(init?.headers).get('If-Match'), '"9"');
    assert.ok(new Headers(init?.headers).get('Idempotency-Key'));
    writes.push(JSON.parse(String(init?.body)));
    return Response.json({ success: true, changed: true, revision: 10, count: 2 });
  }) as typeof fetch;
  try {
    assert.equal(await api.replaceUserScheduleFromPreview(semester, rows!), 2);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].rows[1], { systemCourseId: official.id });
    assert.deepEqual(writes[0].rows[0].course.scheduleSessions, rows![0].course.scheduleSessions);
    assert.equal(writes[0].rows[0].course.scheduleSessions[0].startTime, '13:00');
    assert.equal(writes[0].rows[0].course.scheduleSessions[0].room, 'Đã sửa');
    const invalid = structuredClone(rows!);
    invalid[0].course.scheduleSessions.pop();
    await assert.rejects(api.replaceUserScheduleFromPreview(semester, invalid));
    assert.equal(writes.length, 1);
  } finally { globalThis.fetch = original; }
});

test('catalog pagination completes before checking uniqueness', async () => {
  const original = globalThis.fetch;
  const offsets: number[] = [];
  globalThis.fetch = (async input => {
    const url = new URL(String(input), 'https://example.test');
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    return Response.json(offset === 0
      ? { data: [{ ...imported, id: 'community', semester, is_user_added: true }], hasMore: true }
      : { data: [{ ...imported, id: 'official-page-two', semester, is_user_added: false }], hasMore: false });
  }) as typeof fetch;
  try {
    const [row] = await api.buildScheduleImportPreview([imported], semester);
    assert.equal(row.systemCourseId, 'official-page-two');
    assert.ok(offsets.includes(100));
  } finally { globalThis.fetch = original; }
});
