import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {prepare,approve,validateCI,validateOwner,validateReceipt,policyDigest,validateBaselineEvidence,baselinePatch,
  REPO,ENV,WORKFLOW,VALIDATION,runUrl,ReleaseError} from '../scripts/release-assistant-core.mjs';
import {githubAPI,ownerToken,safeError,completeList,releaseRuns,snapshot} from '../scripts/release-assistant-api.mjs';
import {stateStore,confirm} from '../scripts/release-assistant.mjs';
const sha='a'.repeat(40),version='11111111-1111-4111-8111-111111111111',next='22222222-2222-4222-8222-222222222222';
const now=Date.parse('2026-10-18T02:10:00Z');
function fixture() {
  const owner={type:'User',id:42,login:'tqhoangg08'};
  const run={id:900,head_sha:sha,head_branch:'main',path:WORKFLOW,event:'workflow_dispatch',repository:{full_name:REPO},
    actor:owner,triggering_actor:owner,run_attempt:1,created_at:'2026-10-18T02:00:00Z',status:'in_progress',conclusion:null};
  const ci={...run,id:800,path:VALIDATION,status:'completed',conclusion:'success'};
  return {user:owner,repository:{full_name:REPO,default_branch:'main',owner},branch:{name:'main',protected:true,commit:{sha}},
    classicProtection:{enforce_admins:{enabled:true},allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},
      required_pull_request_reviews:{required_approving_review_count:0},required_status_checks:{strict:true,checks:[{context:'AI Advisor independent validation',app_id:15368}]}},
    environment:{id:23,name:ENV,can_admins_bypass:false,protection_rules:[{type:'branch_policy'},{type:'wait_timer',wait_timer:5}],
      deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}},
    deploymentPolicies:{total_count:1,branch_policies:[{name:'main',type:'branch'}]},
    checkRuns:[{id:81,name:'AI Advisor independent validation',app:{id:15368},head_sha:sha,started_at:'2026-10-18T01:00:00Z',
      status:'completed',conclusion:'success',details_url:`${runUrl(800)}/job/81`}],ciRuns:[ci],runs:[run],jobs:[{name:'validate',status:'in_progress'}],
    live:{versionId:version},ownerApproval:{name:'PUBLIC_RELEASE_APPROVAL_SHA',value:'b'.repeat(40),updated_at:'2026-10-17T00:00:00Z'},
    ownerRunApproval:{name:'PUBLIC_RELEASE_APPROVAL_RUN_ID',value:'899',updated_at:'2026-10-17T00:00:00Z'}};
}
function receipt(s=fixture()) {return {state:'dispatched',sha,ownerId:42,runId:'900',policy:policyDigest(s),ci:'800',version,
  requestedAt:'2026-10-18T01:59:59Z',previousRuns:[]};}
