/** Loopback-only QA server. Real Scholarship Worker + ephemeral D1, synthetic
 * identity service. No production credentials, remote D1 or outbound requests.
 * State file .cache/scholarship-qa-state.json controls QA scenarios only. */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';

if (process.env.NODE_ENV === 'production') throw new Error('Scholarship QA is development-only');
// Refuse production before loading the emulator, bundler or synthetic identity code.
const [{ build }, { Miniflare }, { handleAdminScholarships }] = await Promise.all([
  import('esbuild'),
  import('miniflare'),
  import('../cloudflare/worker/src/scholarship-admin.ts'),
]);
const port = Number(process.env.SCHOLARSHIP_QA_PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
const origin = `http://127.0.0.1:${port}`;
await mkdir('.cache', { recursive: true });
const state = async () => {
  try { return JSON.parse(await readFile('.cache/scholarship-qa-state.json', 'utf8')); }
  catch { return { identity: 'anonymous', data: 'published' }; }
};
const userId = '11111111-1111-4111-8111-111111111111';
const identity = mode => ({ userId, email: `${mode === 'no-award' ? '000000009999' : '000000000001'}@st.buh.edu.vn`, role: mode === 'admin' ? 'admin' : 'user' });
const auth = async request => {
  const { identity: mode } = await state();
  if (mode === 'failure') return Response.json({ error: 'Local QA failure' }, { status: 503 });
  if (mode === 'anonymous' || !request.headers.get('cookie')) return Response.json(null, { status: 401 });
  const id = identity(mode);
  if (new URL(request.url).pathname === '/api/auth/get-session') return Response.json({ session: { id: 'synthetic-local', userId }, user: { id: userId, email: id.email, emailVerified: mode !== 'unverified' } });
  return Response.json(id);
};
const bundle = await build({ entryPoints: ['cloudflare/worker/src/index.ts'], bundle: true, write: false,
  format: 'esm', platform: 'browser', external: ['cloudflare:*'], logLevel: 'silent' });
const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-07-29', d1Databases: ['DB'], bindings: { ALLOWED_ORIGINS: `${origin},http://localhost:3000,http://127.0.0.1:3000` },
  serviceBindings: { AUTH_SERVICE: auth }, outboundService: () => Response.json({ error: 'QA outbound disabled' }, { status: 503 }) });
