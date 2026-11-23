import test from 'node:test';
import { D1_AUDIT_RELEASE_EXCLUSIONS } from './fixtures/d1-audit-release-scope.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { getPlatformProxy } from 'wrangler';
import { publicationFixture } from './hk2-publication-fixture.mjs';
import { captureSnapshot, createBulkPlan, applyNextBatch, rollbackNextBatch, exportReceipts } from '../scripts/hk2-2026-2027/bulk-import.mjs';
import { authorizeProductionImport, importApprovalText, digest, RELEASE, DB_ID } from '../scripts/hk2-2026-2027/operator-authorization.mjs';
import { guardedOperatorBinding, applyOperatorBatch, CLOSED_GATE_ASSERTION } from '../scripts/hk2-2026-2027/production-transport.mjs';
import { handleCourses } from '../cloudflare/worker/src/courses.ts';

const operatorSha = 'c'.repeat(40), HK2='HK2_2026_2027';
const primary = db => ({ prepare: sql => db.prepare(sql), batch: async statements => (await db.batch(statements)).map(r => ({...r,meta:{...r.meta,served_by_primary:true}})) });
const rows = async (db,sql) => (await db.prepare(sql).all()).results;
const count = async db => (await db.prepare("SELECT COUNT(*) AS n FROM course_schedules WHERE semester='HK2_2026_2027'").first()).n;
function backup(plan) {
  const table = name => ({table:name,match:true,reference:{rows:1,sha256:'d'.repeat(64)},restored:{rows:1,sha256:'d'.repeat(64)}});
  const tables=['course_schedules','user_schedules','user_schedule_course_snapshots','user_course_requests'].map(table);
  const file={sha256:'e'.repeat(64),complete:true,bytes:100,exportBookmark:'fixture-bookmark',completedAt:new Date(Date.parse(plan.snapshot.checked_at)-3000).toISOString()};
  return {status:'PASS',production_database_id:DB_ID,backup:file,export_status:'complete',bookmarks:{export_at:'fixture-bookmark'},
    schema_completeness:{status:'PASS',live_schema_sha256:'f'.repeat(64),export_schema_sha256:'f'.repeat(64)},
    restore:{status:'PASS',production_restored:false,migration_executed:false,local_database:{remote:false,fresh_state:true,uuid:'local-only'},
      backup_file:file,application_tables:tables.length,tables,verified_at:new Date(Date.parse(plan.snapshot.checked_at)-1000).toISOString(),
      checks:Object.fromEntries(['integrity_ok','schema_equal','all_tables_equal','foreign_keys_equal','foreign_keys_clean','sequences_equal',
        'hk1_equal','hk1_expected','hk2_zero','no_0061_0062','gate_tables_absent'].map(k=>[k,true]))}};
}
async function provider(plan, proof, mutate = () => {}) {
  const now=new Date().toISOString(), earlier=new Date(Date.now()-3600000).toISOString();
  const expiresAt=new Date(Date.now()+30*60000).toISOString();
  const gate=Buffer.from((await readFile('cloudflare/worker/src/course-publication.ts','utf8')).replace(/\r\n/g,'\n'));
  const owner={id:252552483,type:'User',login:'tqhoangg08'},base='https://api.github.com/repos/tqhoangg08/HUB-PLANNER';
  const ci={id:777,head_sha:operatorSha,path:'.github/workflows/ai-advisor-pr-validation.yml',head_branch:'main',event:'workflow_dispatch',
    repository:{full_name:'tqhoangg08/HUB-PLANNER'},status:'completed',conclusion:'success'};
  const comment={id:101,user:owner,issue_url:base+'/issues/164',created_at:now,updated_at:now,body:importApprovalText(plan,proof,operatorSha,expiresAt)};
  const responses={identity:owner,repo:{id:1126820605,full_name:'tqhoangg08/HUB-PLANNER',owner,default_branch:'main'},branch:{name:'main',commit:{sha:operatorSha}},comment,
    checks:{total_count:1,check_runs:[{id:888,head_sha:operatorSha,name:'AI Advisor independent validation',app:{id:15368},status:'completed',conclusion:'success',started_at:earlier,details_url:base.replace('api.github.com/repos','github.com')+'/actions/runs/777/job/888'}]},
    runs:{total_count:1,workflow_runs:[ci]},release:{id:RELEASE.run_id,repository:{id:1126820605},head_sha:RELEASE.sha,head_branch:'main',event:'workflow_dispatch',run_attempt:1,
      path:'.github/workflows/deploy-cloudflare-production.yml',actor:owner,triggering_actor:owner,status:'completed',conclusion:'success'},
    jobs:{total_count:1,jobs:[{name:'release-public',conclusion:'success',started_at:earlier,completed_at:now,steps:['Verify solo owner approval, live protections and exact-SHA CI',
      'Deploy Public Worker and frontend assets','Verify serving Public version preserves V2 100 percent and document flags remain OFF'].map(name=>({name,conclusion:'success'}))}]},
    content:{type:'file',sha:createHash('sha1').update(`blob ${gate.length}\0`).update(gate).digest('hex')},
    deployment:{deployments:[{versions:[{version_id:RELEASE.version,percentage:100}]}]},
    version:{id:RELEASE.version,metadata:{created_on:now},resources:{bindings:[{name:'DB',type:'d1',id:DB_ID},...['COURSE_READ_AUTHORITY','COURSE_WRITE_AUTHORITY'].map(name=>({name,text:'d1'}))]}}};
  mutate(responses);
  const calls=[];
  const fetchImpl=async(url,init)=>{
    assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.ok(init.headers.Authorization);calls.push(url);
    let value;
    if(url.startsWith('https://api.cloudflare.com/client/v4/accounts/6cd8bac6009a55f96bdf9df7c2057548/workers/scripts/hub-planner-public-dev-api/')) {
      value={success:true,result:url.endsWith('/deployments')?responses.deployment:responses.version};
    } else if(url==='https://api.github.com/user')value=responses.identity;
    else if(url===base)value=responses.repo;
    else if(url===base+'/branches/main')value=responses.branch;
    else if(url===base+'/issues/comments/101')value=responses.comment;
    else if(url.includes('/check-runs?'))value=responses.checks;
    else if(url.includes('/actions/runs?'))value=responses.runs;
    else if(url.endsWith('/jobs?per_page=100'))value=responses.jobs;
    else if(url===base+'/actions/runs/'+RELEASE.run_id)value=responses.release;
    else if(url.startsWith(base+'/contents/'))value=responses.content;
    else throw new Error('Unexpected provider URL');
    return Response.json(structuredClone(value));
  };
  return {responses,calls,options:{operatorSha,approvalCommentId:101,expiresAt,githubToken:'fixture-gh',cloudflareToken:'fixture-cf',fetchImpl}};
}
async function fixture(t) {
  const f=await publicationFixture();t.after(()=>f.mf.dispose());await f.migrate();
  const raw=primary(f.db),plan=await createBulkPlan(f.pkg,await captureSnapshot(raw,DB_ID));
  return {...f,raw,productionPlan:plan,proof:backup(plan)};
}

