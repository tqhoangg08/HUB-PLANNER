import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {checkPublicReleaseState,validatePublicReleaseState,validateTextFirstReleaseSchema,TEXT_FIRST_MIGRATIONS,PUBLIC_RELEASE_ACCOUNT,PUBLIC_RELEASE_DB} from '../scripts/check-public-release-state.mjs';

const config=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8')).config;
const before='11111111-1111-4111-8111-111111111111',after='22222222-2222-4222-8222-222222222222';
const scratch=new DatabaseSync(':memory:');
for(const migration of ['0032_ai_documents_chat_d1_r2_authority','0044_ai_document_ocr_ingestion','0045_ai_document_public_view_policy','0049_ai_document_derived_index_identity','0054_ai_document_search_ingestion_state','0055_ai_document_index_segment_count','0056_ai_text_document_revisions'])scratch.exec(readFileSync(`cloudflare/migrations/${migration}.sql`,'utf8'));
const schema=scratch.prepare('PRAGMA table_info(ai_documents)').all();
const objects=scratch.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name IN ('ai_documents','ai_text_documents','ai_text_revisions','ai_text_revisions_document','ai_text_publication_source_guard')").all();
const ledger=TEXT_FIRST_MIGRATIONS.map(name=>({name}));scratch.close();
const settings=percent=>({observability:config.observability,bindings:[
  ...Object.entries(config.vars).map(([name,text])=>({name,type:'plain_text',text:name==='AI_ADVISOR_V2_CANARY_PERCENT'?percent:text})),
  {name:'DB',type:'d1',id:PUBLIC_RELEASE_DB},
  ...config.r2_buckets.map(b=>({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name})),
  ...config.services.map(b=>({name:b.binding,type:'service',service:b.service})),
  ...config.queues.producers.map(b=>({name:b.binding,type:'queue',queue_name:b.queue})),
  ...config.workflows.map(b=>({name:b.binding,type:'workflow',workflow_name:b.name})),
  ...config.ai_search_namespaces.map(b=>({name:b.binding,type:'ai_search_namespace',namespace:b.namespace})),
  ...config.ratelimits.map(b=>({name:b.name,type:'ratelimit',namespace_id:b.namespace_id})),
  {name:'ASSETS',type:'assets'},{name:'AI',type:'ai'},{name:'fixture-secret-name',type:'secret_text'},
]});
const patchVar=(s,name,text)=>({...s,bindings:s.bindings.map(b=>b.name===name?{...b,text}:b)});
const offNames=['AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED','AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED','AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT'];

test('Text-first release preserves exact 100% in both phases; old 7% is rejected',()=>{
  assert.equal(validatePublicReleaseState(config,settings('100'),schema,'predeploy'),true);
  assert.equal(validatePublicReleaseState(config,settings('100'),schema,'postdeploy'),true);
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
    const s=settings(percent);
    assert.throws(()=>validatePublicReleaseState(config,patchVar(s,'AI_ADVISOR_V2_GENERATOR_MODEL','unreviewed-model'),schema,phase),/LIVE_VARIABLE_DRIFT/);
    assert.throws(()=>validatePublicReleaseState(config,{...s,bindings:s.bindings.map(b=>b.name==='DB'?{...b,id:'wrong'}:b)},schema,phase),/LIVE_BINDING_DRIFT/);
    assert.throws(()=>validatePublicReleaseState(config,{...s,bindings:[...s.bindings,{name:'EXTRA',type:'d1',id:'wrong'}]},schema,phase),/UNREVIEWED_LIVE_BINDING/);
    assert.throws(()=>validatePublicReleaseState(config,{...s,bindings:[...s.bindings,s.bindings[0]]},schema,phase),/LIVE_BINDING_METADATA_INVALID/);
    assert.throws(()=>validatePublicReleaseState(config,{...s,observability:{enabled:false}},schema,phase),/OBSERVABILITY_DRIFT/);
    assert.throws(()=>validatePublicReleaseState(config,s,[],phase),/0054/);
  }
});

function fakeApi(phase='predeploy',override=()=>undefined){
  const calls=[],s=settings('100'),versionId=phase==='predeploy'?before:after;
  const fn=async(url,options)=>{
    calls.push({url,options});
    const forced=override(url,options,s,versionId);if(forced)return forced;
    const sql=options.body?JSON.parse(options.body).sql:null;
    const result=url.endsWith('/settings')?s:url.endsWith('/query')?[{results:sql.startsWith('PRAGMA')?schema:sql.includes('sqlite_schema')?objects:ledger,meta:{rows_written:0,changed_db:false}}]
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
    assert.equal(r.versionId,phase==='predeploy'?before:after);assert.equal(api.calls.length,6);
    for(const {url,options}of api.calls){
      assert.ok(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${PUBLIC_RELEASE_ACCOUNT}/`));
      assert.equal(options.redirect,'error');
      if(url.endsWith('/query')){
        assert.equal(options.method,'POST');assert.ok(url.includes(PUBLIC_RELEASE_DB));
        const sql=JSON.parse(options.body).sql;
        assert.ok(sql==='PRAGMA table_info(ai_documents)'||sql==="SELECT type,name,sql FROM sqlite_schema WHERE name IN ('ai_documents','ai_text_documents','ai_text_revisions','ai_text_revisions_document','ai_text_publication_source_guard')"||sql==="SELECT name FROM d1_migrations WHERE name IN ('0055_ai_document_index_segment_count.sql','0056_ai_text_document_revisions.sql')");
        assert.doesNotMatch(sql,/ALTER|INSERT|UPDATE|DELETE|DROP/i);
      }else{assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.ok(url.includes('/workers/scripts/hub-planner-public-dev-api/'));}
    }
  }
});

test('wrong account, Auth DB, absent previous version or invalid phase fail before network access',async()=>{
  for(const patch of [{account:'wrong'},{token:''},{phase:'skip'},{phase:'postdeploy',beforeVersion:undefined}]){
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

test('postflight rejects old/split traffic or serving version still at seven despite settings at 100',async()=>{
  const wrap=result=>({ok:true,json:async()=>({success:true,result})});
  for(const result of [{deployments:[]},{deployments:[{created_on:'invalid',versions:[]}]},
    {deployments:[{created_on:'2026-10-12T00:00:00Z',versions:[{version_id:before,percentage:100}]}]},
    {deployments:[{created_on:'2026-10-12T00:00:00Z',versions:[{version_id:after,percentage:90},{version_id:before,percentage:10}]}]}]){
    const api=fakeApi('postdeploy',url=>url.endsWith('/deployments')?wrap(result):undefined);
    await assert.rejects(()=>checkPublicReleaseState(config,opts(api,'postdeploy')));
  }
  for(const resource of [{id:before,resources:{bindings:settings('100').bindings}},{id:after,resources:{bindings:settings('7').bindings}},{id:after,resources:{}},
    {id:after,resources:{bindings:patchVar(settings('100'),'AI_ADVISOR_V2_GENERATOR_MODEL','wrong-model').bindings}},
    {id:after,resources:{bindings:settings('100').bindings.map(b=>b.name==='DB'?{...b,id:'wrong-db'}:b)}}]){
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
