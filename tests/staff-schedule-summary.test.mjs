import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('staff schedule summary joins real credits and resolves email in one Auth batch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hub-staff-summary-'));
  let mf;
  try {
    const bundle = join(directory, 'worker.mjs');
    await build({
      stdin: {
        contents: `import { handleStaffSchedules } from './cloudflare/worker/src/staff-schedules.ts';
          export default { async fetch(request, env) {
            try { return Response.json(await handleStaffSchedules(request, new URL(request.url), env)); }
            catch (error) { return Response.json({ error: String(error) }, { status: 500 }); }
          } };`,
        resolveDir: process.cwd(), sourcefile: 'staff-summary-entry.ts', loader: 'ts',
      },
      outfile: bundle, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent',
    });
    const script = await readFile(bundle, 'utf8');
    const dbId = crypto.randomUUID();
    let emailLookups = 0;
    const auth = async (request) => {
      if (new URL(request.url).pathname === '/internal/auth/staff') {
        return Response.json({ userId: '22222222-2222-4222-8222-222222222222', email: 'admin@st.buh.edu.vn', role: 'admin' });
      }
      if (new URL(request.url).pathname === '/internal/auth/user-names') {
        emailLookups++;
        const body = await request.json();
        return Response.json({ names: body.userIds.map((userId) => ({ userId, email: userId.startsWith('1111') ? 'real@student.example' : null })) });
      }
      return Response.json({}, { status: 404 });
    };
    const control = `export default { async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === '/sql') { const statements = await request.json(); for (const sql of statements) await env.DB.prepare(sql).run(); return Response.json({ ok: true }); }
      return env.APP.fetch(request);
    } };`;
    mf = new Miniflare({ workers: [
      { name: 'control', modules: true, compatibilityDate: '2026-07-29', script: control, d1Databases: { DB: dbId }, serviceBindings: { APP: 'application' } },
      { name: 'application', modules: true, compatibilityDate: '2026-07-29', script, d1Databases: { DB: dbId }, serviceBindings: { AUTH_SERVICE: auth } },
    ] });
    const studentA = '11111111-1111-4111-8111-111111111111';
    const studentB = '33333333-3333-4333-8333-333333333333';
    const semester = 'HK1_2026_2027';
    const sql = [
      'CREATE TABLE user_profiles (user_id TEXT PRIMARY KEY, student_code TEXT, full_name TEXT)',
      'CREATE TABLE course_schedules (id TEXT PRIMARY KEY, credits INTEGER)',
      'CREATE TABLE user_schedules (id TEXT PRIMARY KEY, user_id TEXT, course_id TEXT, semester TEXT, custom_data TEXT)',
      'CREATE TABLE user_schedule_course_snapshots (schedule_id TEXT, user_id TEXT, course_id TEXT, course_json TEXT)',
      `INSERT INTO user_profiles VALUES ('${studentA}','SV1','Sinh viên A'),('${studentB}','SV2','Sinh viên B')`,
      "INSERT INTO course_schedules VALUES ('c1',3),('c2',4),('c3',3),('c4',NULL),('c5',5)",
      `INSERT INTO user_schedules VALUES ('s1','${studentA}','c1','${semester}',NULL),('s2','${studentA}','c2','${semester}',NULL),('s3','${studentA}','c3','${semester}','{"credits":1}'),('s4','${studentB}','c4','${semester}','not-json'),('s5','${studentA}','c5','${semester}',NULL)`,
      `INSERT INTO user_schedule_course_snapshots VALUES ('s2','${studentA}','c2','{"credits":2}')`,
      `INSERT INTO user_schedule_course_snapshots VALUES ('s5','${studentA}','c5','{}')`,
    ];
    const setup = await mf.dispatchFetch('http://localhost/sql', { method: 'POST', body: JSON.stringify(sql) });
    assert.equal(setup.status, 200, await setup.text());
    const response = await mf.dispatchFetch(`https://hub.example/api/staff/v1/schedules?mode=summaries&semester=${semester}`, { headers: { Cookie: 'session=admin' } });
    assert.equal(response.status, 200, await response.clone().text());
    const payload = await response.json();
    assert.equal(payload.data.find((row) => row.user_id === studentA).total_credits, 6);
    assert.equal(payload.data.find((row) => row.user_id === studentA).course_count, 4);
    assert.equal(payload.data.find((row) => row.user_id === studentB).total_credits, 0);
    assert.equal(payload.data.find((row) => row.user_id === studentA).email, 'real@student.example');
    assert.equal(payload.data.find((row) => row.user_id === studentB).email, null);
    assert.equal(emailLookups, 1);
  } finally {
    await mf?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
