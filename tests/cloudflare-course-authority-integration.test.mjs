import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const ORIGIN = 'https://hotrosinhvienhub.id.vn';
const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const AUDITOR = '33333333-3333-4333-8333-333333333333';
const SECRET = 'c'.repeat(40);

const schema = `
CREATE TABLE course_schedules (id TEXT PRIMARY KEY, course_code TEXT NOT NULL, subject_name TEXT NOT NULL, prerequisite TEXT, credits INTEGER, knowledge_block TEXT, shift TEXT, day_of_week TEXT, weeks TEXT, room TEXT, campus TEXT, managing_faculty TEXT, exam_date TEXT, exam_shift TEXT, exam_campus TEXT, exam_room TEXT, cohort TEXT, major TEXT, group_name TEXT, orientation TEXT, orientation_note_3 TEXT, registration_type TEXT, general_note TEXT, academic_program TEXT, student_count INTEGER, phase TEXT, semester TEXT, instructor TEXT, is_user_added INTEGER, created_at TEXT, updated_at TEXT NOT NULL, course_code_search TEXT NOT NULL, subject_name_search TEXT NOT NULL, instructor_search TEXT NOT NULL, source_position INTEGER NOT NULL, catalogue_visibility TEXT NOT NULL DEFAULT 'published', revision INTEGER NOT NULL DEFAULT 0, source_kind TEXT NOT NULL DEFAULT 'legacy_sync', source_key TEXT, writer_provenance TEXT NOT NULL DEFAULT 'legacy_sync', content_hash TEXT, instructor_provenance TEXT NOT NULL DEFAULT 'legacy_sync', retired_at TEXT);
CREATE UNIQUE INDEX course_source_key ON course_schedules(source_kind, source_key) WHERE source_key IS NOT NULL;
CREATE TABLE course_filter_facets (semester TEXT, phase TEXT, is_user_added INTEGER, subject_name TEXT, major TEXT, cohort TEXT, academic_program TEXT, group_name TEXT, course_count INTEGER, first_source_position INTEGER, PRIMARY KEY (semester,phase,is_user_added,subject_name,major,cohort,academic_program,group_name));
CREATE TABLE course_mutation_receipts (actor_scope TEXT, actor_id TEXT, idempotency_key TEXT, request_hash TEXT, operation TEXT, response_json TEXT, created_at TEXT, PRIMARY KEY(actor_scope,actor_id,idempotency_key));
CREATE TABLE course_mutation_outbox (id TEXT PRIMARY KEY, dedupe_key TEXT UNIQUE, event_type TEXT, course_id TEXT, request_id TEXT, user_id TEXT, payload_json TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, created_at TEXT, delivered_at TEXT);
CREATE TABLE user_course_requests (id TEXT PRIMARY KEY, user_id TEXT, course_code TEXT, subject_name TEXT, semester TEXT, instructor TEXT, request_note TEXT, schedule_details_json TEXT NOT NULL DEFAULT '[]', status TEXT DEFAULT 'pending', request_hash TEXT, revision INTEGER DEFAULT 0, reviewer_id TEXT, reviewed_at TEXT, approved_course_id TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE course_scraper_runs (run_id TEXT PRIMARY KEY, payload_hash TEXT, status TEXT, attempted_count INTEGER, updated_count INTEGER DEFAULT 0, skipped_admin_count INTEGER DEFAULT 0, conflict_count INTEGER DEFAULT 0, error_code TEXT, created_at TEXT, completed_at TEXT);
`;

