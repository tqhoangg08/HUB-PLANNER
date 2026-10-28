import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateReleaseApproval,readGitHubReleaseMetadata as readMetadata,verifyGitHubCIReadAccess,RELEASE_REPOSITORY,RELEASE_ENVIRONMENT,RELEASE_WORKFLOW,RELEASE_CHECK,VALIDATION_WORKFLOW} from '../scripts/check-public-release-approval.mjs';

const credentials={ciToken:'fixture-actions-read',metadataToken:'fixture-admin-env-read'};
const readGitHubReleaseMetadata=(c,options={})=>readMetadata(c,{...credentials,...options});

const fixture=()=>{
  const sha='a'.repeat(40),runId='1234',owner={id:42,login:'solo',type:'User'};
  return {sha,head:sha,event:'workflow_dispatch',ref:'refs/heads/main',runId,attempt:'1',actorId:'42',triggeringActor:'solo',
    workflowRef:`${RELEASE_REPOSITORY}/${RELEASE_WORKFLOW}@refs/heads/main`,now:Date.parse('2026-10-11T12:10:00Z'),
    repository:{full_name:RELEASE_REPOSITORY,default_branch:'main',owner},
    branch:{name:'main',protected:true,commit:{sha}},
    run:{id:1234,run_attempt:1,event:'workflow_dispatch',path:RELEASE_WORKFLOW,head_sha:sha,head_branch:'main',actor:{...owner},triggering_actor:{...owner},repository:{full_name:RELEASE_REPOSITORY},created_at:'2026-10-11T12:00:00Z'},
    environment:{name:RELEASE_ENVIRONMENT,can_admins_bypass:false,deployment_branch_policy:{protected_branches:false,custom_branch_policies:true},protection_rules:[{type:'wait_timer',wait_timer:5},{type:'branch_policy'}]},
    deploymentPolicies:{total_count:1,branch_policies:[{name:'main',type:'branch'}]},
    classicProtection:{enforce_admins:{enabled:true},allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},required_pull_request_reviews:{required_approving_review_count:0},required_status_checks:{strict:true,checks:[{context:RELEASE_CHECK,app_id:15368}]}},
    ownerApproval:{name:'PUBLIC_RELEASE_APPROVAL_SHA',value:sha,updated_at:'2026-10-11T12:01:00Z'},
    ownerRunApproval:{name:'PUBLIC_RELEASE_APPROVAL_RUN_ID',value:runId,updated_at:'2026-10-11T12:01:00Z'},
    ciRuns:[{id:5678,path:VALIDATION_WORKFLOW,head_sha:sha,head_branch:'main',event:'workflow_dispatch',repository:{full_name:RELEASE_REPOSITORY},status:'completed',conclusion:'success'}],
    checkRuns:[{id:99,started_at:'2026-10-11T12:00:00Z',details_url:`https://github.com/${RELEASE_REPOSITORY}/actions/runs/5678/job/99`,name:RELEASE_CHECK,head_sha:sha,app:{id:15368},status:'completed',conclusion:'success'}]};
};
const set=(c,path,value)=>{const keys=path.split('.');let t=c;for(const k of keys.slice(0,-1))t=t[k];t[keys.at(-1)]=value;};

