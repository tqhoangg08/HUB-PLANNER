import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { handlePublicScholarships, handleMyScholarships, scholarshipErrorStatus } from '../cloudflare/worker/src/scholarships.ts';
import { handleAdminScholarships, readScholarshipJson } from '../cloudflare/worker/src/scholarship-admin.ts';
import { normalizeScholarshipName, validateScholarshipImport } from '../shared/scholarship-import.ts';
import { eligibilityMapping, convertEligibilityImport } from '../shared/scholarship-eligibility.ts';
import { rankingKeys } from '../shared/scholarship-policy.ts';
import { syntheticEligibility } from './fixtures/scholarship-eligibility.ts';

test('1059 x 17 eligibility rows: typed conversion, independent own policy, public leakage, AND filters and source order', async t => {
  const c = await setup(t); await c.create();
  const data = syntheticEligibility();
  assert.equal(data.rows.length,1059); assert.equal(Object.keys(data.rows[0].values).length,17);
  const legacy = structuredClone(data) as any;
  delete legacy.mapping.sourceOrdinal; delete legacy.mapping.sourceListKind; delete legacy.mapping.trainingProgram; delete legacy.mapping.rankings;
  legacy.mapping.scores.push({key:'trainingProgram',column:'Chương trình đào tạo',label:'Chương trình đào tạo'},
    ...eligibilityMapping.rankings!.map(item=>({...item,label:item.column})));
  const converted = await convertEligibilityImport(legacy);
  await assert.rejects(c.preview(legacy),{status:400});
  assert.deepEqual(converted.payload.rows, legacy.rows); assert.equal(converted.validation.errors.length,0);
  assert.equal(converted.validation.rows[0].studentCode,'000000000001');
  assert.deepEqual(converted.validation.rows[0].scores,{gpa:3.6,trainingScore:100,credits:17,amountVnd:13926000});
  assert.equal(converted.validation.rows[0].rankings?.topSchoolPercent,0.0125);
  const batchId = await c.applied(converted.payload as never);
  const core = ['fullName','studentCode','awardType'];
  const detail = ['sourceOrdinal','className','major','cohort','trainingProgram','scholarshipRank','scores.gpa','scores.trainingScore','scores.credits','scores.amountVnd'];
  const ownFields = [...detail,...rankingKeys.map(key=>'rankings.'+key)];
  const approval = {batchId,sourceSha256:data.sourceSha256,officialSource:{title:'Synthetic eligibility',reference:'SYNTHETIC ONLY',url:null},republicationConfirmed:true};
  await assert.rejects(c.transition('approve',{...approval,approvedFields:[...core,'scores.topSchool']}),{status:400});
  await assert.rejects(c.transition('approve',{...approval,approvedFields:core,ownFields}),{status:400});
  await c.transition('approve',{...approval,approvedFields:[...core,...detail],ownFields,ownAccessConfirmed:true});
  await c.transition('publish',{batchId});
  const response = await c.publicApi(slug+'/recipients?limit=3&page=2') as any;
  assert.equal(response.total,1059); assert.equal(response.recipients[0].sourceOrdinal,4);
  assert.equal(response.campaign.sourceListKind,'eligibility');
  assert.doesNotMatch(JSON.stringify(response),/topSchool|topMajor|topCohort|topClass|rankings/i);
  const values = {q:'viên kiểm thử',major:'Kế toán',className:'TEST-B',cohort:'K24',scholarshipRank:'Giỏi',trainingProgram:'Chương trình kiểm thử A'};
  const expected = data.rows.filter(({values:v},i)=>i%2 && i%3 && i%4 && i%5);
  const query = new URLSearchParams({...values,limit:'3',page:'2'});
  const filtered = await c.publicApi(slug+'/search?'+query) as any;
  assert.equal(filtered.total,expected.length);
  assert.deepEqual(filtered.recipients.map(r=>r.studentCode),expected.slice(3,6).map(r=>r.values.MSSV));
  const facets = await c.publicApi(slug+'/facets?'+new URLSearchParams(values)) as any;
  assert.equal(facets.apiVersion,'1.2.0'); assert.ok(facets.supportedFilters.includes('trainingProgram'));
  assert.doesNotMatch(JSON.stringify(facets),/topSchool|topMajor|topCohort|topClass|rankings/i);
  assert.equal((await c.publicApi(slug+'/recipients?trainingProgram=unknown')).total,0);
  const mine = await handleMyScholarships(c.req('/api/me/scholarships'),c.env as never) as any;
  assert.equal(mine.awards.length,1); assert.equal(mine.awards[0].rankings.topSchoolPercent,0.0125);
  assert.equal(mine.awards[0].trainingProgram,data.rows[0].values['Chương trình đào tạo']);
  // Revoke public optional fields, preserving independent own access. Legacy Top aliases cannot bypass policy.
  c.sqlite.prepare('UPDATE scholarship_import_batches SET approved_fields_json=? WHERE id=?').run(JSON.stringify([...core,'scores.topSchool','rankings.topClass']),batchId);
  const publicHidden = await c.publicApi(slug+'/recipients') as any;
  assert.deepEqual(publicHidden.recipients[0].scores,{}); assert.equal(publicHidden.recipients[0].trainingProgram,null);
  assert.doesNotMatch(JSON.stringify(publicHidden),/topSchool|topClass|rankings/i);
  assert.equal((await c.publicApi(slug+'/facets')).supportedFilters.length,0);
  assert.equal((await c.publicApi(slug+'/recipients?trainingProgram='+encodeURIComponent(data.rows[0].values['Chương trình đào tạo']))).total,0);
  assert.equal((await handleMyScholarships(c.req('/api/me/scholarships'),c.env as never) as any).awards[0].scores.amountVnd,13926000);
  const otherEnv = {...c.env,AUTH_SERVICE:{fetch:async(request: Request)=>Response.json(new URL(request.url).pathname.startsWith('/internal/')
    ? {...owner,email:'999999999999@st.buh.edu.vn',role:'user'}
    : {user:{id:owner.userId,email:'999999999999@st.buh.edu.vn',emailVerified:true}})}};
  assert.deepEqual((await handleMyScholarships(c.req('/api/me/scholarships'),otherEnv as never)).awards,[]);
  for (const param of ['studentCode','rankings','topSchool','trainingProgram']) await assert.rejects(handleMyScholarships(c.req('/api/me/scholarships?'+param+'=forged'),c.env as never),{status:400});
  const plan=c.sqlite.prepare('EXPLAIN QUERY PLAN SELECT id FROM scholarship_snapshot_rows WHERE batch_id=? AND training_program=? AND cohort=?').all(batchId,'x','K24');
  assert.match(JSON.stringify(plan),/scholarship_snapshot_program_idx/);
});