test('production authorization rejects JSON approvals and invalid owner/provider/backup evidence before writes',async t=>{
  const f=await fixture(t),p=f.productionPlan;
  await assert.rejects(applyNextBatch(f.raw,f.pkg,p,{plan_id:p.plan_id,action:'apply',course_write_authority:'d1',expires_at:new Date(Date.now()+60000).toISOString()}),/Production execution is disabled/);
  for(const mutate of [r=>r.identity={id:9,type:'User'},r=>r.comment.user={id:9,type:'User'},r=>r.comment.body+=' forged',r=>r.comment.updated_at='2020-01-01',
    r=>r.branch.commit.sha='0'.repeat(40),r=>r.checks.check_runs[0].conclusion='failure',r=>r.runs.workflow_runs[0].event='pull_request',
    r=>r.content.sha='0'.repeat(40),r=>r.release.head_sha=operatorSha,r=>r.jobs.jobs[0].steps.pop(),r=>r.deployment.deployments[0].versions[0].percentage=99,
    r=>r.deployment.deployments[0].versions.push({version_id:'other',percentage:1}),r=>r.version.resources.bindings[0].id='other']) {
    const x=await provider(p,f.proof,mutate);await assert.rejects(authorizeProductionImport(p,f.proof,x.options));
  }
  const bad=structuredClone(f.proof);bad.restore.checks.foreign_keys_clean=false;
  const x=await provider(p,f.proof);await assert.rejects(authorizeProductionImport(p,bad,x.options),/backup/i);
  await assert.rejects(authorizeProductionImport(p,f.proof,{...x.options,expiresAt:new Date(Date.now()-1).toISOString()}),/expired/i);
  assert.equal(await count(f.db),0);assert.equal((await exportReceipts(f.db,p)).length,0);
});

