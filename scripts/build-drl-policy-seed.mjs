import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DRL_RULES_2026, DRL_POLICY_VERSION } from '../utils/drlPolicy2026.ts';

const quote = (value) => value === null ? 'NULL' : typeof value === 'number' ? String(value)
  : `'${String(value).replaceAll("'", "''")}'`;
export const buildDrlPolicySeed = () => {
  const columns = ['rule_id','section','rule_group','content','condition_text','points','unit','event_suitable','active','source_version'];
  const rows = DRL_RULES_2026.map((rule) => `(${columns.map((key) => quote(rule[key])).join(',')})`);
  const equal = DRL_RULES_2026.map((rule) => `(SELECT COUNT(*) FROM drl_rules WHERE ${columns.map((key) =>
    `${key} IS ${quote(rule[key])}`).join(' AND ')})=1`).join('\n AND ');
  return `-- Generated from the verified appendix. Data only; existing 0052 schema and runtime logic.\n-- Apply as an atomic migration. Existing IDs/content/points and history are never replaced.\nINSERT OR IGNORE INTO drl_rules (${columns.join(',')}) VALUES\n${rows.join(',\n')};\n-- A conflicting ID or incomplete seed deliberately violates section NOT NULL.\n-- The sentinel is never inserted on success; a failure must roll back the migration.\nINSERT INTO drl_rules(rule_id,section,content,event_suitable,active,source_version)\nSELECT ${quote(DRL_POLICY_VERSION + ':INTEGRITY')},NULL,'Catalog integrity check failed',0,0,${quote(DRL_POLICY_VERSION)}\nWHERE NOT (${equal}\n AND (SELECT COUNT(*) FROM drl_rules WHERE source_version=${quote(DRL_POLICY_VERSION)})=46);\n-- Retain legacy rows and references; only stop offering the superseded catalog.\nUPDATE drl_rules SET active=0 WHERE source_version<>${quote(DRL_POLICY_VERSION)} AND active=1;\n`;
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('This generator only writes the local SQL artifact. No remote execution.');
  await writeFile(new URL('../cloudflare/migrations/0058_seed_drl_catalog_2026.sql', import.meta.url), buildDrlPolicySeed());
  console.log('Generated local idempotent policy seed. No database accessed.');
}
