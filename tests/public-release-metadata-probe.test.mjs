import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

// Test the exact embedded workflow code, not a duplicate implementation.
const workflow = readFileSync(new URL('../.github/workflows/public-release-metadata-probe.yml', import.meta.url), 'utf8').replace(/\r\n/g,'\n');
const embedded = workflow.split("node --input-type=module <<'PROBE'\n")[1]?.split('\n          PROBE')[0];
assert.ok(embedded, 'probe heredoc must exist');
const code = embedded.split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
const {probe} = await import(`data:text/javascript;base64,${Buffer.from(code.split('// Runner entrypoint:')[0]).toString('base64')}`);
const now = Date.parse('2026-10-11T03:00:00Z');
const sha = 'a'.repeat(40), repo = 'tqhoangg08/HUB-PLANNER', path = '.github/workflows/public-release-metadata-probe.yml';
const context = () => ({repository:repo, event:'workflow_dispatch', ref:'refs/heads/main', sha, runId:'123', attempt:'1',
  actor:'tqhoangg08', actorId:'42', triggeringActor:'tqhoangg08', workflowRef:`${repo}/${path}@refs/heads/main`});
const fixtures = () => ({
  '': {full_name:repo, default_branch:'main', owner:{type:'User', login:'tqhoangg08', id:42}},
  '/branches/main': {name:'main', protected:true, commit:{sha}},
  '/actions/runs/123': {id:123, run_attempt:1, status:'in_progress', event:'workflow_dispatch', head_branch:'main', head_sha:sha, path,
    repository:{full_name:repo}, actor:{id:42,login:'tqhoangg08'}, triggering_actor:{id:42,login:'tqhoangg08'}, workflow_id:5,
    created_at:'2026-10-11T02:54:00Z'},
  '/actions/workflows/public-release-metadata-probe.yml': {id:5, path, state:'active'},
  '/environments/public-production': {name:'public-production', can_admins_bypass:false,
    deployment_branch_policy:{protected_branches:false,custom_branch_policies:true},
    protection_rules:[{type:'branch_policy'}, {type:'wait_timer',wait_timer:5}]},
  '/environments/public-production/deployment-branch-policies?per_page=100': {total_count:1,branch_policies:[{name:'main',type:'branch'}]},
  '/branches/main/protection': {enforce_admins:{enabled:true},allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},
    required_pull_request_reviews:{required_approving_review_count:0},
    required_status_checks:{strict:true,checks:[{context:'AI Advisor independent validation',app_id:15368}]}},
  '/environments/public-production/variables?per_page=100': {total_count:0,variables:[]}
});
const variable = name => ({name,value:'DO_NOT_OUTPUT_THIS_VALUE',created_at:'2026-10-10T00:00:00Z',updated_at:'2026-10-10T00:00:00Z'});
function harness(data = fixtures(), override) {
  const calls=[];
  return {calls, options:{now,ciToken:'short-lived-ci-fixture',metadataToken:'read-only-pat-fixture',fetchImpl:async(url,options)=>{
    const suffix=url.replace(`https://api.github.com/repos/${repo}`,'');
    calls.push({suffix,options});
    if (override) {const result=await override(suffix,calls,options); if(result)return result;}
    assert.ok(Object.hasOwn(data,suffix), `unexpected endpoint ${suffix}`);
    return Response.json(data[suffix]);
  }}};
}

