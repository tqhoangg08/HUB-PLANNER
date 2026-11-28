import test from 'node:test';
import './release-baseline-transition.test.mjs';
import {assertHk2ReleaseFreeze,readPreHostnameTransitionFile} from './fixtures/hk2-release-freeze.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {checkPublicReleaseState,validatePublicReleaseState,validateTextFirstReleaseSchema,TEXT_FIRST_MIGRATIONS,PUBLIC_RELEASE_ACCOUNT,PUBLIC_RELEASE_DB,PUBLIC_RELEASE_PREDEPLOY_VERSION,SCHOLARSHIP_LIMITER} from '../scripts/check-public-release-state.mjs';
import {validateScholarshipReleaseSchema,SCHOLARSHIP_MIGRATIONS,SCHOLARSHIP_SCHEMA_QUERY} from '../scripts/scholarship-release-schema.mjs';
import {ANNOUNCEMENT_SCHEMA_QUERY,ANNOUNCEMENT_LEDGER_QUERY} from '../scripts/announcement-release-schema.mjs';
import {announcementReleaseFixture} from './announcement-release-fixture.mjs';

const config=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8')).config;
const before=PUBLIC_RELEASE_PREDEPLOY_VERSION,after='22222222-2222-4222-8222-222222222222';
const historicalBefore='e14d5e2c-e381-46b3-a27d-2f41e9c21249';
const historicalV470='d4b614d4-1b59-47ec-be36-ad54a40e49f4';
const historicalV471='edcbad46-de0e-439a-b00b-4e4a06a683b0';
const historicalV472='2a898cfc-0e65-4e33-bd07-49901f0ec06b';
const historicalV473='655fda62-1767-4fb9-992e-780de214d2ec';
const historicalV474='782cd1c4-8ddb-41bc-9a51-9e2768a0b6e6';
const historicalV475='4a9e7d99-c2cb-4206-8318-2b13b5fb249a';
const historicalV476='78a4f08b-ea3b-4fad-839e-baec2da98c56';
const historicalV477='04e1f162-6ca5-4ef1-8161-aa74deefef68';
const v476BaselineCommit='8416837eb5ce648ce9c1c6237b4eed81802dbd03';
const {objects:announcementObjects,ledger:announcementLedger}=announcementReleaseFixture();
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
    const result=url.endsWith('/subdomain')?{enabled:false,previews_enabled:false}:url.endsWith('/settings')?s:url.endsWith('/query')?[{results:sql===ANNOUNCEMENT_SCHEMA_QUERY?announcementObjects:sql===ANNOUNCEMENT_LEDGER_QUERY?announcementLedger:sql===SCHOLARSHIP_SCHEMA_QUERY?scholarshipObjects:sql.includes("'0055_scholarships.sql'")?scholarshipLedger:sql.startsWith('PRAGMA')?schema:sql.includes('sqlite_schema')?objects:ledger,meta:{rows_written:0,changed_db:false}}]
      :url.endsWith('/deployments')?{deployments:[{created_on:'2026-10-12T00:00:00Z',versions:[{version_id:versionId,percentage:100}]}]}
      :url.endsWith(`/versions/${versionId}`)?{id:versionId,resources:{bindings:s.bindings}}:undefined;
    assert.ok(result,'No unexpected endpoint');
    return {ok:true,json:async()=>({success:true,result})};
  };
  return {calls,fn};
}
const opts=(api,phase='predeploy')=>({phase,account:PUBLIC_RELEASE_ACCOUNT,token:'offline-fixture',beforeVersion:before,fetchImpl:api.fn});