test('explicit solo owner can release without a fake second reviewer when all independent layers exist',()=>{
  assert.equal(validateReleaseApproval(fixture()),true);
});
const invalid=[
  ['event','push'],['ref','refs/heads/feature'],['sha','main'],['head','b'.repeat(40)],['branch.commit.sha','b'.repeat(40)],
  ['branch.name','other'],['repository.full_name','fork/HUB-PLANNER'],['repository.default_branch','dev'],['repository.owner.type','Organization'],
  ['run.head_sha','b'.repeat(40)],['run.head_branch','feature'],['run.repository.full_name','fork/HUB-PLANNER'],['run.event','push'],
  ['run.path','.github/workflows/other.yml'],['run.id',999],['run.actor.id',9],['run.triggering_actor.id',9],['actorId','9'],['triggeringActor','other'],
  ['attempt','2'],['run.run_attempt',2],['workflowRef',`${RELEASE_REPOSITORY}/${RELEASE_WORKFLOW}@refs/heads/feature`],
  ['environment.name','other'],['environment.can_admins_bypass',true],['environment.can_admins_bypass',undefined],
  ['environment.protection_rules',[{type:'branch_policy'}]],['environment.protection_rules',[{type:'branch_policy'},{type:'wait_timer',wait_timer:4}]],
  ['environment.protection_rules',[{type:'branch_policy'},{type:'wait_timer',wait_timer:'5'}]],
  ['environment.protection_rules',[{type:'wait_timer',wait_timer:5}]],
  ['environment.deployment_branch_policy.custom_branch_policies',false],['environment.deployment_branch_policy.protected_branches',true],
  ['deploymentPolicies.total_count',2],['deploymentPolicies.branch_policies',[{name:'*',type:'branch'}]],['deploymentPolicies.branch_policies',[{name:'main',type:'tag'}]],
  ['branch.protected',false],['classicProtection.enforce_admins.enabled',false],['classicProtection.allow_force_pushes.enabled',true],
  ['classicProtection',undefined],['classicProtection',null],['classicProtection',{}],
  ['classicProtection.enforce_admins',undefined],['classicProtection.allow_force_pushes',undefined],['classicProtection.allow_deletions',undefined],
  ['classicProtection.allow_deletions.enabled',true],['classicProtection.required_pull_request_reviews',null],
  ['classicProtection.required_status_checks.strict',false],['classicProtection.required_status_checks.checks',[]],
  ['classicProtection.required_status_checks.checks',[{context:RELEASE_CHECK,app_id:-1}]],
  ['ownerApproval',undefined],['ownerApproval.name','CLIENT_SHA'],['ownerApproval.value','b'.repeat(40)],
  ['ownerApproval.updated_at','2026-10-11T11:59:59Z'],['ownerApproval.updated_at','2026-10-11T12:11:00Z'],['ownerApproval.updated_at','bad'],
  ['ownerRunApproval.value','1233'],['ownerRunApproval',undefined],['run.created_at','bad'],['now',NaN],
  ['checkRuns',[]],['checkRuns.0.conclusion','failure'],['checkRuns.0.status','queued'],['checkRuns.0.head_sha','b'.repeat(40)],['checkRuns.0.app.id',7],
  ['ciRuns',[]],['ciRuns.0.path','.github/workflows/fake.yml'],['ciRuns.0.head_branch','other'],['ciRuns.0.head_sha','b'.repeat(40)],
  ['ciRuns.0.repository.full_name','fork/HUB-PLANNER'],['ciRuns.0.event','push'],['ciRuns.0.conclusion','failure'],['checkRuns.0.details_url','https://attacker.invalid/'],
  ['checkRuns.0.started_at','bad'],['checkRuns.0.started_at','2026-10-11T12:11:00Z'],
  ['now',Date.parse('2026-10-11T12:04:00Z')]
];
for(const [path,value]of invalid)test(`solo approval fails closed: ${path}=${String(value)}`,()=>{const c=fixture();set(c,path,value);assert.throws(()=>validateReleaseApproval(c));});
test('old approvals expire and bypass-shaped caller fields do not remove any layer',()=>{
  const c=fixture();c.now+=86400001;assert.throws(()=>validateReleaseApproval(c));
  const d=fixture();d.ownerApproval=undefined;Object.assign(d,{requireOwner:false,skipGuard:true,mode:'unsafe',ownerSha:d.sha});assert.throws(()=>validateReleaseApproval(d));
});
test('a newer failed or in-progress validation cannot reuse an older successful receipt',()=>{
 for(const [status,conclusion]of [['completed','failure'],['in_progress',null]]){
  const c=fixture();c.checkRuns.push({...c.checkRuns[0],id:100,started_at:'2026-10-11T12:05:00Z',status,conclusion});
  assert.throws(()=>validateReleaseApproval(c),/EXACT_SHA_CI_REQUIRED/);
 }
});

