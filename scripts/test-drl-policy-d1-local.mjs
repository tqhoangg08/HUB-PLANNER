import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Deliberately has no remote option and no production config or credentials.
if (process.argv.length !== 2) throw new Error('Local-only fixture validation accepts no arguments.');
const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, '.cache', `drl-d1-${Date.now()}`);
const migrations = path.join(directory, 'migrations');
await mkdir(migrations, { recursive: true });
for (const name of ['0006_create_public_events.sql','0008_create_admin_events.sql',
  '0027_create_event_candidates.sql','0052_event_drl_history.sql','0058_drl_policy_versions.sql','0059_seed_drl_policy_2026.sql']) {
  await writeFile(path.join(migrations, name), await readFile(path.join(root, 'cloudflare/migrations', name)));
}
await writeFile(path.join(migrations, '0057_synthetic_legacy_fixture.sql'), `
  INSERT INTO drl_rules VALUES('SYNTHETIC_OLD','III',NULL,'Synthetic historical rule',NULL,10,'hoạt động',1,1,'synthetic-corpus');
  INSERT INTO event_drl_corpus VALUES('synthetic-corpus',2750,'ready','2025-01-01');
  WITH RECURSIVE n(id) AS (VALUES(1) UNION ALL SELECT id+1 FROM n WHERE id<2750)
  INSERT INTO event_drl_history(id,source_row,observed_code,title_original,title_clean,title_normalized,title_normalized_no_year,source_version)
  SELECT id,id,'III.1','Synthetic '||id,'Synthetic '||id,'synthetic '||id,'synthetic '||id,'synthetic-corpus' FROM n;
  INSERT INTO admin_events(id,title,criteria,points,drl_rule_id,created_at,title_search,organizer_search) VALUES(1,'Synthetic historical event','III','10','SYNTHETIC_OLD','2025-01-01','synthetic historical event','');
  INSERT INTO public_events(id,title,criteria,points,drl_rule_id,created_at,title_search,organizer_search) VALUES(1,'Synthetic historical event','III','10','SYNTHETIC_OLD','2025-01-01','synthetic historical event','');
  INSERT INTO event_drl_prediction_cache VALUES('synthetic-old-cache','synthetic-corpus','SYNTHETIC_OLD','III.1',0.8,'medium','historical_ai',2,'[]','2025-01-01');
`);
const config = path.join(directory, 'wrangler.json');
await writeFile(config, JSON.stringify({ name: 'hub-drl-local-validation', compatibility_date: '2026-07-29',
  d1_databases: [{ binding: 'DB', database_name: 'drl-policy-local', database_id: '00000000-0000-4000-8000-000000000026', migrations_dir: './migrations' }] }));
const run = (args) => {
  const result = spawnSync(process.execPath, [path.join(root,'scripts/run-wrangler.mjs'), 'd1', ...args,
    '--local','--config',config,'--persist-to',path.join(directory,'state')], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
  });
  commandLogs.push(result.stdout, result.stderr);
  if (result.status !== 0) throw new Error(`Local D1 command failed (${result.status}): ${result.stdout}\n${result.stderr}`);
  return result.stdout;
};
const commandLogs = [];
try {
  run(['migrations','apply','drl-policy-local']);
  const repeated = run(['migrations','apply','drl-policy-local']);
  assert.match(repeated,/No migrations to apply/i);
  run(['execute','drl-policy-local','--file',path.join(migrations,'0059_seed_drl_policy_2026.sql')]);
  const output = run(['execute','drl-policy-local','--json','--command', `SELECT
    (SELECT COUNT(*) FROM event_drl_history) AS history_rows,
    (SELECT COUNT(*) FROM drl_rules WHERE source_version='hub-drl-2026-5549-v1') AS new_rules,
    (SELECT points FROM admin_events WHERE id=1) AS admin_old_points,
    (SELECT points FROM public_events WHERE id=1) AS public_old_points,
    (SELECT COUNT(*) FROM event_drl_prediction_cache WHERE fingerprint='synthetic-old-cache') AS old_cache;
    PRAGMA foreign_key_check;`]);
  const result = JSON.parse(output);
  assert.deepEqual(result[0].results[0], { history_rows:2750,new_rules:46,admin_old_points:'10',public_old_points:'10',old_cache:1 });
  assert.deepEqual(result[1].results,[]);
  console.log(JSON.stringify({ D1_LOCAL:'PASS',history_rows:2750,new_rules:46,migration_reapply:'no migrations',seed_reapply:'unchanged',foreign_key_check:'PASS',production_access:false }));
} finally { await writeFile(path.join(root,'.cache/drl-d1-local.log'),commandLogs.join('\n')); }
