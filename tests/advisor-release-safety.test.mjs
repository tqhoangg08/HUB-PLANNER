import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {validateReleaseApproval} from '../scripts/check-public-release-approval.mjs';
import {validatePublicReleaseState} from '../scripts/check-public-release-state.mjs';
import {assertRehearsalTarget} from '../scripts/rehearse-advisor-d1-staging.mjs';

test('PR CI is credential-free validation, never a production deployment',()=>{
  const ci=readFileSync('.github/workflows/ai-advisor-pr-validation.yml','utf8');
  assert.match(ci,/pull_request:/);
  assert.match(ci,/contents: read/);
  assert.match(ci,/persist-credentials: false/);
  assert.match(ci,/fetch-depth: 2/); // HEAD^ must exist for the diff check.
  assert.doesNotMatch(ci,/pull_request_target|workflow_run|secrets\.|wrangler|--remote|deploy-cloudflare-production|setup-advisor-app-staging/);
  for(const command of ['npm ci','npm run test:advisor','npm run typecheck','npm run cf:typecheck','npm run build','npm test'])assert.ok(ci.includes(command));
});

test('main merge cannot deploy Auth or apply pending migrations; Public release is manual and separately approved',()=>{
  const workflow=readFileSync('.github/workflows/deploy-cloudflare-production.yml','utf8');
  assert.doesNotMatch(workflow,/\bpush:|\bpull_request:|wrangler\.auth|migrations apply|deploy:auth/);
  assert.match(workflow,/default: false/);assert.match(workflow,/environment: public-production/);
  assert.match(workflow,/needs: validate/);assert.match(workflow,/PUBLIC_RELEASE_APPROVAL_SHA/);
  assert.match(workflow,/check-public-release-state/);
  assert.match(workflow,/wrangler deploy --config cloudflare\/wrangler.jsonc --keep-vars/);
});
test('release fails closed for missing reviewers, self approval, admin bypass or wrong approved SHA',()=>{
  const a={sha:'a'.repeat(40),head:'a'.repeat(40),event:'workflow_dispatch',ref:'refs/heads/main',requireOwner:true,ownerSha:'a'.repeat(40),
    environment:{can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:true,reviewers:[{id:1}]}]}};
  assert.equal(validateReleaseApproval(a),true);
  for(const patch of [{event:'push'},{ref:'refs/heads/feature'},{sha:'main'},{ownerSha:'b'.repeat(40)},
    {environment:{}},{environment:{...a.environment,can_admins_bypass:true}},
    {environment:{...a.environment,protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{id:1}]}]}}])assert.throws(()=>validateReleaseApproval({...a,...patch}));
});
test('rehearsal never restores production or the original app staging DB',()=>{
  assert.equal(assertRehearsalTarget('isolated','hub-pr88-0054-rehearsal-aaaa','app'),undefined);
  for(const [id,name]of [['88d702e1-60d3-490a-8514-38ef881cf133','hub-pr88-0054-rehearsal-aaaa'],['app','hub-pr88-0054-rehearsal-aaaa'],['isolated','hub-planner-public-dev']])assert.throws(()=>assertRehearsalTarget(id,name,'app'));
});

