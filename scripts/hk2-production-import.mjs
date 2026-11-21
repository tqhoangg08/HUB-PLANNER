/** Standalone owner CLI. No command opens the publication gate. */
import { readFile, writeFile, mkdir, appendFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { captureSnapshot, createBulkPlan, loadBulkPackage, exportReceipts } from './hk2-2026-2027/bulk-import.mjs';
import { authorizeProductionImport, importApprovalText, DB_ID, digest } from './hk2-2026-2027/operator-authorization.mjs';
import { openProductionBinding, guardedOperatorBinding, applyOperatorBatch, CLOSED_GATE_ASSERTION } from './hk2-2026-2027/production-transport.mjs';
import { ownerToken } from './release-assistant-api.mjs';

const [command, ...flags] = process.argv.slice(2);
const allowed = { capture: ['out'], prepare: ['snapshot','backup','out'], 'approval-text': ['plan','backup','expires'],
  apply: ['plan','backup','approval-comment','expires','journal'] };
if (!allowed[command] || flags.length !== allowed[command].length || flags.some(f => !/^--[a-z-]+=.+/.test(f))) throw new Error('Use capture, prepare, approval-text or apply with documented exact flags');
const args = Object.fromEntries(flags.map(f => { const i = f.indexOf('='); return [f.slice(2,i),f.slice(i+1)]; }));
if (Object.keys(args).sort().join() !== [...allowed[command]].sort().join()) throw new Error('Unknown, duplicate or missing flag');
const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
const ignored = filename => {
  const resolved = path.resolve(filename);
  if (!resolved.startsWith(path.resolve('.cache') + path.sep)) throw new Error('Plan, snapshot and journal must stay in ignored .cache/');
  return resolved;
};
const create = async (filename, value) => { const p = ignored(filename); await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(value, null, 2)+'\n', { flag:'wx' }); };
const operatorSha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
execFileSync('git',['diff','--exit-code','HEAD','--','scripts','data/hk2-2026-2027','cloudflare/worker/src/course-publication.ts'],{stdio:'pipe'});
const pkg = await loadBulkPackage();

if (command === 'capture') {
  const token = ownerToken();
  const response = await fetch('https://api.github.com/user',{redirect:'error',headers:{Authorization:`Bearer ${token}`,'User-Agent':'HUB-HK2-operator'}});
  if (!response.ok || (await response.json()).id !== 252552483) throw new Error('Authenticated owner required');
  const proxy = await openProductionBinding();
  try {
    await proxy.env.DB.prepare(CLOSED_GATE_ASSERTION).first();
    const snapshot = await captureSnapshot(guardedOperatorBinding(proxy.env.DB), DB_ID);
    await createBulkPlan(pkg,snapshot); await create(args.out,snapshot);
    console.log(JSON.stringify({snapshot_sha256:digest(snapshot),snapshot_checked_at:snapshot.checked_at,read_only:true}));
  } finally { await proxy.dispose(); }
} else if (command === 'prepare') {
  const plan = await createBulkPlan(pkg,await json(args.snapshot));
  if (plan.snapshot.database_id !== DB_ID || plan.rows.length !== 2357 || plan.batches !== 95) throw new Error('Exactly 2,357 production additions / 95 batches required');
  const backup = await json(args.backup);
  importApprovalText(plan,backup,operatorSha,new Date(Date.now()+30*60_000).toISOString());
  await create(args.out,plan);
  console.log(JSON.stringify({plan_id:plan.plan_id,snapshot_sha256:plan.snapshot_sha256,manifest_sha256:plan.manifest_sha256,
    payload_sha256:plan.payload_sha256,counts:plan.dry_run.counts,batches:plan.batches,requires_owner_approval:true}));
} else {
  const plan = await json(args.plan), backup = await json(args.backup);
  if (JSON.stringify(await createBulkPlan(pkg,plan.snapshot,{historical:true})) !== JSON.stringify(plan)) throw new Error('Saved plan changed');
  if (command === 'approval-text') console.log(importApprovalText(plan,backup,operatorSha,args.expires));
  else {
    const journal = ignored(args.journal);
    try { for (const line of (await readFile(journal,'utf8')).trim().split('\n').filter(Boolean)) if (JSON.parse(line).plan_id !== plan.plan_id) throw new Error('Journal belongs to another plan'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    await mkdir(path.dirname(journal),{recursive:true});
    const options = {operatorSha,approvalCommentId:Number(args['approval-comment']),expiresAt:args.expires,
      githubToken:ownerToken(),cloudflareToken:process.env.CLOUDFLARE_API_TOKEN};
    let authorization = await authorizeProductionImport(plan,backup,options);
    const proxy = await openProductionBinding();
    try {
      for (;;) {
        await appendFile(journal,JSON.stringify({plan_id:plan.plan_id,event:'attempt',at:new Date().toISOString()})+'\n');
        const result = await applyOperatorBatch(proxy.env.DB,pkg,plan,authorization);
        const receipts = await exportReceipts(guardedOperatorBinding(proxy.env.DB),plan);
        await writeFile(journal+'.receipts.tmp',JSON.stringify(receipts,null,2)+'\n');
        await rename(journal+'.receipts.tmp',journal+'.receipts.json');
        await appendFile(journal,JSON.stringify({plan_id:plan.plan_id,event:'ack',...result,receipts_sha256:digest(receipts),at:new Date().toISOString()})+'\n');
        console.log(JSON.stringify(result)); if(result.done)break;
        authorization = await authorizeProductionImport(plan,backup,options);
      }
    } finally { await proxy.dispose(); }
  }
}
