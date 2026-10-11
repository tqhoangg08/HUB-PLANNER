// SOLO OWNER, not independent review. Every production check is mandatory.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const RELEASE_REPOSITORY='tqhoangg08/HUB-PLANNER';
export const RELEASE_ENVIRONMENT='public-production';
export const RELEASE_WORKFLOW='.github/workflows/deploy-cloudflare-production.yml';
export const RELEASE_CHECK='AI Advisor independent validation';
export const VALIDATION_WORKFLOW='.github/workflows/ai-advisor-pr-validation.yml';
const ACTIONS_APP_ID=15368; // GitHub.com GitHub Actions App, not an arbitrary status publisher.
const SHA=/^[a-f0-9]{40}$/;
const fail=code=>{throw Error(code);};

export function validateDispatchContext(c){
  const {sha,head,event,ref,repository,branch,run,runId,attempt,actorId,triggeringActor,workflowRef}=c;
  if(event!=='workflow_dispatch'||ref!=='refs/heads/main'||!SHA.test(sha||'')||sha!==head||
    repository?.full_name!==RELEASE_REPOSITORY||repository.default_branch!=='main'||
    branch?.name!=='main'||branch.commit?.sha!==sha||run?.head_sha!==sha||run.head_branch!=='main'||
    run.event!=='workflow_dispatch'||run.path!==RELEASE_WORKFLOW||String(run.id)!==runId||
    run.repository?.full_name!==RELEASE_REPOSITORY||workflowRef!==`${RELEASE_REPOSITORY}/${RELEASE_WORKFLOW}@refs/heads/main`)
    fail('EXACT_MAIN_APPROVAL_REQUIRED');
  const owner=repository.owner;
  if(owner?.type!=='User'||!Number.isSafeInteger(owner.id)||owner.id<=0||run.actor?.id!==owner.id||
    run.triggering_actor?.id!==owner.id||actorId!==String(owner.id)||triggeringActor!==owner.login||
    attempt!=='1'||run.run_attempt!==1)fail('SOLO_OWNER_DISPATCH_REQUIRED');
  return true;
}

export function validateEnvironment(environment,policies){
  const rules=environment?.protection_rules;
  if(environment?.name!==RELEASE_ENVIRONMENT||environment.can_admins_bypass!==false||!Array.isArray(rules)||
    environment.deployment_branch_policy?.protected_branches!==false||
    environment.deployment_branch_policy?.custom_branch_policies!==true||
    rules.filter(r=>r.type==='branch_policy').length!==1)fail('PROTECTED_ENVIRONMENT_REQUIRED');
  const timers=rules.filter(r=>r.type==='wait_timer');
  if(timers.length!==1||!Number.isInteger(timers[0].wait_timer)||timers[0].wait_timer<5||timers[0].wait_timer>43200)
    fail('WAIT_TIMER_REQUIRED');
  if(policies?.total_count!==1||!Array.isArray(policies.branch_policies)||policies.branch_policies.length!==1||
    policies.branch_policies[0].name!=='main'||policies.branch_policies[0].type!=='branch')fail('MAIN_ONLY_ENVIRONMENT_REQUIRED');
  return true;
}

const hasRequiredCheck=(checks,idKey)=>Array.isArray(checks)&&checks.some(c=>c.context===RELEASE_CHECK&&c[idKey]===ACTIONS_APP_ID);
const latestCheck=(checks,sha)=>{
  if(!Array.isArray(checks))fail('EXACT_SHA_CI_REQUIRED');
  const candidates=checks.filter(r=>r.name===RELEASE_CHECK&&r.app?.id===ACTIONS_APP_ID&&r.head_sha===sha);
  if(!candidates.length||candidates.some(r=>!Number.isSafeInteger(r.id)||r.id<=0||!Number.isFinite(Date.parse(r.started_at))))fail('EXACT_SHA_CI_REQUIRED');
  return candidates.sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at)||b.id-a.id)[0];
};
export function validateMainProtection({repository,branch,classicProtection}){
  if(branch?.protected!==true)fail('MAIN_PROTECTION_REQUIRED');
  // Ruleset GET can hide bypass_actors from read-only callers. It cannot be our
  // protection authority, even when branch.protected is true or the field is [].
  // Classic protection is independently enforced alongside any rulesets and
  // its security settings are readable with Administration:read.
  const p=classicProtection;
  if(repository?.owner?.type!=='User'||!p||p.enforce_admins?.enabled!==true||p.allow_force_pushes?.enabled!==false||p.allow_deletions?.enabled!==false||
    !Number.isInteger(p.required_pull_request_reviews?.required_approving_review_count)||p.required_pull_request_reviews.required_approving_review_count<0||
    p.required_status_checks?.strict!==true||!hasRequiredCheck(p.required_status_checks.checks,'app_id'))
    fail('MAIN_CLASSIC_PROTECTION_REQUIRED');
  // Classic named PR bypass lists are organization-only (this policy rejects
  // organization owners). Absence here is documented non-applicability, NOT an
  // inference about hidden ruleset bypass metadata. Unexpected lists fail closed.
  const allowances=p.required_pull_request_reviews.bypass_pull_request_allowances;
  if(allowances!==undefined&&(!allowances||['users','teams','apps'].some(k=>!Array.isArray(allowances[k])||allowances[k].length!==0)))
    fail('MAIN_CLASSIC_BYPASS_UNVERIFIED');
  return true;
}

