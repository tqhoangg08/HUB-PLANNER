/** Separate owner session. Never imports classes or deploys. Exactly two comments. */
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ownerToken, githubAPI } from './release-assistant-api.mjs';
import { openProductionBinding } from './hk2-2026-2027/production-transport.mjs';
import { prepareProductionPublication, publishProductionCatalogue, inspectPublication, verifyBackupFile } from './hk2-2026-2027/publication-transport.mjs';
import { backupRestoreAttestationText, publicationApprovalText } from './hk2-2026-2027/publication.mjs';
import { digest } from './hk2-2026-2027/operator-authorization.mjs';

const [command, ...flags] = process.argv.slice(2);
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
const lock = await open(lockPath,'wx');
await lock.writeFile(JSON.stringify({pid:process.pid,action:'publication',plan_id:plan.plan_id})); await lock.close();
let proxy, verification, attempted = false, created = false;
try {
  await mkdir(out,{recursive:false});
  created = true;
  await verifyBackupFile(report);
  proxy = await openProductionBinding();
  const prepared = await prepareProductionPublication(proxy.env.DB,{plan,report,operatorSha,credentials});
  verification = prepared.verification;
  const expiresAt = new Date(Date.parse(verification.checked_at) + 15*60000).toISOString();
  const bodies = { backup: backupRestoreAttestationText(verification), open: publicationApprovalText(verification,expiresAt) };
  for (const [name,body] of Object.entries(bodies)) {
    if (body.includes('\r')) throw new Error('Owner comment must use LF');
    await writeFile(path.join(out,`owner-${name}-comment-lf.json`),JSON.stringify({body}),{flag:'wx'});
  }
  await writeFile(path.join(out,'verification.json'),JSON.stringify({verification,verification_sha256:digest(verification),provider:prepared.provider,backup:prepared.backup,release:prepared.release,expires_at:expiresAt},null,2));
  const psQuote = value => `'${value.replaceAll("'", "''")}'`;
  const commands = Object.keys(bodies).map(name => `& ${psQuote('C:\\Program Files\\GitHub CLI\\gh.exe')} api --method POST repos/tqhoangg08/HUB-PLANNER/issues/${args.issue}/comments --input ${psQuote(path.join(out,`owner-${name}-comment-lf.json`))} --jq '.id'`);
  console.log(JSON.stringify({stage:'AWAITING_TWO_SEPARATE_OWNER_COMMENTS',expires_at:expiresAt,verification_sha256:digest(verification),commands}));
  console.log(commands.join('\n'));
  let comments;
  while (Date.now() < Date.parse(expiresAt)) {
    const list = await api(`/issues/${args.issue}/comments?per_page=100&since=${encodeURIComponent(verification.checked_at)}`);
    if (!Array.isArray(list) || list.length >= 100) throw new Error('Incomplete comment evidence');
    const matches = body => list.filter(c => c.body === body && c.user?.id === 252552483 && c.created_at === c.updated_at);
    const backups = matches(bodies.backup), approvals = matches(bodies.open);
    if (backups.length > 1 || approvals.length > 1) throw new Error('Ambiguous owner comments; stop');
    if (backups.length === 1 && approvals.length === 1) { comments={backup_comment_id:backups[0].id,approval_comment_id:approvals[0].id}; break; }
    await new Promise(resolve => setTimeout(resolve,2000));
  }
  if (!comments) throw new Error('Owner publication approval expired; nothing opened');
  await writeFile(path.join(out,'owner-comments.json'),JSON.stringify(comments,null,2));
  attempted = true;
  const result = await publishProductionCatalogue(proxy.env.DB, verification,{...credentials,...comments,expires_at:expiresAt});
  const after = await inspectPublication(proxy.env.DB);
  await writeFile(path.join(out,'publication-receipt.json'),JSON.stringify({result,after,verification_sha256:digest(verification)},null,2));
  console.log(JSON.stringify({stage:'PUBLISHED',...result,gate:after.gate}));
} catch (e) {
  const failure = {stage:'STOPPED',at:new Date().toISOString(),reason:e.message,attempted,automatic_write_retries:0};
  if (proxy) try { failure.readonly_reconciliation=await inspectPublication(proxy.env.DB); } catch (r) { failure.reconciliation_error=r.message; }
  if (created) try { await writeFile(path.join(out,'stop.json'),JSON.stringify(failure,null,2)); } catch {}
  console.error(JSON.stringify(failure)); process.exitCode=1;
} finally { if(proxy)await proxy.dispose(); await unlink(lockPath); }
