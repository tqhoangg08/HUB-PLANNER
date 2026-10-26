import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {checkPublicReleaseState,validatePublicReleaseState,validateTextFirstReleaseSchema,TEXT_FIRST_MIGRATIONS,PUBLIC_RELEASE_ACCOUNT,PUBLIC_RELEASE_DB,PUBLIC_RELEASE_PREDEPLOY_VERSION,SCHOLARSHIP_LIMITER} from '../scripts/check-public-release-state.mjs';
import {validateScholarshipReleaseSchema,SCHOLARSHIP_MIGRATIONS,SCHOLARSHIP_SCHEMA_QUERY} from '../scripts/scholarship-release-schema.mjs';

const config=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8')).config;
const before=PUBLIC_RELEASE_PREDEPLOY_VERSION,after='22222222-2222-4222-8222-222222222222';
const scratch=new DatabaseSync(':memory:');
for(const migration of ['0032_ai_documents_chat_d1_r2_authority','0044_ai_document_ocr_ingestion','0045_ai_document_public_view_policy','0049_ai_document_derived_index_identity','0054_ai_document_search_ingestion_state','0055_ai_document_index_segment_count','0056_ai_text_document_revisions'])scratch.exec(readFileSync(`cloudflare/migrations/${migration}.sql`,'utf8'));
const schema=scratch.prepare('PRAGMA table_info(ai_documents)').all();
const objects=scratch.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name IN ('ai_documents','ai_text_documents','ai_text_revisions','ai_text_revisions_document','ai_text_publication_source_guard')").all();
const ledger=TEXT_FIRST_MIGRATIONS.map(name=>({name}));
for(const name of SCHOLARSHIP_MIGRATIONS)scratch.exec(readFileSync(`cloudflare/migrations/${name}`,'utf8'));
const scholarshipObjects=scratch.prepare(SCHOLARSHIP_SCHEMA_QUERY).all();
const scholarshipLedger=SCHOLARSHIP_MIGRATIONS.map(name=>({name}));scratch.close();
const settings=(percent,phase='predeploy')=>({observability:config.observability,bindings:[
  ...Object.entries(config.vars).map(([name,text])=>({name,type:'plain_text',text:name==='AI_ADVISOR_V2_CANARY_PERCENT'?percent:text})),
  {name:'DB',type:'d1',id:PUBLIC_RELEASE_DB},
  ...config.r2_buckets.map(b=>({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name})),
  ...config.services.map(b=>({name:b.binding,type:'service',service:b.service})),
  ...config.queues.producers.map(b=>({name:b.binding,type:'queue',queue_name:b.queue})),
  ...config.workflows.map(b=>({name:b.binding,type:'workflow',workflow_name:b.name})),
  ...config.ai_search_namespaces.map(b=>({name:b.binding,type:'ai_search_namespace',namespace:b.namespace})),
  ...config.ratelimits.map(b=>({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple})),
  {name:'ASSETS',type:'assets'},{name:'AI',type:'ai'},{name:'fixture-secret-name',type:'secret_text'},
]});
const patchVar=(s,name,text)=>({...s,bindings:s.bindings.map(b=>b.name===name?{...b,text}:b)});
const offNames=['AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED','AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED','AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT'];

test('Text-first release preserves exact 100% in both phases; old 7% is rejected',()=>{
  assert.equal(validatePublicReleaseState(config,settings('100'),schema,'predeploy'),true);
  assert.equal(validatePublicReleaseState(config,settings('100','postdeploy'),schema,'postdeploy'),true);
  assert.throws(()=>validatePublicReleaseState(config,settings('7'),schema,'predeploy'),/AI_RELEASE_STATE_DRIFT/);
  assert.throws(()=>validatePublicReleaseState(config,settings('7'),schema,'postdeploy'),/AI_RELEASE_STATE_DRIFT/);
  for(const percent of ['0','8','99','101','07','100.0',''])for(const phase of ['predeploy','postdeploy']){
    assert.throws(()=>validatePublicReleaseState(config,settings(percent),schema,phase),/DRIFT/);
  }
  assert.throws(()=>validatePublicReleaseState(config,settings('100'),schema,'skip'),/UNSUPPORTED_RELEASE_PHASE/);
});

test('unreviewed targets, mode changes and document opt-ins fail closed',()=>{
  for(const target of ['7','99',100])assert.throws(()=>validatePublicReleaseState({...config,vars:{...config.vars,AI_ADVISOR_V2_CANARY_PERCENT:target}},settings('100'),schema),/APPROVED_V2_TARGET/);
  for(const mode of ['on','off','shadow','CANARY'])assert.throws(()=>validatePublicReleaseState(config,patchVar(settings('100'),'AI_ADVISOR_V2_MODE',mode),schema));
  for(const name of offNames){
    assert.throws(()=>validatePublicReleaseState(config,patchVar(settings('100'),name,name.endsWith('PERCENT')?'1':'true'),schema));
    const unset={...settings('100'),bindings:settings('100').bindings.filter(b=>b.name!==name)};
    for(const phase of ['predeploy','postdeploy'])assert.throws(()=>validatePublicReleaseState(config,unset,schema,phase),/INITIAL_DOCUMENT_POLICY_MUST_BE_OFF/);
  }
});