test('eligibility rankings retain nulls/numeric strings and reject invalid ratios, ranks and malformed mapping', async () => {
  const data = syntheticEligibility(1) as any;
  data.rows[0].values['Tỷ lệ top trường']='0,0125'; data.rows[0].values['Top trường']=null;
  data.rows[0].values['Top lớp']='001'; data.rows[0].values['Chương trình đào tạo']=null;
  const valid = await validateScholarshipImport(data);
  assert.equal(valid.errors.length,0); assert.equal(valid.rows[0].rankings?.topSchoolPercent,'0,0125');
  assert.equal(valid.rows[0].rankings?.topSchool,null); assert.equal(valid.rows[0].rankings?.topClass,'001');
  assert.equal(valid.rows[0].trainingProgram,null);
  for(const value of [-1,1.01,'1,25',Infinity,'bad']) {
    const invalid=structuredClone(data); invalid.rows[0].values['Tỷ lệ top trường']=value;
    assert.equal((await validateScholarshipImport(invalid)).rejectedRows,1);
  }
  for(const value of [0,-1,1.5,'bad']) {
    const invalid=structuredClone(data); invalid.rows[0].values['Top lớp']=value;
    assert.equal((await validateScholarshipImport(invalid)).rejectedRows,1);
  }
  for(const key of ['trainingProgram','cohort','gpa','amountVnd','topUnknown']) {
    await assert.rejects(validateScholarshipImport({...data,mapping:{...data.mapping,rankings:[{key,column:'Top trường'}]}}));
  }
  await assert.rejects(validateScholarshipImport({...data,mapping:{...data.mapping,sourceListKind:'official_without_evidence'}}));
  await assert.rejects(validateScholarshipImport({...data,mapping:{...data.mapping,sourceListKind:undefined}}),/SOURCE_LIST_KIND_REQUIRED/);
});

const origin = 'https://example.test', slug = 'synthetic-hk2';
const owner = { userId: '11111111-1111-4111-8111-111111111111', email: '000000000001@st.buh.edu.vn', role: 'admin' };
const mapping = { studentCode: 'MSSV', fullName: 'Tên', awardType: 'Loại', className: 'Lớp',
  scores: [{ key: 'gpa', column: 'Điểm', label: 'Điểm nguồn (chưa xác định thang)' }, { key: 'privateScore', column: 'Riêng', label: 'Điểm riêng' }] };
const input = (extra = {}) => ({ sourceSha256: 'a'.repeat(64), sourceFilename: 'synthetic.csv', mapping,
  rows: [
    { sourceRowNumber: 2, values: { MSSV: '000000000001', Tên: 'Nguyễn Văn Đạt', Loại: 'Giỏi', Lớp: 'C1', Điểm: 9.5, Riêng: 888 } },
    { sourceRowNumber: 3, values: { MSSV: '000000000001', Tên: 'Nguyễn Văn Đạt', Loại: 'Tài năng', Lớp: 'C1', Điểm: '9,7', Riêng: 999 } },
    { sourceRowNumber: 4, values: { MSSV: '000000000002', Tên: 'Nguyễn Văn Đạt', Loại: 'Giỏi', Lớp: 'C2', Điểm: 8.8, Riêng: 777 } },
  ], ...extra });