const ruleFixture=()=>{
 const c=fixture();delete c.classicProtection;
 const rules=[{type:'deletion'},{type:'non_fast_forward'},{type:'pull_request',parameters:{required_approving_review_count:0}},
   {type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:[{context:RELEASE_CHECK,integration_id:15368}]}}];
 c.rulesets=[{id:7,target:'branch',source:RELEASE_REPOSITORY,source_type:'Repository',enforcement:'active',bypass_actors:[],conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},rules}];
 c.effectiveRules=rules.map(r=>({...r,ruleset_id:7}));return c;
};
test('even an active no-bypass ruleset cannot substitute for read-verifiable classic protection',()=>assert.throws(()=>validateReleaseApproval(ruleFixture()),/MAIN_CLASSIC_PROTECTION_REQUIRED/));
for(const [path,value]of [
 ['rulesets.0.enforcement','disabled'],['rulesets.0.enforcement','evaluate'],['rulesets.0.bypass_actors',[{actor_type:'RepositoryRole',actor_id:5}]],
 ['rulesets.0.bypass_actors',undefined],['rulesets.0.conditions.ref_name.exclude',['refs/heads/main']],['rulesets.0.conditions.ref_name.include',['refs/heads/other']],
 ['rulesets.0.rules',[]],['effectiveRules',[]],['rulesets.0.rules.3.parameters.strict_required_status_checks_policy',false],
 ['rulesets.0.rules.3.parameters.required_status_checks',[{context:RELEASE_CHECK,integration_id:999}]]
])test(`ruleset-only configuration cannot replace classic protection: ${path}`,()=>{const c=ruleFixture();set(c,path,value);assert.throws(()=>validateReleaseApproval(c),/MAIN_CLASSIC_PROTECTION_REQUIRED/);});