test('other variables, binding identities, observability and migration gates are preserved in both phases',()=>{
  for(const [phase,percent]of [['predeploy','100'],['postdeploy','100']]){
    const s=settings(percent,phase);
    assert.throws(()=>validatePublicReleaseState(config,patchVar(s,'AI_ADVISOR_V2_GENERATOR_MODEL','unreviewed-model'),schema,phase),/LIVE_VARIABLE_DRIFT/);
    assert.throws(()=>validatePublicReleaseState(config,{...s,bindings:s.bindings.map(b=>b.name==='DB'?{...b,id:'wrong'}:b)},schema,phase),/LIVE_BINDING_DRIFT/);
    assert.throws(()=>validatePublicReleaseState(config,{...s,bindings:[...s.bindings,{name:'EXTRA',type:'d1',id:'wrong'}]},schema,phase),/UNREVIEWED_LIVE_BINDING/);
    assert.throws(()=>validatePublicReleaseState(config,{...s,bindings:[...s.bindings,s.bindings[0]]},schema,phase),/LIVE_BINDING_METADATA_INVALID/);
    assert.throws(()=>validatePublicReleaseState(config,{...s,observability:{enabled:false}},schema,phase),/OBSERVABILITY_DRIFT/);
    assert.throws(()=>validatePublicReleaseState(config,s,[],phase),/0054/);
  }
});

test('the verified complete binding set is mandatory before and after this code release',()=>{
  const old=settings('100'),next=settings('100','postdeploy');
  assert.equal(validatePublicReleaseState(config,next,schema,'predeploy'),true);
  assert.equal(validatePublicReleaseState(config,old,schema,'postdeploy'),true);
  for(const phase of ['predeploy','postdeploy']){
    const s=settings('100',phase);
    for(const b of s.bindings.filter(b=>!['plain_text','secret_text'].includes(b.type))){
      assert.throws(()=>validatePublicReleaseState(config,{...s,bindings:s.bindings.filter(x=>x.name!==b.name)},schema,phase),/LIVE_BINDING_DRIFT/);
    }
  }
  for(const phase of ['predeploy','postdeploy'])for(const patch of [{namespace_id:'wrong'},{simple:{limit:61,period:60}},{simple:{limit:60,period:10}},{type:'plain_text'}, {simple:undefined}]){
    assert.throws(()=>validatePublicReleaseState(config,{...next,bindings:next.bindings.map(b=>b.name===SCHOLARSHIP_LIMITER.name?{...b,...patch}:b)},schema,phase),/LIVE_BINDING_DRIFT/);
  }
  for(const patch of [{namespace_id:'wrong'},{simple:{limit:61,period:60}}]){
    assert.throws(()=>validatePublicReleaseState({...config,ratelimits:config.ratelimits.map(b=>b.name===SCHOLARSHIP_LIMITER.name?{...b,...patch}:b)},old,schema),/SCHOLARSHIP_BINDING_CONFIG_REQUIRED/);
  }
});

test('Scholarship contract matches actual immutable migrations and rejects every missing or altered object',()=>{
  assert.equal(scholarshipObjects.length,25);
  assert.equal(validateScholarshipReleaseSchema(scholarshipObjects,scholarshipLedger),true);
  for(const object of scholarshipObjects){
    assert.throws(()=>validateScholarshipReleaseSchema(scholarshipObjects.filter(x=>x!==object),scholarshipLedger),/SCHEMA_DRIFT/);
    assert.throws(()=>validateScholarshipReleaseSchema(scholarshipObjects.map(x=>x===object?{...x,sql:x.sql+' tampered'}:x),scholarshipLedger),/SCHEMA_DRIFT/);
  }
  for(const name of SCHOLARSHIP_MIGRATIONS){
    for(const ledger of [scholarshipLedger.filter(x=>x.name!==name),[...scholarshipLedger,{name}],
      scholarshipLedger.map(x=>x.name===name?{name:name.slice(0,4)+'_unrelated.sql'}:x)]){
      assert.throws(()=>validateScholarshipReleaseSchema(scholarshipObjects,ledger),/MIGRATION_LEDGER/);
    }
  }
  assert.throws(()=>validateScholarshipReleaseSchema([...scholarshipObjects,{type:'table',name:'scholarship_unknown',sql:'CREATE TABLE scholarship_unknown(id)'}],scholarshipLedger),/SCHEMA_DRIFT/);
  for(const [name,from,to]of [
    ['scholarship_campaigns','revision INTEGER NOT NULL DEFAULT 0','revision TEXT'],
    ['scholarship_snapshot_rows','scholarship_rank TEXT','missing_rank TEXT'],
    ['scholarship_snapshot_rows','ON DELETE RESTRICT','ON DELETE CASCADE'],
    ['scholarship_snapshot_rows','UNIQUE(batch_id, source_row_number)','UNIQUE(batch_id, student_code)'],
    ['scholarship_transaction_guard','CHECK(ok=1)','CHECK(ok=2)'],
    ['scholarship_snapshot_update_immutable',"='applied'","='approved'"],
  ]){
    const changed=scholarshipObjects.map(x=>x.name===name?{...x,sql:x.sql.replace(from,to)}:x);
    assert.notDeepEqual(changed,scholarshipObjects,from);
    assert.throws(()=>validateScholarshipReleaseSchema(changed,scholarshipLedger),/SCHEMA_DRIFT/);
  }
});