test('state reader uses only Public metadata GETs and the fixed read-only schema queries',async()=>{
  for(const phase of ['predeploy','postdeploy']){
    const api=fakeApi(phase),r=await checkPublicReleaseState(config,opts(api,phase));
    assert.equal(r.versionId,phase==='predeploy'?before:after);assert.equal(api.calls.length,11);
    assert.ok(api.calls[0].url.endsWith('/workers/scripts/hub-planner-public-dev-api/subdomain'));
    for(const {url,options}of api.calls){
      assert.ok(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${PUBLIC_RELEASE_ACCOUNT}/`));
      assert.equal(options.redirect,'error');
      if(url.endsWith('/query')){
        assert.equal(options.method,'POST');assert.ok(url.includes(PUBLIC_RELEASE_DB));
        const sql=JSON.parse(options.body).sql;
        assert.ok(sql==='PRAGMA table_info(ai_documents)'||sql===ANNOUNCEMENT_SCHEMA_QUERY||sql===ANNOUNCEMENT_LEDGER_QUERY||sql===SCHOLARSHIP_SCHEMA_QUERY||sql===`SELECT name FROM d1_migrations WHERE name IN (${SCHOLARSHIP_MIGRATIONS.map(n=>`'${n}'`).join(',')})`||sql==="SELECT type,name,sql FROM sqlite_schema WHERE name IN ('ai_documents','ai_text_documents','ai_text_revisions','ai_text_revisions_document','ai_text_publication_source_guard')"||sql==="SELECT name FROM d1_migrations WHERE name IN ('0055_ai_document_index_segment_count.sql','0056_ai_text_document_revisions.sql')");
        assert.doesNotMatch(sql,/ALTER|INSERT|UPDATE|DELETE|DROP/i);
      }else{assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.ok(url.includes('/workers/scripts/hub-planner-public-dev-api/'));}
    }
  }
});

test('both hostname flags must be explicitly disabled in config and live before any schema query',async()=>{
  const disabled={enabled:false,previews_enabled:false};
  for(const phase of ['predeploy','postdeploy']){
    for(const field of ['workers_dev','preview_urls'])for(const value of [undefined,true,'false',null,0]){
      const api=fakeApi(phase);
      await assert.rejects(checkPublicReleaseState({...config,[field]:value},opts(api,phase)),/PUBLIC_HOSTNAME_CONFIG_MUST_BE_DISABLED/);
      assert.equal(api.calls.length,0);
    }
    for(const field of Object.keys(disabled))for(const value of [undefined,true,'false',null,0]){
      const api=fakeApi(phase,url=>url.endsWith('/subdomain')?Response.json({success:true,result:{...disabled,[field]:value}}):undefined);
      await assert.rejects(checkPublicReleaseState(config,opts(api,phase)),/PUBLIC_LIVE_HOSTNAMES_NOT_DISABLED/);
      assert.equal(api.calls.length,1);
    }
    for(const response of [Response.json({success:false,result:disabled}),Response.json({success:true,result:null}),
      Response.json({success:false},{status:403}),new Response('invalid JSON')]){
      const api=fakeApi(phase,url=>url.endsWith('/subdomain')?response:undefined);
      await assert.rejects(checkPublicReleaseState(config,opts(api,phase)),/READ_ONLY_STATE_/);
      assert.equal(api.calls.length,1);
    }
  }
});

test('wrong account, Auth DB, absent previous version or invalid phase fail before network access',async()=>{
  for(const patch of [{account:'wrong'},{token:''},{phase:'skip'},{phase:'postdeploy',beforeVersion:undefined},{phase:'postdeploy',beforeVersion:after},
    {phase:'postdeploy',beforeVersion:historicalV477},{phase:'postdeploy',beforeVersion:historicalV470},{phase:'postdeploy',beforeVersion:historicalV472},{phase:'postdeploy',beforeVersion:historicalV473},
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

test('historical v475 receipts remain intact without claiming deployment of preparation main or original artifact bytes',async()=>{
  const before=historicalV475;
  const e=JSON.parse(readFileSync('docs/public-release-baseline-4a9e7d99.json','utf8'));
  assert.equal(e.version,before);
  assert.equal(e.previousVersion,historicalV474);
  assert.equal(e.previousVersion,JSON.parse(readFileSync(e.previousEvidence.path,'utf8')).version);
  const blob=spawnSync('git',['hash-object',`--path=${e.previousEvidence.path}`,e.previousEvidence.path],{encoding:'utf8'});
  assert.equal(blob.status,0);assert.equal(blob.stdout.trim(),e.previousEvidence.gitBlob);
  assert.equal(e.sha,'27b55eba00d89c1de13388cf63b6501527df39ae');
  assert.equal(e.mainAtPreparation,'18588ffbe1fb82c4716caed419c37662025eee65');
  assert.notEqual(e.sha,e.mainAtPreparation);assert.equal(e.mainAtPreparationDeploymentVerified,false);
  assert.equal(e.ownerAcceptance.scope,'baseline PR preparation only');
  assert.equal(e.ownerAcceptance.frontendArtifactByteComparisonLimitationAccepted,true);
  assert.equal(e.ownerAcceptance.authorizesRelease,false);
  const ancestor=spawnSync('git',['merge-base','--is-ancestor',e.sha,e.mainAtPreparation]);
  assert.equal(ancestor.status,0);
  assert.equal(e.runId,'41296397768');assert.equal(e.release.releasePublicJobId,124818998999);
  assert.equal(e.release.url,`https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/${e.runId}`);
  assert.equal(e.release.event,'workflow_dispatch');assert.equal(e.release.branch,'main');assert.equal(e.release.attempt,1);
  assert.equal(e.release.status,'completed');assert.equal(e.release.conclusion,'success');
  assert.equal(e.release.actorId,252552483);assert.equal(e.release.triggeringActorId,e.release.actorId);
  assert.deepEqual(e.release.stepConclusions,{predeploy:'success',ownerApproval:'success',deploy:'success',postdeploy:'success'});
  assert.equal(e.release.receipts.predeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${historicalV474}`);
  assert.equal(e.release.receipts.ownerApproval,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS');
  assert.equal(e.release.receipts.deployedVersion,`Current Version ID: ${before}`);
  assert.equal(e.release.receipts.postdeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${before}`);
  for(const receipt of Object.values(e.release.receipts))assert.ok(e.release.logReceipts.some(line=>line.endsWith(receipt)));
  assert.ok(e.release.logReceipts.some(line=>line.endsWith(` ${e.sha}`)));
  assert.ok(e.release.logReceipts.some(line=>line.endsWith('Uploaded 55 of 55 assets')));
  assert.equal(e.independentValidation.runId,'41295479881');assert.equal(e.independentValidation.sha,e.sha);
  assert.equal(e.independentValidation.status,'completed');assert.equal(e.independentValidation.conclusion,'success');
  assert.equal(e.independentValidation.event,'workflow_dispatch');assert.equal(e.independentValidation.branch,'main');
  assert.equal(e.liveMetadata.version.number,475);assert.equal(e.liveMetadata.version.id,before);
  assert.equal(e.liveMetadata.version.hasGitShaAnnotation,false);
  assert.equal(e.liveMetadata.deployment.id,'5899cd61-efc7-4692-80e4-9de4a5796449');
  assert.deepEqual(e.liveMetadata.deployment.versions,[{version_id:before,percentage:100}]);
  assert.ok(Date.parse(e.release.releasePublicStartedAt)<=Date.parse(e.liveMetadata.version.createdOn));
  assert.ok(Date.parse(e.liveMetadata.version.createdOn)<=Date.parse(e.liveMetadata.deployment.createdOn));
  assert.ok(Date.parse(e.liveMetadata.deployment.createdOn)<=Date.parse(e.release.releasePublicCompletedAt));
  const inventory=e.assets.pathInventory;
  assert.equal(inventory.paths.length,135);assert.equal(new Set(inventory.paths).size,135);
  assert.deepEqual(inventory.paths,[...inventory.paths].sort());
  assert.equal(createHash('sha256').update(JSON.stringify(inventory.paths)).digest('hex'),inventory.buildSha256);
  assert.equal(inventory.buildSha256,inventory.liveSha256);
  assert.equal(inventory.buildCount,inventory.liveCount);assert.equal(inventory.missingCount,0);assert.equal(inventory.extraCount,0);
  assert.equal(e.assets.frontendByteForByteVerified,false);assert.equal(e.assets.originalArtifactAvailable,false);
  assert.equal(e.assets.originalArtifactDigest,null);
  assert.ok(e.limitations.some(text=>text.includes('PR #157')));
  // An old version remains historical evidence, never an alternative accepted pin.
  const api=fakeApi('predeploy');assert.equal((await checkPublicReleaseState(config,opts(api))).versionId,PUBLIC_RELEASE_PREDEPLOY_VERSION);
  for(const versionId of [before,historicalV474,historicalV476,historicalV477,after]){
    const api=fakeApi('predeploy',url=>url.endsWith('/deployments')?{ok:true,json:async()=>({success:true,result:{deployments:[{created_on:'2026-11-01T10:21:54Z',versions:[{version_id:versionId,percentage:100}]}]}})}:undefined);
    await assert.rejects(()=>checkPublicReleaseState(config,opts(api)),/UNREVIEWED_PREDEPLOY_VERSION/);
    assert.ok(!api.calls.some(call=>call.url.includes('/versions/')));
  }
});

test('v476 evidence binds fresh live metadata, guarded release, audit receipts and truthful frontend limitations',async()=>{
  const before=historicalV476;
  const e=JSON.parse(readFileSync('docs/public-release-baseline-78a4f08b.json','utf8'));
  assert.equal(e.version,before);assert.equal(e.version,'78a4f08b-ea3b-4fad-839e-baec2da98c56');
  assert.equal(e.previousVersion,historicalV475);
  assert.equal(e.worker,config.name);assert.equal(e.account,PUBLIC_RELEASE_ACCOUNT);
  assert.equal(e.sha,'bdfb86567497948a371d4ac44cc9952068bc1431');
  assert.equal(e.mainAtPreparation,'6baed20ffc55f1e781629dc167b3606853613d46');
  assert.notEqual(e.sha,e.mainAtPreparation);assert.equal(e.mainAtPreparationDeploymentVerified,false);
  const ancestor=spawnSync('git',['merge-base','--is-ancestor',e.sha,e.mainAtPreparation]);assert.equal(ancestor.status,0);
  assert.equal(e.runId,'44540683447');assert.equal(e.release.releasePublicJobId,135620808408);
  assert.equal(e.release.url,`https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/${e.runId}`);
  assert.equal(e.release.event,'workflow_dispatch');assert.equal(e.release.branch,'main');assert.equal(e.release.attempt,1);
  assert.equal(e.release.status,'completed');assert.equal(e.release.conclusion,'success');
  assert.equal(e.release.actorId,252552483);assert.equal(e.release.triggeringActorId,e.release.actorId);
  assert.deepEqual(e.release.stepConclusions,{predeploy:'success',ownerApproval:'success',deploy:'success',postdeploy:'success'});
  assert.equal(e.release.receipts.predeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${historicalV475}`);
  assert.equal(e.release.receipts.ownerApproval,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS');
  assert.equal(e.release.receipts.deployedVersion,`Current Version ID: ${before}`);
  assert.equal(e.release.receipts.postdeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${before}`);
  for(const receipt of Object.values(e.release.receipts))assert.ok(e.release.logReceipts.some(line=>line.endsWith(receipt)));
  assert.ok(e.release.logReceipts.some(line=>line.endsWith(`APPROVED_SHA: ${e.sha}`)));
  assert.ok(e.release.logReceipts.some(line=>line.endsWith('Uploaded 55 of 55 assets')));
  assert.equal(e.independentValidation.runId,'44279728583');assert.equal(e.independentValidation.sha,e.sha);
  assert.equal(e.preparationValidation.runId,'44736905686');assert.equal(e.preparationValidation.sha,e.mainAtPreparation);
  for(const ci of [e.independentValidation,e.preparationValidation]){
    assert.equal(ci.event,'workflow_dispatch');assert.equal(ci.branch,'main');
    assert.equal(ci.status,'completed');assert.equal(ci.conclusion,'success');
  }
  assert.equal(e.preparationValidation.authorizesRelease,false);
  assert.equal(e.liveMetadata.version.id,before);assert.equal(e.liveMetadata.version.number,476);
  assert.equal(e.liveMetadata.version.hasGitShaAnnotation,false);assert.equal(e.liveMetadata.latestUploadedVersionId,before);
  assert.equal(e.liveMetadata.deployment.id,'390fb7da-16d3-4a07-a244-d092424e5ecc');
  assert.deepEqual(e.liveMetadata.deployment.versions,[{version_id:before,percentage:100}]);
  assert.ok(Date.parse(e.liveMetadata.checkedAtUtc)>Date.parse(e.release.releasePublicCompletedAt));
  assert.ok(Date.parse(e.release.releasePublicStartedAt)<=Date.parse(e.liveMetadata.version.createdOn));
  assert.ok(Date.parse(e.liveMetadata.version.createdOn)<=Date.parse(e.liveMetadata.deployment.createdOn));
  assert.ok(Date.parse(e.liveMetadata.deployment.createdOn)<=Date.parse(e.release.releasePublicCompletedAt));
  assert.deepEqual(e.liveMetadata.comparisonWithV475,{bindingCount:66,bindingsMatch:true,runtimeMatches:true,scriptEtagMatches:false});
  assert.equal(e.auditReceipts.entries.length,3);
  for(const a of e.auditReceipts.entries){
    assert.equal(a.httpStatus,200);assert.ok(a.uri.includes(`/accounts/${e.account}/workers/scripts/${e.worker}/`));
    assert.ok(Date.parse(a.atUtc)>=Date.parse(e.release.releasePublicStartedAt)&&Date.parse(a.atUtc)<=Date.parse(e.release.releasePublicCompletedAt));
  }
  assert.equal(e.auditReceipts.entries.find(a=>a.resourceType==='scripts.versions').versionId,before);
  assert.equal(e.auditReceipts.entries.find(a=>a.resourceType==='scripts.deployments').deploymentId,e.liveMetadata.deployment.id);
  const inventory=e.assets.pathInventory;
  assert.equal(inventory.buildCount,134);assert.equal(inventory.liveCount,134);
  assert.equal(inventory.paths.length,134);assert.equal(new Set(inventory.paths).size,134);
  assert.deepEqual(inventory.paths,[...inventory.paths].sort());assert.deepEqual(inventory.missing,[]);assert.deepEqual(inventory.extra,[]);
  assert.equal(createHash('sha256').update(JSON.stringify(inventory.paths)).digest('hex'),inventory.buildSha256);
  assert.equal(inventory.buildSha256,inventory.liveSha256);
  assert.equal(e.assets.frontendByteForByteVerified,false);assert.equal(e.assets.originalArtifactAvailable,false);assert.equal(e.assets.originalArtifactDigest,null);
  assert.equal(e.ownerAcceptance.scope,'baseline PR preparation only');assert.equal(e.ownerAcceptance.authorizesRelease,false);
  assert.equal(e.ownerAcceptance.frontendArtifactByteComparisonLimitationAccepted,false);assert.equal(e.ownerAcceptance.requiresOwnerReview,true);
  for(const historical of [historicalV475,historicalV476])
    await assert.rejects(()=>checkPublicReleaseState(config,{...opts(fakeApi('postdeploy'),'postdeploy'),beforeVersion:historical}),/PREDEPLOY_VERSION_REQUIRED/);
});

test('v476 changes exactly the reviewed pin and two provenance comments; historical evidence and protected surfaces are unchanged',()=>{
  const e=JSON.parse(readFileSync('docs/public-release-baseline-78a4f08b.json','utf8'));
  const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
  const path='scripts/check-public-release-state.mjs',old=git('show',`${e.mainAtPreparation}:${path}`).replace(/\r\n/g,'\n'),now=git('show',`${v476BaselineCommit}:${path}`).replace(/\r\n/g,'\n');
  const normalize=s=>s.replace(/^\/\/ Reviewed release baseline:.*$/m,'<BASELINE_COMMENT>')
    .replace(/^\/\/ See docs\/public-release-baseline-.*$/m,'<BASELINE_RECEIPT>')
    .replace(/export const PUBLIC_RELEASE_PREDEPLOY_VERSION='[^']+';/,'<BASELINE_PIN>');
  assert.equal(normalize(now),normalize(old));
  assert.equal(createHash('sha256').update(normalize(now)).digest('hex'),e.validation.guardSourceSha256IgnoringPinAndComments);
  assert.deepEqual(now.split('\n').flatMap((line,i)=>line===old.split('\n')[i]?[]:[i+1]),[13,14,15]);
  assert.deepEqual(e.validation.guardChangedLines,[13,14,15]);assert.equal(e.validation.guardLogicEquivalentExceptPinAndComments,true);
  const manifest=git('ls-tree','-r',e.mainAtPreparation,'--','docs').trim().split('\n').map(line=>{
    const [meta,path]=line.split('\t');return{path,blob:meta.split(' ')[2]};
  }).filter(row=>row.path.includes('public-release-baseline')).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  assert.deepEqual(manifest,e.validation.historicalBaselineManifest);
  for(const row of manifest)assert.equal(git('hash-object',`--path=${row.path}`,row.path).trim(),row.blob,row.path);
  assert.equal(git('hash-object',`--path=${e.previousEvidence.path}`,e.previousEvidence.path).trim(),e.previousEvidence.gitBlob);
  assertHk2ReleaseFreeze(e.mainAtPreparation,['.github/workflows/deploy-cloudflare-production.yml','.github/workflows/ai-advisor-pr-validation.yml','.github/workflows/public-release-metadata-probe.yml','cloudflare/wrangler.jsonc','cloudflare/migrations/0062_hk2_catalogue_publication.sql','data/hk2-2026-2027','scripts/hk2-2026-2027/catalogue.mjs','scripts/hk2-d1-import.mjs','scripts/check-public-release-approval.mjs','scripts/release-assistant-core.mjs','scripts/release-assistant-api.mjs','scripts/release-assistant.mjs','scripts/scholarship-release-schema.mjs','scripts/scholarship-release-schema.json','scripts/announcement-release-schema.mjs','scripts/announcement-release-schema.json']);
  // Preserve the original baseline-only proof at its merged SHA. The new operator
  // test separately proves every writer algorithm unchanged except its auth hook.
  git('diff','--exit-code',e.mainAtPreparation,'8416837eb5ce648ce9c1c6237b4eed81802dbd03','--','scripts/hk2-2026-2027/bulk-import.mjs');
});

test('historical reviewed v474 baseline matches official receipts, exact-SHA validation and Cloudflare live metadata',()=>{
  const before=historicalV474;
  const e=JSON.parse(readFileSync('docs/public-release-baseline-782cd1c4.json','utf8'));
  assert.equal(e.version,before);
  assert.equal(e.previousVersion,historicalV473);assert.equal(e.previousVersion,JSON.parse(readFileSync(e.previousEvidence.path,'utf8')).version);
  const hash=spawnSync('git',['hash-object',`--path=${e.previousEvidence.path}`,e.previousEvidence.path],{encoding:'utf8'});
  assert.equal(hash.status,0);assert.equal(hash.stdout.trim(),e.previousEvidence.gitBlob);
  assert.equal(e.runId,'41268885309');assert.equal(e.sha,'a1c4c9ccd47b767160424a32615870ccb7a1027e');
  assert.equal(e.worker,config.name);assert.equal(e.account,PUBLIC_RELEASE_ACCOUNT);
  assert.equal(e.release.url,`https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/${e.runId}`);
  assert.equal(e.release.event,'workflow_dispatch');assert.equal(e.release.branch,'main');assert.equal(e.release.attempt,1);
  assert.equal(e.release.status,'completed');assert.equal(e.release.conclusion,'success');
  assert.equal(e.release.actorId,252552483);assert.equal(e.release.triggeringActorId,e.release.actorId);
  assert.equal(e.release.validateConclusion,'success');assert.equal(e.release.publicConclusion,'success');
  assert.deepEqual(e.release.stepConclusions,{predeploy:'success',ownerApproval:'success',deploy:'success',postdeploy:'success'});
  assert.equal(e.release.receipts.predeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${historicalV473}`);
  assert.equal(e.release.receipts.ownerApproval,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS');
  assert.equal(e.release.receipts.deployedVersion,`Current Version ID: ${before}`);
  assert.equal(e.release.receipts.postdeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${before}`);
  for(const receipt of Object.values(e.release.receipts))assert.ok(e.release.logReceipts.some(line=>line.endsWith(receipt)));
  assert.equal(e.independentValidation.runId,'41265433274');assert.equal(e.independentValidation.sha,e.sha);
  assert.equal(e.independentValidation.event,'workflow_dispatch');assert.equal(e.independentValidation.branch,'main');
  assert.equal(e.independentValidation.status,'completed');assert.equal(e.independentValidation.conclusion,'success');
  assert.equal(e.liveMetadata.deployment.id,'f5bdbea8-5ce9-42e6-b3ac-31e2368f3b60');
  assert.deepEqual(e.liveMetadata.deployment.versions,[{version_id:before,percentage:100}]);
  assert.equal(e.liveMetadata.version.id,before);assert.equal(e.liveMetadata.version.number,474);
  assert.equal(e.liveMetadata.version.etag,'4b22ecde4eecd2fe03e07f1b82415ccfc752efdf6a7fb188edea087a78764d89');
  assert.equal(e.liveMetadata.version.source,'wrangler');assert.equal(e.liveMetadata.deployment.source,'wrangler');
  assert.ok(Date.parse(e.release.releasePublicStartedAt)<=Date.parse(e.liveMetadata.version.createdOn));
  assert.ok(Date.parse(e.liveMetadata.version.createdOn)<=Date.parse(e.liveMetadata.deployment.createdOn));
  assert.ok(Date.parse(e.liveMetadata.deployment.createdOn)<=Date.parse(e.release.releasePublicCompletedAt));
  assert.deepEqual(e.rollout,{v2Mode:'canary',v2Percent:'100',documentFlags:{AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT:'0',AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'false'}});
});

test('historical reviewed v473 baseline matches official receipts, exact-SHA validation and Cloudflare live metadata',()=>{
  const before=historicalV473;
  const e=JSON.parse(readFileSync('docs/public-release-baseline-655fda62.json','utf8'));
  assert.equal(e.version,'655fda62-1767-4fb9-992e-780de214d2ec');assert.equal(e.version,before);
  assert.equal(e.previousVersion,historicalV472);assert.equal(e.previousVersion,JSON.parse(readFileSync('docs/public-release-baseline-2a898cfc.json','utf8')).version);
  assert.equal(e.runId,'41164138113');assert.equal(e.sha,'bba1b6f357077646b9ce16070e4abf8fc0ac0304');
  assert.equal(e.worker,'hub-planner-public-dev-api');assert.equal(e.account,PUBLIC_RELEASE_ACCOUNT);
  assert.equal(e.release.url,`https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/${e.runId}`);
  assert.equal(e.release.event,'workflow_dispatch');assert.equal(e.release.branch,'main');assert.equal(e.release.attempt,1);
  assert.equal(e.release.status,'completed');assert.equal(e.release.conclusion,'success');
  assert.equal(e.release.actorId,252552483);assert.equal(e.release.triggeringActorId,e.release.actorId);
  assert.equal(e.release.validateConclusion,'success');assert.equal(e.release.publicConclusion,'success');
  assert.deepEqual(e.release.stepConclusions,{predeploy:'success',ownerApproval:'success',deploy:'success',postdeploy:'success'});
  assert.equal(e.release.receipts.predeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${historicalV472}`);
  assert.equal(e.release.receipts.ownerApproval,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS');
  assert.equal(e.release.receipts.deployedVersion,`Current Version ID: ${before}`);
  assert.equal(e.release.receipts.postdeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${before}`);
  assert.equal(e.independentValidation.runId,'41163724015');assert.equal(e.independentValidation.sha,e.sha);
  assert.equal(e.independentValidation.event,'workflow_dispatch');assert.equal(e.independentValidation.branch,'main');
  assert.equal(e.independentValidation.status,'completed');assert.equal(e.independentValidation.conclusion,'success');
  assert.equal(e.liveMetadata.deployment.id,'aa640be5-ed89-47fd-92c0-5973404782d2');
  assert.deepEqual(e.liveMetadata.deployment.versions,[{version_id:before,percentage:100}]);
  assert.equal(e.liveMetadata.version.id,before);assert.equal(e.liveMetadata.version.number,473);
  assert.equal(e.liveMetadata.version.etag,'ed004cf2a6075b7e20f603eea4d8d957ae17ff18b4395503632c48353e57702d');
  assert.equal(e.liveMetadata.version.source,'wrangler');assert.equal(e.liveMetadata.deployment.source,'wrangler');
  assert.ok(Date.parse(e.release.releasePublicStartedAt)<=Date.parse(e.liveMetadata.version.createdOn));
  assert.ok(Date.parse(e.liveMetadata.version.createdOn)<=Date.parse(e.liveMetadata.deployment.createdOn));
  assert.ok(Date.parse(e.liveMetadata.deployment.createdOn)<=Date.parse(e.release.releasePublicCompletedAt));
  assert.deepEqual(e.rollout,{v2Mode:'canary',v2Percent:'100',documentFlags:{AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT:'0',AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'false'}});
});

test('0060 gate rejects missing/partial/writable metadata before traffic reads, in both phases',async()=>{
  for(const phase of ['predeploy','postdeploy'])for(const [query,result]of [
    [ANNOUNCEMENT_SCHEMA_QUERY,{results:[],meta:{rows_written:0,changed_db:false}}],
    [ANNOUNCEMENT_SCHEMA_QUERY,{results:announcementObjects.slice(1),meta:{rows_written:0,changed_db:false}}],
    [ANNOUNCEMENT_SCHEMA_QUERY,{results:announcementObjects,meta:{rows_written:1,changed_db:false}}],
    [ANNOUNCEMENT_SCHEMA_QUERY,{results:announcementObjects,meta:{rows_written:0,changed_db:true}}],
    [ANNOUNCEMENT_SCHEMA_QUERY,{results:announcementObjects}],
    [ANNOUNCEMENT_LEDGER_QUERY,{results:[],meta:{rows_written:0,changed_db:false}}],
    [ANNOUNCEMENT_LEDGER_QUERY,{results:[...announcementLedger,...announcementLedger],meta:{rows_written:0,changed_db:false}}],
    [ANNOUNCEMENT_LEDGER_QUERY,{results:announcementLedger,meta:{rows_written:0}}],
  ]){
    const api=fakeApi(phase,(_url,options)=>options.body&&JSON.parse(options.body).sql===query?{ok:true,json:async()=>({success:true,result:[result]})}:undefined);
    await assert.rejects(()=>checkPublicReleaseState(config,opts(api,phase)),/ANNOUNCEMENT_0060_|READ_ONLY_ANNOUNCEMENT_SCHEMA/);
    assert.ok(!api.calls.some(call=>call.url.endsWith('/deployments')));
  }
});

test('historical reviewed v472 baseline matches official release receipts, exact-SHA CI and live traffic metadata',()=>{
  const before=historicalV472;
  const evidence=JSON.parse(readFileSync('docs/public-release-baseline-2a898cfc.json','utf8'));
  assert.equal(evidence.version,before);
  assert.equal(evidence.previousVersion,JSON.parse(readFileSync('docs/public-release-baseline-edcbad46.json','utf8')).version);
  assert.equal(evidence.worker,'hub-planner-public-dev-api');
  assert.equal(evidence.account,PUBLIC_RELEASE_ACCOUNT);
  assert.equal(evidence.runId,'41160354380');
  assert.equal(evidence.sha,'8b41e8c48a0d08969c11750f93a341aa8f89f822');
  assert.equal(evidence.release.url,`https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/${evidence.runId}`);
  assert.equal(evidence.release.event,'workflow_dispatch');assert.equal(evidence.release.branch,'main');
  assert.equal(evidence.release.status,'completed');assert.equal(evidence.release.conclusion,'success');
  assert.equal(evidence.release.attempt,1);assert.equal(evidence.release.actorId,252552483);
  assert.equal(evidence.release.triggeringActorId,evidence.release.actorId);
  assert.equal(evidence.release.validateConclusion,'success');assert.equal(evidence.release.publicConclusion,'success');
  assert.deepEqual(evidence.release.stepConclusions,{predeploy:'success',ownerApproval:'success',deploy:'success',postdeploy:'success'});
  assert.equal(evidence.release.receipts.predeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${historicalV471}`);
  assert.equal(evidence.release.receipts.ownerApproval,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS');
  assert.equal(evidence.release.receipts.deployedVersion,`Current Version ID: ${before}`);
  assert.equal(evidence.release.receipts.postdeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${before}`);
  assert.equal(evidence.independentValidation.runId,'41159947206');
  assert.equal(evidence.independentValidation.sha,evidence.sha);
  assert.equal(evidence.independentValidation.event,'workflow_dispatch');assert.equal(evidence.independentValidation.branch,'main');
  assert.equal(evidence.independentValidation.status,'completed');assert.equal(evidence.independentValidation.conclusion,'success');
  assert.equal(evidence.liveMetadata.deployment.id,'cee250db-11f9-4652-9a5e-9b2cab2a70c9');
  assert.equal(evidence.liveMetadata.deployment.source,'wrangler');
  assert.deepEqual(evidence.liveMetadata.deployment.versions,[{version_id:before,percentage:100}]);
  assert.equal(evidence.liveMetadata.version.id,before);assert.equal(evidence.liveMetadata.version.number,472);
  assert.equal(evidence.liveMetadata.version.source,'wrangler');
  assert.equal(evidence.liveMetadata.version.etag,'506968ae76e3375dfbb7103962b7a2737d73d0815feb2a93201b961f53ceb6bb');
  assert.ok(Date.parse(evidence.liveMetadata.version.createdOn)>=Date.parse(evidence.release.releasePublicStartedAt));
  assert.ok(Date.parse(evidence.liveMetadata.deployment.createdOn)>=Date.parse(evidence.liveMetadata.version.createdOn));
  assert.ok(Date.parse(evidence.liveMetadata.deployment.createdOn)<=Date.parse(evidence.release.releasePublicCompletedAt));
  assert.deepEqual(evidence.rollout,{v2Mode:'canary',v2Percent:'100',documentFlags:{
    AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT:'0'
  }});
});

test('historical reviewed v471 baseline has successful owner-approved release and read-only 100 percent Cloudflare serving evidence',()=>{
  const evidence=JSON.parse(readFileSync('docs/public-release-baseline-edcbad46.json','utf8'));
  assert.equal(evidence.version,historicalV471);
  assert.equal(evidence.previousVersion,historicalV470);
  assert.equal(evidence.worker,'hub-planner-public-dev-api');
  assert.equal(evidence.account,PUBLIC_RELEASE_ACCOUNT);
  assert.equal(evidence.runId,'41093636381');
  assert.equal(evidence.sha,'b8950ae5fa4101a38401d729e4428c9979fcb957');
  assert.equal(evidence.release.url,`https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/${evidence.runId}`);
  assert.equal(evidence.release.event,'workflow_dispatch');
  assert.equal(evidence.release.branch,'main');
  assert.equal(evidence.release.status,'completed');
  assert.equal(evidence.release.conclusion,'success');
  assert.equal(evidence.release.attempt,1);
  assert.equal(evidence.release.actorId,252552483);
  assert.equal(evidence.release.validateConclusion,'success');
  assert.equal(evidence.release.publicConclusion,'success');
  assert.deepEqual(evidence.release.stepConclusions,{predeploy:'success',ownerApproval:'success',deploy:'success',postdeploy:'success'});
  assert.equal(evidence.release.receipts.predeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${historicalV470}`);
  assert.equal(evidence.release.receipts.ownerApproval,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS');
  assert.equal(evidence.release.receipts.deployedVersion,`Current Version ID: ${historicalV471}`);
  assert.equal(evidence.release.receipts.postdeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${historicalV471}`);
  assert.equal(evidence.liveMetadata.deployment.id,'cf9deefc-e376-495e-a906-27e826030084');
  assert.equal(evidence.liveMetadata.deployment.source,'wrangler');
  assert.deepEqual(evidence.liveMetadata.deployment.versions,[{version_id:historicalV471,percentage:100}]);
  assert.equal(evidence.liveMetadata.version.id,historicalV471);
  assert.equal(evidence.liveMetadata.version.number,471);
  assert.equal(evidence.liveMetadata.version.source,'wrangler');
  assert.ok(Date.parse(evidence.liveMetadata.version.createdOn)>=Date.parse(evidence.release.releasePublicStartedAt));
  assert.ok(Date.parse(evidence.liveMetadata.deployment.createdOn)>=Date.parse(evidence.liveMetadata.version.createdOn));
  assert.ok(Date.parse(evidence.liveMetadata.deployment.createdOn)<=Date.parse(evidence.release.releasePublicCompletedAt));
  assert.deepEqual(evidence.rollout,{v2Mode:'canary',v2Percent:'100',documentFlags:{
    AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT:'0'
  }});
});

test('historical reviewed v470 baseline is backed by successful owner-approved release and read-only Cloudflare metadata',()=>{
  const evidence=JSON.parse(readFileSync('docs/public-release-baseline-d4b614d4.json','utf8'));
  assert.equal(evidence.version,historicalV470);
  assert.equal(evidence.previousVersion,historicalBefore);
  assert.equal(evidence.worker,'hub-planner-public-dev-api');
  assert.equal(evidence.account,PUBLIC_RELEASE_ACCOUNT);
  assert.equal(evidence.runId,'40669494474');
  assert.equal(evidence.sha,'555b1f78aa58b399393f547a21dbe86e906d0b4d');
  assert.equal(evidence.release.url,`https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/${evidence.runId}`);
  assert.equal(evidence.release.event,'workflow_dispatch');
  assert.equal(evidence.release.branch,'main');
  assert.equal(evidence.release.conclusion,'success');
  assert.equal(evidence.release.attempt,1);
  assert.equal(evidence.release.actorId,252552483);
  assert.equal(evidence.release.validateConclusion,'success');
  assert.equal(evidence.release.publicConclusion,'success');
  assert.deepEqual(evidence.release.stepConclusions,{
    predeploy:'success', ownerApproval:'success', deploy:'success', postdeploy:'success'
  });
  assert.equal(evidence.release.receipts.predeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${historicalBefore}`);
  assert.equal(evidence.release.receipts.ownerApproval,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS');
  assert.equal(evidence.release.receipts.deployedVersion,`Current Version ID: ${historicalV470}`);
  assert.equal(evidence.release.receipts.postdeploy,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${historicalV470}`);
  assert.equal(evidence.liveMetadata.deployment.id,'6c01379c-9a3b-4b2f-80e1-c22e1d88762e');
  assert.equal(evidence.liveMetadata.deployment.source,'wrangler');
  assert.deepEqual(evidence.liveMetadata.deployment.versions,[{version_id:historicalV470,percentage:100}]);
  assert.equal(evidence.liveMetadata.version.id,historicalV470);
  assert.equal(evidence.liveMetadata.version.number,470);
  assert.equal(evidence.liveMetadata.version.source,'wrangler');
  assert.ok(Date.parse(evidence.liveMetadata.version.createdOn)>=Date.parse(evidence.release.releasePublicStartedAt));
  assert.ok(Date.parse(evidence.liveMetadata.deployment.createdOn)>=Date.parse(evidence.liveMetadata.version.createdOn));
  assert.ok(Date.parse(evidence.liveMetadata.deployment.createdOn)<=Date.parse(evidence.release.releasePublicCompletedAt));
});

test('predeploy accepts reviewed v478 and retains historical v469 provenance assertions',async()=>{
  assert.equal(before,'65f4241b-b2ab-48db-ac3d-1c9d772bb981');
  const evidence=JSON.parse(readFileSync('docs/public-release-baseline-e14d5e2c.json','utf8'));
  assert.equal(evidence.version,historicalBefore);assert.equal(evidence.runId,'39923225777');
  assert.equal(evidence.sha,'d92dc81c658891cbb0a60a93393dcc7ff41adae5');
  assert.equal(evidence.previousVersion,'ecee213b-dbe8-4ce9-98e8-a8c9a13e184b');
  assert.equal(evidence.previousVersion,JSON.parse(readFileSync('docs/public-release-baseline-ecee213b.json','utf8')).version);
  assert.deepEqual(evidence.liveMetadata.deployment.versions,[{version_id:historicalBefore,percentage:100}]);
  assert.equal(evidence.liveMetadata.version.id,historicalBefore);
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
  for(const receipt of [`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${evidence.previousVersion}`,`APPROVED_SHA: ${evidence.sha}`,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS',`Current Version ID: ${historicalBefore}`]){
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
  assert.ok(evidence.release.receipts.some(line=>line.includes(`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${historicalBefore}`)));
  assert.deepEqual(evidence.release.rollout,{mode:'canary',percent:100,documentFlags:{AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'false',AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT:'0'}});
  for(const [name,value] of Object.entries({AI_ADVISOR_V2_MODE:'canary',AI_ADVISOR_V2_CANARY_PERCENT:'100',...evidence.release.rollout.documentFlags})){
    assert.ok(evidence.release.receipts.some(line=>line.includes(`env.${name} ("${value}")`)));
  }
  for(const [stepNumber,receipt] of [[6,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=predeploy; PUBLIC_VERSION=${evidence.previousVersion}`],[7,'PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS'],[8,`Current Version ID: ${historicalBefore}`],[9,`PUBLIC_LIVE_STATE_GATE=PASS; PHASE=postdeploy; PUBLIC_VERSION=${historicalBefore}`]]){
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
  for(const obsoleteVersion of [historicalV477,historicalV475,historicalV474,historicalV473,historicalV472,historicalV471,historicalV470,historicalBefore,'ecee213b-dbe8-4ce9-98e8-a8c9a13e184b','79c4f615-cab1-49be-81b4-6622bfe415d1','bba26eca-7811-4f1a-802e-f6bc7c6f7421','f5abb252-a042-45e7-9f4e-96bdb550dd8e','58c94fc8-5bfe-41e3-97f5-d0c39bc8be65','cd1d81be-966f-4518-8729-0b1c3e5484ce','66bc5fd9-55f4-4983-9048-0a271550ef9f','93e9bad7-39f3-4635-bb97-c6d71ccc4524','3e7f80ec-e268-4869-976a-6e26c38244b0','cf44c795-ddf0-4f56-b55c-6100029d6d3e','77374643-bb94-420a-ab4c-fd456fca516d','e17bfe9f-5aa8-45e8-88fe-9fc63c26b2a3','799042c2-47a2-471c-80dc-e13c42e237ef','6ff2cbdb-5c4a-485b-8bb6-f310e5d39ec6','9497fa3b-9a0c-422f-ab0e-4e3fe4a98ac1','d102b7e6-0a37-448c-acce-5f8e795af13c']){
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

test('historical v475 security surfaces remain byte-equivalent under the current reviewed pin',()=>{
  const e=JSON.parse(readFileSync('docs/public-release-baseline-4a9e7d99.json','utf8'));
  const original=path=>{
    const r=spawnSync('git',['show',`${e.mainAtPreparation}:${path}`],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);return r.stdout.replace(/\r\n/g,'\n');
  };
  const path='scripts/check-public-release-state.mjs';
  const previous=original(path),current=readPreHostnameTransitionFile(path).replace(/\r\n/g,'\n');
  const normalize=s=>s.replace(/^\/\/ Reviewed release baseline:.*$/m,'<BASELINE_COMMENT>')
    .replace(/^\/\/ See docs\/public-release-baseline-.*$/m,'<BASELINE_RECEIPT>')
    .replace(/export const PUBLIC_RELEASE_PREDEPLOY_VERSION='[^']+';/,'<BASELINE_PIN>');
  assert.equal(normalize(current),normalize(previous));
  assert.equal(current.split('\n').length,previous.split('\n').length);
  assert.deepEqual(current.split('\n').flatMap((line,index)=>line===previous.split('\n')[index]?[]:[index+1]),[13,14,15]);
  for(const path of ['scripts/check-public-release-approval.mjs','scripts/release-assistant-core.mjs','scripts/release-assistant-api.mjs',
    '.github/workflows/deploy-cloudflare-production.yml','.github/workflows/ai-advisor-pr-validation.yml','cloudflare/wrangler.jsonc',
    'scripts/scholarship-release-schema.mjs','scripts/announcement-release-schema.mjs','scripts/announcement-release-schema.json']){
    const workflow = '.github/workflows/deploy-cloudflare-production.yml';
    const current=['cloudflare/wrangler.jsonc', workflow].includes(path)
      ? readPreHostnameTransitionFile(path) : readFileSync(path,'utf8');
    assert.equal(current.replace(/\r\n/g,'\n'),original(path),path);
  }
});

test('v474 baseline changes only the reviewed pin and comments; release workflow and owner approval stay unchanged',()=>{
  const evidence=JSON.parse(readFileSync('docs/public-release-baseline-782cd1c4.json','utf8'));
  const git=path=>{const r=spawnSync('git',['show',`${evidence.sha}:${path}`],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.replace(/\r\n/g,'\n');};
  const normalize=s=>s.replace(/^\/\/ Reviewed release baseline:.*$/m,'<BASELINE_RECEIPT>')
    .replace(/^\/\/ See docs\/public-release-baseline-.*$/m,'<BASELINE_EVIDENCE>')
    .replace(/export const PUBLIC_RELEASE_PREDEPLOY_VERSION='[^']+';/,'<BASELINE_PIN>');
  const path='scripts/check-public-release-state.mjs';
  assert.equal(normalize(readPreHostnameTransitionFile(path).replace(/\r\n/g,'\n')),normalize(git(path)));
  const workflow = '.github/workflows/deploy-cloudflare-production.yml';
  assert.equal(readFileSync('scripts/check-public-release-approval.mjs','utf8').replace(/\r\n/g,'\n'),git('scripts/check-public-release-approval.mjs'));
  assert.equal(readPreHostnameTransitionFile(workflow).replace(/\r\n/g,'\n'),git(workflow));
  assertHk2ReleaseFreeze(evidence.sha,[workflow]);
});

test('0060 extends the gate without changing historical checks or baseline Git evidence',()=>{
  const evidence=JSON.parse(readFileSync('docs/public-release-baseline-e14d5e2c.json','utf8'));
  const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
  const normalize=s=>s.replace(/\r\n/g,'\n')
    .replace(/^\/\/ Reviewed release baseline:.*$/m,'// Reviewed release baseline: <REVIEWED_RELEASE>.')
    .replace(/^\/\/ See docs\/public-release-baseline-.*$/m,'// See <REVIEWED_EVIDENCE>.')
    .replace(/export const PUBLIC_RELEASE_PREDEPLOY_VERSION='[^']+';/,"export const PUBLIC_RELEASE_PREDEPLOY_VERSION='<REVIEWED_VERSION>';");
  const old=git('show',`${evidence.mainAtPreparation}:scripts/check-public-release-state.mjs`).replace(/\r\n/g,'\n');
  const extended=readPreHostnameTransitionFile('scripts/check-public-release-state.mjs').replace(/\r\n/g,'\n');
  const additionImport="import {validateAnnouncementReleaseSchema,ANNOUNCEMENT_SCHEMA_QUERY,ANNOUNCEMENT_LEDGER_QUERY} from './announcement-release-schema.mjs';\n";
  const additionBody="  const [announcementObjects]=await cf(`d1/database/${PUBLIC_RELEASE_DB}/query`,{sql:ANNOUNCEMENT_SCHEMA_QUERY});\n  const [announcementLedger]=await cf(`d1/database/${PUBLIC_RELEASE_DB}/query`,{sql:ANNOUNCEMENT_LEDGER_QUERY});\n  for(const result of [announcementObjects,announcementLedger])if(!Array.isArray(result?.results)||result.meta?.rows_written!==0||result.meta?.changed_db!==false)throw Error('READ_ONLY_ANNOUNCEMENT_SCHEMA_UNVERIFIED');\n  validateAnnouncementReleaseSchema(announcementObjects.results,announcementLedger.results);\n";
  assert.equal(extended.split(additionImport).length,2);assert.equal(extended.split(additionBody).length,2);
  const current=extended.replace(additionImport,'').replace(additionBody,'');
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
