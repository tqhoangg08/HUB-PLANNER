import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { DRL_APPENDIX_ROWS, DRL_NOTES, DRL_RULES_2026, DRL_SECTIONS, DRL_POLICY_VERSION, DRL_SPECIAL_CASES } from '../utils/drlPolicy2026.ts';
import { buildDrlPolicySeed } from '../scripts/build-drl-policy-seed.mjs';
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
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

const fixture = () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0006_create_public_events.sql','0008_create_admin_events.sql','0027_create_event_candidates.sql','0052_event_drl_history.sql']) {
    sql.exec(read(`cloudflare/migrations/${file}`));
  }
  sql.exec(`INSERT INTO drl_rules VALUES('OLD','III',NULL,'Old rule','Old condition',10,'điểm',1,1,'old-corpus');
    INSERT INTO event_drl_corpus VALUES('old-corpus',2750,'ready','2025-01-01');
    WITH RECURSIVE n(id) AS (VALUES(1) UNION ALL SELECT id+1 FROM n WHERE id<2750)
    INSERT INTO event_drl_history(id,source_row,observed_code,title_original,title_clean,title_normalized,title_normalized_no_year,mapped_rule_id,source_version)
    SELECT id,id,'III.1','Synthetic '||id,'Synthetic '||id,'synthetic '||id,'synthetic '||id,'OLD','old-corpus' FROM n;
    INSERT INTO admin_events(id,title,criteria,points,drl_rule_id,created_at,title_search,organizer_search)
    VALUES(1,'Historical event','III','10','OLD','2025-01-01','historical event','');
    INSERT INTO public_events(id,title,criteria,points,drl_rule_id,created_at,title_search,organizer_search)
    VALUES(1,'Historical event','III','10','OLD','2025-01-01','historical event','');
    INSERT INTO event_drl_prediction_cache VALUES('old-cache','old-corpus','OLD','III.1',0.8,'medium','historical_ai',2,'[]','2025-01-01');
    INSERT INTO event_candidates(id,created_at,source_name,post_url,raw_content,review_status,approved_event_id)
    VALUES(1,'2025-01-01','Synthetic','https://example.org/fixture','Synthetic','approved',1);
    INSERT INTO event_candidate_drl_predictions VALUES(1,'old-cache','completed','OLD',0.8,'medium','historical_ai',2,'[]','2025-01-01');`);
  return sql;
};
const apply = (sql: DatabaseSync) => {
  sql.exec('BEGIN');
  try { sql.exec(buildDrlPolicySeed()); sql.exec('COMMIT'); }
  catch (error) { sql.exec('ROLLBACK'); throw error; }
};
const snapshot = (sql: DatabaseSync) => ['event_drl_history','event_drl_corpus','admin_events','public_events',
  'event_drl_prediction_cache','event_candidates','event_candidate_drl_predictions']
  .map((table) => sql.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());

test('catalog-only migration is idempotent and preserves history, approvals, points, IDs and cached predictions', () => {
  const sql = fixture();
  try {
    const before = snapshot(sql);
    const schema = sql.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
    const old = sql.prepare('SELECT * FROM drl_rules WHERE rule_id=?').get('OLD')!;
    assert.equal(read('cloudflare/migrations/0058_seed_drl_catalog_2026.sql'),buildDrlPolicySeed());
    apply(sql);
    const rules = sql.prepare('SELECT * FROM drl_rules ORDER BY rule_id').all();
    apply(sql);
    assert.deepEqual(sql.prepare('SELECT * FROM drl_rules ORDER BY rule_id').all(),rules);
    assert.deepEqual(sql.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(),schema);
    assert.deepEqual(snapshot(sql),before);
    assert.deepEqual({ ...sql.prepare('SELECT * FROM drl_rules WHERE rule_id=?').get('OLD') },{ ...old,active:0 });
    const choices = sql.prepare('SELECT rule_id,section,points FROM drl_rules WHERE active=1 AND event_suitable=1 AND points IS NOT NULL ORDER BY rule_id').all();
    assert.equal(choices.length,23);
    assert.ok(choices.every((row) => String(row.rule_id).startsWith(DRL_POLICY_VERSION)));
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM drl_rules').get()!.n,47);
    assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { sql.close(); }
});

test('a conflicting new rule ID fails atomically instead of replacing either catalog', () => {
  const sql = fixture();
  try {
    const rule = DRL_RULES_2026[0];
    sql.prepare('INSERT INTO drl_rules VALUES(?,?,NULL,?,NULL,?,NULL,0,1,?)')
      .run(rule.rule_id,rule.section,'Conflicting text',999,DRL_POLICY_VERSION);
    const before = sql.prepare('SELECT * FROM drl_rules ORDER BY rule_id').all();
    assert.throws(() => apply(sql),/NOT NULL constraint failed: drl_rules.section/);
    assert.deepEqual(sql.prepare('SELECT * FROM drl_rules ORDER BY rule_id').all(),before);
  } finally { sql.close(); }
});