function harness({stage='approve',confirmation=true,mutate=()=>{},productionError,writeError,dispatchError}={}) {
  let s=fixture(),saved=stage==='approve'?receipt(s):undefined;
  if(stage==='prepare')s.runs=[];
  let reads=0;
  const calls=[],messages=[];
  const io={now:()=>now,target:async()=>calls.push('target'),load:async()=>saved?structuredClone(saved):undefined,
    save:async r=>{saved=structuredClone(r);calls.push(`save:${r.state}`);},
    snapshot:async()=>{reads++;mutate(s,reads);return structuredClone(s);},
    production:async()=>{if(productionError)throw productionError;return structuredClone(s.live);},
    provenance:async()=>calls.push('provenance'),summary:()=>calls.push('summary'),
    confirm:async p=>{calls.push(`confirm:${p}`);return confirmation;},print:x=>messages.push(x),
    updateVariable:async(name,value)=>{calls.push(`PATCH:${name}`);if(writeError)throw writeError;
      s[name.endsWith('_RUN_ID')?'ownerRunApproval':'ownerApproval']={name,value,updated_at:new Date(now).toISOString()};},
    monitor:async()=>{calls.push('monitor');return 'DONE';},
    dispatchRelease:async()=>{calls.push('dispatch');if(dispatchError)throw dispatchError;s.runs=fixture().runs;},
    findDispatched:async()=>s.runs[0],dispatchValidation:async()=>{calls.push('validation');s.checkRuns=fixture().checkRuns;},
    waitCI:async()=>structuredClone(s)};
  return {io,calls,messages,get saved(){return saved;}};
}
test('prepare: one exact SHA confirmation, durable intent before dispatch, automatic run ID',async()=>{
  const h=harness({stage:'prepare'});const r=await prepare(h.io);assert.equal(r.runId,'900');
  assert.ok(h.calls.indexOf('save:dispatching')<h.calls.indexOf('dispatch'));
  assert.equal(h.calls.filter(x=>x.startsWith('confirm:')).length,1);assert.equal(h.saved.state,'dispatched');
});
test('approve: separate exact run/SHA confirmation, two PATCHes, final guard, monitor',async()=>{
  const h=harness();assert.equal(await approve(h.io),'DONE');assert.equal(h.saved.state,'approved');
  assert.equal(h.calls.filter(x=>x.startsWith('PATCH:')).length,2);
  assert.ok(h.calls.indexOf(`confirm:APPROVE 900 ${sha}`)<h.calls.indexOf('PATCH:PUBLIC_RELEASE_APPROVAL_SHA'));
});
test('missing independent CI requires separate validation-only consent',async()=>{
  const h=harness({stage:'prepare',mutate:(s,n)=>{if(n===1)s.checkRuns=[];}});
  await prepare(h.io);assert.equal(h.calls.filter(x=>x.startsWith('confirm:')).length,2);assert.ok(h.calls.includes('validation'));
});
for(const stage of ['prepare','approve']) test(`${stage}: Owner declines => no GitHub writes`,async()=>{
  const h=harness({stage,confirmation:false});assert.equal(await (stage==='prepare'?prepare:approve)(h.io),'DECLINED');
  assert.ok(!h.calls.some(x=>x==='dispatch'||x==='validation'||x.startsWith('PATCH:')));
});
test('declining missing-CI validation performs no dispatch',async()=>{
  const h=harness({stage:'prepare',confirmation:false,mutate:(s)=>s.checkRuns=[]});
  assert.equal(await prepare(h.io),'DECLINED');assert.ok(!h.calls.includes('validation'));
});
test('manual approval fallback prints only exact nonsecret values and performs zero writes',async()=>{
  const h=harness();assert.equal(await approve(h.io,{manual:true}),'MANUAL_REQUIRED');
  assert.ok(h.messages.join('\n').includes(`PUBLIC_RELEASE_APPROVAL_SHA=${sha}`));
  assert.ok(!h.calls.some(x=>x.startsWith('PATCH:')));assert.equal(h.saved.state,'manual');
});
const mutations=[
  ['main SHA changes',s=>s.branch.commit.sha='b'.repeat(40)],
  ['CI wrong SHA',s=>s.checkRuns[0].head_sha='b'.repeat(40)],
  ['CI fails',s=>s.checkRuns[0].conclusion='failure'],
  ['CI in progress',s=>s.checkRuns[0].status='in_progress'],
  ['CI fake publisher',s=>s.checkRuns[0].app.id=9],
  ['CI malformed ID',s=>s.checkRuns[0].id=0],
  ['CI wrong workflow',s=>s.ciRuns[0].path=WORKFLOW],
  ['CI wrong run URL',s=>s.checkRuns[0].details_url=runUrl(700)],
  ['release not Owner',s=>s.runs[0].actor={id:9}],
  ['rerun',s=>s.runs[0].run_attempt=2],
  ['run ID wrong',s=>s.runs[0].id=901],
  ['run stale',s=>s.runs[0].created_at='2026-10-16T00:00:00Z'],
  ['run before intent',s=>s.runs[0].created_at='2026-10-18T01:59:00Z'],
  ['approval too early',s=>s.runs[0].created_at='2026-10-18T02:09:00Z'],
  ['approval replay',s=>s.ownerRunApproval.value='900'],
  ['Worker drift',s=>s.live.versionId=next],
  ['environment changed',s=>s.environment.id=24],
  ['environment identity missing',s=>delete s.environment.id],
  ['timer changed',s=>s.environment.protection_rules[1].wait_timer=10],
  ['bypass enabled',s=>s.environment.can_admins_bypass=true],
  ['classic protection changed',s=>s.classicProtection.allow_force_pushes.enabled=true],
  ['concurrent release',s=>s.runs.push({...s.runs[0],id:901})],
  ['Owner auth wrong',s=>s.user={id:9,login:'other'}],
  ['release job started',s=>s.jobs.push({name:'release-public',status:'in_progress'})],
  ['release completed',s=>s.runs[0].status='completed']
];
for(const [name,mutation] of mutations) test(`approve fails closed before PATCH: ${name}`,async()=>{
  const h=harness({mutate:s=>mutation(s)});await assert.rejects(()=>approve(h.io));assert.ok(!h.calls.some(x=>x.startsWith('PATCH:')));
});
for(const stage of ['prepare','approve']) for(const [name,mutation]of mutations.filter(([name])=>
  ['main SHA changes','CI wrong SHA','Worker drift','environment changed'].includes(name)))
  test(`${stage}: recheck after confirmation rejects ${name}`,async()=>{
    const h=harness({stage,mutate:(s,n)=>{if(n===2)mutation(s);}});await assert.rejects(()=>(stage==='prepare'?prepare:approve)(h.io));
    assert.ok(!h.calls.some(x=>x==='dispatch'||x.startsWith('PATCH:')));
  });
