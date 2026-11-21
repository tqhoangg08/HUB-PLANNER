import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { publicationFixture, HK1_ID } from './hk2-publication-fixture.mjs';
import { prepareProductionPublication, publishProductionCatalogue, inspectPublication, publicationBinding,
  publicationBackupEvidence, verifyBackupFile } from '../scripts/hk2-2026-2027/publication-transport.mjs';
import { backupRestoreAttestationText, publicationApprovalText, openHk2Publication } from '../scripts/hk2-2026-2027/publication.mjs';
import { verifyPublicationOperator, V477_ASSET_MANIFEST_SHA256 } from '../scripts/hk2-2026-2027/publication-operator.mjs';
import { DB_ID, RELEASE } from '../scripts/hk2-2026-2027/operator-authorization.mjs';
import { handleCourses } from '../cloudflare/worker/src/courses.ts';

const operatorSha='c'.repeat(40),base='/repos/tqhoangg08/HUB-PLANNER';
const release={...{sha:RELEASE.sha,run_id:RELEASE.run_id,worker_version:RELEASE.version},operator_sha:operatorSha,asset_manifest_sha256:V477_ASSET_MANIFEST_SHA256};
const credentials={github_read_token:'fixture-github',cloudflare_read_token:'fixture-cloudflare'};
const primary=db=>({prepare:sql=>db.prepare(sql),batch:async list=>(await db.batch(list)).map(r=>({...r,meta:{...r.meta,served_by_primary:true}}))});
async function evidence(){
  const owner={id:252552483,login:'tqhoangg08',type:'User'},time=new Date().toISOString(),earlier=new Date(Date.now()-3600000).toISOString();
  const gate=Buffer.from((await readFile('cloudflare/worker/src/course-publication.ts','utf8')).replace(/\r\n/g,'\n'));
  const manifest=await readFile('docs/hk2-publication/v477-asset-manifest.json');
  const ci={id:800,path:'.github/workflows/ai-advisor-pr-validation.yml',head_sha:operatorSha,head_branch:'main',event:'workflow_dispatch',repository:{full_name:'tqhoangg08/HUB-PLANNER'},status:'completed',conclusion:'success'};
  const run={id:RELEASE.run_id,repository:{id:1126820605,full_name:'tqhoangg08/HUB-PLANNER'},head_sha:RELEASE.sha,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/deploy-cloudflare-production.yml',actor:owner,triggering_actor:owner,run_attempt:1,status:'completed',conclusion:'success'};
  const comment=(id,body)=>({id,user:owner,issue_url:'https://api.github.com'+base+'/issues/165',created_at:time,updated_at:time,body});
  const state={owner,repo:{id:1126820605,full_name:'tqhoangg08/HUB-PLANNER',default_branch:'main',owner},branch:{name:'main',protected:true,commit:{sha:operatorSha}},
    environment:{id:23,name:'public-production',can_admins_bypass:false,protection_rules:[{type:'branch_policy'},{type:'wait_timer',wait_timer:5}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}},
    policies:{total_count:1,branch_policies:[{name:'main',type:'branch'}]},
    protection:{enforce_admins:{enabled:true},allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},required_pull_request_reviews:{required_approving_review_count:0},required_status_checks:{strict:true,checks:[{context:'AI Advisor independent validation',app_id:15368}]}},
    checks:{total_count:1,check_runs:[{id:81,name:'AI Advisor independent validation',head_sha:operatorSha,app:{id:15368},started_at:earlier,status:'completed',conclusion:'success',details_url:'https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/800/job/81'}]},ci,
    run,runs:{total_count:1,workflow_runs:[run]},jobs:{total_count:1,jobs:[{name:'release-public',conclusion:'success',started_at:earlier,completed_at:time,steps:[
      'Verify live settings and schema without applying migrations','Verify solo owner approval, live protections and exact-SHA CI','Deploy Public Worker and frontend assets','Verify serving Public version preserves V2 100 percent and document flags remain OFF'].map(name=>({name,conclusion:'success'}))}]},
    content:{type:'file',sha:createHash('sha1').update(`blob ${gate.length}\0`).update(gate).digest('hex')},
    deployment:{deployments:[{versions:[{version_id:RELEASE.version,percentage:100}]}]},
    version:{id:RELEASE.version,metadata:{created_on:time},resources:{bindings:[{name:'DB',type:'d1',id:DB_ID},{name:'COURSE_READ_AUTHORITY',text:'d1'},{name:'COURSE_WRITE_AUTHORITY',text:'d1'}]}},
    approval:comment(101,''),backup:comment(102,''),manifest};
  const calls=[];
  const fetcher=async(url,init)=>{
    assert.equal(init.method,'GET');assert.ok(['error','manual'].includes(init.redirect));calls.push(String(url));
    const u=new URL(url),p=u.pathname;
    if(u.hostname==='hotrosinhvienhub.id.vn')return new Response(state.manifest,{headers:{'Content-Type':'application/json'}});
    if(u.hostname==='api.cloudflare.com')return Response.json({success:true,result:p.endsWith('/deployments')?state.deployment:state.version});
    let data=p==='/user'?state.owner:p===base?state.repo:p.endsWith('/branches/main')?state.branch:p.endsWith('/branches/main/protection')?state.protection
      :p.endsWith('/environments/public-production')?state.environment:p.endsWith('/deployment-branch-policies')?state.policies
      :p.includes('/check-runs')?state.checks:p.endsWith('/workflows/deploy-cloudflare-production.yml/runs')?state.runs
      :p.endsWith('/runs/800')?state.ci:p.endsWith('/jobs')?state.jobs:p.endsWith('/runs/'+RELEASE.run_id)?state.run
      :p.includes('/contents/')?state.content:p.endsWith('/comments/101')?state.approval:p.endsWith('/comments/102')?state.backup:null;
    assert.ok(data,'Unexpected provider read '+p);return Response.json(structuredClone(data));
  };
  return {state,fetcher,calls};
}
function report(plan){
  const at=new Date(Date.parse(plan.snapshot.checked_at)-3000).toISOString(),verified=new Date(Date.parse(plan.snapshot.checked_at)-1000).toISOString();
  const file={sha256:'e'.repeat(64),complete:true,bytes:100,exportBookmark:'fixture-bookmark',completedAt:at};
  const tables=['course_schedules','user_schedules','user_schedule_course_snapshots','user_course_requests'].map(table=>({table,match:true,reference:{rows:1,sha256:'d'.repeat(64)},restored:{rows:1,sha256:'d'.repeat(64)}}));
  return {status:'PASS',production_database_id:DB_ID,backup:file,export_status:'complete',bookmarks:{export_at:'fixture-bookmark'},schema_completeness:{status:'PASS',live_schema_sha256:'f'.repeat(64),export_schema_sha256:'f'.repeat(64)},
    restore:{status:'PASS',production_restored:false,migration_executed:false,local_database:{remote:false,fresh_state:true,uuid:'local'},backup_file:file,application_tables:4,tables,verified_at:verified,
      checks:Object.fromEntries(['integrity_ok','schema_equal','all_tables_equal','foreign_keys_equal','foreign_keys_clean','sequences_equal','hk1_equal','hk1_expected','hk2_zero'].map(k=>[k,true]))}};
}

