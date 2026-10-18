import {execFileSync} from 'node:child_process';
import {REPO, ENV, WORKFLOW, VALIDATION, fail, ReleaseError} from './release-assistant-core.mjs';
export function ownerToken(env=process.env,exec=execFileSync) {
  let token=env.GH_TOKEN||env.GITHUB_TOKEN;
  if(!token) {
    try {token=exec('gh',['auth','token','--hostname','github.com'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim();}
    catch {fail('OWNER_AUTH_REQUIRED_SET_GH_TOKEN_OR_INSTALL_AND_AUTHENTICATE_GH');}
  }
  if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token)) fail('OWNER_AUTH_INVALID');
  return token;
}
const dispatchPaths=[WORKFLOW,VALIDATION].map(p=>`/actions/workflows/${p.split('/').at(-1)}/dispatches`);
const variables=['PUBLIC_RELEASE_APPROVAL_SHA','PUBLIC_RELEASE_APPROVAL_RUN_ID'];
export function githubAPI(token,{fetchImpl=fetch}={}) {
  if(!token||/[\r\n]/.test(token)) fail('OWNER_AUTH_REQUIRED');
  const request=async (path,{method='GET',body,logs=false}={})=>{
    if(!path.startsWith('/')||path.includes('..')||path.includes('#')||path.includes('\\')) fail('FIXED_GITHUB_ENDPOINT_REQUIRED');
    if(method!=='GET' && !(method==='POST'&&dispatchPaths.includes(path)) &&
      !(method==='PATCH'&&variables.some(n=>path===`/environments/${ENV}/variables/${n}`&&body?.name===n))) fail('UNSUPPORTED_GITHUB_WRITE');
    if(method==='POST'&&(body?.ref!=='main'||path===dispatchPaths[0]&&
      (body.inputs?.approve_public_release!==true||!/^[a-f0-9]{40}$/.test(body.inputs?.approved_sha||'')))) fail('EXACT_MAIN_DISPATCH_REQUIRED');
    const url=path==='/user'?'https://api.github.com/user':`https://api.github.com/repos/${REPO}${path==='/'?'':path}`;
    let r;
    try {r=await fetchImpl(url,{method,redirect:'manual',headers:{Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});} catch {fail('GITHUB_API_UNAVAILABLE_NO_AUTOMATIC_WRITE_RETRY');}
    if(logs&&r.status===302) {
      let location;
      try {location=new URL(r.headers.get('location'));} catch {fail('LOG_LOCATION_UNVERIFIED');}
      if(location.protocol!=='https:'||location.username||location.password||
        !['.blob.core.windows.net','.actions.githubusercontent.com'].some(h=>location.hostname.endsWith(h))) fail('LOG_LOCATION_UNVERIFIED');
      // Signed download URL is never printed or stored. Never forward Owner Authorization.
      try {r=await fetchImpl(location.href,{redirect:'error',signal:AbortSignal.timeout(15000)});} catch {fail('GITHUB_LOGS_UNAVAILABLE');}
    }
    if(!r.ok) fail(r.status===401||r.status===403?'GITHUB_PERMISSION_REQUIRED_USE_MANUAL_APPROVAL_IF_WRITE_UNAVAILABLE':`GITHUB_HTTP_${r.status}`);
    if(r.status===204) return;
    try {return logs?await r.text():await r.json();} catch {fail('GITHUB_RESPONSE_MALFORMED');}
  };
  return request;
}
export async function completeList(api,path,key) {
  const j=await api(path);
  if(!Array.isArray(j?.[key])||j.total_count!==j[key].length) fail('METADATA_INCOMPLETE');
  return j[key];
}
export async function releaseRuns(api) {
  // Bound and paginate history; status=waiting alone would miss validating/queued releases.
  const base=`/actions/workflows/${WORKFLOW.split('/').at(-1)}/runs`;
  const runs=[];
  for(let page=1;page<=10;page++) {
    const j=await api(`${base}?per_page=100&page=${page}`);
    if(!Array.isArray(j.workflow_runs)||!Number.isInteger(j.total_count)) fail('RELEASE_RUNS_UNVERIFIED');
    runs.push(...j.workflow_runs);
    if(runs.length===j.total_count) return runs;
    if(!j.workflow_runs.length||runs.length>j.total_count) fail('METADATA_INCOMPLETE');
  }
  fail('RELEASE_HISTORY_BOUND_EXCEEDED');
}
export async function snapshot(api,runId) {
  const [user,repository,branch,environment,deploymentPolicies,classicProtection,runs]=await Promise.all([
    api('/user'),api('/'),api('/branches/main'),api(`/environments/${ENV}`),
    api(`/environments/${ENV}/deployment-branch-policies?per_page=100`),api('/branches/main/protection'),releaseRuns(api)]);
  const sha=branch.commit?.sha;
  if(!/^[a-f0-9]{40}$/.test(sha||'')) fail('EXACT_MAIN_REQUIRED');
  const checkRuns=await completeList(api,`/commits/${sha}/check-runs?check_name=${encodeURIComponent('AI Advisor independent validation')}&filter=latest&per_page=100`,'check_runs');
  const ids=[...new Set(checkRuns.filter(c=>c.name==='AI Advisor independent validation'&&c.app?.id===15368&&c.head_sha===sha).map(c=>{
    const match=new RegExp(`^https://github\\.com/${REPO}/actions/runs/(\\d+)/job/${c.id}$`).exec(c.details_url||'');
    if(!match) fail('CI_PROVENANCE_UNVERIFIED'); return match[1];
  }))];
  if(ids.length>5) fail('CI_METADATA_BOUND_EXCEEDED');
  const ciRuns=await Promise.all(ids.map(id=>api(`/actions/runs/${id}`)));
  let extra={jobs:[]};
  if(runId) {
    if(!/^\d+$/.test(runId)) fail('RUN_ID_REQUIRED');
    const [run,jobs,ownerApproval,ownerRunApproval]=await Promise.all([api(`/actions/runs/${runId}`),
      completeList(api,`/actions/runs/${runId}/jobs?per_page=100`,'jobs'),
      api(`/environments/${ENV}/variables/PUBLIC_RELEASE_APPROVAL_SHA`),api(`/environments/${ENV}/variables/PUBLIC_RELEASE_APPROVAL_RUN_ID`)]);
    const index=runs.findIndex(r=>String(r.id)===runId);
    if(index<0) fail('RUN_ID_UNVERIFIED'); runs[index]=run;
    extra={jobs,ownerApproval,ownerRunApproval};
  }
  return {user,repository,branch,environment,deploymentPolicies,classicProtection,runs,checkRuns,ciRuns,...extra};
}
export const safeError = e => e instanceof ReleaseError ? e.message : 'RELEASE_ASSISTANT_UNVERIFIED';
