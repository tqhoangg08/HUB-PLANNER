import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { predictEventDrl, rankEventDrlHistory, normalizeEventDrlText, normalizeEventDrlNoYear } from '../cloudflare/worker/src/event-drl-prediction.ts';

const row = (id: number, title: string, code: string, organizer = '') => ({
  id, observed_code: code, title_clean: title,
  title_normalized: normalizeEventDrlText(title),
  title_normalized_no_year: normalizeEventDrlNoYear(title),
  organizer_normalized: normalizeEventDrlText(organizer), mapped_rule_id: null,
});

test('history ranking searches beyond the first three examples', () => {
  const history = [
    row(1, 'Một hoạt động khác', 'III.1.1'),
    row(2, 'Hai hoạt động khác', 'III.1.1'),
    row(3, 'Ba hoạt động khác', 'III.1.1'),
    row(4, 'Hội nghị học thuật 2025', 'I.1.2'),
    row(5, 'Hội nghị học thuật 2024', 'I.1.2'),
  ];
  const results = rankEventDrlHistory(history, { title: 'Hội nghị học thuật 2026' });
  assert.equal(results[0]?.row.id, 4);
  assert.equal(results[1]?.row.id, 5);
  assert.equal(results[0]?.score, 0.96);
});

test('exact title outranks recurring title; organizer helps similar titles', () => {
  const history = [row(1, 'Ngày hội hiến máu 2024', 'IV.1.3'), row(2, 'Ngày hội hiến máu 2025', 'IV.1.3')];
  const results = rankEventDrlHistory(history, { title: 'Ngày hội hiến máu 2025' });
  assert.equal(results[0]?.row.id, 2);
  assert.equal(results[0]?.score, 1);
  assert.equal(results[1]?.score, 0.96);
});

test('different observed codes for one title remain separate evidence', () => {
  const history = [row(1, 'Hoạt động cộng đồng', 'III.1.1'), row(2, 'Hoạt động cộng đồng', 'V.1.4')];
  const results = rankEventDrlHistory(history, { title: 'Hoạt động cộng đồng' });
  assert.deepEqual(results.map((result) => result.row.observed_code), ['III.1.1', 'V.1.4']);
});

const predictionFixture = () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE event_drl_corpus(source_version TEXT,historical_rows INTEGER,status TEXT,imported_at TEXT);
    CREATE TABLE drl_rules(rule_id TEXT PRIMARY KEY,section TEXT,rule_group TEXT,content TEXT,condition_text TEXT,points INTEGER,unit TEXT,active INTEGER,event_suitable INTEGER);
    CREATE TABLE event_drl_history(id INTEGER PRIMARY KEY,observed_code TEXT,title_clean TEXT,title_normalized TEXT,title_normalized_no_year TEXT,organizer_normalized TEXT,mapped_rule_id TEXT,source_version TEXT);
    CREATE TABLE event_drl_prediction_cache(fingerprint TEXT PRIMARY KEY,source_version TEXT,rule_id TEXT,observed_code TEXT,confidence REAL,confidence_label TEXT,reason_code TEXT,historical_support_count INTEGER,closest_matches_json TEXT,created_at TEXT);
    INSERT INTO event_drl_corpus VALUES('fixture',4,'ready','2026-10-06');
    INSERT INTO drl_rules VALUES('I_RULE','I',NULL,'Official event rule',NULL,5,NULL,1,1);`);
  const DB = { prepare: (query: string) => {
    const statement = sql.prepare(query);
    const bound = (args: unknown[]) => ({
      first: async () => statement.get(...args) || null,
      all: async () => ({ results: statement.all(...args) }),
      run: async () => statement.run(...args),
    });
    return { ...bound([]), bind: (...args: unknown[]) => bound(args) };
  } };
  return { sql, DB };
};

test('full-corpus AI choice uses official rule points once and caches repeated draft', async () => {
  const { sql, DB } = predictionFixture();
  try {
    for (let id = 1; id <= 4; id += 1) {
      const title = id === 4 ? 'Hội nghị học thuật 2025' : `Hoạt động khác ${id}`;
      sql.prepare(`INSERT INTO event_drl_history VALUES(?,?,?,?,?,?,?,?)`).run(id, 'I.1.2', title,
        normalizeEventDrlText(title), normalizeEventDrlNoYear(title), '', null, 'fixture');
    }
    let calls = 0;
    const AI = { run: async () => {
      calls += 1;
      return { choices: [{ message: { tool_calls: [{ function: { name: 'choose_drl_rule',
        arguments: JSON.stringify({ rule_id: 'I_RULE', confidence: 0.8 }) } }] } }] };
    } };
    const input = { title: 'Hội nghị học thuật 2026' };
    const result = await predictEventDrl({ DB, AI } as never, input);
    assert.equal(result.rule_id, 'I_RULE');
    assert.equal(result.points, 5);
    assert.equal(result.reason_code, 'historical_ai');
    assert.equal(result.observed_code, 'I.1.2');
    assert.equal((await predictEventDrl({ DB, AI } as never, input)).points, 5);
    assert.equal(calls, 1);
  } finally { sql.close(); }
});
