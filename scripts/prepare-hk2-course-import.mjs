import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditPackage, DATA_DIR, planImport, SEMESTER, sha256, validateSnapshot } from './hk2-2026-2027/catalogue.mjs';

// Intentionally no apply/remote mode and no D1 credentials or SQL execution.
const args = process.argv.slice(2);
if (args.some(a => a !== '--check' && !a.startsWith('--snapshot='))) throw new Error('Only --check and --snapshot=<complete-readonly-json> are supported; no production writer exists.');
const audited = await auditPackage();
const snapshotFile = args.find(a => a.startsWith('--snapshot='))?.slice(11) || path.join(DATA_DIR, 'production-readonly.json');
const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
const results = validateSnapshot(snapshot, await readFile(path.join(DATA_DIR, 'preflight.sql'), 'utf8'));
const plan = planImport(audited.records, results[3].results, audited.temporary_items);
const output = path.join(DATA_DIR, 'generated');
const artifacts = {
  'catalogue.json': audited,
  'dry-run.json': { ...plan, snapshot_checked_at: snapshot.checked_at, snapshot_sha256: sha256(await readFile(snapshotFile)), snapshot_is_historical: true },
  'exceptions.json': { semester: SEMESTER, placeholders: audited.placeholders,
    classes: audited.records.filter(r => r.issues.length).map(r => ({ code: r.course.course_code, source_file: r.source_file,
      source_row: r.source_row, status: r.status, publication: r.publication, issues: r.issues, raw_schedule: r.raw_schedule,
      exam_date: r.course.exam_date, exam_room_raw: r.exam_room_raw, ...(r.owner_derivation ? { owner_derivation: r.owner_derivation } : {}) })),
    temporary_items: audited.temporary_items },
  'temporary-items.json': { semester: SEMESTER, mode: 'REVIEW_PREVIEW_ONLY', requires_separate_schema: true,
    production_write_supported: false, items: audited.temporary_items },
  'owner-decisions.json': audited.owner_decisions,
};
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
artifacts['manifest.json'] = { schema_version: 2, semester: SEMESTER, source_files_unchanged: audited.integrity.files,
  owner_decision_id: audited.owner_decisions.decision_id,
  builder_sha256: sha256(await readFile(new URL('./hk2-2026-2027/catalogue.mjs', import.meta.url))),
  runtime_policy_sha256: sha256(await readFile(new URL('../utils/provisionalCoursePolicy.js', import.meta.url))),
  output_sha256: Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, sha256(serialize(value))])) };
await mkdir(output, { recursive: true });
for (const [name, value] of Object.entries(artifacts)) {
  const text = serialize(value);
  if (args.includes('--check')) {
    if (await readFile(path.join(output, name), 'utf8') !== text) throw new Error(`Generated artifact stale: ${name}`);
  } else await writeFile(path.join(output, name), text);
}
console.log(JSON.stringify({ summary: audited.summary, plan: plan.counts, status: plan.status }, null, 2));
if (plan.conflicts.length) process.exitCode = 1;