// Real SQLite SQL/constraints; D1 batch adapter preserves atomicity (no SQL-pattern mocks).
const sqliteD1 = (sqlite: DatabaseSync) => {
  const prepare = (sql: string) => {
    let bound: unknown[] = [];
    const stmt = {
      bind(...values: unknown[]) { bound = values; return stmt; },
      async first() { return sqlite.prepare(sql).get(...bound) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...bound) }; },
      async run() { const result = sqlite.prepare(sql).run(...bound); return { success: true, meta: { changes: Number(result.changes) } }; },
      sql, get bound() { return bound; },
    };
    return stmt;
  };
  return { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    sqlite.exec('BEGIN');
    try { const result = []; for (const stmt of statements) result.push(await stmt.run()); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
};
const setup = async (t: { after: (fn: () => void) => void }, options: Record<string, unknown> = {}) => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0055_scholarships.sql', '0056_scholarship_snapshots.sql', '0057_scholarship_filters.sql', '0059_scholarship_personal_details.sql'])
    sqlite.exec(await readFile(new URL('../cloudflare/migrations/' + file, import.meta.url), 'utf8'));
  const DB = sqliteD1(sqlite);
  const env = { DB, AUTH_SERVICE: { fetch: async (request: Request) => {
    if (options.authFailure) throw Error('synthetic');
    if (options.expired) return Response.json({}, { status: 401 });
    if (new URL(request.url).pathname.startsWith('/internal/')) return Response.json({ ...owner, role: options.role ?? 'admin', email: options.email ?? owner.email });
    return Response.json({ user: { id: options.userId ?? owner.userId, email: options.email ?? owner.email, emailVerified: options.verified ?? true } });
  } } };
  const req = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => new Request(origin + path,
    { method, headers: { Cookie: 'synthetic=session', Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
  const admin = (suffix = '', method = 'GET', body?: unknown, headers?: Record<string, string>) => {
    const request = req('/api/admin/v1/scholarships/campaigns' + suffix, method, body, headers);
    return handleAdminScholarships(request, new URL(request.url), env as never);
  };
  const publicApi = (suffix: string, method = 'GET') => {
    const request = req('/api/public/v1/scholarships/' + suffix, method);
    return handlePublicScholarships(request, new URL(request.url), env as never);
  };
  const current = () => sqlite.prepare('SELECT * FROM scholarship_campaigns WHERE slug=?').get(slug) as Record<string, unknown>;
  const transition = (action: string, body = {}) => admin('/' + slug + '/' + action, 'POST', { expectedRevision: current().revision, ...body });
  const create = () => admin('', 'POST', { slug, title: 'Synthetic awards', schoolYear: '2025-2026', semester: 'HK2' });
  const preview = async (data = input()) => {
    const result = await admin('/' + slug + '/imports/preview', 'POST', data) as { receipt: { batchId: string }; valid: boolean };
    return result;
  };
  const applied = async (data = input()) => {
    const previewed = await preview(data); const batchId = previewed.receipt.batchId;
    await transition('imports/apply', { batchId }); return batchId;
  };
  const approved = async (batchId: string, fields = ['fullName', 'studentCode', 'awardType', 'scores.gpa']) => transition('approve', {
    batchId, sourceSha256: sqlite.prepare('SELECT source_sha256 FROM scholarship_import_batches WHERE id=?').get(batchId)?.source_sha256,
    officialSource: { title: 'Synthetic decision', reference: 'SYNTHETIC-LOCAL-ONLY', url: null },
    approvedFields: fields, republicationConfirmed: true,
  });
  const published = async () => { await create(); const batchId = await applied(); await approved(batchId); await transition('publish', { batchId }); return batchId; };
  return { sqlite, env, req, admin, publicApi, current, transition, create, preview, applied, approved, published };
};

test('empty launch state and all nonpublished states are private, including legacy rows', async t => {
  const c = await setup(t);
  assert.deepEqual(await c.publicApi('campaigns'), { campaigns: [], total: 0, page: 1, limit: 20 });
  await c.create();
  for (const state of ['draft', 'validated', 'approved', 'archived']) {
    c.sqlite.prepare('UPDATE scholarship_campaigns SET status=? WHERE slug=?').run(state, slug);
    await assert.rejects(c.publicApi(slug + '/recipients'), { status: 404 });
  }
  c.sqlite.exec(`UPDATE scholarship_campaigns SET status='published', public_data_approved=1,published_at='synthetic';
    INSERT INTO scholarship_recipients(campaign_slug,source_row_number,student_code,full_name,full_name_search,award_type)
    VALUES ('${slug}',2,'000000000001','Synthetic','synthetic','Giỏi');`);
  assert.equal((await c.publicApi('campaigns')).total, 0);
});
test('preview/apply/approval remain private; public fields are explicit, source scores retain semantics', async t => {
  const c = await setup(t); await c.create(); const batchId = await c.applied();
  await assert.rejects(c.publicApi(slug + '/summary'), { status: 404 });
  await c.approved(batchId); await assert.rejects(c.publicApi(slug + '/recipients'), { status: 404 });
  await c.transition('publish', { batchId });
  const result = await c.publicApi(slug + '/recipients') as Record<string, any>;
  assert.equal(result.total, 3); assert.equal(result.recipients[0].gpa, 9.5);
  assert.equal(result.recipients[1].gpa, '9,7'); assert.equal(result.recipients[0].className, null);
  assert.equal(result.recipients[0].scores.privateScore, undefined);
  assert.deepEqual(result.campaign.scoreColumns, [{ key: 'gpa', label: mapping.scores[0].label }]);
  const stats = await c.publicApi(slug + '/summary'); assert.equal(stats.totalRecipients, 3); assert.equal(stats.totalStudents, 2);
});
test('Vietnamese name substring, duplicate names, student-code prefix and literal wildcard escaping', async t => {
  const c = await setup(t); await c.published();
  assert.equal(normalizeScholarshipName(' ĐẶNG   Văn '), 'dang van');
  for (const q of ['Văn Đạt', 'van dat', 'DAT', '0000000000']) assert.equal((await c.publicApi(slug + '/search?q=' + encodeURIComponent(q))).total, 3);
  for (const q of ['%_', '\\%', 'does not match']) assert.equal((await c.publicApi(slug + '/search?q=' + encodeURIComponent(q))).total, 0);
  assert.equal((await c.publicApi(slug + '/search?q=000000000002')).total, 1);
});
test('bounded filters/pagination preserve source order and validate query, routes and methods', async t => {
  const c = await setup(t); await c.published();
  const first = await c.publicApi(slug + '/recipients?limit=1&page=1') as Record<string, any>;
  const second = await c.publicApi(slug + '/recipients?limit=1&page=2') as Record<string, any>;
  assert.equal(first.recipients[0].awardType, 'Giỏi'); assert.equal(second.recipients[0].awardType, 'Tài năng');
  assert.equal((await c.publicApi(slug + '/recipients?awardType=' + encodeURIComponent('Giỏi'))).total, 2);
  assert.equal((await c.publicApi('campaigns?semester=HK1')).total, 0);
  for (const qs of ['page=-1', 'limit=51', 'page=1e2', 'page=01', 'page=', 'limit=0', 'page=10001', 'page=1&page=2', 'userId=x'])
    await assert.rejects(c.publicApi(slug + '/recipients?' + qs), { status: 400 });
  for (const q of ['A', 'a'.repeat(81), 'a\u0000b']) await assert.rejects(c.publicApi(slug + '/search?q=' + encodeURIComponent(q)), { status: 400 });
  await assert.rejects(c.publicApi('-invalid/recipients'), { status: 400 });
  await assert.rejects(c.publicApi(slug + '/invalid'), { status: 404 });
  await assert.rejects(c.publicApi(slug + '/summary', 'POST'), { status: 405 });
});
test('own award lookup verifies server identity, returns every award and applies score gates', async t => {
  const c = await setup(t); await c.published();
  const result = await handleMyScholarships(c.req('/api/me/scholarships'), c.env as never) as Record<string, any>;
  assert.equal(result.verified, true); assert.equal(result.awards.length, 2);
  assert.ok(result.awards.every(a => a.studentCode === '000000000001' && !('privateScore' in a.scores)));
  for (const key of ['studentCode', 'userId', 'recipientId'])
    await assert.rejects(handleMyScholarships(c.req('/api/me/scholarships?' + key + '=forged'), c.env as never), { status: 400 });
});
test('unverified vs verified no award; mismatched/expired/auth unavailable fail closed', async t => {
  for (const options of [{ verified: false }, { email: 'other@example.test' }, { email: '000000000009@st.buh.edu.vn' }]) {
    const c = await setup(t, options); await c.published();
    const result = await handleMyScholarships(c.req('/api/me/scholarships'), c.env as never);
    assert.deepEqual(result, { verified: options.email === '000000000009@st.buh.edu.vn', awards: [] });
  }
  for (const options of [{ userId: '22222222-2222-4222-8222-222222222222' }, { expired: true }, { authFailure: true }]) {
    const c = await setup(t, options);
    await assert.rejects(handleMyScholarships(c.req('/api/me/scholarships'), c.env as never), { status: options.expired ? 401 : 503 });
  }
});
test('every Admin read/mutation denies auditor and user; client role headers have no authority', async t => {
  for (const role of ['user', 'auditor']) {
    const c = await setup(t, { role });
    await assert.rejects(c.create(), { status: 403 });
    await assert.rejects(c.admin('', 'GET', undefined, { 'X-Role': 'admin' }), { status: 403 });
    for (const action of ['imports/preview', 'imports/apply', 'approve', 'publish', 'unpublish', 'rollback', 'archive'])
      await assert.rejects(c.admin('/' + slug + '/' + action, 'POST', {}), { status: 403 });
  }
});
test('same-origin/JSON checks, streamed byte bound, malformed payload and method validation', async t => {
  const c = await setup(t);
  await assert.rejects(c.admin('', 'POST', {}, { Origin: 'https://evil.test' }), { status: 403 });
  await assert.rejects(c.admin('', 'POST', {}, { Origin: '' }), { status: 403 });
  await assert.rejects(c.admin('', 'POST', {}, { 'Content-Type': 'text/plain' }), { status: 415 });
  await assert.rejects(c.admin('', 'DELETE'), { status: 405 });
  await assert.rejects(readScholarshipJson(new Request(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })), { status: 400 });
  await assert.rejects(readScholarshipJson(new Request(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(1048577) })), { status: 413 });
});
test('ambiguous duplicates, conflicting names, missing columns and invalid numeric MSSV reject entire import', async t => {
  const c = await setup(t); await c.create();
  const data = input(); data.rows.push({ ...data.rows[0], sourceRowNumber: 5 });
  const result = await c.preview(data) as Record<string, any>;
  assert.equal(result.valid, false); assert.equal(result.errors[0].code, 'AMBIGUOUS_DUPLICATE_AWARD');
  assert.equal(c.sqlite.prepare("SELECT COUNT(*) AS n FROM scholarship_import_batches WHERE status='rejected'").get()?.n, 1);
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) AS n FROM scholarship_snapshot_rows').get()?.n, 0);
  for (const values of [{ ...input().rows[0].values, MSSV: 1 }, { ...input().rows[0].values, MSSV: 'bad' }]) {
    const checked = await validateScholarshipImport(input({ rows: [{ sourceRowNumber: 2, values }] })); assert.equal(checked.rejectedRows, 1);
  }
  const conflict = input(); conflict.rows[1].values.Tên = 'Different';
  assert.equal((await validateScholarshipImport(conflict)).errors[0].code, 'CONFLICTING_STUDENT_NAME');
  await assert.rejects(validateScholarshipImport(input({ sourceSha256: 'invalid' })), { status: 400 });
});
test('same-category multiple awards require distinct source identifiers; different categories need no dedupe', async () => {
  const data = input(); data.rows[1].values.Loại = 'Giỏi';
  assert.equal((await validateScholarshipImport(data)).rejectedRows, 1);
  const withIds = input({ mapping: { ...mapping, sourceIdentifier: 'ID' }, rows: data.rows.map((r, i) => ({ ...r, values: { ...r.values, ID: 'source-' + i } })) });
  assert.equal((await validateScholarshipImport(withIds)).rejectedRows, 0);
});
test('preview and apply idempotency include source checksum, mapping and payload; no duplicate audit writes', async t => {
  const c = await setup(t); await c.create(); const first = await c.preview(); const second = await c.preview();
  assert.equal(first.receipt.batchId, second.receipt.batchId);
  const id = first.receipt.batchId; await c.transition('imports/apply', { batchId: id });
  const rows = await c.admin('/' + slug + '/imports/' + id + '/rows?limit=1') as Record<string, any>;
  assert.equal(rows.total, 3); assert.equal(rows.rows.length, 1); assert.equal(rows.rows[0].scores.privateScore, 888);
  assert.throws(() => c.sqlite.prepare("UPDATE scholarship_snapshot_rows SET full_name='changed' WHERE batch_id=?").run(id), /SCHOLARSHIP_SNAPSHOT_IMMUTABLE/);
  const stale = await c.admin('/' + slug + '/imports/apply', 'POST', { expectedRevision: 0, batchId: id }) as Record<string, any>;
  assert.equal(stale.idempotent, true);
  assert.equal(c.sqlite.prepare("SELECT COUNT(*) AS n FROM scholarship_audit_events WHERE action='applied'").get()?.n, 1);
  const modified = input(); modified.rows[0].values.Điểm = 10;
  assert.notEqual((await c.preview(modified)).receipt.batchId, id);
});
test('corrupt stored preview is detected before apply', async t => {
  const c = await setup(t); await c.create(); const batchId = (await c.preview()).receipt.batchId;
  c.sqlite.prepare("UPDATE scholarship_snapshot_rows SET full_name='Corrupted' WHERE batch_id=?").run(batchId);
  await assert.rejects(c.transition('imports/apply', { batchId }), { status: 409 });
  assert.equal(c.current().revision, 0); assert.equal(c.current().status, 'draft');
});
test('approval requires document, matching checksum, republication and mandatory fields; no invented scores', async t => {
  const c = await setup(t); await c.create(); const batchId = await c.applied();
  const base = { batchId, sourceSha256: 'a'.repeat(64), officialSource: { title: 'Synthetic', reference: 'local', url: null },
    approvedFields: ['fullName', 'studentCode', 'awardType'], republicationConfirmed: true };
  for (const patch of [{ officialSource: null }, { sourceSha256: 'b'.repeat(64) }, { republicationConfirmed: false },
    { approvedFields: ['fullName'] }, { approvedFields: [...base.approvedFields, 'scores.missing'] }])
    await assert.rejects(c.transition('approve', { ...base, ...patch }), { status: 400 });
  await c.transition('approve', base); await c.transition('publish', { batchId });
  const result = await c.publicApi(slug + '/recipients') as Record<string, any>;
  assert.deepEqual(result.recipients[0].scores, {}); assert.equal(result.recipients[0].gpa, null);
});
test('live snapshot survives preview, apply is gated; explicit replacement, unpublish, rollback and archive', async t => {
  const c = await setup(t); const old = await c.published();
  const replacement = input({ sourceSha256: 'b'.repeat(64), rows: [input().rows[2]] });
  const next = (await c.preview(replacement)).receipt.batchId;
  assert.equal((await c.publicApi(slug + '/recipients')).total, 3);
  await assert.rejects(c.transition('imports/apply', { batchId: next }), { status: 409 });
  await c.transition('unpublish'); await assert.rejects(c.publicApi(slug + '/recipients'), { status: 404 });
  await c.transition('imports/apply', { batchId: next }); await c.approved(next); await c.transition('publish', { batchId: next });
  assert.equal((await c.publicApi(slug + '/recipients')).total, 1);
  await c.transition('rollback', { batchId: old }); assert.equal((await c.publicApi(slug + '/recipients')).total, 3);
  await c.transition('archive'); await assert.rejects(c.publicApi(slug + '/recipients'), { status: 404 });
});
test('stale revisions and transaction failures leave publication/audit intact', async t => {
  const c = await setup(t); const id = await c.published();
  await assert.rejects(c.admin('/' + slug + '/unpublish', 'POST', { expectedRevision: 0 }), { status: 409 });
  c.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON scholarship_audit_events WHEN NEW.action='unpublished' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END;");
  const previous = { ...c.current() };
  await assert.rejects(c.transition('unpublish'), { status: 503 });
  assert.deepEqual({ ...c.current() }, previous); assert.equal((await c.publicApi(slug + '/recipients')).total, 3);
  assert.equal(c.current().active_batch_id, id);
});
test('campaign create/edit/list/archive and import/audit pagination use Admin capability', async t => {
  const c = await setup(t); await c.create();
  await assert.rejects(c.create(), { status: 409 });
  const edited = await c.admin('/' + slug, 'PATCH', { expectedRevision: 0, title: 'Edited synthetic' }) as Record<string, any>;
  assert.equal(edited.campaign.title, 'Edited synthetic'); assert.equal(edited.campaign.revision, 1);
  assert.equal((await c.admin())!.total, 1);
  await c.applied();
  await assert.rejects(c.admin('/' + slug, 'PATCH', { expectedRevision: 2, title: 'Invalid' }), { status: 409 });
  assert.equal((await c.admin('/' + slug + '/imports?limit=1'))!.total, 1);
  const audit = await c.admin('/' + slug + '/audit?limit=1') as Record<string, any>;
  assert.equal(audit.total, 4); assert.equal(audit.audit.length, 1); assert.equal(audit.audit[0].actorUserId, owner.userId);
  await c.transition('archive'); await assert.rejects(c.preview(), { status: 409 });
});
test('failed preview transaction never leaves a partial snapshot or receipt', async t => {
  const c = await setup(t); await c.create();
  c.sqlite.exec("CREATE TRIGGER fail_row BEFORE INSERT ON scholarship_snapshot_rows WHEN NEW.source_row_number=3 BEGIN SELECT RAISE(ABORT,'synthetic row failure'); END;");
  await assert.rejects(c.preview(), { status: 503 });
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) AS n FROM scholarship_snapshot_rows').get()?.n, 0);
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) AS n FROM scholarship_import_batches').get()?.n, 0);
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) AS n FROM scholarship_audit_events').get()?.n, 1);
});
test('publish and rollback audit failures atomically preserve the prior state and live pointer', async t => {
  const c = await setup(t); await c.create(); const old = await c.applied(); await c.approved(old);
  c.sqlite.exec("CREATE TRIGGER fail_publish BEFORE INSERT ON scholarship_audit_events WHEN NEW.action='published' BEGIN SELECT RAISE(ABORT,'synthetic publish failure'); END;");
  const approved = { ...c.current() };
  await assert.rejects(c.transition('publish', { batchId: old }), { status: 503 });
  assert.deepEqual({ ...c.current() }, approved); await assert.rejects(c.publicApi(slug + '/recipients'), { status: 404 });
  c.sqlite.exec('DROP TRIGGER fail_publish'); await c.transition('publish', { batchId: old });
  const next = (await c.preview(input({ sourceSha256: 'b'.repeat(64), rows: [input().rows[2]] }))).receipt.batchId;
  await c.transition('unpublish'); await c.transition('imports/apply', { batchId: next }); await c.approved(next); await c.transition('publish', { batchId: next });
  c.sqlite.exec("CREATE TRIGGER fail_rollback BEFORE INSERT ON scholarship_audit_events WHEN NEW.action='rollback' BEGIN SELECT RAISE(ABORT,'synthetic rollback failure'); END;");
  const live = { ...c.current() };
  await assert.rejects(c.transition('rollback', { batchId: old }), { status: 503 });
  assert.deepEqual({ ...c.current() }, live); assert.equal((await c.publicApi(slug + '/recipients')).total, 1);
  assert.equal(c.sqlite.prepare("SELECT COUNT(*) AS n FROM scholarship_audit_events WHERE action='rollback'").get()?.n, 0);
});
test('rate limit and missing/failing D1 return actionable status without leaking database diagnostics', async t => {
  const c = await setup(t); await c.published();
  const request = c.req('/api/public/v1/scholarships/' + slug + '/search?q=dat', 'GET', undefined, { 'CF-Connecting-IP': '192.0.2.1' });
  await assert.rejects(handlePublicScholarships(request, new URL(request.url), { ...c.env, SCHOLARSHIP_SEARCH_RATE_LIMIT: { limit: async () => ({ success: false }) } } as never), { status: 429 });
  await assert.rejects(handlePublicScholarships(request, new URL(request.url), {}), { status: 503 });
  assert.equal(scholarshipErrorStatus(Error('D1 private diagnostics')), 503);
});