function fakeApi(c,override=()=>undefined){
 const calls=[];
 const fn=async(url,options)=>{
   calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
   const path=new URL(url).pathname.replace(`/repos/${RELEASE_REPOSITORY}`,'');
   const protectedPath=path==='/branches/main/protection'||path.startsWith(`/environments/${RELEASE_ENVIRONMENT}/variables/`);
   if(options.headers.Authorization!==`Bearer ${protectedPath?credentials.metadataToken:credentials.ciToken}`)
     return {ok:false,status:403}; // Simulate endpoint permission separation, no cross-token recovery.
   const forced=override(path,options);if(forced)return forced;
   const data={'':c.repository,'/branches/main':c.branch,[`/actions/runs/${c.runId}`]:c.run,[`/environments/${RELEASE_ENVIRONMENT}`]:c.environment,
     [`/environments/${RELEASE_ENVIRONMENT}/deployment-branch-policies`]:c.deploymentPolicies,'/rules/branches/main':c.effectiveRules||[],
     '/branches/main/protection':c.classicProtection,[`/environments/${RELEASE_ENVIRONMENT}/variables/PUBLIC_RELEASE_APPROVAL_SHA`]:c.ownerApproval,
     [`/environments/${RELEASE_ENVIRONMENT}/variables/PUBLIC_RELEASE_APPROVAL_RUN_ID`]:c.ownerRunApproval,
     [`/commits/${c.sha}/check-runs`]:{total_count:c.checkRuns.length,check_runs:c.checkRuns},'/rulesets/7':c.rulesets?.[0],'/actions/runs/5678':c.ciRuns?.[0]}[path];
   assert.notEqual(data,undefined,`unexpected metadata path ${path}`);return {ok:true,json:async()=>data};
 };return {calls,fn};
}
test('final metadata comes from fixed environment/API; all network operations are read-only',async()=>{
 const c=fixture(),a=fakeApi(c);const result=await readGitHubReleaseMetadata(c,{fetchImpl:a.fn});assert.equal(validateReleaseApproval(result),true);
 assert.ok(a.calls.some(x=>x.url.includes('/variables/PUBLIC_RELEASE_APPROVAL_SHA')));
 assert.equal(a.calls.filter(x=>x.url.endsWith('/branches/main/protection')).length,2);
 assert.ok(a.calls.every(x=>!x.url.includes('/rulesets/')&&!x.url.includes('/rules/branches/')));
});
test('PAT is confined to protection/approval variables; GITHUB_TOKEN handles Checks and workflow provenance',async()=>{
 const c=fixture(),a=fakeApi(c);assert.equal(validateReleaseApproval(await readGitHubReleaseMetadata(c,{fetchImpl:a.fn})),true);
 const patCalls=a.calls.filter(x=>x.options.headers.Authorization===`Bearer ${credentials.metadataToken}`);
 assert.equal(patCalls.length,4); // Two protection reads plus two owner variables.
 assert.ok(patCalls.every(x=>x.url.endsWith('/branches/main/protection')||x.url.includes('/variables/PUBLIC_RELEASE_APPROVAL_')));
 assert.ok(a.calls.filter(x=>x.url.includes('/check-runs')||x.url.includes('/actions/runs/')).every(x=>x.options.headers.Authorization===`Bearer ${credentials.ciToken}`));
});
for(const missing of ['ciToken','metadataToken'])test(`missing ${missing} blocks before any API request`,async()=>{
 const a=fakeApi(fixture());await assert.rejects(()=>readMetadata(fixture(),{...credentials,[missing]:undefined,fetchImpl:a.fn}),/GITHUB_READ_TOKEN_REQUIRED/);
 assert.equal(a.calls.length,0);
});
test('the old single-token option and identical credentials cannot silently replace separation',async()=>{
 const a=fakeApi(fixture());
 await assert.rejects(()=>readMetadata(fixture(),{token:credentials.metadataToken,fetchImpl:a.fn}),/GITHUB_READ_TOKEN_REQUIRED/);
 await assert.rejects(()=>readMetadata(fixture(),{ciToken:credentials.ciToken,metadataToken:credentials.ciToken,fetchImpl:a.fn}),/DISTINCT_READ_CREDENTIALS_REQUIRED/);
 assert.equal(a.calls.length,0);
});
for(const patch of [{ciToken:credentials.metadataToken},{metadataToken:credentials.ciToken},{ciToken:credentials.metadataToken,metadataToken:credentials.ciToken}])
test(`wrong credential role blocks without retry: ${Object.keys(patch).join(',')}`,async()=>{
 const a=fakeApi(fixture());await assert.rejects(()=>readMetadata(fixture(),{...credentials,...patch,fetchImpl:a.fn}),/DISTINCT_READ_CREDENTIALS_REQUIRED|GITHUB_METADATA_HTTP_403/);
 assert.ok(a.calls.length<=5); // Initial parallel reads only; no alternate-token retry.
});
for(const status of [401,403,404])test(`Checks HTTP ${status} fails closed without PAT/anonymous fallback`,async()=>{
 const c=fixture(),a=fakeApi(c,p=>p.endsWith('/check-runs')?{ok:false,status}:undefined);
 await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:a.fn}),new RegExp(`GITHUB_METADATA_HTTP_${status}`));
 const attempts=a.calls.filter(x=>x.url.includes('/check-runs'));assert.equal(attempts.length,1);
 assert.equal(attempts[0].options.headers.Authorization,`Bearer ${credentials.ciToken}`);
});
test('preflight uses only GITHUB_TOKEN and does not acquire or substitute a PAT',async()=>{
 const c=fixture(),a=fakeApi(c);await readMetadata(c,{ciToken:credentials.ciToken,fetchImpl:a.fn,preflight:true});
 assert.ok(a.calls.every(x=>x.options.headers.Authorization===`Bearer ${credentials.ciToken}`));
 assert.ok(a.calls.every(x=>!x.url.includes('/protection')&&!x.url.includes('/variables/')&&!x.url.includes('/check-runs')));
});
test('real-CI read probe reuses Checks reader and validates exact SHA, Actions publisher and run provenance',async()=>{
 const c=fixture(),a=fakeApi(c);
 assert.equal(await verifyGitHubCIReadAccess({sha:c.sha,runId:'5678',event:'workflow_dispatch'},{ciToken:credentials.ciToken,fetchImpl:a.fn}),true);
 assert.equal(a.calls.length,2);
 assert.ok(a.calls.every(x=>x.options.headers.Authorization===`Bearer ${credentials.ciToken}`));
});
for(const [path,value]of [['checkRuns.0.head_sha','b'.repeat(40)],['checkRuns.0.app.id',7],['checkRuns.0.details_url','https://attacker.invalid'],
 ['ciRuns.0.head_sha','b'.repeat(40)],['ciRuns.0.path','.github/workflows/fake.yml'],['ciRuns.0.repository.full_name','fork/repo'],['ciRuns.0.event','push']])