test('valid protected owner probe passes while approval variables absent: not release approval',async()=>{
  const h=harness(); assert.deepEqual(await probe(context(),h.options),{approvalVariablesPresent:false});
  for(const call of h.calls){
    assert.equal(call.options.method,'GET'); assert.equal(call.options.redirect,'error');
    assert.ok(call.options.signal instanceof AbortSignal);
    const pat=call.suffix==='/branches/main/protection'||call.suffix.includes('/variables');
    assert.equal(call.options.headers.Authorization,`Bearer ${pat?h.options.metadataToken:h.options.ciToken}`);
  }
  assert.equal(h.calls.filter(c=>c.options.headers.Authorization.includes('read-only-pat-fixture')).length,3);
  assert.ok(h.calls.findIndex(c=>c.suffix==='/branches/main/protection')>=6,'verify provenance/environment before PAT reads');
});
test('reads each existing approval variable with PAT without interpreting its value as approval',async()=>{
  const f=fixtures(), names=['PUBLIC_RELEASE_APPROVAL_SHA','PUBLIC_RELEASE_APPROVAL_RUN_ID'];
  f['/environments/public-production/variables?per_page=100']={total_count:2,variables:names.map(variable)};
  for(const name of names)f[`/environments/public-production/variables/${name}`]=variable(name);
  const h=harness(f); assert.deepEqual(await probe(context(),h.options),{approvalVariablesPresent:true});
  assert.equal(h.calls.filter(c=>c.suffix.includes('/variables/')).length,2);
});
test('unrelated variables do not count as release approval metadata',async()=>{
  const f=fixtures();f['/environments/public-production/variables?per_page=100']={total_count:1,variables:[variable('OTHER')]};
  assert.deepEqual(await probe(context(),harness(f).options),{approvalVariablesPresent:false});
});

for(const [field,value] of Object.entries({repository:'other/repo',event:'pull_request_target',ref:'refs/pull/1/merge',sha:'invalid',runId:'123/evil',
  attempt:'2',actor:'attacker',actorId:'invalid',triggeringActor:'attacker',workflowRef:`${repo}/${path}@refs/heads/feature`})){
  test(`untrusted context ${field} is rejected before any API call`,async()=>{
    const h=harness();await assert.rejects(probe({...context(),[field]:value},h.options));assert.equal(h.calls.length,0);
  });
}
for(const [label,change] of [
  ['owner mismatch',f=>f[''].owner.id=43], ['organization owner',f=>f[''].owner.type='Organization'],
  ['default branch mismatch',f=>f[''].default_branch='develop'], ['unprotected branch',f=>f['/branches/main'].protected=false],
  ['live SHA changed',f=>f['/branches/main'].commit.sha='b'.repeat(40)],
  ['run SHA mismatch',f=>f['/actions/runs/123'].head_sha='b'.repeat(40)],
  ['wrong run path',f=>f['/actions/runs/123'].path='.github/workflows/other.yml'],
  ['wrong run actor',f=>f['/actions/runs/123'].actor.id=43],
  ['missing triggering actor',f=>delete f['/actions/runs/123'].triggering_actor],
  ['rerun',f=>f['/actions/runs/123'].run_attempt=2],
  ['stale completed run',f=>f['/actions/runs/123'].status='completed'],
  ['wrong workflow ID',f=>f['/actions/runs/123'].workflow_id=9],
  ['disabled probe',f=>f['/actions/workflows/public-release-metadata-probe.yml'].state='disabled_manually'],
  ['wait not elapsed',f=>f['/actions/runs/123'].created_at='2026-10-11T02:59:00Z'],
  ['missing creation time',f=>delete f['/actions/runs/123'].created_at],
  ['environment bypass',f=>f['/environments/public-production'].can_admins_bypass=true],
  ['missing bypass metadata',f=>delete f['/environments/public-production'].can_admins_bypass],
  ['short wait',f=>f['/environments/public-production'].protection_rules[1].wait_timer=4],
  ['missing wait',f=>f['/environments/public-production'].protection_rules.pop()],
  ['tag policy',f=>f['/environments/public-production/deployment-branch-policies?per_page=100'].branch_policies[0].type='tag'],
  ['wildcard policy',f=>f['/environments/public-production/deployment-branch-policies?per_page=100'].branch_policies[0].name='*'],
  ['extra branch',f=>f['/environments/public-production/deployment-branch-policies?per_page=100'].total_count=2]
])test(`${label} fails before PAT use`,async()=>{
  const f=fixtures();change(f);const h=harness(f);await assert.rejects(probe(context(),h.options));
  assert.ok(h.calls.every(c=>c.options.headers.Authorization===`Bearer ${h.options.ciToken}`));
});