test('operator evidence preserves exact-main CI, owner, protection, release, serving binding and frontend guards',async()=>{
  for(const mutate of [s=>s.owner.id=9,s=>s.branch.commit.sha='0'.repeat(40),s=>s.branch.protected=false,s=>s.protection.enforce_admins.enabled=false,
    s=>s.environment.can_admins_bypass=true,s=>s.checks.check_runs[0].conclusion='failure',s=>s.ci.event='pull_request',s=>s.runs.workflow_runs.push({...s.run,status:'in_progress'}),
    s=>s.run.head_sha=operatorSha,s=>s.jobs.jobs[0].steps.pop(),s=>s.content.sha='0'.repeat(40),s=>s.deployment.deployments[0].versions[0].percentage=99,
    s=>s.deployment.deployments[0].versions.push({version_id:'other',percentage:1}),s=>s.version.resources.bindings[0].id='wrong',s=>s.manifest=Buffer.from('{}')]){
    const e=await evidence();mutate(e.state);await assert.rejects(verifyPublicationOperator(release,{...credentials,fetchImpl:e.fetcher}));
  }
  const e=await evidence();assert.equal((await verifyPublicationOperator(release,{...credentials,fetchImpl:e.fetcher})).ci_run,'800');
  await assert.rejects(verifyPublicationOperator({...release,sha:operatorSha},{...credentials,fetchImpl:e.fetcher}),/Reviewed/);
});