test('native transport imports all 2,357 in 95 transactions; partial loss/resume, rollback failure and gate races are fail-closed', {timeout:480000},async t=>{
  const f=await fixture(t),p=f.productionPlan;
  // Full 2,103 synthetic HK1 catalogue, with one retained personal schedule.
  await f.db.batch(Array.from({length:2102},(_,j)=>{
    const n=j+1;return f.db.prepare(`INSERT INTO course_schedules(id,course_code,subject_name,semester,instructor,is_user_added,updated_at,course_code_search,subject_name_search,instructor_search,source_position)
      VALUES(?,?,?,'HK1_2026_2027','HK1 lecturer',0,'old',?,?,?,0)`).bind('hk1-'+n,'HK1_'+n,'HK1 subject','hk1_'+n,'hk1 subject','hk1 lecturer');
  }));
  // Refresh after synthetic fixture seeding: this is the exact approved initial state.
  const plan=await createBulkPlan(f.pkg,await captureSnapshot(f.raw,DB_ID)),proof=backup(plan);
  await f.db.prepare("INSERT INTO user_schedules(id,user_id,course_id,semester,created_at) VALUES('kept','owner','22222222-2222-4222-8222-222222222222','HK1_2026_2027','old')").run();
  const hk1=await rows(f.db,"SELECT * FROM course_schedules WHERE semester='HK1_2026_2027' ORDER BY id"),personal=await rows(f.db,'SELECT * FROM user_schedules ORDER BY id');
  const evidence=await provider(plan,proof);
  const auth=()=>authorizeProductionImport(plan,proof,evidence.options);
  let writes=0,lose=true,fail=true;
  const transport={prepare:sql=>f.raw.prepare(sql),batch:async list=>{
    if(list.length!==7){
      assert.ok(list.length<=27);writes++;
      if(fail){fail=false;await assert.rejects(f.raw.batch([...list,f.db.prepare("INSERT INTO hk2_catalogue_publications(semester) VALUES('HK2_2026_2027')")]));assert.equal(await count(f.db),0);throw new Error('injected atomic failure');}
      const result=await f.raw.batch(list);if(lose){lose=false;throw new Error('lost response after commit');}return result;
    }
    return f.raw.batch(list);
  }};
  await assert.rejects(applyOperatorBatch(transport,f.pkg,plan,await auth()),/atomic failure/);
  assert.equal((await exportReceipts(f.db,plan)).length,0);
  await assert.rejects(applyOperatorBatch(transport,f.pkg,plan,await auth()),/lost response/);
  assert.equal(await count(f.db),25);
  await assert.rejects(createBulkPlan(f.pkg,await captureSnapshot(f.raw,DB_ID)),/active.*plan/i);
  assert.equal((await handleCourses(new URL('https://example.test/courses?semester='+HK2),{DB:f.db})).payload.total,0);
  // Same-plan authentic reauthorization reconciles the durable receipt and advances batch 1, not batch 0.
  await applyOperatorBatch(transport,f.pkg,plan,await auth());assert.equal(await count(f.db),50);
  const revoked=await auth();evidence.responses.comment.body+=' revoked';
  await assert.rejects(applyOperatorBatch(transport,f.pkg,plan,revoked),/revoked/);evidence.responses.comment.body=evidence.responses.comment.body.slice(0,-8);
  const gated=await auth();await f.db.prepare('DELETE FROM hk2_catalogue_publications').run();
  await assert.rejects(applyOperatorBatch(transport,f.pkg,plan,gated),/malformed JSON/);assert.equal(await count(f.db),50);
  await f.db.prepare("INSERT INTO hk2_catalogue_publications(semester) VALUES('HK2_2026_2027')").run();
  let result;
  do{result=await applyOperatorBatch(transport,f.pkg,plan,await auth());}while(!result.done);
  assert.equal(await count(f.db),2357);assert.equal((await exportReceipts(f.db,plan)).length,95);
  assert.deepEqual(await applyOperatorBatch(transport,f.pkg,plan,await auth()),{done:true,committed_batches:95});
  assert.equal(await count(f.db),2357);
  assert.equal((await handleCourses(new URL('https://example.test/courses?semester='+HK2),{DB:f.db})).payload.total,0);
  assert.deepEqual(await rows(f.db,"SELECT * FROM course_schedules WHERE semester='HK1_2026_2027' ORDER BY id"),hk1);
  assert.deepEqual(await rows(f.db,'SELECT * FROM user_schedules ORDER BY id'),personal);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM course_schedules WHERE semester=? AND instructor IS NOT NULL").bind(HK2).first()).n,0);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM course_schedules WHERE semester=? AND shift LIKE '%dự kiến theo owner%'").bind(HK2).first()).n,8);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM course_schedules WHERE course_code='_262_'").first()).n,0);
  await assert.rejects(rollbackNextBatch(f.raw,f.pkg,plan,await auth()),/Production execution is disabled|plan\/action/i);
  const proofResult={official_count:2357,apply_receipts:95,hk1_count:hk1.length,personal_rows_unchanged:true,gate:'CLOSED',lost_response_resumed:true,partial_failure_atomic:true,writes_attempted:writes};
  await mkdir('.cache/hk2-production-transport',{recursive:true});await writeFile('.cache/hk2-production-transport/local-evidence.json',JSON.stringify(proofResult,null,2));
});