test('v1.1 AND filters use independent source type/rank/cohort and global pagination', async t => {
  const c = await setup(t); await c.create();
  const source = { ...input(), mapping: { ...mapping, major: 'Ngành', cohort: 'Khóa', scholarshipType: 'Chương trình', scholarshipRank: 'Xếp loại' },
    rows: Array.from({ length: 37 }, (_, i) => ({ sourceRowNumber: i + 2, values: {
      MSSV: String(i + 1).padStart(12, '0'), Tên: 'Đặng Văn An', Loại: 'Legacy label', Lớp: ['A1','A2','A3','B1'][i%4],
      Ngành: i%4===3 ? 'Kinh tế' : 'Kế toán', Khóa: i%4===3 ? 'K23' : 'K24',
      'Chương trình': i%4===2 ? 'Tiếp sức' : 'KKHT', 'Xếp loại': i%4===1 ? 'Khá' : 'Giỏi', Điểm: 9, Riêng: 999,
    } })) };
  const batchId = await c.applied(source);
  await c.approved(batchId, ['fullName','studentCode','awardType','major','className','cohort','scholarshipType','scholarshipRank']);
  await c.transition('publish',{batchId});
  const filters = new URLSearchParams({ q:'dang', scholarshipType:'KKHT', scholarshipRank:'Giỏi', major:'Kế toán', cohort:'K24', className:'A1', limit:'3', page:'2' });
  const result = await c.publicApi(slug+'/search?'+filters) as Record<string, any>;
  assert.equal(result.total,10); assert.equal(result.recipients.length,3);
  assert.deepEqual(result.recipients.map(r=>r.studentCode), ['000000000013','000000000017','000000000021']);
  assert.equal(result.recipients[0].awardType,'Legacy label');
  assert.equal(result.recipients[0].scholarshipType,'KKHT'); assert.equal(result.recipients[0].scholarshipRank,'Giỏi');
  const facet = await c.publicApi(slug+'/facets?'+new URLSearchParams({major:'Kế toán',cohort:'K24'})) as Record<string, any>;
  assert.deepEqual(facet.facets.className.options,['A1','A2','A3']); assert.equal(facet.totalRecipients,28);
  assert.deepEqual((await c.publicApi(slug+'/facets?'+new URLSearchParams({scholarshipType:'KKHT',scholarshipRank:'Giỏi',major:'Kế toán',cohort:'K24',className:'A1'})) as any).facets.className.options,['A1']);
  assert.equal((await c.publicApi(slug+'/recipients?'+new URLSearchParams({major:"' OR 1=1 --",cohort:'K24'}))).total,0);
  assert.equal((await c.publicApi(slug+'/recipients?'+new URLSearchParams({major:'Kế toán',cohort:'K23'}))).total,0);
  const plan = c.sqlite.prepare('EXPLAIN QUERY PLAN SELECT id FROM scholarship_snapshot_rows WHERE batch_id=? AND cohort=? AND major=? AND class_name=?').all(batchId,'K24','Kế toán','A1');
  assert.match(JSON.stringify(plan),/scholarship_snapshot_cohort_major_idx/);
  await c.transition('unpublish'); await assert.rejects(c.publicApi(slug+'/facets'),{status:404});
});