test(`CI credential probe rejects forged metadata: ${path}`,async()=>{
 const c=fixture();set(c,path,value);const a=fakeApi(c);
 await assert.rejects(()=>verifyGitHubCIReadAccess({sha:c.sha,runId:'5678',event:'workflow_dispatch'},{ciToken:credentials.ciToken,fetchImpl:a.fn}),/EXACT_SHA_CI_REQUIRED|CI_PROBE_PROVENANCE_REQUIRED/);
});
test('CI credential probe rejects missing permission and incomplete metadata without release approval',async()=>{
 const c=fixture();
 for(const forced of [{ok:false,status:403},{ok:true,json:async()=>({total_count:2,check_runs:c.checkRuns})},{ok:true,json:async()=>({check_runs:c.checkRuns})}]){
  const a=fakeApi(c,p=>p.endsWith('/check-runs')?forced:undefined);
  await assert.rejects(()=>verifyGitHubCIReadAccess({sha:c.sha,runId:'5678',event:'workflow_dispatch'},{ciToken:credentials.ciToken,fetchImpl:a.fn}),/GITHUB_METADATA_HTTP_403|CI_METADATA_INCOMPLETE/);
 }
});
for(const status of [401,403,404])test(`classic protection HTTP ${status} blocks even with an active main ruleset`,async()=>{
 const c=ruleFixture(),a=fakeApi(c,p=>p==='/branches/main/protection'?{ok:false,status}:undefined);
 await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:a.fn}),new RegExp(`GITHUB_METADATA_HTTP_${status}`));
 assert.ok(a.calls.every(x=>!x.url.includes('/rulesets/')));
});
for(const path of [`/environments/${RELEASE_ENVIRONMENT}/variables/PUBLIC_RELEASE_APPROVAL_SHA`,`/environments/${RELEASE_ENVIRONMENT}/variables/PUBLIC_RELEASE_APPROVAL_RUN_ID`,`/actions/runs/5678`])
test(`insufficient read permission at ${path} blocks`,async()=>{
 const c=fixture(),a=fakeApi(c,p=>p===path?{ok:false,status:403}:undefined);
 await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:a.fn}),/GITHUB_METADATA_HTTP_403/);
});
for(const status of [401,403,404,429,500])test(`metadata HTTP ${status} always blocks`,async()=>{
 const c=fixture(),a=fakeApi(c,()=>({ok:false,status,json:async()=>({value:c.sha})}));await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:a.fn}),/GITHUB_METADATA_HTTP/);
});
test('network failure, malformed JSON and truncated check metadata block',async()=>{
 const c=fixture();await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:async()=>{throw Error('private provider body')}}),/UNAVAILABLE/);
 await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:async()=>({ok:true,json:async()=>{throw Error('bad')}})}),/MALFORMED/);
 const a=fakeApi(c,p=>p.endsWith('/check-runs')?{ok:true,json:async()=>({total_count:101,check_runs:c.checkRuns})}:undefined);
 await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:a.fn}),/CI_METADATA_INCOMPLETE/);
});
test('preflight is not approval and cannot substitute for final owner/rules checks',async()=>{
 const c=fixture(),a=fakeApi(c);const partial=await readGitHubReleaseMetadata(c,{fetchImpl:a.fn,preflight:true});
 // The real CLI passes trusted context only, not fixture approval/protection objects.
 delete partial.ownerApproval;delete partial.classicProtection;assert.throws(()=>validateReleaseApproval(partial));
});
test('main moving during API reads or unknown CI URL blocks instead of approving stale metadata',async()=>{
 const c=fixture();let reads=0;
 const a=fakeApi(c,p=>p==='/branches/main'&&++reads>1?{ok:true,json:async()=>({...c.branch,commit:{sha:'b'.repeat(40)}})}:undefined);
 await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:a.fn}),/EXACT_MAIN/);
 c.checkRuns[0].details_url='https://attacker.invalid/token';const b=fakeApi(c);
 await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:b.fn}),/CI_PROVENANCE/);
});
test('protection removed or admin bypass added during metadata reads blocks',async()=>{
 const c=fixture();let reads=0;
 const a=fakeApi(c,p=>p==='/branches/main/protection'&&++reads>1?{ok:true,json:async()=>({...c.classicProtection,enforce_admins:{enabled:false}})}:undefined);
 await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:a.fn}),/MAIN_PROTECTION_CHANGED/);
});
test('hidden or explicit ruleset bypass cannot rescue absent/invalid classic protection',()=>{
 for(const bypass of [undefined,[],[{actor_type:'RepositoryRole',actor_id:5}]]){
  const c=ruleFixture();c.rulesets[0].bypass_actors=bypass;
  assert.throws(()=>validateReleaseApproval(c),/MAIN_CLASSIC_PROTECTION_REQUIRED/);
  c.classicProtection={...fixture().classicProtection,enforce_admins:{enabled:false}};
  assert.throws(()=>validateReleaseApproval(c),/MAIN_CLASSIC_PROTECTION_REQUIRED/);
 }
});
test('classic authority works alongside extra rulesets without claiming their hidden bypass is empty',async()=>{
 for(const bypass of [undefined,[{actor_type:'RepositoryRole',actor_id:5}]]){
  const c=ruleFixture();c.rulesets[0].bypass_actors=bypass;c.classicProtection=fixture().classicProtection;
  const a=fakeApi(c);assert.equal(validateReleaseApproval(await readGitHubReleaseMetadata(c,{fetchImpl:a.fn})),true);
  assert.equal(c.rulesets[0].bypass_actors,bypass);
  assert.ok(a.calls.every(x=>!x.url.includes('/rulesets/')&&!x.url.includes('/rules/branches/')));
 }
});
test('unexpected classic named bypass or incomplete allowance metadata is rejected',()=>{
 for(const allowances of [null,{}, {users:[],teams:[]},...['users','teams','apps'].map(k=>({users:[],teams:[],apps:[],[k]:[{id:7}]}))]){
  const c=fixture();c.classicProtection.required_pull_request_reviews.bypass_pull_request_allowances=allowances;
  assert.throws(()=>validateReleaseApproval(c),/MAIN_CLASSIC_BYPASS_UNVERIFIED/);
 }
 const c=fixture();c.classicProtection.required_pull_request_reviews.bypass_pull_request_allowances={users:[],teams:[],apps:[]};
 assert.equal(validateReleaseApproval(c),true);
});
test('missing classic settings returned with HTTP 200 fail closed before approval metadata',async()=>{
 const c=fixture(),a=fakeApi(c,p=>p==='/branches/main/protection'?{ok:true,json:async()=>({enforce_admins:{enabled:true}})}:undefined);
 await assert.rejects(()=>readGitHubReleaseMetadata(c,{fetchImpl:a.fn}),/MAIN_CLASSIC_PROTECTION_REQUIRED/);
 assert.ok(a.calls.every(x=>!x.url.includes('/variables/')));
});
test('unsupported CLI bypass flags fail before network access',()=>{
 for(const flag of ['--skip-guard','--require-owner-sha','--solo-owner','--force']){
  const r=spawnSync(process.execPath,['scripts/check-public-release-approval.mjs',flag],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/UNSUPPORTED_APPROVAL_ARGUMENT/);
 }
});
test('release workflow uses final guard without bypass immediately before Public-only deploy',()=>{
 const y=readFileSync('.github/workflows/deploy-cloudflare-production.yml','utf8');const release=y.split('  release-public:')[1];
 assert.match(release,/RELEASE_GITHUB_READ_TOKEN: \$\{\{ secrets.PUBLIC_RELEASE_GITHUB_READ_TOKEN \}\}/);
 assert.match(release,/GH_TOKEN: \$\{\{ github.token \}\}/);
 assert.match(release,/permissions:\s+contents: read\s+actions: read\s+checks: read/);
 assert.doesNotMatch(y,/\b(?:contents|actions|checks|administration|environments): write/);
 assert.doesNotMatch(release,/--preflight|--require-owner|vars.PUBLIC_RELEASE_APPROVAL_SHA|migrations apply|wrangler.auth/);
 assert.match(release,/run: node scripts\/check-public-release-approval.mjs\s+- name: Deploy Public/);
 assert.doesNotMatch(y,/skip_guard:|bypass:|approval_mode:|solo_owner:/);
});
test('independent CI checks real short-lived token access without PAT, settings writes or deployment',()=>{
 const y=readFileSync('.github/workflows/ai-advisor-pr-validation.yml','utf8');
 assert.match(y,/permissions:\s+contents: read\s+actions: read\s+checks: read/);
 assert.match(y,/GH_TOKEN: \$\{\{ github.token \}\}/);assert.match(y,/node scripts\/check-github-ci-read-access.mjs/);
 assert.doesNotMatch(y,/secrets\.|: write|pull_request_target|wrangler/);
});