test('installed Wrangler local proxy preserves prepared NULL/newlines and atomic guard rollback',async t=>{
  await mkdir('.cache/hk2-production-transport/proxy',{recursive:true});
  const filename='.cache/hk2-production-transport/proxy/wrangler.json';
  await writeFile(filename,JSON.stringify({name:'hk2-transport-local-test',compatibility_date:'2026-07-29',d1_databases:[{binding:'DB',database_name:'fixture',database_id:crypto.randomUUID()}]}));
  const proxy=await getPlatformProxy({configPath:filename,remoteBindings:false,persist:false,envFiles:[]});t.after(()=>proxy.dispose());
  await proxy.env.DB.prepare('CREATE TABLE fixture(id INTEGER PRIMARY KEY,value TEXT)').run();
  await proxy.env.DB.batch([proxy.env.DB.prepare('INSERT INTO fixture VALUES(?,?)').bind(1,null),proxy.env.DB.prepare('INSERT INTO fixture VALUES(?,?)').bind(2,'LỚP ẢO\nSân bóng đá')]);
  assert.equal((await proxy.env.DB.prepare('SELECT value FROM fixture WHERE id=1').first()).value,null);
  assert.equal((await proxy.env.DB.prepare('SELECT value FROM fixture WHERE id=2').first()).value,'LỚP ẢO\nSân bóng đá');
  await assert.rejects(proxy.env.DB.batch([proxy.env.DB.prepare('INSERT INTO fixture VALUES(3,NULL)'),proxy.env.DB.prepare('INSERT INTO fixture VALUES(1,NULL)')]));
  assert.equal((await proxy.env.DB.prepare('SELECT COUNT(*) AS n FROM fixture').first()).n,2);
});

test('original writer SQL/ledger/local approval stays unchanged outside the audited D1 files; no application operator imports',async()=>{
  const file='scripts/hk2-2026-2027/bulk-import.mjs';
  const original=execFileSync('git',['show',`${RELEASE.sha}:${file}`],{encoding:'utf8'}).replace(/\r\n/g,'\n');
  const actual=(await readFile(file,'utf8')).replace(/\r\n/g,'\n');
  const expected=original.replace("import { DATA_DIR, FIELDS, SEMESTER, normalizeKey, planImport, sha256 } from './catalogue.mjs';",
    "import { DATA_DIR, FIELDS, SEMESTER, normalizeKey, planImport, sha256 } from './catalogue.mjs';\nimport { assertProductionAuthorization } from './operator-authorization.mjs';")
    .replace('  // No production adapter is shipped. A future owner-approved integration must authenticate the\n  // operator, resolve these receipts from trusted systems, and supply the primary D1 binding.\n  throw new Error(\'Production execution is disabled in this PR; owner-approved transport and verified release/backup receipts required\');',
      "  // The separate operator integration authenticates the owner and trusted receipts;\n  // a caller's JSON approval never enables production execution.\n  assertProductionAuthorization(plan, authorization, action);");
  assert.equal(actual,expected);
  execFileSync('git',['diff','--exit-code',RELEASE.sha,'--','data/hk2-2026-2027','cloudflare','components','utils','.github','scripts/hk2-d1-import.mjs','scripts/hk2-2026-2027/catalogue.mjs',...D1_AUDIT_RELEASE_EXCLUSIONS]);
  for(const name of ['index.ts','courses.ts','course-publication.ts'])assert.doesNotMatch(await readFile('cloudflare/worker/src/'+name,'utf8'),/production-transport|operator-authorization/);
  assert.match(CLOSED_GATE_ASSERTION,/revision=0/);
});