test('optional source fields require independent approval and never alias legacy awardType', async t => {
  const c = await setup(t); await c.published();
  const legacy = await c.publicApi(slug+'/recipients') as any;
  assert.equal(legacy.recipients[0].scholarshipType,null); assert.equal(legacy.recipients[0].scholarshipRank,null); assert.equal(legacy.recipients[0].cohort,null);
  assert.equal((await c.publicApi(slug+'/recipients?scholarshipRank='+encodeURIComponent('Giỏi'))).total,0);
  assert.deepEqual((await c.publicApi(slug+'/facets') as any).supportedFilters,[]);
  await c.transition('unpublish');
  const batchId=await c.applied({ ...input(), mapping:{...mapping,scholarshipType:'Program',scholarshipRank:'Rank',cohort:'Cohort'},rows:[
    {sourceRowNumber:2,values:{...input().rows[0].values,Program:'Private program',Rank:'Giỏi',Cohort:'K24'}},
    {sourceRowNumber:3,values:{...input().rows[2].values,Program:null,Rank:null,Cohort:null}},
  ]});
  await c.approved(batchId,['fullName','studentCode','awardType','scholarshipRank']);await c.transition('publish',{batchId});
  const data=await c.publicApi(slug+'/recipients') as any;
  assert.equal(data.recipients[0].scholarshipType,null);assert.equal(data.recipients[0].cohort,null);assert.equal(data.recipients[1].scholarshipRank,null);
  const facet=await c.publicApi(slug+'/facets') as any;
  assert.deepEqual(facet.supportedFilters,['scholarshipRank']);assert.deepEqual(facet.facets.scholarshipRank.options,['Giỏi']);
  assert.equal((await c.publicApi(slug+'/recipients?scholarshipType='+encodeURIComponent('Private program'))).total,0);
});