for(const [label,change] of [
  ['admin enforcement off',p=>p.enforce_admins.enabled=false], ['force push allowed',p=>p.allow_force_pushes.enabled=true],
  ['deletion allowed',p=>p.allow_deletions.enabled=true], ['missing PR rule',p=>delete p.required_pull_request_reviews],
  ['strict CI off',p=>p.required_status_checks.strict=false], ['wrong CI publisher',p=>p.required_status_checks.checks[0].app_id=-1],
  ['wrong check name',p=>p.required_status_checks.checks[0].context='spoofed'],
  ['incomplete bypass metadata',p=>p.required_pull_request_reviews.bypass_pull_request_allowances={users:[],teams:[]}],
  ['configured PR bypass',p=>p.required_pull_request_reviews.bypass_pull_request_allowances={users:[{id:42}],teams:[],apps:[]}]
])test(`classic ${label} fails closed`,async()=>{
  const f=fixtures();change(f['/branches/main/protection']);await assert.rejects(probe(context(),harness(f).options));
});
for(const status of [301,401,403,404,429,500])test(`PAT HTTP ${status} blocks, never treats absent protection/denied API as success`,async()=>{
  const h=harness(fixtures(),suffix=>suffix==='/branches/main/protection'?new Response('SECRET_ERROR_BODY',{status}):undefined);
  await assert.rejects(probe(context(),h.options),{message:`HTTP_${status}_BLOCKED`});
});
test('missing PAT blocks before network, never substitutes GITHUB_TOKEN',async()=>{
  const h=harness();await assert.rejects(probe(context(),{...h.options,metadataToken:''}));assert.equal(h.calls.length,0);
});
test('same token blocks; credential split remains mandatory',async()=>{
  const h=harness();await assert.rejects(probe(context(),{...h.options,metadataToken:h.options.ciToken}));assert.equal(h.calls.length,0);
});
test('credential newline injection blocked',async()=>{
  const h=harness();await assert.rejects(probe(context(),{...h.options,metadataToken:'bad\nheader'}));assert.equal(h.calls.length,0);
});
test('provider error text is never propagated',async()=>{
  const h=harness(fixtures(),()=>{throw Error('PRIVATE_TOKEN_OR_BODY');});
  await assert.rejects(probe(context(),h.options),{message:'NETWORK_BLOCKED'});
});
test('malformed JSON rejected without exposing response',async()=>{
  const h=harness(fixtures(),suffix=>suffix==='/branches/main/protection'?new Response('NOT_JSON_SECRET'):undefined);
  await assert.rejects(probe(context(),h.options),{message:'METADATA_BLOCKED'});
});
test('oversized metadata is bounded',async()=>{
  const h=harness(fixtures(),suffix=>suffix==='/branches/main/protection'?new Response('x'.repeat(2097153)):undefined);
  await assert.rejects(probe(context(),h.options),{message:'METADATA_SIZE_BLOCKED'});
});
test('truncated variables cannot prove complete read',async()=>{
  const f=fixtures();f['/environments/public-production/variables?per_page=100'].total_count=1;
  await assert.rejects(probe(context(),harness(f).options),{message:'VARIABLE_METADATA_BLOCKED'});
});
test('variable metadata must contain expected fields even though values are never printed',async()=>{
  const f=fixtures();f['/environments/public-production/variables?per_page=100']={total_count:1,variables:[{name:'TEST'}]};
  await assert.rejects(probe(context(),harness(f).options),{message:'VARIABLE_METADATA_BLOCKED'});
});
test('variables API permission failure is not treated as absent approvals',async()=>{
  const h=harness(fixtures(),suffix=>suffix.includes('/variables?')?new Response('PRIVATE_PROVIDER_MESSAGE',{status:403}):undefined);
  await assert.rejects(probe(context(),h.options),{message:'HTTP_403_BLOCKED'});
});
test('listed variable whose named GET fails blocks rather than treating it as absent',async()=>{
  const f=fixtures(),name='PUBLIC_RELEASE_APPROVAL_SHA';
  f['/environments/public-production/variables?per_page=100']={total_count:1,variables:[variable(name)]};
  const h=harness(f,suffix=>suffix.endsWith('/variables/'+name)?new Response('PRIVATE_PROVIDER_MESSAGE',{status:404}):undefined);
  await assert.rejects(probe(context(),h.options),{message:'HTTP_404_BLOCKED'});
});
test('runner sanitizes provider exception; no token, variable, body or headers emitted',()=>{
  const c=context(), env={...process.env, GITHUB_REPOSITORY:c.repository,GITHUB_EVENT_NAME:c.event,GITHUB_REF:c.ref,GITHUB_SHA:c.sha,
    GITHUB_RUN_ID:c.runId,GITHUB_RUN_ATTEMPT:c.attempt,GITHUB_ACTOR:c.actor,GITHUB_ACTOR_ID:c.actorId,
    GITHUB_TRIGGERING_ACTOR:c.triggeringActor,GITHUB_WORKFLOW_REF:c.workflowRef,
    CI_READ_TOKEN:'PRIVATE_CI_CREDENTIAL',METADATA_READ_TOKEN:'PRIVATE_PAT_CREDENTIAL'};
  try{
    execFileSync(process.execPath,['--input-type=module'],{input:"const fetch=async()=>{throw Error('PRIVATE_PROVIDER_BODY');};\n"+code,env,encoding:'utf8',stdio:['pipe','pipe','pipe']});
    assert.fail('runner must exit nonzero');
  }catch(error){
    assert.equal(error.status,1);assert.equal(error.stdout.trim(),'METADATA_PROBE=BLOCKED NETWORK_BLOCKED');
    assert.equal(error.stderr,'');assert.doesNotMatch(error.stdout,/PRIVATE_/);
  }
});
test('protection drift during probe blocks',async()=>{
  const h=harness(fixtures(),(suffix,calls)=>suffix==='/branches/main/protection'&&calls.filter(c=>c.suffix===suffix).length===2?
    Response.json({...fixtures()[suffix],extra_changed_setting:true}):undefined);
  await assert.rejects(probe(context(),h.options),{message:'PROTECTION_CHANGED_BLOCKED'});
});
test('live main moves during probe: blocked',async()=>{
  const h=harness(fixtures(),(suffix,calls)=>suffix==='/branches/main'&&calls.filter(c=>c.suffix===suffix).length===2?
    Response.json({...fixtures()[suffix],commit:{sha:'b'.repeat(40)}}):undefined);
  await assert.rejects(probe(context(),h.options),{message:'MAIN_SHA_BLOCKED'});
});
test('probe workflow has only manual trigger, owner/main gate, protected environment, no deployment',()=>{
  assert.match(workflow,/on:\s+workflow_dispatch:\s+permissions:/);
  assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/github.actor == 'tqhoangg08'/);
  assert.match(workflow,/github.triggering_actor == 'tqhoangg08'/);
  assert.match(workflow,/github.run_attempt == 1/);
  assert.match(workflow,/name: public-production\s+deployment: false/);
  assert.doesNotMatch(workflow,/pull_request_target:|pull_request:|uses:|checkout@|npm (?:ci|install)|wrangler|CLOUDFLARE_|secrets: inherit|write\s*$/m);
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(m=>m[1]),['PUBLIC_RELEASE_GITHUB_READ_TOKEN']);
  const outputs=code.split('\n').filter(line=>line.includes('console.'));
  assert.equal(outputs.length,5);
  assert.ok(outputs.every(line=>/console\.log\((?:'|result\.approvalVariablesPresent|`METADATA_PROBE=BLOCKED \$\{code\}`)/.test(line)));
  assert.match(code,/RELEASE_APPROVAL=BLOCKED_NOT_EVALUATED/);
});
test('bootstrap emits exact required check without environment secrets or production commands',()=>{
  const ci=readFileSync(new URL('../.github/workflows/ai-advisor-pr-validation.yml',import.meta.url),'utf8');
  assert.match(ci,/name: AI Advisor independent validation/);
  assert.match(ci,/pull_request:\s+branches: \[main\]/);
  assert.doesNotMatch(ci,/pull_request_target:|secrets\.|environment:|wrangler|cf:deploy|migrations apply|write\s*$/m);
  for(const name of ['typecheck','cf:typecheck','build','test'])assert.match(ci,new RegExp(`npm (?:run )?${name.replace(':','\\:')}(?:\\s|$)`));
  assert.doesNotMatch(ci,/test:advisor|staging\/advisor/,'do not copy scripts absent from main');
});