export function validateReleaseApproval(c){
  validateDispatchContext(c);
  validateEnvironment(c.environment,c.deploymentPolicies);
  validateMainProtection(c);
  // API reads from THIS environment, never vars-context fallback or workflow inputs.
  const approvals=[['PUBLIC_RELEASE_APPROVAL_SHA',c.sha,c.ownerApproval],['PUBLIC_RELEASE_APPROVAL_RUN_ID',c.runId,c.ownerRunApproval]];
  const now=c.now??Date.now(),created=Date.parse(c.run.created_at);
  if(!Number.isFinite(now)||!Number.isFinite(created)||created>now)fail('APPROVAL_TIME_UNVERIFIED');
  if(now-created<300000)fail('WAIT_NOT_ELAPSED');
  for(const [name,value,a] of approvals){
    const updated=Date.parse(a?.updated_at);
    if(a?.name!==name||a.value!==value||!Number.isFinite(updated)||updated<created||updated>now||now-updated>86400000)
      fail('SEPARATE_OWNER_APPROVAL_REQUIRED');
  }
  const r=latestCheck(c.checkRuns,c.sha);
  if(!Array.isArray(c.ciRuns)||Date.parse(r.started_at)>now||r.status!=='completed'||r.conclusion!=='success'||!c.ciRuns.some(ci=>
      r.details_url===`https://github.com/${RELEASE_REPOSITORY}/actions/runs/${ci.id}/job/${r.id}`&&
      ci.path===VALIDATION_WORKFLOW&&ci.head_sha===c.sha&&ci.head_branch==='main'&&ci.event==='workflow_dispatch'&&
      ci.repository?.full_name===RELEASE_REPOSITORY&&ci.status==='completed'&&ci.conclusion==='success'))
    fail('EXACT_SHA_CI_REQUIRED');
  return true;
}

// Only GET fixed GitHub.com endpoints. No token fallback, anonymous retry or
// caller-selected endpoint/provider policy. Never send the PAT to Checks API.
function githubReader(token,fetchImpl){
  if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))fail('GITHUB_READ_TOKEN_REQUIRED');
  return async suffix=>{
    let r;
    try{r=await fetchImpl(`https://api.github.com/repos/${RELEASE_REPOSITORY}${suffix}`,{
      method:'GET',redirect:'error',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});}catch{fail('GITHUB_METADATA_UNAVAILABLE');}
    if(!r.ok)fail(`GITHUB_METADATA_HTTP_${r.status}`);
    try{return await r.json();}catch{fail('GITHUB_METADATA_MALFORMED');}
  };
}
const readChecks=async(get,sha)=>{
  if(!SHA.test(sha||''))fail('EXACT_SHA_CI_REQUIRED');
  const checks=await get(`/commits/${sha}/check-runs?check_name=${encodeURIComponent(RELEASE_CHECK)}&filter=latest&per_page=100`);
  if(!Array.isArray(checks?.check_runs)||checks.total_count!==checks.check_runs.length)fail('CI_METADATA_INCOMPLETE');
  return checks.check_runs;
};