test('facets paginate source options without silent truncation and reject abusive queries', async t => {
  const c=await setup(t);await c.create();const batchId=await c.applied({ ...input(),rows:Array.from({length:51},(_,i)=>({sourceRowNumber:i+2,values:{...input().rows[0].values,MSSV:String(i+1).padStart(12,'0'),Lớp:'C'+String(i).padStart(2,'0')}})) });
  await c.approved(batchId,['fullName','studentCode','awardType','className']);await c.transition('publish',{batchId});
  const facet=await c.publicApi(slug+'/facets?facetLimit=20&facetPage=3') as any;
  assert.equal(facet.facets.className.total,51);assert.equal(facet.facets.className.options.length,11);assert.equal(facet.facets.className.options[0],'C40');
  for(const query of ['major=','major=a&major=b','cohort='+encodeURIComponent('a\u007fb'),'scholarshipType='+('x'.repeat(161)),'facetLimit=201','facetPage=0','limit=20','campaignSlug=other','q=a']) await assert.rejects(c.publicApi(slug+'/facets?'+query),{status:400});
  const req=c.req('/api/public/v1/scholarships/'+slug+'/facets','GET',undefined,{'CF-Connecting-IP':'192.0.2.1'});
  await assert.rejects(handlePublicScholarships(req,new URL(req.url),{...c.env,SCHOLARSHIP_SEARCH_RATE_LIMIT:{limit:async()=>({success:false})}} as never),{status:429});
});

