import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createBulkPlan, loadBulkPackage, summarizePlan } from './hk2-2026-2027/bulk-import.mjs';

// Only offline dry-run is exposed. No flag can select a remote writer or rollback.
const args = process.argv.slice(2);
if (args[0] !== 'dry-run' || args.slice(1).some(a => !/^--(?:snapshot|out)=.+/.test(a))) {
  throw new Error('Usage: node scripts/hk2-d1-import.mjs dry-run --snapshot=<fresh-json> --out=<new-plan-json>. No remote/apply mode.');
}
const one = name => {
  const values = args.filter(a => a.startsWith(`--${name}=`));
  if (values.length !== 1) throw new Error(`Exactly one --${name}= argument required`);
  return values[0].slice(name.length + 3);
};
const snapshot = JSON.parse(await readFile(one('snapshot'), 'utf8'));
const plan = await createBulkPlan(await loadBulkPackage(), snapshot);
const output = path.resolve(one('out'));
if (!output.startsWith(path.resolve('.cache') + path.sep)) throw new Error('Plans must stay in ignored .cache/ (may contain catalogue snapshot metadata)');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(summarizePlan(plan), null, 2));