const headers = (cookie, key, revision) => ({
  Origin: ORIGIN, Cookie: `session=${cookie}`, 'Content-Type': 'application/json',
  'Idempotency-Key': key, ...(revision === undefined ? {} : { 'If-Match': `"${revision}"` }),
});
const courseBody = (code = 'TEST_001') => ({ course_code: code, subject_name: 'Fixture course', semester: 'HK1_2099', instructor: 'Initial instructor' });
const scheduleSessions = [{ weeks: [1, 2, 3], dayOfWeek: 2, shift: 'S', campus: '', room: '' }];
const signedInternalHeaders = async (body, nonce = crypto.randomUUID()) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${nonce}.${body}`)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { 'Content-Type': 'application/json', 'X-Hub-Course-Internal-Timestamp': timestamp, 'X-Hub-Course-Internal-Nonce': nonce, 'X-Hub-Course-Internal-Signature': signature };
};

const harness = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hub-course-d1-'));
  const bundle = join(dir, 'worker.mjs');
  await build({ entryPoints: ['cloudflare/worker/src/index.ts'], outfile: bundle, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
  const applicationScript = await readFile(bundle, 'utf8');
  const databaseId = crypto.randomUUID();
  const control = `export default { async fetch(request, env) { const url = new URL(request.url); if (url.pathname === '/sql') { const text = await request.text(); const result = await env.DB.prepare(text).all(); return Response.json(result.results || []); } return env.APP.fetch(request); } }`;
  const auth = async (request) => {
    const cookie = request.headers.get('Cookie') || '';
    if (cookie.includes('user')) return Response.json({ userId: USER, email: 'user@st.buh.edu.vn', role: 'user' });
    if (cookie.includes('admin')) return Response.json({ userId: ADMIN, email: 'admin@st.buh.edu.vn', role: 'admin' });
    if (cookie.includes('auditor')) return Response.json({ userId: AUDITOR, email: 'auditor@st.buh.edu.vn', role: 'auditor' });
    return Response.json({}, { status: 401 });
  };
  const mf = new Miniflare({ workers: [
    { name: 'control', modules: true, compatibilityDate: '2026-07-29', script: control, d1Databases: { DB: databaseId }, serviceBindings: { APP: 'application' } },
    { name: 'application', modules: true, compatibilityDate: '2026-07-29', script: applicationScript, d1Databases: { DB: databaseId }, serviceBindings: { AUTH_SERVICE: auth }, bindings: { ALLOWED_ORIGINS: ORIGIN, AUTH_SERVICE_PROXY_ENABLED: 'false', COURSE_WRITE_AUTHORITY: 'd1', COURSE_D1_INTERNAL_ENABLED: 'true', COURSE_D1_INTERNAL_SECRET: SECRET, COURSE_SCRAPER_INTERNAL_ENABLED: 'true' } },
  ] });
  for (const sql of schema.split(';').map((part) => part.trim()).filter(Boolean)) await (await mf.dispatchFetch('http://localhost/sql', { method: 'POST', body: sql })).json();
  return { request: (path, init) => mf.dispatchFetch(`${ORIGIN}${path}`, init), sql: async (value) => (await mf.dispatchFetch('http://localhost/sql', { method: 'POST', body: value })).json(), dispose: async () => { await mf.dispose(); await rm(dir, { recursive: true, force: true }); } };
};

test('course D1 APIs enforce roles, CAS, idempotency, ownership and atomic approval/outbox', async () => {
  const app = await harness();
  try {
    const denied = await app.request('/api/private/v1/courses', { method: 'POST', headers: headers('user', 'ordinary-create-0001'), body: JSON.stringify(courseBody()) });
    assert.equal(denied.status, 403);
    const auditor = await app.request('/api/private/v1/courses', { method: 'POST', headers: headers('auditor', 'auditor-create-0001'), body: JSON.stringify(courseBody()) });
    assert.equal(auditor.status, 403);

    const create = await app.request('/api/private/v1/courses', { method: 'POST', headers: headers('admin', 'admin-create-0001'), body: JSON.stringify(courseBody()) });
    assert.equal(create.status, 200); const created = await create.json();
    const retry = await app.request('/api/private/v1/courses', { method: 'POST', headers: headers('admin', 'admin-create-0001'), body: JSON.stringify(courseBody()) });
    assert.deepEqual(await retry.json(), created);
    const update = await app.request(`/api/private/v1/courses/${created.id}`, { method: 'PATCH', headers: headers('admin', 'admin-update-0001', 0), body: JSON.stringify({ instructor: 'Admin-reviewed instructor' }) });
    assert.equal(update.status, 200);
    const stale = await app.request(`/api/private/v1/courses/${created.id}`, { method: 'PATCH', headers: headers('admin', 'admin-stale-0001', 0), body: JSON.stringify({ instructor: 'Stale update' }) });
    assert.equal(stale.status, 409);
    const retire = await app.request(`/api/private/v1/courses/${created.id}`, { method: 'DELETE', headers: headers('admin', 'admin-retire-0001', 1) });
    assert.equal(retire.status, 200);
    assert.equal((await app.sql(`SELECT catalogue_visibility FROM course_schedules WHERE id='${created.id}'`))[0].catalogue_visibility, 'retired');

    const missingSessions = await app.request('/api/private/v1/course-requests', { method: 'POST', headers: headers('user', 'request-no-sessions-0001'), body: JSON.stringify({ courseCode: 'REQ_NONE', subjectName: 'No sessions', semester: 'HK1_2099' }) });
    assert.equal(missingSessions.status, 400);
    const invalidDay = await app.request('/api/private/v1/course-requests', { method: 'POST', headers: headers('user', 'request-invalid-day-0001'), body: JSON.stringify({ courseCode: 'REQ_DAY', subjectName: 'Invalid day', semester: 'HK1_2099', scheduleSessions: [{ ...scheduleSessions[0], dayOfWeek: 9 }] }) });
    assert.equal(invalidDay.status, 400);
    const invalidWeek = await app.request('/api/private/v1/course-requests', { method: 'POST', headers: headers('user', 'request-invalid-week-0001'), body: JSON.stringify({ courseCode: 'REQ_WEEK', subjectName: 'Invalid week', semester: 'HK1_2099', scheduleSessions: [{ ...scheduleSessions[0], weeks: [23] }] }) });
    assert.equal(invalidWeek.status, 400);
    const invalidShift = await app.request('/api/private/v1/course-requests', { method: 'POST', headers: headers('user', 'request-invalid-shift-0001'), body: JSON.stringify({ courseCode: 'REQ_SHIFT', subjectName: 'Invalid shift', semester: 'HK1_2099', scheduleSessions: [{ ...scheduleSessions[0], shift: 'CUSTOM' }] }) });
    assert.equal(invalidShift.status, 400);
    const invalidCampus = await app.request('/api/private/v1/course-requests', { method: 'POST', headers: headers('user', 'request-invalid-campus-0001'), body: JSON.stringify({ courseCode: 'REQ_CAMPUS', subjectName: 'Invalid campus', semester: 'HK1_2099', scheduleSessions: [{ ...scheduleSessions[0], campus: 'Campus không có', room: 'A.101' }] }) });
    assert.equal(invalidCampus.status, 400);
    const invalidRoom = await app.request('/api/private/v1/course-requests', { method: 'POST', headers: headers('user', 'request-invalid-room-0001'), body: JSON.stringify({ courseCode: 'REQ_ROOM', subjectName: 'Invalid room', semester: 'HK1_2099', scheduleSessions: [{ ...scheduleSessions[0], campus: 'TD', room: 'Không tồn tại' }] }) });
    assert.equal(invalidRoom.status, 400);

    const request = await app.request('/api/private/v1/course-requests', { method: 'POST', headers: headers('user', 'request-create-0001'), body: JSON.stringify({ courseCode: 'REQ_001', subjectName: 'Request fixture', semester: 'HK1_2099', note: 'fixture', scheduleSessions }) });
    assert.equal(request.status, 200); const requested = await request.json();
    const own = await app.request('/api/private/v1/course-requests', { headers: { Origin: ORIGIN, Cookie: 'session=user' } }); assert.equal(own.status, 200);
    const review = await app.request('/api/private/v1/course-requests/review', { headers: { Origin: ORIGIN, Cookie: 'session=auditor' } }); assert.equal(review.status, 200);
    const approve = await app.request(`/api/private/v1/course-requests/${requested.id}/approve`, { method: 'PATCH', headers: headers('admin', 'request-approve-0001', 0) });
    assert.equal(approve.status, 200); const approved = await approve.json();
    const approvalRetry = await app.request(`/api/private/v1/course-requests/${requested.id}/approve`, { method: 'PATCH', headers: headers('admin', 'request-approve-0001', 0) }); assert.deepEqual(await approvalRetry.json(), approved);
    const counts = (await app.sql(`SELECT (SELECT COUNT(*) FROM course_schedules WHERE source_key='request:${requested.id}') AS courses,(SELECT status FROM user_course_requests WHERE id='${requested.id}') AS status,(SELECT COUNT(*) FROM course_mutation_outbox WHERE request_id='${requested.id}' AND event_type='course_request.approved') AS outbox`))[0];
    assert.deepEqual({ courses: Number(counts.courses), status: counts.status, outbox: Number(counts.outbox) }, { courses: 1, status: 'approved', outbox: 1 });
    assert.deepEqual((await app.sql(`SELECT weeks,day_of_week,shift,campus,room FROM course_schedules WHERE source_key='request:${requested.id}'`))[0], { weeks: '1,2,3', day_of_week: '2', shift: 'S', campus: '', room: '' });

    const rejectedRequest = await app.request('/api/private/v1/course-requests', { method: 'POST', headers: headers('user', 'request-create-0002'), body: JSON.stringify({ courseCode: 'REQ_002', subjectName: 'Reject fixture', semester: 'HK1_2099', scheduleSessions }) }); const rejected = await rejectedRequest.json();
    const reject = await app.request(`/api/private/v1/course-requests/${rejected.id}/reject`, { method: 'PATCH', headers: headers('admin', 'request-reject-0001', 0) }); assert.equal(reject.status, 200);
  } finally { await app.dispose(); }
});

test('scraper internal path is server-authenticated, idempotent and cannot overwrite admin-reviewed instructor', async () => {
  const app = await harness();
  try {
    const courseId = '44444444-4444-4444-8444-444444444444';
    await app.sql(`INSERT INTO course_schedules (id,course_code,subject_name,semester,instructor,updated_at,course_code_search,subject_name_search,instructor_search,source_position,instructor_provenance) VALUES ('${courseId}','SCRAPE_001','Scraper fixture','HK1_2099','Old','2026-01-01','scrape_001','scraper fixture','old',1,'legacy_sync')`);
    const runId = '55555555-5555-4555-8555-555555555555'; const body = JSON.stringify({ writer: 'scraper', operation: 'apply_instructor_updates', runId, updates: [{ courseId, instructor: 'Scraped instructor' }] });
    const internalHeaders = await signedInternalHeaders(body, '66666666-6666-4666-8666-666666666666');
    const call = () => app.request('/internal/courses/v1/authority', { method: 'POST', headers: internalHeaders, body });
    assert.equal((await call()).status, 200); assert.equal((await call()).status, 200);
    assert.equal((await app.sql(`SELECT instructor FROM course_schedules WHERE id='${courseId}'`))[0].instructor, 'Scraped instructor');
    await app.sql(`UPDATE course_schedules SET instructor_provenance='admin',revision=7 WHERE id='${courseId}'`);
    const protectedRun = body.replace(runId, '77777777-7777-4777-8777-777777777777');
    const protectedResponse = await app.request('/internal/courses/v1/authority', { method: 'POST', headers: await signedInternalHeaders(protectedRun), body: protectedRun });
    assert.equal(protectedResponse.status, 200); assert.equal((await protectedResponse.json()).skippedAdmin, 1);
  } finally { await app.dispose(); }
});

test('approval failure is atomic and account cleanup removes only owner-owned request state', async () => {
  const app = await harness();
  try {
    const create = await app.request('/api/private/v1/course-requests', { method: 'POST', headers: headers('user', 'request-create-atomic-0001'), body: JSON.stringify({ courseCode: 'REQ_ATOMIC', subjectName: 'Atomic fixture', semester: 'HK1_2099', scheduleSessions }) });
    const requested = await create.json();
    await app.sql(`CREATE TRIGGER reject_approval BEFORE UPDATE OF status ON user_course_requests WHEN NEW.id='${requested.id}' BEGIN SELECT RAISE(ABORT, 'injected approval failure'); END`);
    const failedApproval = await app.request(`/api/private/v1/course-requests/${requested.id}/approve`, { method: 'PATCH', headers: headers('admin', 'request-approve-atomic-0001', 0) });
    assert.equal(failedApproval.status, 500);
    const failedState = (await app.sql(`SELECT status,(SELECT COUNT(*) FROM course_schedules WHERE source_key='request:${requested.id}') AS courses,(SELECT COUNT(*) FROM course_mutation_receipts WHERE idempotency_key='request-approve-atomic-0001') AS receipts,(SELECT COUNT(*) FROM course_mutation_outbox WHERE event_type='course_request.approved' AND request_id='${requested.id}') AS outbox FROM user_course_requests WHERE id='${requested.id}'`))[0];
    assert.deepEqual({ status: failedState.status, courses: Number(failedState.courses), receipts: Number(failedState.receipts), outbox: Number(failedState.outbox) }, { status: 'pending', courses: 0, receipts: 0, outbox: 0 });
    const cleanupBody = JSON.stringify({ writer: 'auth_edge', operation: 'delete_user_course_requests', userId: USER });
    const cleanup = await app.request('/internal/courses/v1/authority', { method: 'POST', headers: await signedInternalHeaders(cleanupBody), body: cleanupBody });
    assert.equal(cleanup.status, 200);
    const cleaned = (await app.sql(`SELECT (SELECT COUNT(*) FROM user_course_requests WHERE user_id='${USER}') AS requests,(SELECT COUNT(*) FROM course_mutation_receipts WHERE actor_scope='user' AND actor_id='${USER}') AS receipts,(SELECT COUNT(*) FROM course_mutation_outbox WHERE user_id='${USER}') AS outbox`))[0];
    assert.deepEqual({ requests: Number(cleaned.requests), receipts: Number(cleaned.receipts), outbox: Number(cleaned.outbox) }, { requests: 0, receipts: 0, outbox: 0 });
  } finally { await app.dispose(); }
});

test('D1-native public facet rebuild is internally authenticated and idempotent', async () => {
  const app = await harness();
  try {
    await app.sql("INSERT INTO course_schedules (id,course_code,subject_name,semester,is_user_added,updated_at,course_code_search,subject_name_search,instructor_search,source_position,catalogue_visibility) VALUES ('88888888-8888-4888-8888-888888888888','FACET_001','Facet fixture','HK1_2099',0,'2026-01-01','facet_001','facet fixture','',1,'published'),('99999999-9999-4999-8999-999999999999','FACET_002','Retired fixture','HK1_2099',0,'2026-01-01','facet_002','retired fixture','',2,'retired')");
    const body = JSON.stringify({ writer: 'system', operation: 'rebuild_course_facets' });
    const rebuild = async () => app.request('/internal/courses/v1/authority', { method: 'POST', headers: await signedInternalHeaders(body), body });
    const first = await rebuild(); assert.equal(first.status, 200);
    const countAfterFirst = Number((await app.sql("SELECT COUNT(*) AS count FROM course_filter_facets WHERE subject_name='Facet fixture'"))[0].count);
    const second = await rebuild(); assert.equal(second.status, 200);
    const countAfterSecond = Number((await app.sql("SELECT COUNT(*) AS count FROM course_filter_facets WHERE subject_name='Facet fixture'"))[0].count);
    assert.equal(countAfterFirst, 1); assert.equal(countAfterSecond, 1);
    assert.equal(Number((await app.sql("SELECT COUNT(*) AS count FROM course_filter_facets WHERE subject_name='Retired fixture'"))[0].count), 0);
  } finally { await app.dispose(); }
});