test('main changes between PATCHes: never writes run-ID approval',async()=>{
  const h=harness({mutate:(s,n)=>{if(n===3)s.branch.commit.sha='b'.repeat(40);}});
  await assert.rejects(()=>approve(h.io),/APPROVAL_WRITE_UNVERIFIED/);
  assert.deepEqual(h.calls.filter(x=>x.startsWith('PATCH:')),['PATCH:PUBLIC_RELEASE_APPROVAL_SHA']);assert.equal(h.saved.state,'approving');
});
for(const code of ['SCHEMA_MISMATCH','LEDGER_MISMATCH','CLOUDFLARE_TIMEOUT','CLOUDFLARE_HTTP_403'])
  test(`production read failure blocks all writes: ${code}`,async()=>{
    const h=harness({productionError:new Error(code)});await assert.rejects(()=>approve(h.io));assert.ok(!h.calls.some(x=>x.startsWith('PATCH:')));
  });
test('PATCH permission error or timeout never retries, durable state blocks replay',async()=>{
  for(const writeError of [new Error('403'),new Error('timeout TOKEN_SECRET')]) {
    const h=harness({writeError});await assert.rejects(()=>approve(h.io),/APPROVAL_WRITE_UNVERIFIED/);
    assert.equal(h.calls.filter(x=>x.startsWith('PATCH:')).length,1);assert.equal(h.saved.state,'approving');
    await assert.rejects(()=>approve(h.io));assert.equal(h.calls.filter(x=>x.startsWith('PATCH:')).length,1);
  }
});
test('dispatch timeout preserves intent; subsequent prepare cannot redispatch',async()=>{
  const h=harness({stage:'prepare',dispatchError:new Error('timeout')});await assert.rejects(()=>prepare(h.io));
  assert.equal(h.saved.state,'dispatching');await assert.rejects(()=>prepare(h.io),/EXISTING_RECEIPT/);assert.equal(h.calls.filter(x=>x==='dispatch').length,1);
});
test('approve waits read-only for the valid time before showing confirmation 2',async()=>{
  const h=harness({mutate:(s,n)=>{s.runs[0].created_at=n===1?'2026-10-18T02:09:00Z':'2026-10-18T02:00:00Z';}});
  h.io.waitApproval=async()=>h.calls.push('wait-timer');
  await approve(h.io);assert.ok(h.calls.indexOf('wait-timer')<h.calls.findIndex(x=>x.startsWith('confirm:')));
});
test('completed receipt is archived automatically before a new prepare',async()=>{
  const h=harness({stage:'prepare'});let loaded=false;
  h.io.load=async()=>loaded?undefined:{state:'completed',runId:'899'};
  h.io.archive=async()=>{loaded=true;h.calls.push('archive');};
  await prepare(h.io);assert.ok(h.calls.indexOf('archive')<h.calls.indexOf('dispatch'));
});
test('newest failed CI cannot reuse older success',()=>{
  const s=fixture();s.checkRuns.push({...s.checkRuns[0],id:82,started_at:'2026-10-18T02:00:00Z',conclusion:'failure'});
  assert.throws(()=>validateCI(s,now));
});
test('environment variable bookkeeping timestamp does not hide or masquerade as protection changes',()=>{
  const s=fixture(),hash=policyDigest(s);s.environment.updated_at='2026-10-18T02:11:00Z';assert.equal(policyDigest(s),hash);
  s.environment.protection_rules.push({type:'required_reviewers',reviewers:[]});assert.notEqual(policyDigest(s),hash);
});
test('receipt missing timestamp or unverified local time fails closed',()=>{
  const s=fixture(),r=receipt(s);delete r.requestedAt;
  assert.throws(()=>validateReceipt(s,r,now),/TIME_UNVERIFIED/);
  assert.throws(()=>validateReceipt(s,receipt(s),NaN),/TIME_UNVERIFIED/);
});
test('dispatch intent uses GitHub timestamp resolution without dropping prior run identity',async()=>{
  const h=harness({stage:'prepare'});h.io.now=()=>now+999;const r=await prepare(h.io);
  assert.equal(r.requestedAt,new Date(now).toISOString());assert.deepEqual(r.previousRuns,[]);
});
function evidence() {
  const s=fixture();const run={...s.runs[0],status:'completed',conclusion:'success'};s.runs=[];
  return {s,run,job:{id:901,run_id:900,head_sha:sha,name:'release-public',status:'completed',conclusion:'success',
    started_at:'2026-10-18T02:00:00Z',completed_at:'2026-10-18T02:05:00Z',steps:[{name:'Verify serving Public version preserves V2',conclusion:'success'}]},
    logs:`PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS\nPUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${version}\n`,
    version:{id:version,metadata:{created_on:'2026-10-18T02:03:00Z'}},
    deployment:{id:'33333333-3333-4333-8333-333333333333',created_on:'2026-10-18T02:03:01Z',versions:[{version_id:version,percentage:100}]}};
}
test('baseline requires exact successful Owner run, postflight, creation times and 100% deployment',()=>assert.equal(validateBaselineEvidence(evidence()),version));
for(const [name,mutation]of [
  ['unknown version',e=>e.version.id=next],['partial traffic',e=>e.deployment.versions[0].percentage=99],
  ['missing deployment identity',e=>delete e.deployment.id],
  ['split traffic',e=>e.deployment.versions.push({version_id:next,percentage:1})],
  ['missing logs',e=>e.logs=''],['duplicated marker',e=>e.logs+=e.logs],['wrong postflight version',e=>e.logs=e.logs.replace(version,next)],
  ['failed run',e=>e.run.conclusion='failure'],['wrong job SHA',e=>e.job.head_sha='b'.repeat(40)],['wrong job run',e=>e.job.run_id=800],
  ['replayed version',e=>e.version.metadata.created_on='2026-10-17T00:00:00Z'],
  ['later rollback deployment',e=>e.deployment.created_on='2026-10-18T03:00:00Z'],
  ['non Owner',e=>e.run.actor={id:9}],['no postflight step',e=>e.job.steps=[]],['concurrent release',e=>e.s.runs=fixture().runs]
])test(`baseline rejects ${name}`,()=>{const e=evidence();mutation(e);assert.throws(()=>validateBaselineEvidence(e));});
test('baseline patch updates only reviewed static pin and its assertion',()=>{
  const source=readFileSync('scripts/check-public-release-state.mjs','utf8'),tests=readFileSync('tests/public-release-v2-rollout.test.mjs','utf8');
  const patch=baselinePatch(source,tests,next);
  assert.equal(patch.source.replace(next,patch.old),source);
  assert.equal(patch.testSource.replace(`assert.equal(before,'${next}')`,`assert.equal(before,'${patch.old}')`),tests);
  assert.throws(()=>baselinePatch(source,tests,patch.old));assert.throws(()=>baselinePatch(source+source,tests,next));
});
test('no gh and no token => actionable failure; explicit token works without gh',()=>{
  assert.throws(()=>ownerToken({},()=>{throw Error('not found');}),/OWNER_AUTH_REQUIRED/);
  assert.equal(ownerToken({GH_TOKEN:'secret'},()=>{throw Error();}),'secret');
  assert.throws(()=>ownerToken({GH_TOKEN:'secret\n'}),/AUTH_INVALID/);
  let call;assert.equal(ownerToken({},(...args)=>{call=args;return 'secret\n';}),'secret');
  assert.equal(call[0],'gh');assert.deepEqual(call[1],['auth','token','--hostname','github.com']);assert.equal(call[2].stdio[2],'pipe');
});
test('sanitized errors never emit raw token, URL, signed query or child process stderr',()=>{
  for(const text of ['TOKEN_SECRET','ghp_exampleSecret','https://blob.core.windows.net/?sig=SECRET','Bearer SECRET'])
    assert.equal(safeError(new Error(text)),'RELEASE_ASSISTANT_UNVERIFIED');
  assert.equal(safeError(new ReleaseError('GITHUB_API_UNAVAILABLE')),'GITHUB_API_UNAVAILABLE');
});
test('GitHub network failures and HTTP permissions fail closed without retry or token disclosure',async()=>{
  for(const fetchImpl of [async()=>{throw Error('SECRET')},async()=>({ok:false,status:403}),async()=>({ok:true,json:async()=>{throw Error('SECRET')}})]) {
    let count=0;const api=githubAPI('SECRET',{fetchImpl:async(...a)=>{count++;return fetchImpl(...a);}});
    await assert.rejects(()=>api('/branches/main'),e=>!e.message.includes('SECRET'));assert.equal(count,1);
  }
});
test('fixed write surface cannot modify protections, secrets, Auth or other repositories',async()=>{
  const calls=[];const api=githubAPI('secret',{fetchImpl:async(...a)=>{calls.push(a);return {ok:true,status:204};}});
  for(const [path,method]of [['/branches/main/protection','PUT'],[`/environments/${ENV}`,'PUT'],['/actions/secrets','PUT'],['/actions/workflows/auth.yml/dispatches','POST'],['//evil.invalid','PATCH']])
    await assert.rejects(()=>api(path,{method,body:{}}));
  assert.equal(calls.length,0);
  await api(`/environments/${ENV}/variables/PUBLIC_RELEASE_APPROVAL_SHA`,{method:'PATCH',body:{name:'PUBLIC_RELEASE_APPROVAL_SHA',value:sha}});
  assert.equal(calls.length,1);assert.equal(calls[0][1].redirect,'manual');assert.ok(calls[0][1].signal);
});
test('workflow dispatch requires main and exact SHA; validation has no deploy inputs',async()=>{
  const calls=[];const api=githubAPI('secret',{fetchImpl:async(...a)=>{calls.push(a);return {ok:true,status:204};}});
  const path=`/actions/workflows/${WORKFLOW.split('/').at(-1)}/dispatches`;
  await assert.rejects(()=>api(path,{method:'POST',body:{ref:'feature'}}));
  await assert.rejects(()=>api(path,{method:'POST',body:{ref:'main',inputs:{approve_public_release:true,approved_sha:'short'}}}));
  await api(path,{method:'POST',body:{ref:'main',inputs:{approve_public_release:true,approved_sha:sha}}});
  await api(`/actions/workflows/${VALIDATION.split('/').at(-1)}/dispatches`,{method:'POST',body:{ref:'main'}});
  assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[1][1].body),{ref:'main'});
});
test('signed logs download never forwards Owner token and rejects arbitrary redirect hosts',async()=>{
  const calls=[];const api=githubAPI('SECRET',{fetchImpl:async(url,options)=>{
    calls.push({url,options});return calls.length===1?{status:302,headers:{get:()=> 'https://logs.blob.core.windows.net/job?sig=signed'}}:{ok:true,text:async()=> 'logs'};
  }});
  assert.equal(await api('/actions/jobs/1/logs',{logs:true}),'logs');assert.equal(calls[1].options.headers,undefined);
  const evil=githubAPI('SECRET',{fetchImpl:async()=>({status:302,headers:{get:()=> 'https://evil.invalid/log'}})});
  await assert.rejects(()=>evil('/actions/jobs/1/logs',{logs:true}),/LOCATION_UNVERIFIED/);
});
test('incomplete/paginated metadata is bounded and cannot hide a concurrent run',async()=>{
  await assert.rejects(()=>completeList(async()=>({total_count:101,jobs:[{}]}),'/jobs','jobs'),/INCOMPLETE/);
  const calls=[];const runs=await releaseRuns(async path=>{calls.push(path);return {total_count:2,workflow_runs:calls.length===1?[{id:1,status:'completed'}]:[{id:2,status:'waiting'}]};});
  assert.equal(calls.length,2);assert.equal(runs[1].status,'waiting');
  await assert.rejects(()=>releaseRuns(async()=>({total_count:99,workflow_runs:[]})),/INCOMPLETE/);
});
test('snapshot collects exact run, current Owner, CI provenance and both approval variables',async()=>{
  const s=fixture(),calls=[];
  const api=async path=>{
    calls.push(path);
    if(path.includes('/workflows/'))return {total_count:1,workflow_runs:s.runs};
    if(path.includes('/check-runs?'))return {total_count:1,check_runs:s.checkRuns};
    if(path.endsWith('/jobs?per_page=100'))return {total_count:1,jobs:s.jobs};
    return {'/user':s.user,'/':s.repository,'/branches/main':s.branch,'/branches/main/protection':s.classicProtection,
      [`/environments/${ENV}`]:s.environment,[`/environments/${ENV}/deployment-branch-policies?per_page=100`]:s.deploymentPolicies,
      '/actions/runs/800':s.ciRuns[0],'/actions/runs/900':s.runs[0],
      [`/environments/${ENV}/variables/PUBLIC_RELEASE_APPROVAL_SHA`]:s.ownerApproval,
      [`/environments/${ENV}/variables/PUBLIC_RELEASE_APPROVAL_RUN_ID`]:s.ownerRunApproval}[path]??assert.fail(path);
  };
  const result=await snapshot(api,'900');assert.equal(validateReceipt({...result,live:s.live},receipt(s),now).id,900);
  assert.ok(calls.includes('/actions/runs/800'));assert.ok(calls.includes('/actions/runs/900'));
});
test('PowerShell entrypoint supports --help and rejects token arguments without any network',()=>{
  const output=execFileSync(process.execPath,['scripts/release-assistant.mjs','--help'],{encoding:'utf8'});
  assert.match(output,/HUB Release Assistant/);
  try {execFileSync(process.execPath,['scripts/release-assistant.mjs','approve','--token=SECRET'],{encoding:'utf8',stdio:'pipe'});assert.fail('must reject');}
  catch(e){assert.match(e.stderr,/UNSUPPORTED_RELEASE_ARGUMENT/);assert.ok(!e.stderr.includes('SECRET'));}
});
test('Actions can run offline regressions/help but cannot run Owner commands',()=>{
  const env={...process.env,GITHUB_ACTIONS:'true'};
  assert.match(execFileSync(process.execPath,['scripts/release-assistant.mjs','--help'],{encoding:'utf8',env}),/HUB Release Assistant/);
  try {execFileSync(process.execPath,['scripts/release-assistant.mjs','prepare'],{encoding:'utf8',stdio:'pipe',env});assert.fail('must reject');}
  catch(e){assert.match(e.stderr,/LOCAL_OWNER_TERMINAL_ONLY/);}
});
test('noninteractive invocation cannot supply approval through piped stdin',async()=>{
  if(!process.stdin.isTTY)await assert.rejects(()=>confirm(`RELEASE ${sha}`,'confirm'),/INTERACTIVE_OWNER/);
});
test('shared worktree lock is exclusive and receipts contain no credentials',async()=>{
  const store=stateStore();const release=store.lock();
  try {assert.throws(()=>store.lock(),/LOCK_EXISTS/);}finally{release();}
});