test('native publication transport: 2357 rows/95 receipts, two real owner comments, atomic failure/lost ACK and protected data', {timeout:480000},async t=>{
  const f=await publicationFixture({databaseId:DB_ID});t.after(()=>f.mf.dispose());await f.migrate();
  await f.db.prepare('CREATE TABLE d1_migrations(name TEXT)').run();await f.db.prepare("INSERT INTO d1_migrations VALUES('0062_hk2_catalogue_publication.sql')").run();
  const raw=primary(f.db),proof=report(f.plan),originalFetch=global.fetch,e=await evidence();global.fetch=e.fetcher;t.after(()=>{global.fetch=originalFetch;});
  await assert.rejects(prepareProductionPublication(raw,{plan:f.plan,report:proof,operatorSha,credentials}),/Incomplete/);
  await f.insertTo(95);
  await f.db.prepare("INSERT INTO user_schedules(id,user_id,course_id,semester,created_at) VALUES('kept','owner',?,'HK1_2026_2027','old')").bind(HK1_ID).run();
  const hk1=(await f.db.prepare("SELECT * FROM course_schedules WHERE semester='HK1_2026_2027' ORDER BY id").all()).results;
  const personal=(await f.db.prepare('SELECT * FROM user_schedules ORDER BY id').all()).results;
  const {verification}=await prepareProductionPublication(raw,{plan:f.plan,report:proof,operatorSha,credentials});
  assert.equal(verification.official_count,2357);assert.equal(verification.batch_count,95);assert.equal(verification.operator_sha,operatorSha);
  const expires_at=new Date(Date.now()+600000).toISOString();
  e.state.approval.body=publicationApprovalText(verification,expires_at);e.state.backup.body=backupRestoreAttestationText(verification);
  e.state.approval.created_at=e.state.approval.updated_at=e.state.backup.created_at=e.state.backup.updated_at=new Date().toISOString();
  assert.match(e.state.approval.body,/v2\naction=OPEN_HK2_2026_2027/);assert.ok(!e.state.approval.body.includes('\r'));
  const options={...credentials,approval_comment_id:101,backup_comment_id:102,expires_at};
  await assert.rejects(openHk2Publication(publicationBinding(raw),verification,{approved:true}),/Authenticated/);
  await assert.rejects(publishProductionCatalogue(raw,verification,{...options,backup_comment_id:101}),/Separate/);
  const body=e.state.backup.body;e.state.backup.body+=' forged';await assert.rejects(publishProductionCatalogue(raw,verification,options),/attested/);e.state.backup.body=body;
  e.state.approval.updated_at='2020-01-01';await assert.rejects(publishProductionCatalogue(raw,verification,options),/unedited/);e.state.approval.updated_at=e.state.approval.created_at;
  const bound=publicationBinding(raw);
  assert.throws(()=>bound.prepare('DELETE FROM course_schedules').all(),/atomic/);
  await assert.rejects(bound.batch([bound.prepare('UPDATE course_schedules SET instructor=NULL')]),/Only original/);
  let writes=0;
  const fail={prepare:sql=>raw.prepare(sql),batch:async list=>{writes++;await raw.batch([...list,f.db.prepare("INSERT INTO hk2_catalogue_publications(semester) VALUES('HK2_2026_2027')")]);}};
  await assert.rejects(publishProductionCatalogue(fail,verification,options));assert.equal(writes,1);
  assert.equal((await inspectPublication(raw)).gate.state,'CLOSED');assert.equal((await inspectPublication(raw)).receipts.length,0);
  assert.equal((await handleCourses(new URL('https://x/courses?semester=HK2_2026_2027'),{DB:f.db})).payload.total,0);
  const lose={prepare:sql=>raw.prepare(sql),batch:async list=>{writes++;await raw.batch(list);throw new Error('lost response after native commit');}};
  await assert.rejects(publishProductionCatalogue(lose,verification,options),/lost response/);
  const after=await inspectPublication(raw);assert.equal(after.gate.state,'OPEN');assert.equal(after.gate.revision,1);assert.equal(after.receipts.length,1);
  assert.equal((await publishProductionCatalogue(raw,verification,options)).changed,false,'Same in-process verification reconciles a lost response without a second mutation');
  assert.equal((await handleCourses(new URL('https://x/courses?semester=HK2_2026_2027'),{DB:f.db})).payload.total,2357);
  assert.deepEqual((await f.db.prepare("SELECT * FROM course_schedules WHERE semester='HK1_2026_2027' ORDER BY id").all()).results,hk1);
  assert.deepEqual((await f.db.prepare('SELECT * FROM user_schedules ORDER BY id').all()).results,personal);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM course_mutation_receipts').first()).n,95);
  const bad=structuredClone(proof);bad.restore.tables[0].restored.sha256='0'.repeat(64);assert.throws(()=>publicationBackupEvidence(bad,f.plan),/backup/);
});

test('private export bytes are verified; original publication SQL, importer, Worker, UI and release guards are unchanged',async()=>{
  await mkdir('.cache/hk2-publication-tests',{recursive:true});const file='.cache/hk2-publication-tests/export-fixture.sql',bytes=Buffer.from('-- isolated test fixture only\n');
  await writeFile(file,bytes);const b={backup:{file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
  await verifyBackupFile(b);await assert.rejects(verifyBackupFile({backup:{...b.backup,bytes:1}}),/hash\/length/);
  const fileName='scripts/hk2-2026-2027/publication.mjs',before=execFileSync('git',['show',`7b951b27c416d7b3d767a1dbebbb7332d5c8a7ab:${fileName}`],{encoding:'utf8'}).replace(/\r\n/g,'\n');
  const after=(await readFile(fileName,'utf8')).replace(/\r\n/g,'\n');
  assert.equal(after.slice(after.indexOf('const sqlArray =')),before.slice(before.indexOf('const sqlArray =')),'Atomic SQL, guards, capability consumption and state machine unchanged');
  execFileSync('git',['diff','--exit-code','7b951b27c416d7b3d767a1dbebbb7332d5c8a7ab','--','cloudflare','components','utils','data/hk2-2026-2027','.github','scripts/hk2-2026-2027/bulk-import.mjs','scripts/hk2-2026-2027/operator-authorization.mjs','scripts/hk2-2026-2027/production-transport.mjs','scripts/check-public-release-approval.mjs','scripts/check-public-release-state.mjs','scripts/release-assistant-core.mjs','scripts/release-assistant-api.mjs']);
});