function fakeApi(phase='predeploy',override=()=>undefined){
  const calls=[],s=settings('100',phase),versionId=phase==='predeploy'?before:after;
  const fn=async(url,options)=>{
    calls.push({url,options});
    const forced=override(url,options,s,versionId);if(forced)return forced;
    const sql=options.body?JSON.parse(options.body).sql:null;
    const result=url.endsWith('/settings')?s:url.endsWith('/query')?[{results:sql===SCHOLARSHIP_SCHEMA_QUERY?scholarshipObjects:sql.includes("'0055_scholarships.sql'")?scholarshipLedger:sql.startsWith('PRAGMA')?schema:sql.includes('sqlite_schema')?objects:ledger,meta:{rows_written:0,changed_db:false}}]
      :url.endsWith('/deployments')?{deployments:[{created_on:'2026-10-12T00:00:00Z',versions:[{version_id:versionId,percentage:100}]}]}
      :url.endsWith(`/versions/${versionId}`)?{id:versionId,resources:{bindings:s.bindings}}:undefined;
    assert.ok(result,'No unexpected endpoint');
    return {ok:true,json:async()=>({success:true,result})};
  };
  return {calls,fn};
}
const opts=(api,phase='predeploy')=>({phase,account:PUBLIC_RELEASE_ACCOUNT,token:'offline-fixture',beforeVersion:before,fetchImpl:api.fn});