test('additional-topic staging has the existing empty course schema before context retrieval',()=>{
  const setup=readFileSync('scripts/setup-advisor-app-staging.mjs','utf8');
  assert.match(setup,/prepare-context/);assert.match(setup,/live.name!==NAME/);
  const db=new DatabaseSync(':memory:');
  try{
    for(const name of ['0001_create_school_announcements','0002_create_course_schedules','0003_reduce_read_amplification','0018_add_course_authority_foundation','0011_create_user_schedules'])db.exec(readFileSync(`cloudflare/migrations/${name}.sql`,'utf8'));
    assert.deepEqual(db.prepare("SELECT id FROM course_schedules WHERE catalogue_visibility='published' AND retired_at IS NULL AND subject_name_search LIKE ? ORDER BY source_position LIMIT 8").all('%hoc%'),[]);
    assert.equal(db.prepare('SELECT COUNT(*) AS rows FROM course_schedules').get().rows,0);
    assert.deepEqual(db.prepare('SELECT us.semester,cs.subject_name FROM user_schedules us LEFT JOIN course_schedules cs ON cs.id=us.course_id WHERE us.user_id=? ORDER BY us.created_at DESC LIMIT 24').all('synthetic'),[]);
    assert.match(setup,/0011_create_user_schedules.sql/);
  }finally{db.close();}
});
test('Public live-state preflight rejects canary drift and missing 0054 without writing anything',()=>{
  const config={name:'hub-planner-public-dev-api',main:'worker/src/index.ts',vars:{AI_ADVISOR_V2_MODE:'canary',AI_ADVISOR_V2_CANARY_PERCENT:'7',AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'false'},assets:{binding:'ASSETS'},ai:{binding:'AI'},observability:{enabled:true}};
  const settings={bindings:[{name:'ASSETS',type:'assets'},{name:'AI',type:'ai'},...Object.entries(config.vars).map(([name,text])=>({name,type:'plain_text',text}))],observability:config.observability};
  const schema=['ai_search_status','ai_search_revision','ocr_uncertain_tokens','gemini_indexing_status'].map(name=>({name}));
  assert.equal(validatePublicReleaseState(config,settings,schema),true);
  assert.throws(()=>validatePublicReleaseState(config,settings,[]),/0054/);
  assert.throws(()=>validatePublicReleaseState(config,{...settings,bindings:settings.bindings.map(b=>b.name==='AI_ADVISOR_V2_MODE'?{...b,text:'on'}:b)},schema));
  assert.throws(()=>validatePublicReleaseState(config,{...settings,observability:{enabled:false}},schema));
});

test('initial release configuration leaves completeness off and canary at seven percent',()=>{
  const parsed=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8'));
  assert.equal(parsed.error,undefined);
  assert.equal(parsed.config.vars.AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED,'false');
  assert.equal(parsed.config.vars.AI_ADVISOR_V2_MODE,'canary');
  assert.equal(String(parsed.config.vars.AI_ADVISOR_V2_CANARY_PERCENT),'7');
  assert.ok(!String(parsed.config.main).includes('staging'));
});

test('clean CI lockfile retains optional WASM peer dependency closure',()=>{
  const {packages}=JSON.parse(readFileSync('package-lock.json','utf8'));
  const core=packages['node_modules/@emnapi/core'];
  const threads=packages['node_modules/@emnapi/wasi-threads'];
  assert.ok(core&&threads,'npm10 clean CI reproduced missing optional peers');
  assert.equal(core.dependencies['@emnapi/wasi-threads'],threads.version);
  assert.equal(core.optional,true);
  assert.equal(threads.optional,true);
  for(const dependency of [core,threads]){
    assert.match(dependency.resolved,/^https:\/\/registry\.npmjs\.org\/@emnapi\//);
    assert.match(dependency.integrity,/^sha512-/);
  }
});

test('0054 preserves old document rows and old SQL while new sources default to unprepared',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec("CREATE TABLE ai_documents(id TEXT PRIMARY KEY, content_hash TEXT, version INTEGER, indexing_status TEXT, deleted_at TEXT)");
    db.exec("INSERT INTO ai_documents VALUES('active','hash',1,'completed',NULL),('deleted','hash2',1,'deleted','date')");
    const before=db.prepare('SELECT * FROM ai_documents ORDER BY id').all();
    const migration=readFileSync('cloudflare/migrations/0054_ai_document_search_ingestion_state.sql','utf8');
    assert.doesNotMatch(migration,/\b(DROP|DELETE|UPDATE|INSERT|REPLACE)\b/i);
    db.exec(migration);
    assert.deepEqual(db.prepare('SELECT id,content_hash,version,indexing_status,deleted_at FROM ai_documents ORDER BY id').all(),before);
    assert.deepEqual(db.prepare('SELECT id FROM ai_documents WHERE deleted_at IS NULL AND indexing_status=\'completed\'').all().map(r=>r.id),['active']);
    assert.ok(db.prepare('SELECT ai_search_status,ai_search_revision,ocr_uncertain_tokens,gemini_indexing_status FROM ai_documents').all().every(r=>r.ai_search_status==='not_prepared'&&r.ai_search_revision===null&&r.ocr_uncertain_tokens===0&&r.gemini_indexing_status===null));
    assert.throws(()=>db.exec("UPDATE ai_documents SET ai_search_status='invented'"),/CHECK constraint/);
    // Not idempotent raw SQL: a partial/repeated application must STOP, not be
    // blindly rerun. The operator uses the migration ledger and schema probe.
    assert.throws(()=>db.exec(migration),/duplicate column/);
  }finally{db.close();}
});