test('training program facets paginate independently while applying the remaining AND filters', async t => {
  const c=await setup(t);await c.create();const data=syntheticEligibility(51);
  data.rows.forEach((row,i)=>{row.values['Chương trình đào tạo']='Program '+String(i).padStart(2,'0');row.values['Khóa']='K24';});
  const batchId=await c.applied(data as never);
  await c.approved(batchId,['fullName','studentCode','awardType','trainingProgram','cohort']);await c.transition('publish',{batchId});
  const facets=await c.publicApi(slug+'/facets?cohort=K24&trainingProgram=Program%2001&facetLimit=20&facetPage=3') as any;
  assert.equal(facets.totalRecipients,1);assert.equal(facets.facets.trainingProgram.total,51);
  assert.deepEqual(facets.facets.trainingProgram.options,Array.from({length:11},(_,i)=>'Program '+String(i+40).padStart(2,'0')));
  for(const query of ['trainingProgram=','trainingProgram=A&trainingProgram=B','trainingProgram='+('x'.repeat(161)),'trainingProgram='+encodeURIComponent('a\u007fb')]) await assert.rejects(c.publicApi(slug+'/recipients?'+query),{status:400});
});

test('new import mapping distinguishes programs without deriving cohort or weakening duplicate detection', async () => {
  const data={...input(),mapping:{...mapping,scholarshipType:'Program',scholarshipRank:'Rank',cohort:'Cohort'},rows:[
    {sourceRowNumber:2,values:{...input().rows[0].values,Program:'A',Rank:'Giỏi',Cohort:null}},
    {sourceRowNumber:3,values:{...input().rows[0].values,Program:'B',Rank:'Giỏi',Cohort:null}},
  ]};
  const valid=await validateScholarshipImport(data);assert.equal(valid.errors.length,0);assert.equal(valid.rows[0].cohort,null);
  const invalid=await validateScholarshipImport({...data,rows:[data.rows[0],{...data.rows[0],sourceRowNumber:3}]});assert.equal(invalid.errors[0].code,'AMBIGUOUS_DUPLICATE_AWARD');
  await assert.rejects(validateScholarshipImport({...data,mapping:{...data.mapping,cohort:'MSSV'}}),/AMBIGUOUS_COLUMN_MAPPING/);
});