test('state reader uses only Public metadata GETs and the fixed read-only schema query',async()=>{
  for(const phase of ['predeploy','postdeploy']){
    const api=fakeApi(phase),r=await checkPublicReleaseState(config,opts(api,phase));
    assert.equal(r.versionId,phase==='predeploy'?before:after);assert.equal(api.calls.length,8);
    for(const {url,options}of api.calls){
      assert.ok(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${PUBLIC_RELEASE_ACCOUNT}/`));
      assert.equal(options.redirect,'error');
      if(url.endsWith('/query')){
        assert.equal(options.method,'POST');assert.ok(url.includes(PUBLIC_RELEASE_DB));
        const sql=JSON.parse(options.body).sql;
        assert.ok(sql==='PRAGMA table_info(ai_documents)'||sql===SCHOLARSHIP_SCHEMA_QUERY||sql===`SELECT name FROM d1_migrations WHERE name IN (${SCHOLARSHIP_MIGRATIONS.map(n=>`'${n}'`).join(',')})`||sql==="SELECT type,name,sql FROM sqlite_schema WHERE name IN ('ai_documents','ai_text_documents','ai_text_revisions','ai_text_revisions_document','ai_text_publication_source_guard')"||sql==="SELECT name FROM d1_migrations WHERE name IN ('0055_ai_document_index_segment_count.sql','0056_ai_text_document_revisions.sql')");
        assert.doesNotMatch(sql,/ALTER|INSERT|UPDATE|DELETE|DROP/i);
      }else{assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.ok(url.includes('/workers/scripts/hub-planner-public-dev-api/'));}
    }
  }
});

test('wrong account, Auth DB, absent previous version or invalid phase fail before network access',async()=>{
  for(const patch of [{account:'wrong'},{token:''},{phase:'skip'},{phase:'postdeploy',beforeVersion:undefined},{phase:'postdeploy',beforeVersion:after},
    {phase:'postdeploy',beforeVersion:'ecee213b-dbe8-4ce9-98e8-a8c9a13e184b'},
    {phase:'postdeploy',beforeVersion:'79c4f615-cab1-49be-81b4-6622bfe415d1'},
    {phase:'postdeploy',beforeVersion:'bba26eca-7811-4f1a-802e-f6bc7c6f7421'},
    {phase:'postdeploy',beforeVersion:'f5abb252-a042-45e7-9f4e-96bdb550dd8e'},
    {phase:'postdeploy',beforeVersion:'58c94fc8-5bfe-41e3-97f5-d0c39bc8be65'},
    {phase:'postdeploy',beforeVersion:'cd1d81be-966f-4518-8729-0b1c3e5484ce'},
    {phase:'postdeploy',beforeVersion:'66bc5fd9-55f4-4983-9048-0a271550ef9f'},
    {phase:'postdeploy',beforeVersion:'00000000-0000-4000-8000-000000000000'},
    {phase:'postdeploy',beforeVersion:'93e9bad7-39f3-4635-bb97-c6d71ccc4524'},
    {phase:'postdeploy',beforeVersion:'3e7f80ec-e268-4869-976a-6e26c38244b0'},
    {phase:'postdeploy',beforeVersion:'cf44c795-ddf0-4f56-b55c-6100029d6d3e'},
    {phase:'postdeploy',beforeVersion:'77374643-bb94-420a-ab4c-fd456fca516d'},
    {phase:'postdeploy',beforeVersion:'799042c2-47a2-471c-80dc-e13c42e237ef'},
    {phase:'postdeploy',beforeVersion:'9497fa3b-9a0c-422f-ab0e-4e3fe4a98ac1'}]){
    const api=fakeApi();await assert.rejects(()=>checkPublicReleaseState(config,{...opts(api),...patch}));assert.equal(api.calls.length,0);
  }
  const api=fakeApi();await assert.rejects(()=>checkPublicReleaseState({...config,d1_databases:[{...config.d1_databases[0],database_id:'auth'}]},opts(api)),/PUBLIC_ONLY_TARGET/);
  assert.equal(api.calls.length,0);
});

test('real SQLite Text-first schema requires additive migrations, exact ledger and publication guard',()=>{
  assert.equal(validateTextFirstReleaseSchema(schema,objects,ledger),true);
  assert.throws(()=>validateTextFirstReleaseSchema(schema.filter(c=>c.name!=='index_segment_count'),objects,ledger),/0055_SCHEMA/);
  for(const patch of [{type:'TEXT'},{notnull:1},{dflt_value:'0'}])assert.throws(()=>validateTextFirstReleaseSchema(schema.map(c=>c.name==='index_segment_count'?{...c,...patch}:c),objects,ledger),/0055_SCHEMA/);
  for(const name of TEXT_FIRST_MIGRATIONS){assert.throws(()=>validateTextFirstReleaseSchema(schema,objects,ledger.filter(x=>x.name!==name)),/LEDGER/);assert.throws(()=>validateTextFirstReleaseSchema(schema,objects,[...ledger,{name}]),/LEDGER/);}
  for(const object of objects)assert.throws(()=>validateTextFirstReleaseSchema(schema,objects.filter(x=>x.name!==object.name),ledger));
  assert.throws(()=>validateTextFirstReleaseSchema(schema,objects.map(x=>x.name==='ai_text_publication_source_guard'?{...x,sql:x.sql.replace('AND a.visibility=NEW.visibility','')}:x),ledger),/PUBLICATION_SCHEMA/);
  assert.throws(()=>validateTextFirstReleaseSchema(schema,objects.map(x=>x.name==='ai_documents'?{...x,sql:x.sql.replace('BETWEEN 1 AND 128','BETWEEN 1 AND 999')}:x),ledger),/SEGMENT_CHECK/);
});

test('state reader rejects partial or writable Text-first metadata',async()=>{
  for(const result of [{results:[],meta:{rows_written:0}},{results:objects,meta:{rows_written:1}},{results:objects,meta:{changed_db:true}}]){
    const api=fakeApi('predeploy',(_url,options)=>options.body&&JSON.parse(options.body).sql?.includes('sqlite_schema')?{ok:true,json:async()=>({success:true,result:[result]})}:undefined);
    await assert.rejects(()=>checkPublicReleaseState(config,opts(api)));
  }
});

test('state reader fails closed on missing Scholarship schema, full filenames, or writable metadata in both phases',async()=>{
  const wrap=result=>({ok:true,json:async()=>({success:true,result:[result]})});
  for(const phase of ['predeploy','postdeploy'])for(const [query,result]of [
    [SCHOLARSHIP_SCHEMA_QUERY,{results:[],meta:{rows_written:0}}],
    [SCHOLARSHIP_SCHEMA_QUERY,{results:scholarshipObjects,meta:{rows_written:1}}],
    [SCHOLARSHIP_SCHEMA_QUERY,{results:scholarshipObjects,meta:{changed_db:true}}],
    ["'0055_scholarships.sql'",{results:ledger,meta:{rows_written:0}}],
    ["'0055_scholarships.sql'",{results:scholarshipLedger.slice(1),meta:{rows_written:0}}],
  ]){
    const api=fakeApi(phase,(_url,options)=>options.body&&JSON.parse(options.body).sql.includes(query)?wrap(result):undefined);
    await assert.rejects(()=>checkPublicReleaseState(config,opts(api,phase)),/SCHOLARSHIP_|READ_ONLY_SCHEMA/);
    assert.ok(!api.calls.some(c=>c.url.endsWith('/deployments')));
  }
});

test('predeploy accepts reviewed e14d5e2c baseline and rejects previous or unknown versions',async()=>{
  assert.equal(before,'e14d5e2c-e381-46b3-a27d-2f41e9c21249');
  const evidence=JSON.parse(readFileSync('docs/public-release-baseline-e14d5e2c.json','utf8'));
  assert.equal(evidence.version,before);assert.equal(evidence.runId,'39923225777');
  assert.equal(evidence.sha,'d92dc81c658891cbb0a60a93393dcc7ff41adae5');
  assert.equal(evidence.previousVersion,'ecee213b-dbe8-4ce9-98e8-a8c9a13e184b');
  assert.equal(evidence.previousVersion,JSON.parse(readFileSync('docs/public-release-baseline-ecee213b.json','utf8')).version);
  assert.deepEqual(evidence.liveMetadata.deployment.versions,[{version_id:before,percentage:100}]);
  assert.equal(evidence.liveMetadata.version.id,before);
  assert.equal(evidence.liveMetadata.account,PUBLIC_RELEASE_ACCOUNT);
  assert.equal(evidence.liveMetadata.deployment.id,'74ef39cc-1107-41c2-a005-7b452f476b58');
  assert.equal(evidence.liveMetadata.deployment.strategy,'percentage');
  assert.equal(evidence.liveMetadata.version.number,469);
  assert.equal(evidence.liveMetadata.environment,'Production');
  assert.equal(evidence.liveMetadata.version.createdOn,'2026-10-23T08:24:21.944567Z');
  assert.equal(evidence.liveMetadata.deployment.createdOn,'2026-10-23T08:24:22.772233Z');
  assert.equal(evidence.liveMetadata.version.source,'wrangler');
  assert.equal(evidence.liveMetadata.deployment.source,'wrangler');
  assert.equal(evidence.liveMetadata.dashboardUi,null);
  assert.ok(evidence.liveMetadata.limitations.some(line=>line.includes('Ready status was not independently observed')));
  assert.equal(evidence.release.name,'Approved Public-only production release');
  assert.equal(evidence.release.sha,evidence.sha);assert.equal(evidence.release.branch,'main');
  assert.equal(evidence.release.event,'workflow_dispatch');assert.equal(evidence.release.conclusion,'success');
  const job=evidence.release.jobs.find(j=>j.name==='release-public');
  assert.equal(job.conclusion,'success');assert.equal(job.status,'completed');
  assert.equal(job.id,120314861550);
  assert.equal(evidence.worker,'hub-planner-public-dev-api');
  assert.equal(evidence.mainAtPreparation,'410137ab2e6eb7e94b1542846743a76b364c4f61');
  assert.equal(evidence.task10.merged,true);assert.equal(evidence.task10.number,139);
  assert.equal(evidence.task10.prUrl,'https://github.com/tqhoangg08/HUB-PLANNER/pull/139');
  assert.equal(evidence.task10.mergeSha,evidence.mainAtPreparation);
  assert.equal(evidence.task10.baseSha,evidence.sha);
  assert.equal(evidence.task10.headSha,'c7ebb96a4715301c47504886b25e2abcecd85e7b');
  const merge=spawnSync('git',['show','-s','--format=%P%n%s%n%cI',evidence.task10.mergeSha],{encoding:'utf8'});
  assert.equal(merge.status,0,merge.stderr);
  const [parents,subject,committedAt]=merge.stdout.trim().split(/\r?\n/);
  assert.deepEqual(evidence.task10.parents,[evidence.task10.baseSha,evidence.task10.headSha]);
  assert.deepEqual(parents.split(' '),evidence.task10.parents);
  assert.match(subject,/^Merge pull request #139 /);
  assert.equal(committedAt,evidence.task10.committedAt);
  assert.ok(Date.parse(evidence.release.updatedAt)<Date.parse(committedAt));
  assert.ok(Date.parse(committedAt)<=Date.parse(evidence.task10.mergedAt));
  assert.ok(Date.parse(evidence.release.updatedAt)<Date.parse(evidence.task10.mergedAt),'This baseline is not the Task 10 production release');
  assert.equal(evidence.release.runId,evidence.runId);assert.equal(evidence.release.url,evidence.url);
  assert.equal(evidence.url,`https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/${evidence.runId}`);
  assert.equal(evidence.release.createdAt,'2026-10-23T08:14:11Z');
  assert.equal(evidence.release.startedAt,evidence.release.createdAt);
  assert.equal(evidence.release.status,'completed');assert.equal(evidence.release.attempt,1);
  assert.equal(evidence.release.actorId,252552483);assert.equal(evidence.release.triggeringActorId,252552483);
  const validate=evidence.release.jobs.find(j=>j.name==='validate');
  assert.equal(validate.id,120313245566);assert.equal(validate.conclusion,'success');assert.equal(validate.status,'completed');
  assert.ok(Date.parse(evidence.release.startedAt)<=Date.parse(validate.startedAt));
  assert.ok(Date.parse(validate.startedAt)<=Date.parse(validate.completedAt));
  assert.ok(Date.parse(validate.completedAt)<=Date.parse(job.startedAt));
  assert.ok(Date.parse(job.startedAt)<=Date.parse(job.completedAt));
  assert.ok(Date.parse(job.completedAt)<=Date.parse(evidence.release.updatedAt));
  assert.ok(Date.parse(evidence.release.updatedAt)<=Date.parse(evidence.liveMetadata.recordedAt));
  for(const name of ['Verify live settings and schema without applying migrations','Verify solo owner approval, live protections and exact-SHA CI','Deploy Public Worker and frontend assets','Verify serving Public version preserves V2 100 percent and document flags remain OFF']){
    const step=job.steps.find(s=>s.name===name);assert.equal(step.status,'completed');assert.equal(step.conclusion,'success');
  }
  assert.deepEqual(job.steps.map(step=>step.number),[6,7,8,9]);
  assert.ok(job.steps.every((step,index)=>Date.parse(step.startedAt)<=Date.parse(step.completedAt)&&(index===0||Date.parse(job.steps[index-1].completedAt)<=Date.parse(step.startedAt))));
  for(const receipt of [`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${evidence.previousVersion}`,`APPROVED_SHA: ${evidence.sha}`,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS',`Current Version ID: ${before}`]){
    assert.ok(evidence.release.receipts.some(line=>line.includes(receipt)));
  }
  for(const created of [evidence.liveMetadata.version.createdOn,evidence.liveMetadata.deployment.createdOn]){
    assert.ok(Date.parse(job.startedAt)<=Date.parse(created)&&Date.parse(created)<=Date.parse(job.completedAt));
    const deploy=job.steps.find(s=>s.name==='Deploy Public Worker and frontend assets');
    assert.ok(Date.parse(deploy.startedAt)<=Date.parse(created)&&Date.parse(created)<=Date.parse(deploy.completedAt));
  }
  assert.ok(Date.parse(evidence.liveMetadata.version.createdOn)<=Date.parse(evidence.liveMetadata.deployment.createdOn));
  const receiptTimes=evidence.release.receipts.map(line=>Date.parse(line.split(' ')[0]));
  assert.ok(receiptTimes.every((time,index)=>Number.isFinite(time)&&Date.parse(job.startedAt)<=time&&time<=Date.parse(job.completedAt)&&(index===0||receiptTimes[index-1]<=time)));
  assert.ok(evidence.release.receipts.some(line=>line.endsWith(` ${evidence.sha}`)));
  assert.ok(evidence.release.receipts.some(line=>line.includes('Success! Uploaded 55 files (115 already uploaded)')));
  assert.ok(evidence.release.receipts.some(line=>line.includes('Uploaded hub-planner-public-dev-api')));
  assert.ok(evidence.release.receipts.some(line=>line.includes('Deployed hub-planner-public-dev-api triggers')));
  assert.ok(evidence.release.receipts.some(line=>line.includes(`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${before}`)));
  assert.deepEqual(evidence.release.rollout,{mode:'canary',percent:100,documentFlags:{AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT:'0'}});
  for(const [name,value] of Object.entries({AI_ADVISOR_V2_MODE:'canary',AI_ADVISOR_V2_CANARY_PERCENT:'100',...evidence.release.rollout.documentFlags})){
    assert.ok(evidence.release.receipts.some(line=>line.includes(`env.${name} ("${value}")`)));
  }
  for(const [stepNumber,receipt] of [[6,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${evidence.previousVersion}`],[7,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS'],[8,`Current Version ID: ${before}`],[9,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${before}`]]){
    const step=job.steps.find(s=>s.number===stepNumber);
    const time=Date.parse(evidence.release.receipts.find(line=>line.includes(receipt)).split(' ')[0]);
    // GitHub step timestamps have second precision; log receipts have fractions.
    assert.ok(time>=Date.parse(step.startedAt)&&time<Date.parse(step.completedAt)+1000);
  }
  const wrap=result=>({ok:true,json:async()=>({success:true,result})});
  const reviewed=fakeApi('predeploy');
  assert.equal((await checkPublicReleaseState(config,opts(reviewed))).versionId,before);
  assert.ok(reviewed.calls.some(c=>c.url.endsWith(`/versions/${before}`)));
  const unknown=fakeApi('predeploy',url=>url.endsWith('/deployments')?wrap({deployments:[{created_on:'2026-10-16T00:00:00Z',versions:[{version_id:after,percentage:100}]}]}):undefined);
  await assert.rejects(()=>checkPublicReleaseState(config,opts(unknown)),/UNREVIEWED_PREDEPLOY_VERSION/);
  assert.ok(!unknown.calls.some(c=>c.url.includes('/versions/')));
  for(const obsoleteVersion of ['ecee213b-dbe8-4ce9-98e8-a8c9a13e184b','79c4f615-cab1-49be-81b4-6622bfe415d1','bba26eca-7811-4f1a-802e-f6bc7c6f7421','f5abb252-a042-45e7-9f4e-96bdb550dd8e','58c94fc8-5bfe-41e3-97f5-d0c39bc8be65','cd1d81be-966f-4518-8729-0b1c3e5484ce','66bc5fd9-55f4-4983-9048-0a271550ef9f','93e9bad7-39f3-4635-bb97-c6d71ccc4524','3e7f80ec-e268-4869-976a-6e26c38244b0','cf44c795-ddf0-4f56-b55c-6100029d6d3e','77374643-bb94-420a-ab4c-fd456fca516d','e17bfe9f-5aa8-45e8-88fe-9fc63c26b2a3','799042c2-47a2-471c-80dc-e13c42e237ef','6ff2cbdb-5c4a-485b-8bb6-f310e5d39ec6','9497fa3b-9a0c-422f-ab0e-4e3fe4a98ac1','d102b7e6-0a37-448c-acce-5f8e795af13c']){
    const obsolete=fakeApi('predeploy',url=>url.endsWith('/deployments')?wrap({deployments:[{created_on:'2026-10-16T00:00:00Z',versions:[{version_id:obsoleteVersion,percentage:100}]}]}):undefined);
    await assert.rejects(()=>checkPublicReleaseState(config,opts(obsolete)),/UNREVIEWED_PREDEPLOY_VERSION/);
    assert.ok(!obsolete.calls.some(c=>c.url.includes('/versions/')));
  }
  const changed=fakeApi('predeploy',url=>url.includes('/versions/')?wrap({id:before,resources:{bindings:settings('100').bindings.filter(b=>b.name!==SCHOLARSHIP_LIMITER.name)}}):undefined);
  await assert.rejects(()=>checkPublicReleaseState(config,opts(changed)),/LIVE_BINDING_DRIFT/);
  const missing=fakeApi('predeploy',url=>url.endsWith('/settings')?wrap({...settings('100'),bindings:settings('100').bindings.filter(b=>b.name!==SCHOLARSHIP_LIMITER.name)}):undefined);
  await assert.rejects(()=>checkPublicReleaseState(config,opts(missing)),/LIVE_BINDING_DRIFT/);
});

test('reviewed baseline still rejects partial or split traffic in both release phases',async()=>{
  for(const phase of ['predeploy','postdeploy'])for(const versions of [
    ...[0,7,99,101,'100',undefined].map(percentage=>[{version_id:phase==='predeploy'?before:after,percentage}]),
    [{version_id:before,percentage:50},{version_id:after,percentage:50}],
    [{version_id:before,percentage:100},{version_id:after,percentage:0}],
  ]){
    const api=fakeApi(phase,url=>url.endsWith('/deployments')?{ok:true,json:async()=>({success:true,result:{deployments:[{created_on:'2026-10-17T00:00:00Z',versions}]}})}:undefined);
    await assert.rejects(()=>checkPublicReleaseState(config,opts(api,phase)),/SINGLE_PUBLIC_VERSION_REQUIRED/);
  }
});

test('postflight rejects old/split traffic or serving version still at seven despite settings at 100',async()=>{
  const wrap=result=>({ok:true,json:async()=>({success:true,result})});
  for(const result of [{deployments:[]},{deployments:[{created_on:'invalid',versions:[]}]},
    {deployments:[{created_on:'2026-10-12T00:00:00Z',versions:[{version_id:before,percentage:100}]}]},
    {deployments:[{created_on:'2026-10-12T00:00:00Z',versions:[{version_id:after,percentage:90},{version_id:before,percentage:10}]}]}]){
    const api=fakeApi('postdeploy',url=>url.endsWith('/deployments')?wrap(result):undefined);
    await assert.rejects(()=>checkPublicReleaseState(config,opts(api,'postdeploy')));
  }
  for(const resource of [{id:before,resources:{bindings:settings('100','postdeploy').bindings}},{id:after,resources:{bindings:settings('7','postdeploy').bindings}},{id:after,resources:{}},
    {id:after,resources:{bindings:patchVar(settings('100','postdeploy'),'AI_ADVISOR_V2_GENERATOR_MODEL','wrong-model').bindings}},
    {id:after,resources:{bindings:settings('100','postdeploy').bindings.map(b=>b.name==='DB'?{...b,id:'wrong-db'}:b)}}]){
    const api=fakeApi('postdeploy',url=>url.includes('/versions/')?wrap(resource):undefined);
    await assert.rejects(()=>checkPublicReleaseState(config,opts(api,'postdeploy')));
  }
});

test('HTTP, malformed JSON, timeout and incomplete metadata never retry or expose provider content',async()=>{
  for(const forced of [{ok:false,status:403,json:async()=>({secret:'never-read'})},{ok:true,json:async()=>{throw Error('private-body');}},{ok:true,json:async()=>({success:true})}]){
    const api=fakeApi('predeploy',()=>forced);await assert.rejects(()=>checkPublicReleaseState(config,opts(api)),/^Error: READ_ONLY_STATE_/);assert.equal(api.calls.length,1);
  }
  let calls=0;await assert.rejects(()=>checkPublicReleaseState(config,{...opts(fakeApi()),fetchImpl:async()=>{calls++;throw Error('private-timeout');}}),/READ_ONLY_STATE_UNAVAILABLE/);assert.equal(calls,1);
});

test('workflow keeps exact-SHA/owner guard immediately before deploy and mandatory postflight after it',()=>{
  const y=readFileSync('.github/workflows/deploy-cloudflare-production.yml','utf8').replace(/\r\n/g,'\n');
  assert.match(y,/id: public-preflight/);assert.match(y,/check-public-release-state.mjs --predeploy/);
  const guard=y.indexOf('run: node scripts/check-public-release-approval.mjs\n',y.indexOf('  release-public:'));
  const deploy=y.indexOf('run: npx wrangler deploy --config cloudflare/wrangler.jsonc --keep-vars');
  const post=y.indexOf('run: node scripts/check-public-release-state.mjs --postdeploy');
  assert.ok(guard>=0&&guard<deploy&&deploy<post);
  assert.match(y,/PUBLIC_RELEASE_VERSION_BEFORE: \$\{\{ steps.public-preflight.outputs.public_version_before \}\}/);
  assert.doesNotMatch(y,/always\(\)|continue-on-error|migrations apply|wrangler\.auth|skip_guard/);
});

test('CLI cannot select arbitrary from/to percentages or disable drift checking',()=>{
  for(const flag of ['--skip','--from=100','--to=7','--postdeploy --skip']){
    const r=spawnSync(process.execPath,['scripts/check-public-release-state.mjs',...flag.split(' ')],{encoding:'utf8',env:{}});
    assert.equal(r.status,1);assert.match(r.stderr,/UNSUPPORTED_RELEASE_ARGUMENT/);
  }
});

test('baseline pin changes only its UUID and two comments; historical Git evidence stays intact',()=>{
  const evidence=JSON.parse(readFileSync('docs/public-release-baseline-e14d5e2c.json','utf8'));
  const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
  const normalize=s=>s.replace(/\r\n/g,'\n')
    .replace(/^\/\/ Reviewed release baseline:.*$/m,'// Reviewed release baseline: <REVIEWED_RELEASE>.')
    .replace(/^\/\/ See docs\/public-release-baseline-.*$/m,'// See <REVIEWED_EVIDENCE>.')
    .replace(/export const PUBLIC_RELEASE_PREDEPLOY_VERSION='[^']+';/,"export const PUBLIC_RELEASE_PREDEPLOY_VERSION='<REVIEWED_VERSION>';");
  const old=git('show',`${evidence.mainAtPreparation}:scripts/check-public-release-state.mjs`).replace(/\r\n/g,'\n');
  const current=readFileSync('scripts/check-public-release-state.mjs','utf8').replace(/\r\n/g,'\n');
  assert.equal(normalize(old),normalize(current));
  assert.equal(createHash('sha256').update(normalize(current)).digest('hex'),evidence.validation.guardSourceSha256IgnoringPinAndComments);
  const oldLines=old.split('\n'),newLines=current.split('\n');assert.equal(oldLines.length,newLines.length);
  assert.deepEqual(newLines.flatMap((line,index)=>line===oldLines[index]?[]:[index+1]),[12,13,14]);
  assert.deepEqual(evidence.validation.guardChangedLines,[12,13,14]);
  assert.equal(evidence.validation.guardLogicEquivalentExceptPinAndComments,true);
  const historical=git('ls-tree','-r',evidence.mainAtPreparation,'--','docs').trim().split('\n').map(line=>{
    const [metadata,path]=line.split('\t');return {path,blob:metadata.split(' ')[2]};
  }).filter(row=>row.path.includes('public-release-baseline')).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  assert.deepEqual(historical,evidence.validation.historicalBaselineManifest);
  assert.equal(historical.length,evidence.validation.historicalBaselineFilesPreserved);
  assert.equal(createHash('sha256').update(JSON.stringify(historical)).digest('hex'),evidence.validation.historicalBaselineManifestSha256);
  for(const row of historical)assert.equal(git('hash-object',`--path=${row.path}`,row.path).trim(),row.blob,row.path);
});
