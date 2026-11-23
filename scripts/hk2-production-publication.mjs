/** Separate owner session. Never imports classes or deploys. Exactly two comments. */
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ownerToken, githubAPI } from './release-assistant-api.mjs';
import { PublicationNativeLease } from './hk2-2026-2027/publication-native-lease.mjs';
import { PublicationSessionState, inspectSession, releaseOwnedOperatorLock } from './hk2-2026-2027/publication-session-state.mjs';
import { prepareProductionPublication, publicationBinding, inspectPublication, verifyBackupFile } from './hk2-2026-2027/publication-transport.mjs';
import { backupRestoreAttestationText, publicationApprovalText, authorizeHk2Publication, openHk2Publication } from './hk2-2026-2027/publication.mjs';
import { digest } from './hk2-2026-2027/operator-authorization.mjs';

const [command, ...flags] = process.argv.slice(2);
if (command === 'status') {
  if (flags.length !== 1 || !flags[0].startsWith('--out=')) throw Error('Use status --out=.cache/session-directory');
  const state = await inspectSession(path.resolve(flags[0].slice(6)));
  console.log(JSON.stringify(state)); process.exit(state.approval_valid ? 0 : 1);
}
const keys = ['plan','backup','out','issue'];
if (command !== 'session' || flags.length !== keys.length || flags.some(f => !/^--[a-z-]+=.+/.test(f))) throw new Error('Use session --plan=... --backup=... --out=.cache/new-directory --issue=...');
const args = Object.fromEntries(flags.map(f => { const i = f.indexOf('='); return [f.slice(2,i),f.slice(i+1)]; }));
if (Object.keys(args).sort().join() !== [...keys].sort().join() || !/^[1-9][0-9]*$/.test(args.issue)) throw new Error('Unknown/duplicate/missing session arguments');
const out = path.resolve(args.out), cache = path.resolve('.cache') + path.sep;
if (!out.startsWith(cache) || !path.resolve(args.plan).startsWith(cache) || !path.resolve(args.backup).startsWith(cache)) throw new Error('Operator artifacts must remain in ignored .cache/');
const operatorSha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
execFileSync('git',['diff','--exit-code','HEAD'],{stdio:'pipe'});
const json = async f => JSON.parse(await readFile(f,'utf8'));
const plan = await json(args.plan), report = await json(args.backup);
const credentials = { github_read_token: ownerToken(), cloudflare_read_token: process.env.CLOUDFLARE_API_TOKEN };
const api = githubAPI(credentials.github_read_token);
// Same operational lock as the importer: a publication session never overlaps it.
const lockPath = path.join(path.dirname(path.resolve(args.plan)), 'resume-operator.lock');
const lockNonce = randomUUID();
const lock = await open(lockPath,'wx');
await lock.writeFile(JSON.stringify({pid:process.pid,nonce:lockNonce,action:'publication',plan_id:plan.plan_id,out,started_at:new Date().toISOString()})); await lock.close();
let lease, monitor, verification, attempted = false, created = false;
try {
  await mkdir(out,{recursive:false});
  created = true;
  monitor = new PublicationSessionState(out); await monitor.start();
  await verifyBackupFile(report);
  lease = new PublicationNativeLease({signal:monitor.controller.signal});
  await monitor.update('VERIFYING',{native_active:true});
  const prepared = await prepareProductionPublication(lease.db,{plan,report,operatorSha,credentials});
  await lease.health();
  await monitor.update('CLOSING_VERIFICATION_TRANSPORT',{native_active:true,native_pid:lease.pid});
  await lease.close(); // no Wrangler/Miniflare/workerd is alive during owner wait
  monitor.assertActive();
  verification = prepared.verification;
  const expiresAt = new Date(Date.parse(verification.checked_at) + 15*60000).toISOString();
  const bodies = { backup: backupRestoreAttestationText(verification), open: publicationApprovalText(verification,expiresAt) };
  for (const [name,body] of Object.entries(bodies)) {
    if (body.includes('\r')) throw new Error('Owner comment must use LF');
    await writeFile(path.join(out,`owner-${name}-comment-lf.json`),JSON.stringify({body}),{flag:'wx'});
  }
  await writeFile(path.join(out,'verification.json'),JSON.stringify({verification,verification_sha256:digest(verification),provider:prepared.provider,backup:prepared.backup,release:prepared.release,expires_at:expiresAt},null,2));
  await monitor.update('AWAITING_OWNER',{native_active:false,native_pid:null,expires_at:expiresAt,verification_sha256:digest(verification)});
  const psQuote = value => `'${value.replaceAll("'", "''")}'`;
  const statusCommand = `& ${psQuote(process.execPath)} ${psQuote(fileURLToPath(import.meta.url))} status ${psQuote('--out='+out)}; if ($LASTEXITCODE -ne 0) { throw 'Publication session is not live; do not post approval' }; `;
  const commands = Object.keys(bodies).map(name => statusCommand+`& ${psQuote('C:\\Program Files\\GitHub CLI\\gh.exe')} api --method POST repos/tqhoangg08/HUB-PLANNER/issues/${args.issue}/comments --input ${psQuote(path.join(out,`owner-${name}-comment-lf.json`))} --jq '.id'`);
  console.log(JSON.stringify({stage:'AWAITING_TWO_SEPARATE_OWNER_COMMENTS',expires_at:expiresAt,verification_sha256:digest(verification),commands}));
  console.log(commands.join('\n'));
  let comments;
  while (Date.now() < Date.parse(expiresAt)) {
    monitor.assertActive();
    const list = await api(`/issues/${args.issue}/comments?per_page=100&since=${encodeURIComponent(verification.checked_at)}`);
    if (!Array.isArray(list) || list.length >= 100) throw new Error('Incomplete comment evidence');
    const matches = body => list.filter(c => c.body === body && c.user?.id === 252552483 && c.created_at === c.updated_at);
    const backups = matches(bodies.backup), approvals = matches(bodies.open);
    if (backups.length > 1 || approvals.length > 1) throw new Error('Ambiguous owner comments; stop');
    if (backups.length === 1 && approvals.length === 1) { comments={backup_comment_id:backups[0].id,approval_comment_id:approvals[0].id}; break; }
    await new Promise((resolve,reject) => {
      const signal=monitor.controller.signal;
      const onAbort=()=>{clearTimeout(timer);reject(signal.reason);};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},2000);
      signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();
    });
  }
  if (!comments) throw new Error('Owner publication approval expired; nothing opened');
  await writeFile(path.join(out,'owner-comments.json'),JSON.stringify(comments,null,2));
  monitor.assertActive();
  lease = new PublicationNativeLease({publication:true,signal:monitor.controller.signal,expiresAt});
  await monitor.update('CONNECTING_FOR_PUBLICATION',{native_active:true});
  await lease.health(); // fresh primary read before obtaining the 60s capability
  monitor.assertActive();
  await monitor.update('AUTHORIZING_PUBLICATION',{native_pid:lease.pid});
  const capability=await authorizeHk2Publication(verification,{...credentials,...comments,expires_at:expiresAt});
  monitor.assertActive();
  if(!lease.active)throw Error('Native lease failed during authorization');
  await monitor.update('OPEN_IN_FLIGHT');
  monitor.assertActive();
  attempted = true;
  const result = await openHk2Publication(publicationBinding(lease.db),verification,capability);
  const after = await inspectPublication(lease.db);
  await writeFile(path.join(out,'publication-receipt.json'),JSON.stringify({result,after,verification_sha256:digest(verification)},null,2));
  console.log(JSON.stringify({stage:'PUBLISHED',...result,gate:after.gate}));
  await lease.close(); await monitor.finish('PUBLISHED',{native_active:false,receipt_id:result.receipt_id});
} catch (e) {
  const failure = {stage:'STOPPED',at:new Date().toISOString(),reason:e.message,attempted,mutation_attempted:lease?.mutationAttempted||false,automatic_write_retries:0};
  failure.native_diagnostics=lease?.diagnostics;
  if (lease) try { await lease.close(); } catch (r) { failure.cleanup_error=r.message; }
  if (attempted) {
    // A new READ-ONLY child may inspect receipts; never re-send the write.
    const reader=new PublicationNativeLease();
    try { failure.readonly_reconciliation=await inspectPublication(reader.db); } catch(r){failure.reconciliation_error=r.message;}
    finally {try{await reader.close();}catch{}}
  }
  if (created) try { await writeFile(path.join(out,'stop.json'),JSON.stringify(failure,null,2)); } catch {}
  if(monitor)await monitor.finish('STOPPED',{native_active:false,publication_outcome:attempted?'RECONCILE_REQUIRED':'NOT_ATTEMPTED'});
  console.error(JSON.stringify(failure)); process.exitCode=1;
} finally { await releaseOwnedOperatorLock(lockPath,process.pid,lockNonce); }