test('additive 0057 preserves a v1.0 preview checksum and permits later apply', async t => {
  const sqlite=new DatabaseSync(':memory:'); t.after(()=>sqlite.close());
  for(const file of ['0055_scholarships.sql','0056_scholarship_snapshots.sql'])sqlite.exec(await readFile(new URL('../cloudflare/migrations/'+file,import.meta.url),'utf8'));
  const data=await validateScholarshipImport(input());
  sqlite.prepare('INSERT INTO scholarship_campaigns(slug,title,school_year,semester,source_title) VALUES (?,?,?,?,?)').run(slug,'Synthetic','2025-2026','HK2','');
  const id='b'.repeat(64);
  sqlite.prepare("INSERT INTO scholarship_import_batches(id,campaign_slug,source_sha256,source_filename,expected_rows,accepted_rows,rejected_rows,status,performed_by_user_id,mapping_json,payload_sha256) VALUES (?,?,?,?,?,?,0,'previewed',?,?,?)").run(id,slug,data.sourceSha256,data.sourceFilename,3,3,owner.userId,JSON.stringify(data.mapping),data.payloadSha256);
  for(const r of data.rows) sqlite.prepare('INSERT INTO scholarship_snapshot_rows(batch_id,source_row_number,source_identifier,student_code,full_name,full_name_search,class_name,major,award_type,scores_json,source_row_sha256) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,r.sourceRowNumber,r.sourceIdentifier,r.studentCode,r.fullName,r.fullNameSearch,r.className,r.major,r.awardType,JSON.stringify(r.scores),r.rowSha256);
  sqlite.exec(await readFile(new URL('../cloudflare/migrations/0057_scholarship_filters.sql',import.meta.url),'utf8'));
  sqlite.exec(await readFile(new URL('../cloudflare/migrations/0059_scholarship_personal_details.sql',import.meta.url),'utf8'));
  assert.equal(sqlite.prepare('SELECT scholarship_type FROM scholarship_snapshot_rows LIMIT 1').get()?.scholarship_type,null);
  const req=new Request(origin+'/api/admin/v1/scholarships/campaigns/'+slug+'/imports/apply',{method:'POST',headers:{Cookie:'synthetic',Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:0,batchId:id})});
  const result=await handleAdminScholarships(req,new URL(req.url),{DB:sqliteD1(sqlite),AUTH_SERVICE:{fetch:async()=>Response.json(owner)}} as never);
  assert.equal(result.campaign.status,'validated');
});

test('explicit legacy label may reuse one source type or rank column but independent fields cannot share', async () => {
  const base={...input(),mapping:{...mapping,scholarshipType:'Program',scholarshipRank:'Loại'},rows:input().rows.map(row=>({...row,values:{...row.values,Program:'KKHT'}}))};
  const result=await validateScholarshipImport(base);assert.equal(result.errors.length,0);assert.equal(result.rows[0].scholarshipType,'KKHT');assert.equal(result.rows[0].scholarshipRank,'Giỏi');
  await assert.rejects(validateScholarshipImport({...base,mapping:{...base.mapping,scholarshipType:'Loại'}}),/AMBIGUOUS_COLUMN_MAPPING/);
  await assert.rejects(validateScholarshipImport({...base,mapping:{...base.mapping,cohort:'Loại'}}),/AMBIGUOUS_COLUMN_MAPPING/);
});

test('0059 upgrades an already applied immutable snapshot without backfilling, rewriting or leaking old private scores', async t => {
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  for(const file of ['0055_scholarships.sql','0056_scholarship_snapshots.sql','0057_scholarship_filters.sql'])sqlite.exec(await readFile(new URL('../cloudflare/migrations/'+file,import.meta.url),'utf8'));
  const data=await validateScholarshipImport(input()), id='e'.repeat(64), row=data.rows[0];
  sqlite.prepare('INSERT INTO scholarship_campaigns(slug,title,school_year,semester,source_title) VALUES (?,?,?,?,?)').run(slug,'Synthetic legacy','2025-2026','HK2','');
  sqlite.prepare("INSERT INTO scholarship_import_batches(id,campaign_slug,source_sha256,source_filename,expected_rows,accepted_rows,rejected_rows,status,performed_by_user_id,mapping_json,payload_sha256) VALUES (?,?,?,?,1,1,0,'previewed',?,?,?)").run(id,slug,data.sourceSha256,data.sourceFilename,owner.userId,JSON.stringify(data.mapping),data.payloadSha256);
  sqlite.prepare('INSERT INTO scholarship_snapshot_rows(batch_id,source_row_number,student_code,full_name,full_name_search,award_type,scores_json,source_row_sha256) VALUES (?,?,?,?,?,?,?,?)').run(id,row.sourceRowNumber,row.studentCode,row.fullName,row.fullNameSearch,row.awardType,JSON.stringify(row.scores),row.rowSha256);
  sqlite.prepare("UPDATE scholarship_import_batches SET status='applied' WHERE id=?").run(id);
  const columns=sqlite.prepare('PRAGMA table_info(scholarship_snapshot_rows)').all().map(column=>String(column.name)).join(',');
  const before=sqlite.prepare('SELECT '+columns+' FROM scholarship_snapshot_rows').all();
  sqlite.exec(await readFile(new URL('../cloudflare/migrations/0059_scholarship_personal_details.sql',import.meta.url),'utf8'));
  assert.deepEqual(sqlite.prepare('SELECT '+columns+' FROM scholarship_snapshot_rows').all(),before);
  assert.deepEqual({...sqlite.prepare('SELECT training_program,source_ordinal_json,private_rankings_json FROM scholarship_snapshot_rows').get()},{training_program:null,source_ordinal_json:null,private_rankings_json:null});
  assert.deepEqual({...sqlite.prepare('SELECT source_list_kind,own_fields_json FROM scholarship_import_batches').get()},{source_list_kind:'unspecified',own_fields_json:null});
  assert.throws(()=>sqlite.prepare('UPDATE scholarship_snapshot_rows SET private_rankings_json=?').run('{"topSchool":1}'),/immutable/i);
});
