// Local Owner tooling only. Production guards remain the deployment authority.
import {createHash} from 'node:crypto';
import {RELEASE_REPOSITORY as REPO, RELEASE_ENVIRONMENT as ENV, RELEASE_WORKFLOW as WORKFLOW,
  VALIDATION_WORKFLOW as VALIDATION, RELEASE_CHECK, validateDispatchContext, validateEnvironment,
  validateMainProtection, validateReleaseApproval} from './check-public-release-approval.mjs';
export {REPO, ENV, WORKFLOW, VALIDATION};
export class ReleaseError extends Error {}
export const fail = code => {throw new ReleaseError(code);};
export const shaPattern = /^[a-f0-9]{40}$/;
export const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const runUrl = id => `https://github.com/${REPO}/actions/runs/${id}`;
export const contextFor = (s, run) => ({...s, run, sha:s.branch.commit.sha, head:s.branch.commit.sha,
  runId:String(run.id), event:'workflow_dispatch', ref:'refs/heads/main', attempt:'1',
  actorId:String(s.user.id), triggeringActor:s.user.login,
  workflowRef:`${REPO}/${WORKFLOW}@refs/heads/main`});
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
export const digest = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export const policyDigest = s => digest({environment:Object.fromEntries(
  ['id','name','can_admins_bypass','protection_rules','deployment_branch_policy'].map(k=>[k,s.environment?.[k]])),
  policies:s.deploymentPolicies, protection:s.classicProtection});