const db = await mf.getD1Database('DB');
for (const file of ['0055_scholarships.sql', '0056_scholarship_snapshots.sql', '0057_scholarship_filters.sql', '0059_scholarship_personal_details.sql']) {
  const sql = await readFile(new URL('../cloudflare/migrations/' + file, import.meta.url), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '').match(/CREATE TRIGGER[\s\S]*?END;|(?:CREATE|ALTER)[\s\S]*?;/g);
  await db.batch(statements.map(sql => db.prepare(sql)));
}
const env = { DB: db, AUTH_SERVICE: { fetch: async () => Response.json({ ...identity('admin'), role: 'admin' }) } };
const admin = async (suffix, body) => {
  const request = new Request(origin + '/api/admin/v1/scholarships/campaigns' + suffix, { method: 'POST',
    headers: { Origin: origin, Cookie: 'qa=synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return handleAdminScholarships(request, new URL(request.url), env);
};
for (const [slug, semester, schoolYear] of [['synthetic-hk1', 'HK1', '2026-2027'], ['synthetic-hk2', 'HK2', '2025-2026']]) {
  const longText = process.env.SCHOLARSHIP_QA_LONG_TEXT === '1';
  await admin('', { slug, title: longText ? 'Đợt học bổng kiểm thử tên quyết định rất dài '.repeat(8).slice(0,240).trim() : 'Đợt kiểm thử cục bộ', schoolYear, semester });
  const preview = await admin(`/${slug}/imports/preview`, { sourceSha256: 'a'.repeat(64), sourceFilename: 'synthetic.csv',
    mapping: { studentCode: 'Code', fullName: 'Name', awardType: 'Award', className: 'Class', major: 'Major',
      scholarshipType: 'Program', scholarshipRank: 'ScholarshipRank', cohort: 'Cohort',
      scores: [{ key: 'gpa', column: 'GPA', label: 'Điểm TB HB' }, { key: 'academicRank', column: 'Academic', label: 'Xếp loại HT' },
        { key: 'trainingScore', column: 'RL', label: 'Điểm RL' }, { key: 'trainingRank', column: 'Rank', label: 'Xếp loại RL' },
        { key: 'credits', column: 'Credits', label: 'Số TC' }, { key: 'privateScore', column: 'Private', label: 'Điểm chưa phê duyệt' }] },
    rows: Array.from({ length: 96 }, (_, index) => ({ sourceRowNumber: index + 2, values: {
      Code: String(index + 1).padStart(12, '0'), Name: longText && index === 0 ? 'Sinh viên kiểm thử có họ tên rất dài '.repeat(8).slice(0,160).trim() : `Sinh viên kiểm thử ${String(index + 1).padStart(2, '0')}`,
      Award: 'Kết quả kiểm thử', Class: ['TEST-A1', 'TEST-A2', 'TEST-A3', 'TEST-B1'][index % 4],
      Major: index % 4 === 3 ? 'Kinh tế' : 'Kế toán', Cohort: index % 4 === 3 ? 'K23' : 'K24',
      Program: index % 4 === 2 ? 'Tiếp sức' : 'Khuyến khích học tập', ScholarshipRank: index % 4 === 1 ? 'Khá' : 'Giỏi', GPA: index % 2 ? '9,7' : 9.5,
      Academic: 'Giỏi', RL: 90, Rank: 'Xuất sắc', Credits: 18, Private: 999,
    } })) });
  const batchId = preview.receipt.batchId;
  await admin(`/${slug}/imports/apply`, { expectedRevision: 0, batchId });
  await admin(`/${slug}/approve`, { expectedRevision: 1, batchId, sourceSha256: 'a'.repeat(64),
    officialSource: { title: 'DỮ LIỆU KIỂM THỬ CỤC BỘ', reference: 'SYNTHETIC-LOCAL-ONLY', url: null },
    approvedFields: ['fullName', 'studentCode', 'awardType', 'className', 'major', 'scholarshipType', 'scholarshipRank', 'cohort', 'scores.gpa', 'scores.academicRank', 'scores.trainingScore', 'scores.trainingRank', 'scores.credits'], republicationConfirmed: true });
  await admin(`/${slug}/publish`, { expectedRevision: 2, batchId });
}
if (process.env.SCHOLARSHIP_QA_EXTENDED === '1') {
  for (let index = 0; index < 24; index++) {
    await admin('', {slug: `qa-draft-${index}`, title: `Bản nháp kiểm thử ${index}`, schoolYear:'2026-2027', semester:'HK1'});
    await admin('/synthetic-hk2/imports/preview', {sourceSha256: (index + 1).toString(16).padStart(64,'0'), sourceFilename:'synthetic-history.csv',
      mapping:{studentCode:'Code',fullName:'Name',awardType:'Award',scores:[]},
      rows:[{sourceRowNumber:2,values:{Code:'000000000001',Name:'Sinh viên kiểm thử',Award:'Kết quả kiểm thử'}}]});
  }
}
const server = createServer(async (req, res) => {
  try {
    const current = await state();
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/admin/v1/scholarships') && current.adminError &&
      (!current.adminErrorPath || url.pathname.endsWith(current.adminErrorPath))) {
      res.statusCode = Number(current.adminError); res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({error:'SYNTHETIC_ADMIN_FAILURE'})); return;
    }
    if (url.pathname === '/api/user/v1/profile' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'private, no-store');
      res.end(JSON.stringify({ success: true, publicProfile: { full_name: 'Sinh viên kiểm thử 01', class_name: 'TEST01' }, privateProfile: { data: {} } })); return;
    }
    if (url.pathname === '/api/auth/registration/status') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ pending: false })); return;
    }
    if (url.pathname === '/api/auth/get-session') {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      if (current.identity === 'failure') { res.statusCode = 503; res.end(JSON.stringify({ error: 'Local QA failure' })); return; }
      if (current.identity !== 'anonymous') res.setHeader('Set-Cookie', 'scholarship_qa=synthetic; Path=/; HttpOnly; SameSite=Lax');
      else res.setHeader('Set-Cookie', 'scholarship_qa=; Max-Age=0; Path=/');
      res.end(JSON.stringify(current.identity === 'anonymous' ? null : { session: { id: 'synthetic-local' }, user: { id: userId, email: identity(current.identity).email, name: 'Sinh viên kiểm thử', image: '/logoapp.png' } })); return;
    }
    if (url.pathname.startsWith('/api/public/v1/scholarships') && current.data === 'failure') {
      res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Dữ liệu học bổng chưa sẵn sàng.' })); return;
    }
    if (url.pathname === '/api/public/v1/scholarships/campaigns' && current.data === 'empty') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ campaigns: [], total: 0, page: 1, limit: 50 })); return;
    }
    if (!/^\/api\/(?:public\/v1\/scholarships|admin\/v1\/scholarships|me\/scholarships|private\/v1\/me)(?:\/|$)/.test(url.pathname)) {
      res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Local scholarship QA only' })); return;
    }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value && !['host', 'content-length'].includes(key)) headers.set(key, String(value));
    const response = await mf.dispatchFetch(url.href, { method: req.method, headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    res.statusCode = response.status;
    for (const [key, value] of response.headers) if (!['content-length', 'transfer-encoding', 'content-encoding'].includes(key)) res.setHeader(key, value);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.statusCode = 503; res.end(JSON.stringify({ error: 'Local QA unavailable' })); }
});
server.listen(port, '127.0.0.1', () => console.log(`Synthetic scholarship QA: ${origin} (ephemeral local D1; no outbound)`));
const stop = () => server.close(async () => { await mf.dispose(); process.exit(0); });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