export async function readGitHubReleaseMetadata(context,{ciToken,metadataToken,fetchImpl=fetch,preflight=false}={}){
  const get=githubReader(ciToken,fetchImpl);
  const protectedGet=preflight?undefined:githubReader(metadataToken,fetchImpl);
  if(!preflight&&ciToken===metadataToken)fail('DISTINCT_READ_CREDENTIALS_REQUIRED');
  if(!/^\d+$/.test(context.runId||''))fail('RUN_ID_REQUIRED');
  const [repository,branch,run,environment,deploymentPolicies]=await Promise.all([
    get(''),get('/branches/main'),get(`/actions/runs/${context.runId}`),get(`/environments/${RELEASE_ENVIRONMENT}`),
    get(`/environments/${RELEASE_ENVIRONMENT}/deployment-branch-policies?per_page=100`)]);
  const c={...context,repository,branch,run,environment,deploymentPolicies};
  validateDispatchContext(c);validateEnvironment(environment,deploymentPolicies);
  if(branch.protected!==true)fail('MAIN_PROTECTION_REQUIRED');
  if(preflight)return c; // No deployment uses this partial check.
  // Always read classic protection, including when active rulesets also exist.
  // Never request write-only bypass metadata or fall back on a ruleset/404.
  const classicProtection=await protectedGet('/branches/main/protection');
  validateMainProtection({...c,classicProtection});
  const [ownerApproval,ownerRunApproval,checkRuns]=await Promise.all([
    protectedGet(`/environments/${RELEASE_ENVIRONMENT}/variables/PUBLIC_RELEASE_APPROVAL_SHA`),
    protectedGet(`/environments/${RELEASE_ENVIRONMENT}/variables/PUBLIC_RELEASE_APPROVAL_RUN_ID`),
    readChecks(get,context.sha)]);
  const selected=latestCheck(checkRuns,context.sha);
  const ciIds=[...new Set([selected].filter(r=>r.status==='completed'&&r.conclusion==='success').map(r=>{
      const m=new RegExp(`^https://github\\.com/${RELEASE_REPOSITORY}/actions/runs/(\\d+)/job/${r.id}$`).exec(r.details_url||'');
      if(!m)fail('CI_PROVENANCE_UNVERIFIED');return m[1];
    }))];
  if(ciIds.length>5)fail('CI_METADATA_BOUND_REQUIRED');
  const ciRuns=await Promise.all(ciIds.map(id=>get(`/actions/runs/${id}`)));
  // Recheck mutable head/environment at the end of metadata reads, immediately before approval.
  const [currentBranch,currentEnvironment,currentPolicies]=await Promise.all([get('/branches/main'),get(`/environments/${RELEASE_ENVIRONMENT}`),
    get(`/environments/${RELEASE_ENVIRONMENT}/deployment-branch-policies?per_page=100`)]);
  validateDispatchContext({...c,branch:currentBranch});validateEnvironment(currentEnvironment,currentPolicies);
  const currentProtection=await protectedGet('/branches/main/protection');
  if(JSON.stringify(currentProtection)!==JSON.stringify(classicProtection))fail('MAIN_PROTECTION_CHANGED');
  validateMainProtection({...c,branch:currentBranch,classicProtection:currentProtection});
  return {...c,branch:currentBranch,environment:currentEnvironment,deploymentPolicies:currentPolicies,
    classicProtection,ownerApproval,ownerRunApproval,checkRuns,ciRuns};
}

// Read-only CI capability probe, NOT release approval. Uses the same Checks
// reader as the final gate, on the current independent-validation run's SHA.
export async function verifyGitHubCIReadAccess({sha,runId,event},{ciToken,fetchImpl=fetch}={}){
  if(!SHA.test(sha||'')||!/^\d+$/.test(runId||'')||!['pull_request','workflow_dispatch'].includes(event))fail('CI_PROBE_CONTEXT_REQUIRED');
  const get=githubReader(ciToken,fetchImpl);
  const [checks,run]=await Promise.all([readChecks(get,sha),get(`/actions/runs/${runId}`)]);
  const check=latestCheck(checks,sha);
  if(run?.head_sha!==sha||run.path!==VALIDATION_WORKFLOW||run.repository?.full_name!==RELEASE_REPOSITORY||
    String(run.id)!==runId||run.event!==event||check.details_url!==`https://github.com/${RELEASE_REPOSITORY}/actions/runs/${runId}/job/${check.id}`)
    fail('CI_PROBE_PROVENANCE_REQUIRED');
  return true; // Current run may still be in progress; final release requires success.
}

async function main(){
  if(process.argv.slice(2).some(a=>a!=='--preflight')||process.argv.slice(2).length>1)fail('UNSUPPORTED_APPROVAL_ARGUMENT');
  const preflight=process.argv.includes('--preflight');
  if(process.env.GITHUB_REPOSITORY!==RELEASE_REPOSITORY)fail('REPOSITORY_REQUIRED');
  const context={sha:process.env.APPROVED_SHA,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    event:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF,runId:process.env.GITHUB_RUN_ID,
    attempt:process.env.GITHUB_RUN_ATTEMPT,actorId:process.env.GITHUB_ACTOR_ID,triggeringActor:process.env.GITHUB_TRIGGERING_ACTOR,
    workflowRef:process.env.GITHUB_WORKFLOW_REF};
  const c=await readGitHubReleaseMetadata(context,{preflight,ciToken:process.env.GH_TOKEN,metadataToken:process.env.RELEASE_GITHUB_READ_TOKEN});
  if(!preflight)validateReleaseApproval(c);
  console.log(preflight?'PUBLIC_ONLY_PREFLIGHT=PASS; NOT_RELEASE_APPROVAL':'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{
  console.error(`PUBLIC_ONLY_APPROVAL_GATE=BLOCKED; ${/^[A-Z_0-9]+$/.test(e.message)?e.message:'METADATA_UNVERIFIED'}`);process.exitCode=1;
});
