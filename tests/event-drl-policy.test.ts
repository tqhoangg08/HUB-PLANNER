import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { DRL_APPENDIX_ROWS, DRL_NOTES, DRL_RULES_2026, DRL_SECTIONS, DRL_POLICY_VERSION, DRL_SPECIAL_CASES } from '../utils/drlPolicy2026.ts';
import { policyForAcademicYear, isOnlineMiniGame, LEGACY_DRL_POLICY } from '../utils/drlPolicy.ts';
import { loadDrlPolicyRules } from '../cloudflare/worker/src/event-drl-policy.ts';
import { predictEventDrl, normalizeEventDrlNoYear, normalizeEventDrlText } from '../cloudflare/worker/src/event-drl-prediction.ts';
import { resolveAdminEventDrlRule, assertAdminEventMutationAllowed, mutateAdminEvent } from '../cloudflare/worker/src/admin-event-mutations.ts';
import { buildAdminEventPayload, createEmptyAdminEventDraft } from '../utils/adminEventForm.ts';
import { buildDrlPolicySeed } from '../scripts/build-drl-policy-seed.mjs';
import { handleEventDrlApi } from '../cloudflare/worker/src/event-drl-api.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
export const policyFixture = () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE sync_metadata(resource TEXT PRIMARY KEY,source_row_count INTEGER,source_max_created_at TEXT,synced_at TEXT,visible_row_count INTEGER)');
  for (const file of ['0006_create_public_events.sql','0008_create_admin_events.sql','0009_create_admin_event_mutations.sql',
    '0023_create_event_push_deliveries.sql','0026_core_events_d1_authority.sql','0027_create_event_candidates.sql',
    '0028_event_candidate_ingest_dedupe.sql','0048_event_view_count.sql','0052_event_drl_history.sql']) sql.exec(read(`cloudflare/migrations/${file}`));
  const prepare = (query: string) => {
    const statement = sql.prepare(query);
    let args: any[] = [];
    const wrapper = { query, get args() { return args; }, bind(...values: any[]) { args = values; return wrapper; },
      async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; },
      async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; } };
    return wrapper;
  };
  const DB = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    sql.exec('BEGIN');
    try {
      const result = statements.map((entry) => /\bRETURNING\b/i.test(entry.query)
        ? { results: sql.prepare(entry.query).all(...entry.args), meta: { changes: 1 } }
        : { results: [], meta: { changes: Number(sql.prepare(entry.query).run(...entry.args).changes) } });
      sql.exec('COMMIT'); return result;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  const migrate = () => { sql.exec(read('cloudflare/migrations/0058_drl_policy_versions.sql')); sql.exec(buildDrlPolicySeed()); };
  return { sql, DB, migrate };
};