export function validateOwner(s) {
  if(s.repository?.full_name!==REPO || s.repository.default_branch!=='main' || s.repository.owner?.type!=='User' ||
    !Number.isSafeInteger(s.user?.id) || s.user.id!==s.repository.owner.id || s.user.login!==s.repository.owner.login)
    fail('OWNER_IDENTITY_REQUIRED');
  if(s.branch?.name!=='main'||!shaPattern.test(s.branch.commit?.sha||'')) fail('EXACT_MAIN_REQUIRED');
  if(!Number.isSafeInteger(s.environment?.id)||s.environment.id<=0) fail('ENVIRONMENT_IDENTITY_REQUIRED');
  validateEnvironment(s.environment,s.deploymentPolicies);
  validateMainProtection(s);
}
export function validateCI(s, now=Date.now()) {
  const sha=s.branch.commit.sha;
  const checks=s.checkRuns.filter(c=>c.name===RELEASE_CHECK&&c.app?.id===15368&&c.head_sha===sha);
  if(!checks.length||checks.some(c=>!Number.isSafeInteger(c.id)||c.id<=0||!Number.isFinite(Date.parse(c.started_at)))) fail('EXACT_SHA_CI_REQUIRED');
  const c=checks.sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at)||b.id-a.id)[0];
  const run=s.ciRuns.find(r=>c.details_url===`${runUrl(r.id)}/job/${c.id}`);
  if(c.status!=='completed'||c.conclusion!=='success'||Date.parse(c.started_at)>now||!run||
    run.head_sha!==sha||run.path!==VALIDATION||run.head_branch!=='main'||run.event!=='workflow_dispatch'||
    run.repository?.full_name!==REPO||run.status!=='completed'||run.conclusion!=='success') fail('EXACT_SHA_CI_REQUIRED');
  return String(run.id);
}
export function validateActive(runs, expected) {
  if(!Array.isArray(runs)) fail('RELEASE_RUNS_UNVERIFIED');
  const active=runs.filter(r=>r.status!=='completed');
  if(expected ? active.length!==1||String(active[0].id)!==expected : active.length!==0) fail('CONCURRENT_OR_MISSING_RELEASE');
}
export function validateReceipt(s, receipt, now) {
  validateOwner(s);
  if(!Number.isFinite(now)||!Number.isFinite(Date.parse(receipt?.requestedAt))) fail('RECEIPT_TIME_UNVERIFIED');
  if(receipt?.state!=='dispatched'||!/^\d+$/.test(receipt.runId||'')||!shaPattern.test(receipt.sha||'')||
    receipt.sha!==s.branch.commit.sha||receipt.ownerId!==s.user.id||receipt.policy!==policyDigest(s)||
    receipt.ci!==validateCI(s,now)||receipt.version!==s.live.versionId) fail('RELEASE_RECEIPT_CHANGED');
  const run=s.runs.find(r=>String(r.id)===receipt.runId);
  if(!run) fail('RUN_ID_UNVERIFIED');
  validateDispatchContext(contextFor(s,run));
  validateActive(s.runs,receipt.runId);
  const created=Date.parse(run.created_at);
  if(!Number.isFinite(created)||created<Date.parse(receipt.requestedAt)||created>now||now-created>86400000) fail('STALE_RELEASE_RUN');
  const minutes=s.environment.protection_rules.find(r=>r.type==='wait_timer').wait_timer;
  if(now-created<Math.max(5,minutes)*60000) fail('APPROVAL_TOO_EARLY');
  // Write while validation/environment wait is still running, before release steps start.
  if(!['queued','waiting','pending','requested','in_progress'].includes(run.status)||
    s.jobs.some(j=>j.name==='release-public'&&(j.status==='in_progress'||j.status==='completed')))
    fail('RELEASE_GATE_ALREADY_STARTED');
  if(s.ownerRunApproval?.value===receipt.runId) fail('APPROVAL_REPLAY');
  return run;
}
export function verifyUnchanged(a,b) {
  if(a.branch.commit.sha!==b.branch.commit.sha||a.user.id!==b.user.id||policyDigest(a)!==policyDigest(b)||
    validateCI(a)!==validateCI(b)||a.live.versionId!==b.live.versionId) fail('RELEASE_CHANGED_DURING_CONFIRMATION');
}
export async function prepare(io) {
  const previous=await io.load();
  if(previous?.state==='completed') await io.archive(previous);
  else if(previous) fail('EXISTING_RECEIPT_REQUIRES_REVIEW');
  await io.target();
  let s=await io.snapshot(); validateOwner(s); validateActive(s.runs);
  try {validateCI(s,io.now());} catch(e) {
    if(e.message!=='EXACT_SHA_CI_REQUIRED') throw e;
    if(!await io.confirm(`VALIDATE ${s.branch.commit.sha}`, 'Run independent CI only (no deployment)')) return 'DECLINED';
    const current=await io.snapshot(); validateOwner(current); validateActive(current.runs);
    if(current.branch.commit.sha!==s.branch.commit.sha||policyDigest(current)!==policyDigest(s)) fail('RELEASE_CHANGED_DURING_CONFIRMATION');
    await io.dispatchValidation(s.branch.commit.sha);
    s=await io.waitCI(s.branch.commit.sha); validateOwner(s); validateActive(s.runs); validateCI(s,io.now());
  }
  s.live=await io.production('predeploy');
  s.previousRelease=await io.provenance(s.live.versionId);
  io.summary(s);
  if(!await io.confirm(`RELEASE ${s.branch.commit.sha}`, 'Confirmation 1/2: dispatch Public-only release')) return 'DECLINED';
  await io.target();
  const fresh=await io.snapshot(); fresh.live=await io.production('predeploy');
  validateOwner(fresh); validateActive(fresh.runs); verifyUnchanged(s,fresh);
  // Persist BEFORE a non-idempotent POST. A timeout must never cause blind redispatch.
  const receipt={state:'dispatching',sha:s.branch.commit.sha,ownerId:s.user.id,policy:policyDigest(s),
    // GitHub created_at has second resolution. Keep the full prior run-ID set as well.
    version:s.live.versionId,ci:validateCI(s),requestedAt:new Date(Math.floor(io.now()/1000)*1000).toISOString(),
    previousRuns:s.runs.map(r=>String(r.id))};
  await io.save(receipt);
  await io.dispatchRelease(receipt.sha);
  const run=await io.findDispatched(receipt);
  validateDispatchContext(contextFor(fresh,run));
  receipt.runId=String(run.id); receipt.state='dispatched'; await io.save(receipt);
  io.print(`RELEASE_RUN=${runUrl(run.id)}; STATUS=${run.status}`);
  return receipt;
}
export async function approve(io,{manual=false}={}) {
  const receipt=await io.load();
  await io.target();
  let s=await io.snapshot(receipt?.runId); s.live=await io.production('predeploy');
  try {validateReceipt(s,receipt,io.now());} catch(e) {
    if(e.message!=='APPROVAL_TOO_EARLY'||!io.waitApproval) throw e;
    await io.waitApproval(receipt);
    s=await io.snapshot(receipt.runId);s.live=await io.production('predeploy');
  }
  const run=validateReceipt(s,receipt,io.now()); s.previousRelease=await io.provenance(s.live.versionId,undefined,receipt.runId);
  io.summary(s,run);
  if(!await io.confirm(`APPROVE ${receipt.runId} ${receipt.sha}`, 'Confirmation 2/2: approve this exact release')) return 'DECLINED';
  await io.target();
  const fresh=await io.snapshot(receipt.runId); fresh.live=await io.production('predeploy');
  validateReceipt(fresh,receipt,io.now()); verifyUnchanged(s,fresh);
  if(manual) {
    // No simulated approval and no write attempt. Owner edits in GitHub; final gate remains mandatory.
    io.print(`MANUAL_APPROVAL_URL=https://github.com/${REPO}/settings/environments`);
    io.print(`ENVIRONMENT=${ENV}\nPUBLIC_RELEASE_APPROVAL_SHA=${receipt.sha}\nPUBLIC_RELEASE_APPROVAL_RUN_ID=${receipt.runId}`);
    io.print('Update BOTH existing variables now. Do not change environment protection. The workflow verifies timestamps and values.');
    receipt.state='manual';await io.save(receipt);
    return 'MANUAL_REQUIRED';
  }
  receipt.state='approving'; await io.save(receipt); // Crash/partial PATCH cannot be replayed by this CLI.
  try {
    await io.updateVariable('PUBLIC_RELEASE_APPROVAL_SHA',receipt.sha);
    // Re-read all mutable evidence between PATCHes. Leave run-ID unchanged if anything drifted.
    s=await io.snapshot(receipt.runId); s.live=await io.production('predeploy');
    validateReceipt(s,{...receipt,state:'dispatched'},io.now()); verifyUnchanged(fresh,s);
    await io.updateVariable('PUBLIC_RELEASE_APPROVAL_RUN_ID',receipt.runId);
    const final=await io.snapshot(receipt.runId);
    validateOwner(final);
    if(policyDigest(final)!==receipt.policy) fail('PROTECTION_CHANGED');
    validateReleaseApproval({...contextFor(final,final.runs.find(r=>String(r.id)===receipt.runId)),now:io.now()});
    receipt.state='approved'; await io.save(receipt);
  } catch {fail('APPROVAL_WRITE_UNVERIFIED_DO_NOT_RETRY_CHECK_RUN_AND_USE_MANUAL_FALLBACK');}
  return io.monitor(receipt);
}
export function validateBaselineEvidence({s,run,job,logs,version,deployment}) {
  validateOwner(s); validateActive(s.runs);
  // Historical source SHA is verified separately as an ancestor of freshly fetched main.
  validateDispatchContext(contextFor({...s,branch:{...s.branch,commit:{sha:run.head_sha}}},run));
  if(run.status!=='completed'||run.conclusion!=='success'||job?.name!=='release-public'||job.status!=='completed'||
    job.conclusion!=='success'||String(job.run_id)!==String(run.id)||job.head_sha!==run.head_sha) fail('SUCCESSFUL_RELEASE_PROVENANCE_REQUIRED');
  const stamps=[Date.parse(job.started_at),Date.parse(job.completed_at),Date.parse(version.metadata?.created_on),Date.parse(deployment.created_on)];
  if(stamps.some(t=>!Number.isFinite(t))||stamps[2]<stamps[0]||stamps[2]>stamps[1]||stamps[3]<stamps[2]||stamps[3]>stamps[1]) fail('DEPLOYMENT_TIME_PROVENANCE_REQUIRED');
  if(!uuidPattern.test(deployment.id||'')||deployment.versions?.length!==1||deployment.versions[0].percentage!==100||deployment.versions[0].version_id!==version.id||!uuidPattern.test(version.id)) fail('SINGLE_PROVEN_VERSION_REQUIRED');
  const matches=[...logs.matchAll(/PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=([a-f0-9-]{36})(?=\s|$)/g)];
  if(matches.length!==1||matches[0][1]!==version.id||!logs.includes('PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS')||
    !job.steps?.some(x=>x.name.startsWith('Verify serving Public version')&&x.conclusion==='success')) fail('POSTFLIGHT_PROVENANCE_REQUIRED');
  return version.id;
}
export function baselinePatch(source,testSource,version) {
  if(!uuidPattern.test(version)) fail('VERSION_REQUIRED');
  const pattern=/export const PUBLIC_RELEASE_PREDEPLOY_VERSION='([a-f0-9-]{36})';/g;
  const matches=[...source.matchAll(pattern)];
  if(matches.length!==1||matches[0][1]===version) fail('BASELINE_CHANGE_REQUIRED');
  const old=matches[0][1];
  if(testSource.split(`assert.equal(before,'${old}')`).length!==2) fail('BASELINE_TEST_ANCHOR_CHANGED');
  // Keep the existing negative drift test and its explicit reviewed-pin assertion.
  return {old,source:source.replace(matches[0][0],matches[0][0].replace(old,version)),
    testSource:testSource.replace(`assert.equal(before,'${old}')`,`assert.equal(before,'${version}')`)};
}