test('GitHub Environment owner review authorizes exact run without local CLI or variable approvals',()=>{
  const c=fixture(),owner=c.repository.owner;
  c.environment.id=23;
  c.environment.prevent_self_review=false;
  c.environment.protection_rules.push({type:'required_reviewers',reviewers:[{type:'User',reviewer:{...owner}}]});
  delete c.ownerApproval;delete c.ownerRunApproval;
  c.reviewHistory=[{state:'approved',user:{...owner},environments:[{id:23,name:RELEASE_ENVIRONMENT}]}];
  assert.equal(validateReleaseApproval(c),true);
  for(const change of [
    x=>x.reviewHistory=[],
    x=>x.reviewHistory[0].state='rejected',
    x=>x.reviewHistory[0].user.id=7,
    x=>x.reviewHistory[0].environments[0].id=24,
    x=>x.environment.prevent_self_review=true,
    x=>x.environment.protection_rules.at(-1).reviewers.push({type:'User',reviewer:{id:10,login:'other',type:'User'}}),
    x=>x.environment.protection_rules.at(-1).reviewers[0].reviewer.login='other',
    x=>x.environment.protection_rules.push({type:'required_reviewers',reviewers:[{type:'User',reviewer:{...owner}}]}),
  ]){
    const bad=structuredClone(c);change(bad);
    assert.throws(()=>validateReleaseApproval(bad));
  }
});
test('GitHub review metadata is read via Actions token; approval variables are not requested',async()=>{
  const c=fixture(),owner=c.repository.owner;
  c.environment.id=23;c.environment.prevent_self_review=false;
  c.environment.protection_rules.push({type:'required_reviewers',reviewers:[{type:'User',reviewer:{...owner}}]});
  c.reviewHistory=[{state:'approved',user:{...owner},environments:[{id:23,name:RELEASE_ENVIRONMENT}]}];
  const calls=[],base=fakeApi(c);
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/actions/runs/1234/approvals')){
      assert.equal(options.headers.Authorization,'Bearer '+credentials.ciToken);
      return {ok:true,json:async()=>c.reviewHistory};
    }
    return base.fn(url,options);
  };
  const result=await readGitHubReleaseMetadata(c,{fetchImpl});
  assert.equal(validateReleaseApproval(result),true);
  assert.ok(calls.some(x=>x.url.endsWith('/actions/runs/1234/approvals')));
  assert.ok(!base.calls.some(x=>x.url.includes('/variables/PUBLIC_RELEASE_APPROVAL_')));
});