test('all 71 source rows, 46 scored criteria and exact points are retained', () => {
  assert.equal(DRL_APPENDIX_ROWS.length, 71);
  assert.equal(createHash('sha256').update(JSON.stringify(DRL_APPENDIX_ROWS)).digest('hex'), 'ce56dbed3814ad515a076cc3ec2633b00396b857e953144b260ac6796555a4c8');
  assert.equal(DRL_RULES_2026.length, 46);
  assert.equal(new Set(DRL_RULES_2026.map((rule) => rule.rule_id)).size, 46);
  assert.deepEqual(DRL_RULES_2026.map((rule) => rule.points), [25,-5,-5,15,10,8,5,10,5,4,15,10,8,15,10,8,15,4,-5,5,5,10,4,4,4,4,20,-5,10,4,8,4,15,-5,10,8,5,5,10,6,8,10,6,10,5,5]);
  for (const rule of DRL_RULES_2026) {
    assert.equal(rule.source_text, DRL_APPENDIX_ROWS[rule.source_row - 1][1]);
    assert.equal(rule.source_points, DRL_APPENDIX_ROWS[rule.source_row - 1][2]);
    assert.ok(rule.rule_id.startsWith(DRL_POLICY_VERSION));
  }
});
test('section caps, negative groups and disability exceptions match appendix', () => {
  assert.deepEqual(DRL_SECTIONS.map((section) => section.max_points), [25,20,20,15,20]);
  assert.equal(DRL_SECTIONS.reduce((sum, section) => sum + section.max_points, 0), 100);
  assert.equal(DRL_RULES_2026.filter((rule) => rule.points < 0).length, 5);
  assert.ok(DRL_RULES_2026.filter((rule) => rule.points < 0).every((rule) => rule.rule_group === 'Điểm trừ' && rule.event_suitable === 0));
  assert.deepEqual(DRL_RULES_2026.filter((rule) => rule.content.includes('khuyết tật')).map((rule) => [rule.section,rule.points,rule.event_suitable]), [['III',20,0],['IV',15,0]]);
});
test('roles, levels, fixed units, highest-level clauses and external proof are explicit', () => {
  const byRow = (n: number) => DRL_RULES_2026.find((rule) => rule.source_row === n)!;
  assert.match(byRow(34).condition_text!, /Ban tổ chức/);
  assert.match(byRow(36).content, /tham gia trực tiếp/);
  assert.equal(byRow(36).points, 5); assert.equal(byRow(37).points, 10);
  assert.equal(byRow(34).unit, 'hoạt động'); assert.equal(byRow(6).unit, 'lần'); assert.equal(byRow(54).unit, 'vi phạm');
  assert.equal(byRow(16).unit, 'điểm cố định'); assert.match(byRow(16).content, /lấy điểm ở cấp cao nhất/);
  assert.match(byRow(63).content, /lấy thành tích ở cấp cao nhất/);
  assert.match(byRow(50).source_text, /toàn chiến dịch.*hiến tóc/);
  assert.match(DRL_NOTES[0], /mini game.*không được tính/);
  assert.match(DRL_NOTES[1], /chữ ký.*đóng dấu tròn/);
  assert.equal(DRL_SPECIAL_CASES.length,8);
  assert.match(DRL_SPECIAL_CASES[6],/giai đoạn 3.*xác nhận/);
  assert.equal(DRL_RULES_2026.filter((rule) => rule.event_suitable).length, 23);
  for (const n of [4,11,20,24,27,42,52,57,58,59,60]) assert.equal(byRow(n).event_suitable, 0);
});
test('academic year resolves explicitly before and after 2026-2027', () => {
  assert.equal(policyForAcademicYear('2025-2026'), LEGACY_DRL_POLICY);
  assert.equal(policyForAcademicYear('2026-2027'), DRL_POLICY_VERSION);
  assert.equal(policyForAcademicYear('2027-2028'), DRL_POLICY_VERSION);
  for (const bad of ['', '2026','2026-2028','2026–2027']) assert.throws(() => policyForAcademicYear(bad));
  assert.equal(isOnlineMiniGame({ title: 'MINI GAME trực tuyến' }), true);
  assert.equal(isOnlineMiniGame({ category: 'Minigame', format: 'Online' }), true);
  assert.equal(isOnlineMiniGame({ title: 'Trò chơi thể thao', format: 'Offline' }), false);
});
test('additive migration preserves 2750 synthetic history rows, event snapshots and cache; seed is idempotent', () => {
  const { sql, migrate } = policyFixture();
  try {
    sql.exec("INSERT INTO drl_rules VALUES('OLD','III',NULL,'Old',NULL,10,'hoạt động',1,1,'old-workbook'); INSERT INTO event_drl_corpus VALUES('old-workbook',2750,'ready','2025-01-01'); INSERT INTO admin_events(id,title,criteria,points,drl_rule_id,created_at,title_search,organizer_search) VALUES(1,'Historical','III','10','OLD','2025-01-01','historical',''); INSERT INTO public_events(id,title,criteria,points,drl_rule_id,created_at,title_search,organizer_search) VALUES(1,'Historical','III','10','OLD','2025-01-01','historical',''); INSERT INTO event_drl_prediction_cache VALUES('old-cache','old-workbook','OLD','III.1',0.8,'medium','historical_ai',1,'[]','2025-01-01')");
    const insert = sql.prepare('INSERT INTO event_drl_history(id,source_row,observed_code,title_original,title_clean,title_normalized,title_normalized_no_year,source_version) VALUES(?,?,?,?,?,?,?,?)');
    for (let id=1;id<=2750;id++) insert.run(id,id,'III.1',`Historical ${id}`,`Historical ${id}`,`historical ${id}`,`historical ${id}`,'old-workbook');
    const before = sql.prepare('SELECT * FROM event_drl_history ORDER BY id').all();
    migrate();
    const seed = read('cloudflare/migrations/0059_seed_drl_policy_2026.sql');
    assert.equal(seed, buildDrlPolicySeed()); sql.exec(seed); sql.exec(seed);
    assert.deepEqual(sql.prepare('SELECT * FROM event_drl_history ORDER BY id').all(), before);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM drl_rules').get()!.n, 47);
    for (const table of ['admin_events','public_events']) {
      const row = sql.prepare(`SELECT points,drl_rule_id,drl_policy_version FROM ${table}`).get()!;
      assert.equal(row.points, '10'); assert.equal(row.drl_rule_id,'OLD'); assert.equal(row.drl_policy_version,null);
    }
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM event_drl_prediction_cache').get()!.n, 1);
    assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
    sql.exec(`UPDATE drl_rules SET points=99 WHERE rule_id='${DRL_RULES_2026[0].rule_id}'`);
    assert.throws(() => sql.exec(seed), /CHECK constraint/);
  } finally { sql.close(); }
});
test('official rule resolution rejects arbitrary points, wrong year, non-event and old rules for new events', async () => {
  const { sql, DB, migrate } = policyFixture(); migrate();
  const env = { DB } as never;
  try {
    sql.exec("INSERT INTO drl_rules VALUES('OLD','III',NULL,'Old',NULL,10,'hoạt động',1,1,'old-workbook')");
    const rule = DRL_RULES_2026.find((r) => r.source_row === 34)!;
    const result = await resolveAdminEventDrlRule(env,'create',{ title:'Hoạt động',drl_rule_id:rule.rule_id });
    assert.equal(result.points,'5'); assert.equal(result.criteria,'III'); assert.equal(result.drl_policy_version,DRL_POLICY_VERSION);
    for (const payload of [{ drl_rule_id:'OLD' },{ drl_rule_id:rule.rule_id,points:'10' },{ drl_rule_id:DRL_RULES_2026[0].rule_id },
      { drl_rule_id:rule.rule_id,drl_academic_year:'2025-2026' },{ drl_rule_id:rule.rule_id,title:'Mini game online',format:'Online' }]) {
      await assert.rejects(resolveAdminEventDrlRule(env,'create',payload));
    }
    assert.equal((await resolveAdminEventDrlRule(env,'create',{ drl_rule_id:'OLD',drl_academic_year:'2025-2026' })).points,'10');
    assert.doesNotThrow(() => assertAdminEventMutationAllowed({ title:'Edited' },'auditor'));
    assert.throws(() => assertAdminEventMutationAllowed({ is_deleted:true },'auditor'));
  } finally { sql.close(); }
});
test('catalog requires a session and invalid policy/year requests return validation errors', async () => {
  const {sql,DB,migrate}=policyFixture(); migrate();
  const env={DB,AUTH_SERVICE:{fetch:async () => Response.json({userId:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.test',role:'user'})}} as never;
  const url='https://example.test/api/private/v1/event-drl/catalog';
  try {
    await assert.rejects(handleEventDrlApi(new Request(url),'/api/private/v1/event-drl/catalog',env),{status:401});
    const catalog=await handleEventDrlApi(new Request(url,{headers:{Cookie:'session=synthetic'}}),'/api/private/v1/event-drl/catalog',env);
    assert.equal(catalog.rules!.length,46);
    assert.equal(catalog.current_policy_version,DRL_POLICY_VERSION);
    await assert.rejects(handleEventDrlApi(new Request('https://example.test/api/private/v1/event-drl/predict',{
      method:'POST',headers:{Cookie:'session=synthetic'},body:JSON.stringify({title:'Event',drl_academic_year:'2025-2026',drl_policy_version:DRL_POLICY_VERSION}),
    }),'/api/private/v1/event-drl/predict',env),{status:400});
  } finally {sql.close();}
});
test('a changed official point or missing official rule fails closed instead of becoming a new selectable rule', async () => {
  const {sql,DB,migrate}=policyFixture(); migrate();
  try {
    sql.prepare('UPDATE drl_rules SET points=99 WHERE rule_id=?').run(`${DRL_POLICY_VERSION}:III:34`);
    await assert.rejects(loadDrlPolicyRules(DB as never,DRL_POLICY_VERSION),/khác nguồn đã kiểm chứng/);
    sql.prepare('UPDATE drl_rules SET points=5 WHERE rule_id=?').run(`${DRL_POLICY_VERSION}:III:34`);
    sql.prepare('DELETE FROM drl_rules WHERE rule_id=?').run(`${DRL_POLICY_VERSION}:III:34`);
    await assert.rejects(loadDrlPolicyRules(DB as never,DRL_POLICY_VERSION),/khác nguồn đã kiểm chứng/);
  } finally {sql.close();}
});
test('editing a historical inactive rule or unlinked snapshot preserves original points on both projections', async () => {
  const { sql, DB, migrate } = policyFixture(); migrate();
  try {
    sql.exec("INSERT INTO drl_rules VALUES('OLD','III',NULL,'Old',NULL,5,'hoạt động',1,0,'old-workbook'); INSERT INTO admin_events(id,title,criteria,points,drl_rule_id,created_at,status,title_search,organizer_search) VALUES(1,'Historical','III','10','OLD','2025-01-01','Sắp diễn ra','historical',''); INSERT INTO public_events(id,title,criteria,points,drl_rule_id,created_at,status,title_search,organizer_search) VALUES(1,'Historical','III','10','OLD','2025-01-01','Sắp diễn ra','historical','')");
    await mutateAdminEvent({ DB } as never,'update',{ title:'Edited',criteria:'III',points:'10',drl_rule_id:'OLD' },1);
    for (const table of ['admin_events','public_events']) assert.equal(sql.prepare(`SELECT points FROM ${table} WHERE id=1`).get()!.points,'10');
    await assert.rejects(mutateAdminEvent({ DB } as never,'update',{ points:'5',drl_rule_id:'OLD' },1));
    const draft = { ...createEmptyAdminEventDraft(),criteria:'IV',points:'15',drl_rule_id:'' };
    assert.equal(buildAdminEventPayload(draft).points,'15');
  } finally { sql.close(); }
});
test('new draft context persists and publication requires a valid rule; public mirror preserves version and year', async () => {
  const {sql,DB,migrate}=policyFixture(); migrate();
  try {
    const created = await mutateAdminEvent({DB} as never,'create',{title:'New draft',status:'pending'},undefined,fetch,
      {mutationId:'0b351e27-5c41-46a4-95f7-97693c621834',userId:'synthetic-staff'});
    const id=created.data[0].id;
    assert.equal(created.data[0].drl_policy_version,DRL_POLICY_VERSION);
    await assert.rejects(mutateAdminEvent({DB} as never,'update',{status:'Sắp diễn ra'},id));
    await mutateAdminEvent({DB} as never,'update',{status:'Sắp diễn ra',drl_rule_id:`${DRL_POLICY_VERSION}:III:34`},id);
    assert.equal(sql.prepare('SELECT drl_policy_version FROM public_events WHERE id=?').get(id)!.drl_policy_version,DRL_POLICY_VERSION);
    assert.equal(sql.prepare('SELECT drl_academic_year FROM public_events WHERE id=?').get(id)!.drl_academic_year,'2026-2027');
    await assert.rejects(mutateAdminEvent({DB} as never,'update',{title:'Mini game online',format:'Online'},id));
  } finally {sql.close();}
});
test('2026 AI abstains on old exact evidence; policy, corpus, rule revisions and year invalidate cache without deleting old cache', async () => {
  const { sql, DB, migrate } = policyFixture(); migrate();
  try {
    sql.exec("INSERT INTO drl_rules VALUES('OLD','III',NULL,'Old',NULL,10,'hoạt động',1,1,'old-workbook'); INSERT INTO event_drl_corpus VALUES('old-workbook',2,'ready','2025-01-01')");
    const title = 'Hoạt động chính trị 2026';
    for (let id=1;id<=2;id++) sql.prepare('INSERT INTO event_drl_history(id,source_row,observed_code,title_original,title_clean,title_normalized,title_normalized_no_year,mapped_rule_id,source_version) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,id,'III.1',title,title,normalizeEventDrlText(title),normalizeEventDrlNoYear(title),'OLD','old-workbook');
    let aiCalls=0;
    const env = { DB, AI: { run: async () => { aiCalls++; return { rule_id:'OLD', confidence:1 }; } } } as never;
    const result = await predictEventDrl(env,{ title });
    assert.equal(result.rule_id,null); assert.equal(result.reason_code,'insufficient_evidence'); assert.equal(result.historical_support_count,2); assert.equal(aiCalls,0);
    assert.equal((await predictEventDrl(env,{ title })).fingerprint,result.fingerprint);
    const old = await predictEventDrl(env,{ title,drl_academic_year:'2025-2026' }); assert.equal(old.rule_id,'OLD'); assert.notEqual(old.fingerprint,result.fingerprint);
    assert.notEqual((await predictEventDrl(env,{ title,drl_academic_year:'2027-2028' })).fingerprint,result.fingerprint);
    sql.exec(`UPDATE drl_rules SET active=0 WHERE rule_id='${DRL_RULES_2026.find((r) => r.source_row === 34)!.rule_id}'`);
    assert.notEqual((await predictEventDrl(env,{ title })).fingerprint,result.fingerprint);
    sql.exec("INSERT INTO event_drl_corpus VALUES('corpus-v2',2,'ready','2027-01-01'); INSERT INTO event_drl_history(id,source_row,observed_code,title_original,title_clean,title_normalized,title_normalized_no_year,mapped_rule_id,source_version) SELECT id+2,source_row+2,observed_code,title_original,title_clean,title_normalized,title_normalized_no_year,mapped_rule_id,'corpus-v2' FROM event_drl_history WHERE source_version='old-workbook'");
    const nextCorpus=await predictEventDrl(env,{title});
    assert.equal(nextCorpus.source_version,'corpus-v2'); assert.notEqual(nextCorpus.fingerprint,result.fingerprint);
    assert.ok(Number(sql.prepare('SELECT COUNT(*) n FROM event_drl_prediction_cache').get()!.n)>=4);
    assert.equal((await loadDrlPolicyRules(DB as never,DRL_POLICY_VERSION)).some((r) => r.rule_id==='OLD'),false);
  } finally { sql.close(); }
});
test('desktop/mobile use the same complete guide and all rule pickers expose version, year and manual selection', () => {
  for (const name of ['EventsBoard','MobileEvents']) {
    const source=read(`components/${name}.tsx`);
    assert.match(source,/DrlScoreGuideModal as ScoreGuideModal/);
    assert.doesNotMatch(source,/const sections = \[/);
    assert.match(source,/onContextChange=/);
  }
  const guide=read('components/DrlScoreGuide.tsx'); assert.match(guide,/DRL_APPENDIX_ROWS/); assert.match(guide,/aria-modal/); assert.match(guide,/Escape/);
  const picker=read('components/EventDrlAssistant.tsx'); assert.match(picker,/Tìm tiêu chí, vai trò, cấp tổ chức/); assert.match(picker,/event_suitable !== 0/);
  for (const name of ['AdminEventEditorPage','AdminEventCandidates']) assert.match(read(`components/${name}.tsx`),/onContextChange=/);
  const detail=read('components/EventDetailView.tsx'); assert.match(detail,/drl_policy_version === DRL_POLICY_VERSION/); assert.match(detail,/Nguồn quy chế chưa xác minh/); assert.match(detail,/DRL_NOTES\[1\]/);
  assert.match(read('scripts/import-event-drl-history.mjs'),/if \(apply\) throw new Error\('Legacy replacement import disabled/);
});
